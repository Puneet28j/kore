import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import { createPortal } from "react-dom";
import {
  ShoppingCart,
  Plus,
  Minus,
  Search,
  Filter,
  ArrowRight,
  Package,
  Tag,
  Layers,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Article, Inventory, Variant, User } from "../../types";
import { toast } from "sonner";
import { getImageUrl } from "../../utils/imageUtils";
import { masterCatalogService } from "../../services/masterCatalogService";

interface ShopProps {
  articles: Article[];
  inventory: Inventory[];
  cart: {
    articleId: string;
    variantId?: string;
    sizeQuantities?: Record<string, number>;
    cartonCount: number;
    pairCount: number;
    price: number;
  }[];
  addToCart: (
    articleId: string,
    variantId: string | undefined,
    sizeQuantities: Record<string, number>
  ) => void;
  removeFromCart: (articleId: string, variantId?: string) => void;
  goToCart: () => void;
  user?: User;
}

interface ColorGroup {
  article: Article;
  color: string;
  variants: Variant[];
}

type PriceView = "pair" | "carton";

const PAIRS_PER_CARTON = 24;

const colorToHex = (color: string): string => {
  const map: Record<string, string> = {
    red: "#ef4444",
    blue: "#3b82f6",
    green: "#22c55e",
    black: "#0f172a",
    white: "#f8fafc",
    grey: "#64748b",
    gray: "#64748b",
    yellow: "#eab308",
    orange: "#f97316",
    pink: "#ec4899",
    purple: "#a855f7",
    indigo: "#6366f1",
    brown: "#78350f",
    navy: "#1e3a8a",
    teal: "#14b8a6",
    cyan: "#06b6d4",
    gold: "#fbbf24",
    silver: "#cbd5e1",
  };
  return map[color.toLowerCase()] || "#cbd5e1";
};

const isVariantInStock = (v: Variant): boolean => {
  const sizeMap = v.sizeMap || {};
  const baseBreakdown = v.sizeQuantities || {};
  const sizes = Object.keys(baseBreakdown);

  if (sizes.length === 0) {
    const entries =
      typeof (sizeMap as any).entries === "function"
        ? Array.from((sizeMap as any).entries())
        : Object.entries(sizeMap);
    if (entries.length === 0) return false;
    return entries.some(([, val]: [string, any]) => {
      const qty = typeof val === "number" ? val : Number(val?.qty || 0);
      const blocked =
        typeof val === "object" ? Number(val?.blockedQty || 0) : 0;
      return qty - blocked > 0;
    });
  }

  let min = Infinity;
  let hasValidAssort = false;
  for (const sz of sizes) {
    const assortQty = Number(baseBreakdown[sz]) || 0;
    if (assortQty === 0) continue;
    hasValidAssort = true;
    const stockEntry =
      typeof (sizeMap as any).get === "function"
        ? (sizeMap as any).get(sz)
        : sizeMap[sz];
    const available = stockEntry
      ? Math.max(
          0,
          Number(stockEntry.qty || 0) - Number(stockEntry.blockedQty || 0)
        )
      : 0;
    min = Math.min(min, Math.floor(available / assortQty));
  }
  if (!hasValidAssort) return false;
  const stock = min === Infinity ? 0 : min;
  return stock > 0;
};

// ─── Amazon-style zoom hook ─────────────────────────────────────────────────
const ZOOM_SIZE = 300;

const useAmazonZoom = () => {
  const [zoom, setZoom] = useState<{
    pctX: number;
    pctY: number;
    panelLeft: number;
    panelTop: number;
    visible: boolean;
  }>({ pctX: 0, pctY: 0, panelLeft: 0, panelTop: 0, visible: false });

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pctX = ((e.clientX - rect.left) / rect.width) * 100;
    const pctY = ((e.clientY - rect.top) / rect.height) * 100;

    // Show panel to the right; fall back to left if not enough space
    const spaceRight = window.innerWidth - rect.right;
    const panelLeft =
      spaceRight >= ZOOM_SIZE + 16 ? rect.right + 8 : rect.left - ZOOM_SIZE - 8;

    // Center panel vertically on the card, clamped to viewport
    const panelTop = Math.max(
      8,
      Math.min(
        rect.top + rect.height / 2 - ZOOM_SIZE / 2,
        window.innerHeight - ZOOM_SIZE - 8
      )
    );

    setZoom({ pctX, pctY, panelLeft, panelTop, visible: true });
  }, []);

  const onMouseLeave = useCallback(
    () => setZoom((p) => ({ ...p, visible: false })),
    []
  );

  return { zoom, onMouseMove, onMouseLeave };
};

// ─── ArticleCard ───────────────────────────────────────────────────────────
const ArticleCard: React.FC<{
  group: ColorGroup;
  inv?: Inventory;
  cart: ShopProps["cart"];
  addToCart: ShopProps["addToCart"];
  discountPercentage: number;
  priceView: PriceView;
  distributorTag?: "online" | "offline";
  articleStatus?: string;
}> = ({
  group,
  inv,
  cart,
  addToCart,
  discountPercentage,
  priceView,
  distributorTag,
  articleStatus,
}) => {
  const { article, color, variants } = group;

  const [selectedVariantId, setSelectedVariantId] = useState<string>(
    variants.length > 0 ? variants[0].id : ""
  );
  const [cartonCount, setCartonCount] = useState(1);

  const selectedVariant = variants.find((v) => v.id === selectedVariantId);
  const baseBreakdown = selectedVariant?.sizeQuantities || {};
  const totalPairsPerCarton = Object.values(baseBreakdown).reduce(
    (a, b) => a + (Number(b) || 0),
    0
  );
  const totalPairs = totalPairsPerCarton * cartonCount;

  // ── Stock cap logic (per variant, per size) ──────────────────────────────
  // sizeMap[size].qty is live stock; blockedQty is reserved. Available = qty - blockedQty.
  const maxCartonsFromStock = useMemo(() => {
    if (!selectedVariant) return 0;
    const sizeMap = selectedVariant.sizeMap || {};
    const sizes = Object.keys(baseBreakdown);
    if (sizes.length === 0) return 999; // no assortment data — no limit
    let min = Infinity;
    for (const sz of sizes) {
      const assortQty = Number(baseBreakdown[sz]) || 0;
      if (assortQty === 0) continue;
      const stockEntry = sizeMap[sz];
      const available = stockEntry
        ? Math.max(0, (stockEntry.qty || 0) - (stockEntry.blockedQty || 0))
        : 0;
      min = Math.min(min, Math.floor(available / assortQty));
    }
    return min === Infinity ? 0 : min;
  }, [selectedVariant, baseBreakdown]);

  // Cartons already in cart for this specific variant
  const cartonsAlreadyInCart = useMemo(() => {
    const entry = cart.find(
      (c) => c.articleId === article.id && c.variantId === selectedVariantId
    );
    return entry ? entry.cartonCount : 0;
  }, [cart, article.id, selectedVariantId]);

  // Max additional cartons the distributor can still add
  const maxAdditionalCartons = Math.max(
    0,
    maxCartonsFromStock - cartonsAlreadyInCart
  );
  const isOutOfStock = maxCartonsFromStock === 0;
  const isAtMax = cartonCount >= maxAdditionalCartons;

  const liveStockPairs = useMemo(() => {
    if (!selectedVariant) return 0;
    const sizeMap = selectedVariant.sizeMap || {};
    return Object.values(sizeMap).reduce((sum, cell: any) => {
      const qty = typeof cell === "number" ? cell : Number(cell?.qty || 0);
      const blocked =
        typeof cell === "object" ? Number(cell?.blockedQty || 0) : 0;
      return sum + Math.max(0, qty - blocked);
    }, 0);
  }, [selectedVariant]);

  // Reset carton count if selected variant or stock max changes
  useEffect(() => {
    setCartonCount(1);
  }, [selectedVariantId]);

  // Pricing
  const fullPricePerPair = article.pricePerPair;
  const discountedPricePerPair =
    fullPricePerPair * (1 - discountPercentage / 100);
  const discountedPricePerCarton = discountedPricePerPair * PAIRS_PER_CARTON;
  const variantMrp =
    distributorTag === "online"
      ? selectedVariant?.onlineMrp || article.mrp || fullPricePerPair * 2
      : distributorTag === "offline"
      ? selectedVariant?.offlineMrp || article.mrp || fullPricePerPair * 2
      : article.mrp || fullPricePerPair * 2;

  // Images carousel
  // Priority: colorMedia[color] → primaryImage + secondaryImages (article-level flat)
  // Variant.images is not a stored field in the schema, so we skip that path.
  const images = useMemo(() => {
    const colorMedia = (article as any).colorMedia || [];
    const targetColor = (color || "").toLowerCase().trim();
    const mediaMatch = colorMedia.find(
      (m: any) => (m.color || "").toLowerCase().trim() === targetColor
    );

    let gallery: string[] = [];

    if (mediaMatch?.images?.length > 0) {
      // Color-specific images from colorMedia
      gallery = mediaMatch.images.map((img: any) =>
        getImageUrl(typeof img === "object" ? img.url : img)
      );
    } else {
      // Flat article-level images — primaryImage first, then secondaryImages
      gallery = [
        getImageUrl(article.imageUrl),
        ...(article.secondaryImages || []).map((s: any) =>
          getImageUrl(typeof s === "object" ? s.url : s)
        ),
      ];
    }

    // Strip empty strings and deduplicate — prevents blank broken-image slots
    const seen = new Set<string>();
    return gallery.filter((url) => {
      if (!url) return false;
      if (seen.has(url)) return false;
      seen.add(url);
      return true;
    });
  }, [article, color, variants]);

  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const carouselRef = useRef<HTMLDivElement>(null);
  const [pointerStart, setPointerStart] = useState<number | null>(null);
  const [brokenImages, setBrokenImages] = useState<Set<string>>(new Set());

  // Only show images that have not failed to load
  const validImages = useMemo(
    () => images.filter((img) => img && !brokenImages.has(img)),
    [images, brokenImages]
  );

  const handleImageError = useCallback((url: string) => {
    setBrokenImages((prev) => new Set(prev).add(url));
  }, []);

  // Amazon zoom
  const { zoom, onMouseMove, onMouseLeave } = useAmazonZoom();
  const currentImageUrl =
    validImages[currentImageIndex] || validImages[0] || "";

  useEffect(() => {
    setCurrentImageIndex(0);
    setBrokenImages(new Set());
  }, [images]);

  const canGoPrev = currentImageIndex > 0;
  const canGoNext = currentImageIndex < validImages.length - 1;

  const goNext = () => {
    if (!canGoNext) return;
    setCurrentImageIndex((p) => p + 1);
  };
  const goPrev = () => {
    if (!canGoPrev) return;
    setCurrentImageIndex((p) => p - 1);
  };

  const carouselBtnClass = (enabled: boolean) =>
    `p-1.5 rounded-lg border backdrop-blur-md shadow-lg transition-all ${
      enabled
        ? "bg-black/60 border-white/30 text-white hover:bg-black/75 hover:scale-105 cursor-pointer"
        : "bg-black/30 border-white/10 text-white/40 cursor-not-allowed"
    }`;

  const handlePointerDown = (e: React.PointerEvent) => {
    setPointerStart(e.clientX);
    carouselRef.current?.setPointerCapture(e.pointerId);
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (pointerStart === null) return;
    const d = pointerStart - e.clientX;
    if (d > 50) {
      goNext();
      setPointerStart(e.clientX);
    }
    if (d < -50) {
      goPrev();
      setPointerStart(e.clientX);
    }
  };
  const handlePointerUp = (e: React.PointerEvent) => {
    if (pointerStart !== null) {
      const d = pointerStart - e.clientX;
      if (d > 50) goNext();
      if (d < -50) goPrev();
      setPointerStart(null);
    }
    carouselRef.current?.releasePointerCapture(e.pointerId);
  };
  const handlePointerCancel = (e: React.PointerEvent) => {
    setPointerStart(null);
    carouselRef.current?.releasePointerCapture(e.pointerId);
  };

  const handleAdd = () => {
    if (!selectedVariant || totalPairs === 0) return;
    if (isOutOfStock) {
      toast.error("This variant is out of stock");
      return;
    }
    if (cartonCount > maxAdditionalCartons) {
      toast.error(
        `Only ${maxAdditionalCartons} carton(s) available for this variant`
      );
      return;
    }
    const finalSizeQty: Record<string, number> = {};
    Object.entries(baseBreakdown).forEach(([sz, qty]) => {
      finalSizeQty[sz] = (Number(qty) || 0) * cartonCount;
    });
    addToCart(article.id, selectedVariant.id, finalSizeQty);
    setCartonCount(1);
    toast.success(`${article.name} (${color}) added to cart`);
  };

  return (
    <div
      className={`bg-white rounded-3xl overflow-hidden border shadow-sm group transition-all duration-300 ${
        isOutOfStock
          ? "border-slate-200 opacity-75"
          : "border-slate-200 hover:shadow-xl hover:border-indigo-200"
      }`}
    >
      {/* Image + Magnifier */}
      <div className="relative aspect-square overflow-hidden group/image">
        <div
          ref={carouselRef}
          className="relative h-full w-full cursor-crosshair"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onMouseMove={onMouseMove}
          onMouseLeave={onMouseLeave}
          style={{ userSelect: "none", touchAction: "pan-y" }}
        >
          {/* Carousel strip — only valid (non-broken) images are rendered */}
          {validImages.length > 0 ? (
            <div
              className="flex h-full w-full transition-transform duration-300 ease-out"
              style={{ transform: `translateX(-${currentImageIndex * 100}%)` }}
            >
              {validImages.map((img, idx) => (
                <div
                  key={idx}
                  className="min-w-full w-full shrink-0 flex-[0_0_100%] h-full"
                >
                  <img
                    src={img}
                    alt={`${article.name} ${idx + 1}`}
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                    className="w-full h-full object-cover pointer-events-none"
                    onError={() => handleImageError(img)}
                  />
                </div>
              ))}
            </div>
          ) : (
            // All images broken / no images — show a clean placeholder
            <div className="flex h-full w-full items-center justify-center bg-slate-100">
              <div className="flex flex-col items-center gap-2 text-slate-400">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="40"
                  height="40"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                  <circle cx="9" cy="9" r="2" />
                  <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                </svg>
                <span className="text-xs font-semibold">{article.name}</span>
              </div>
            </div>
          )}

          {/* Amazon zoom panel — rendered via portal so it escapes overflow:hidden */}
          {zoom.visible &&
            currentImageUrl &&
            createPortal(
              <div
                className="pointer-events-none fixed z-9999 rounded-2xl overflow-hidden border-2 border-slate-200 shadow-2xl"
                style={{
                  left: zoom.panelLeft,
                  top: zoom.panelTop,
                  width: ZOOM_SIZE,
                  height: ZOOM_SIZE,
                  backgroundImage: `url(${currentImageUrl})`,
                  backgroundSize: "400% 400%",
                  backgroundPosition: `${zoom.pctX}% ${zoom.pctY}%`,
                  backgroundRepeat: "no-repeat",
                }}
              />,
              document.body
            )}

          {/* Color bar */}
          <div className="absolute bottom-0 left-0 right-0 h-1.5 z-10 flex">
            {Array.from(
              new Set((article.variants || []).map((v) => v.color))
            ).map((c, i) => (
              <div
                key={i}
                className="h-full flex-1"
                style={{ backgroundColor: colorToHex(c) }}
                title={`Color: ${c}`}
              />
            ))}
          </div>

          {/* Out of Stock overlay */}
          {isOutOfStock && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/60 backdrop-blur-[2px]">
              <span className="bg-red-600 text-white text-xs font-black px-4 py-2 rounded-full shadow-lg tracking-widest uppercase">
                Out of Stock
              </span>
            </div>
          )}

          {/* Discount badge */}
          {discountPercentage > 0 && !isOutOfStock && (
            <div className="absolute top-3 right-3 z-10 bg-emerald-500 text-white text-[10px] font-black px-2 py-1 rounded-full shadow-md">
              {discountPercentage}% OFF
            </div>
          )}

          <div className="absolute top-4 left-4 flex flex-col gap-2 z-10">
            <div className="bg-white/95 backdrop-blur shadow-sm px-3 py-1.5 rounded-full text-[10px] font-black text-indigo-600 uppercase tracking-widest border border-indigo-50">
              {article.category}
            </div>
          </div>
        </div>

        {/* Manual carousel — visible on image hover only */}
        {validImages.length > 1 && (
          <div className="absolute bottom-3 left-3 z-30 flex items-center gap-1 opacity-0 group-hover/image:opacity-100 transition-opacity duration-200 pointer-events-none group-hover/image:pointer-events-auto">
            <button
              type="button"
              onClick={goPrev}
              disabled={!canGoPrev}
              className={carouselBtnClass(canGoPrev)}
              aria-label="Previous image"
            >
              <ChevronLeft size={16} strokeWidth={2.5} />
            </button>
            <button
              type="button"
              onClick={goNext}
              disabled={!canGoNext}
              className={carouselBtnClass(canGoNext)}
              aria-label="Next image"
            >
              <ChevronRight size={16} strokeWidth={2.5} />
            </button>
          </div>
        )}
      </div>

      <div className="p-5">
        <div className="mb-4">
          <h4 className="font-extrabold text-slate-900 group-hover:text-indigo-600 transition-all">
            {article.name}{" "}
            <span className="text-slate-400 font-medium">({color})</span>
          </h4>
          <p className="text-[10px] text-slate-400 font-mono mt-0.5 tracking-wider uppercase">
            {article.sku}
          </p>
        </div>

        {/* Price section */}
        <div className="flex items-center justify-between mb-5">
          <div className="space-y-1">
            <p className="text-xl font-black text-indigo-700">
              ₹
              {Math.round(
                priceView === "pair"
                  ? fullPricePerPair
                  : fullPricePerPair * PAIRS_PER_CARTON
              ).toLocaleString()}
              <span className="text-xs font-semibold text-slate-400 ml-1">
                /{priceView === "pair" ? "pair" : "carton"}
              </span>
            </p>
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border-2 ${
                articleStatus === "WISHLIST"
                  ? "bg-amber-600 text-white border-amber-600"
                  : "bg-indigo-600 text-white border-indigo-600"
              }`}
            >
              {articleStatus === "WISHLIST" ? "Available in 30 Days" : "RFD"}
            </span>
          </div>
          <div className="bg-indigo-50 p-2 rounded-xl shrink-0">
            <Package size={16} className="text-indigo-600" />
          </div>
        </div>

        {/* Size Range */}
        <div className="mb-4 space-y-2">
          <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider ml-1">
            Size Range
          </label>
          <select
            value={selectedVariantId}
            onChange={(e) => setSelectedVariantId(e.target.value)}
            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all font-bold text-slate-700 text-xs cursor-pointer shadow-sm"
          >
            {variants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.sizeRange}
              </option>
            ))}
          </select>
        </div>

        {/* Assortment Breakdown */}
        {selectedVariant && (
          <div className="mb-6 bg-slate-50/80 rounded-2xl p-3 border border-slate-100">
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2 px-1">
              Assortment Breakdown
            </p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(baseBreakdown).map(([sz, qty]) => (
                <div
                  key={sz}
                  className="flex flex-col items-center bg-white border border-slate-200 rounded-lg px-2 py-1 min-w-[32px]"
                >
                  <span className="text-[10px] font-black text-indigo-600">
                    {sz}
                  </span>
                  <span className="text-[10px] font-bold text-slate-400">
                    {qty}
                  </span>
                </div>
              ))}
            </div>
            {/* <div className="mt-2 pt-2 border-t border-slate-200/50 px-1 flex justify-between items-center">
              <span className="text-[10px] font-bold text-slate-500 uppercase">Carton Total</span>
              <span className="text-xs font-black text-slate-900">{totalPairsPerCarton} Pairs</span>
            </div> */}
          </div>
        )}

        {/* Controls */}
        <div className="flex items-stretch gap-3">
          <div className="flex items-center bg-slate-50 border border-slate-200 rounded-2xl p-1 shadow-inner">
            <button
              onClick={() => setCartonCount((p) => Math.max(1, p - 1))}
              className="p-2 hover:bg-white rounded-xl text-slate-500 hover:text-indigo-600 transition-all disabled:opacity-20"
              disabled={cartonCount <= 1 || isOutOfStock}
            >
              <Minus size={14} />
            </button>
            <div className="flex flex-col items-center justify-center min-w-[56px] px-1">
              <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter mb-0.5 leading-none">
                Cartons
              </span>
              <span className="text-sm font-black text-slate-900 leading-none">
                {isOutOfStock ? 0 : cartonCount}
              </span>
            </div>
            <button
              onClick={() =>
                setCartonCount((p) => Math.min(maxAdditionalCartons, p + 1))
              }
              className="p-2 hover:bg-white rounded-xl text-slate-500 hover:text-indigo-600 transition-all disabled:opacity-20"
              disabled={isOutOfStock || isAtMax}
            >
              <Plus size={14} />
            </button>
          </div>

          <button
            onClick={handleAdd}
            disabled={
              totalPairs === 0 || isOutOfStock || maxAdditionalCartons === 0
            }
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-2xl px-6 font-black text-sm transition-all shadow-lg shadow-indigo-100 flex items-center justify-center gap-2 group/btn active:scale-95 py-3"
          >
            <ShoppingCart
              size={16}
              className="group-hover/btn:scale-110 transition-transform"
            />
          </button>
        </div>
      </div>
    </div>
  );
};

// Helper to map DB master catalog item to Article interface
const mapDocToArticle = (doc: any): Article => ({
  id: doc._id || doc.id,
  sku: doc.variants?.[0]?.hsnCode || doc._id,
  name: doc.articleName,
  category: doc.gender || doc.categoryId?.name,
  assortmentId: doc._id,
  pricePerPair:
    doc.mrp || doc.variants?.[0]?.sellingPrice || doc.variants?.[0]?.mrp || 0,
  imageUrl: doc.primaryImage?.url || doc.variants?.[0]?.images?.[0] || "",
  images: doc.secondaryImages?.map((i: any) => i.url) || [],
  secondaryImages: doc.secondaryImages || [],
  colorMedia: doc.colorMedia || [],
  mrp: doc.mrp,
  soleColor: doc.soleColor,
  productCategory: doc.categoryId?.name,
  brand: doc.brandId?.name,
  status: doc.stage || "AVAILABLE",
  expectedDate: doc.expectedAvailableDate,
  selectedColors: doc.productColors || [],
  selectedSizes: doc.sizeRanges || [],
  variants: (doc.variants || []).map((v: any) => ({
    id: v._id || v.id,
    _id: v._id || v.id,
    itemName: v.itemName || doc.articleName,
    sku: v.hsnCode || "",
    sizeSkus: {},
    color: v.color,
    sizeRange: v.sizeRange,
    sizeRangeId: v.sizeRangeId,
    costPrice: v.costPrice || 0,
    sellingPrice: v.sellingPrice || 0,
    mrp: v.mrp || 0,
    hsnCode: v.hsnCode,
    sizeQuantities: v.sizeQuantities || {},
    sizeMap: v.sizeMap || {},
    images: (v.images || []).map((i: any) =>
      typeof i === "string" ? i : i.url
    ),
    isActive: v.isActive !== false,
    tag: v.tag,
    onlineMrp: v.onlineMrp,
    offlineMrp: v.offlineMrp,
  })),
});

// ─── Shop (page) ────────────────────────────────────────────────────────────
const Shop: React.FC<ShopProps> = ({
  articles: initialArticles,
  inventory,
  cart,
  addToCart,
  removeFromCart,
  goToCart,
  user,
}) => {
  const cartItemsCount = cart.reduce((sum, item) => sum + item.pairCount, 0);
  const discountPercentage = user?.discountPercentage || 0;
  const distributorTag = user?.tag;
  const [priceView, setPriceView] = useState<PriceView>("pair");
  const [search, setSearch] = useState("");

  // Filter & Sort state
  const [genderFilter, setGenderFilter] = useState<string>("ALL");
  const [sortOption, setSortOption] = useState<string>("name_asc");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const inStockOnly = true;

  // Server-side Pagination & Infinite Scroll State
  const BATCH_SIZE = 12;
  const [page, setPage] = useState(1);
  const [hasMorePages, setHasMorePages] = useState(true);
  const [totalServerItems, setTotalServerItems] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [backendArticles, setBackendArticles] = useState<Article[]>([]);
  const observerRef = useRef<HTMLDivElement | null>(null);

  // Fetch Page 1 whenever search, gender, sort, or status changes
  const fetchInitialPage = useCallback(async () => {
    setLoading(true);
    setPage(1);
    try {
      let docs: any[] = [];
      let totalCount = 0;

      if (statusFilter === "ALL") {
        // Fetch both AVAILABLE and WISHLIST (pre-book) items
        const [resAvailable, resPreBook] = await Promise.all([
          masterCatalogService.listMasterItems({
            page: 1,
            limit: 1000,
            stage: "AVAILABLE",
            q: search || undefined,
            gender: genderFilter !== "ALL" ? genderFilter : undefined,
            sort: sortOption,
          }),
          masterCatalogService.listMasterItems({
            page: 1,
            limit: 1000,
            stage: "WISHLIST",
            q: search || undefined,
            gender: genderFilter !== "ALL" ? genderFilter : undefined,
            sort: sortOption,
          }),
        ]);

        const docsAvailable = resAvailable.data || resAvailable.items || [];
        const docsPreBook = resPreBook.data || resPreBook.items || [];
        docs = [...docsAvailable, ...docsPreBook];
        totalCount = docs.length;
      } else {
        // Fetch single stage
        const res = await masterCatalogService.listMasterItems({
          page: 1,
          limit: BATCH_SIZE,
          stage: statusFilter,
          q: search || undefined,
          gender: genderFilter !== "ALL" ? genderFilter : undefined,
          sort: sortOption,
        });

        docs = res.data || res.items || [];
        const meta = res.meta || {};
        totalCount = meta.total || docs.length;
      }

      const fetchedArticles = docs.map(mapDocToArticle);
      setBackendArticles(fetchedArticles);
      setTotalServerItems(totalCount);
      setHasMorePages(false); // Disable pagination for now with full fetch
    } catch {
      toast.error("Failed to load catalog");
    } finally {
      setLoading(false);
    }
  }, [search, genderFilter, sortOption, statusFilter]);

  // Load Next Page for Infinite Scroll
  const loadNextPage = useCallback(async () => {
    if (loadingMore || !hasMorePages || statusFilter === "ALL") return;
    setLoadingMore(true);
    const nextPage = page + 1;
    try {
      const res = await masterCatalogService.listMasterItems({
        page: nextPage,
        limit: BATCH_SIZE,
        stage: statusFilter,
        q: search || undefined,
        gender: genderFilter !== "ALL" ? genderFilter : undefined,
        sort: sortOption,
      });

      const docs = res.data || res.items || [];
      const fetchedArticles = docs.map(mapDocToArticle);
      setBackendArticles((prev) => [...prev, ...fetchedArticles]);
      setPage(nextPage);

      const meta = res.meta || {};
      const totalPages = meta.totalPages || 1;
      setHasMorePages(nextPage < totalPages);
    } catch {
      toast.error("Failed to load more items");
    } finally {
      setLoadingMore(false);
    }
  }, [
    page,
    hasMorePages,
    loadingMore,
    search,
    genderFilter,
    sortOption,
    statusFilter,
  ]);

  useEffect(() => {
    fetchInitialPage();
  }, [fetchInitialPage]);

  // IntersectionObserver for Backend Infinite Scroll
  useEffect(() => {
    if (!hasMorePages || loadingMore || loading) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadNextPage();
        }
      },
      { threshold: 0.1, rootMargin: "200px" }
    );

    const currentObs = observerRef.current;
    if (currentObs) observer.observe(currentObs);

    return () => {
      if (currentObs) observer.unobserve(currentObs);
    };
  }, [hasMorePages, loadingMore, loading, loadNextPage]);

  // Build color groups — filtered by distributor tag and stock availability
  const colorGroups = useMemo(() => {
    return backendArticles.flatMap((article) => {
      const variants = article.variants || [];
      const groups: Record<string, Variant[]> = {};
      variants.forEach((v) => {
        if (distributorTag && v.tag && v.tag !== distributorTag) return;
        // Pre-book (WISHLIST) items are allowed with 0 stock; only filter available items by stock
        const isPreBook = article.status === "WISHLIST";
        if (!isPreBook && inStockOnly && !isVariantInStock(v)) return;
        if (!groups[v.color]) groups[v.color] = [];
        groups[v.color].push(v);
      });
      return Object.entries(groups)
        .filter(([, colorVariants]) => colorVariants.length > 0)
        .map(([color, colorVariants]) => ({
          article,
          color,
          variants: colorVariants,
        }));
    });
  }, [backendArticles, distributorTag, inStockOnly]);

  return (
    <div className="space-y-8 pb-20">
      {/* Search + filters bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:max-w-xs">
          <Search
            className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
            size={18}
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            type="text"
            placeholder="Search article or SKU..."
            className="w-full pl-12 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-sm font-medium"
          />
        </div>

        {/* Filters & Sorting controls */}
        <div className="flex flex-wrap gap-2 w-full md:w-auto items-center justify-between md:justify-end">
          {/* Gender Filter Pills */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl gap-1">
            {["ALL", "MEN", "WOMEN", "KIDS"].map((g) => (
              <button
                key={g}
                onClick={() => setGenderFilter(g)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  genderFilter === g
                    ? "bg-white text-indigo-600 shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {g === "ALL" ? "All" : g.charAt(0) + g.slice(1).toLowerCase()}
              </button>
            ))}
          </div>

          {/* Availability Filter Pills */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl gap-1">
            {["ALL", "AVAILABLE", "WISHLIST"].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  statusFilter === s
                    ? "bg-white text-indigo-600 shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {s === "ALL" ? "All" : s === "AVAILABLE" ? "RFD" : "30 Days"}
              </button>
            ))}
          </div>

          {/* Sort dropdown */}
          <select
            value={sortOption}
            onChange={(e) => setSortOption(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer"
          >
            <option value="default">Sort: Featured</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="price_desc">Price: High to Low</option>
            <option value="name_asc">Name: A to Z</option>
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
          </select>

          {/* Price view toggle */}
          <div className="flex items-center bg-slate-100 rounded-xl p-1 gap-1">
            <button
              onClick={() => setPriceView("pair")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                priceView === "pair"
                  ? "bg-white text-indigo-600 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Tag size={12} />
              Pair
            </button>
            <button
              onClick={() => setPriceView("carton")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                priceView === "carton"
                  ? "bg-white text-indigo-600 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Layers size={12} />
              Carton
            </button>
          </div>

          {cartItemsCount > 0 && (
            <button
              onClick={goToCart}
              className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all text-xs"
            >
              <ShoppingCart size={16} />
              Cart ({cartItemsCount})
            </button>
          )}
        </div>
      </div>

      {/* Discount info banner */}
      {discountPercentage > 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-3 flex items-center gap-3">
          <Tag size={16} className="text-emerald-600 shrink-0" />
          <p className="text-sm font-semibold text-emerald-800">
            Your exclusive discount of{" "}
            <span className="font-black">{discountPercentage}%</span> is applied
            to all prices shown below.
          </p>
        </div>
      )}

      {/* Loading state */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 size={32} className="animate-spin text-indigo-600" />
          <p className="text-xs font-bold text-slate-500">
            Loading catalog from server...
          </p>
        </div>
      ) : (
        <>
          {/* Product Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
            {colorGroups.map(({ article, color, variants }) => {
              const inv = inventory.find((i) => i.articleId === article.id);

              return (
                <ArticleCard
                  key={`${article.id}-${color}`}
                  group={{ article, color, variants }}
                  inv={inv}
                  cart={cart}
                  addToCart={addToCart}
                  discountPercentage={discountPercentage}
                  priceView={priceView}
                  distributorTag={distributorTag}
                  articleStatus={article.status}
                />
              );
            })}
          </div>

          {/* Infinite Scroll Trigger & Status */}
          {colorGroups.length > 0 && (
            <div className="flex flex-col items-center justify-center gap-3 pt-6 pb-4">
              {hasMorePages ? (
                <div
                  ref={observerRef}
                  className="flex flex-col items-center gap-2 py-4"
                >
                  {loadingMore ? (
                    <div className="flex items-center gap-2 text-xs font-bold text-indigo-600">
                      <Loader2 size={18} className="animate-spin" />
                      Loading more products...
                    </div>
                  ) : (
                    <button
                      onClick={loadNextPage}
                      className="text-xs font-bold text-indigo-600 hover:text-indigo-800 hover:underline"
                    >
                      Load more items (
                      {totalServerItems - backendArticles.length} remaining)
                    </button>
                  )}
                </div>
              ) : (
                <div className="text-center py-4 border-t border-slate-100 w-full">
                  <p className="text-xs font-bold text-slate-400">
                    🎉 You've reached the end of the catalogue (
                    {colorGroups.length} items shown)
                  </p>
                </div>
              )}
            </div>
          )}

          {colorGroups.length === 0 && (
            <div className="py-20 flex flex-col items-center gap-3 text-slate-400">
              <Package size={40} />
              <p className="text-sm">No matching articles found</p>
            </div>
          )}
        </>
      )}

      {/* Mobile sticky cart bar */}
      {cartItemsCount > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-md z-30 sm:hidden">
          <button
            onClick={goToCart}
            className="w-full bg-indigo-600 text-white p-5 rounded-2xl shadow-2xl flex items-center justify-between font-bold"
          >
            <div className="flex items-center gap-3">
              <ShoppingCart size={24} />
              <span>View Cart</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="bg-white text-indigo-600 px-3 py-1 rounded-lg text-sm">
                {cartItemsCount}
              </span>
              <ArrowRight size={20} />
            </div>
          </button>
        </div>
      )}
    </div>
  );
};

export default Shop;
