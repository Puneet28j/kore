import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
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
} from "lucide-react";
import { Article, Inventory, Variant, User } from "../../types";
import { toast } from "sonner";
import { getImageUrl } from "../../utils/imageUtils";
import Pagination from "../ui/Pagination";

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
    red: "#ef4444", blue: "#3b82f6", green: "#22c55e", black: "#0f172a",
    white: "#f8fafc", grey: "#64748b", gray: "#64748b", yellow: "#eab308",
    orange: "#f97316", pink: "#ec4899", purple: "#a855f7", indigo: "#6366f1",
    brown: "#78350f", navy: "#1e3a8a", teal: "#14b8a6", cyan: "#06b6d4",
    gold: "#fbbf24", silver: "#cbd5e1",
  };
  return map[color.toLowerCase()] || "#cbd5e1";
};

// ─── Amazon-style zoom hook ─────────────────────────────────────────────────
const ZOOM_SIZE = 300;

const useAmazonZoom = () => {
  const [zoom, setZoom] = useState<{
    pctX: number; pctY: number;
    panelLeft: number; panelTop: number;
    visible: boolean;
  }>({ pctX: 0, pctY: 0, panelLeft: 0, panelTop: 0, visible: false });

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pctX = ((e.clientX - rect.left) / rect.width) * 100;
    const pctY = ((e.clientY - rect.top) / rect.height) * 100;

    // Show panel to the right; fall back to left if not enough space
    const spaceRight = window.innerWidth - rect.right;
    const panelLeft = spaceRight >= ZOOM_SIZE + 16
      ? rect.right + 8
      : rect.left - ZOOM_SIZE - 8;

    // Center panel vertically on the card, clamped to viewport
    const panelTop = Math.max(8, Math.min(
      rect.top + rect.height / 2 - ZOOM_SIZE / 2,
      window.innerHeight - ZOOM_SIZE - 8
    ));

    setZoom({ pctX, pctY, panelLeft, panelTop, visible: true });
  }, []);

  const onMouseLeave = useCallback(() => setZoom(p => ({ ...p, visible: false })), []);

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
}> = ({ group, inv, cart, addToCart, discountPercentage, priceView, distributorTag }) => {
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
  const maxAdditionalCartons = Math.max(0, maxCartonsFromStock - cartonsAlreadyInCart);
  const isOutOfStock = maxCartonsFromStock === 0;
  const isAtMax = cartonCount >= maxAdditionalCartons;

  // Reset carton count if selected variant or stock max changes
  useEffect(() => {
    setCartonCount(1);
  }, [selectedVariantId]);

  // Pricing
  const fullPricePerPair = article.pricePerPair;
  const discountedPricePerPair = fullPricePerPair * (1 - discountPercentage / 100);
  const discountedPricePerCarton = discountedPricePerPair * PAIRS_PER_CARTON;
  const variantMrp = distributorTag === "online"
    ? (selectedVariant?.onlineMrp || article.mrp || fullPricePerPair * 2)
    : distributorTag === "offline"
    ? (selectedVariant?.offlineMrp || article.mrp || fullPricePerPair * 2)
    : (article.mrp || fullPricePerPair * 2);

  // Images carousel
  const images = useMemo(() => {
    const colorMedia = (article as any).colorMedia || [];
    const targetColor = (color || "").toLowerCase().trim();
    const mediaMatch = colorMedia.find(
      (m: any) => (m.color || "").toLowerCase().trim() === targetColor
    );
    let gallery: string[] = [];
    if (mediaMatch?.images?.length > 0) {
      gallery = mediaMatch.images.map((img: any) =>
        getImageUrl(typeof img === "object" ? img.url : img)
      );
    } else {
      const variantImages = variants.flatMap((v) => v.images || []);
      gallery = variantImages.length > 0
        ? variantImages.map((img) => getImageUrl(img))
        : ([
            getImageUrl(article.imageUrl),
            ...(article.secondaryImages || []).map((s: any) => getImageUrl(s.url)),
          ].filter(Boolean) as string[]);
    }
    if (gallery.length > 1) return [gallery[gallery.length - 1], ...gallery, gallery[0]];
    return gallery;
  }, [article, color, variants]);

  const [currentImageIndex, setCurrentImageIndex] = useState(images.length > 1 ? 1 : 0);
  const [transitionEnabled, setTransitionEnabled] = useState(true);
  const carouselRef = useRef<HTMLDivElement>(null);
  const [pointerStart, setPointerStart] = useState<number | null>(null);

  // Amazon zoom
  const { zoom, onMouseMove, onMouseLeave } = useAmazonZoom();
  const currentImageUrl = images[currentImageIndex] || images[0] || "";

  useEffect(() => { setCurrentImageIndex(images.length > 1 ? 1 : 0); }, [images.length]);

  useEffect(() => {
    if (images.length <= 1) return;
    const interval = setInterval(() => setCurrentImageIndex((p) => p + 1), 3000);
    return () => clearInterval(interval);
  }, [images.length]);

  useEffect(() => {
    if (images.length <= 1) return;
    if (currentImageIndex === images.length - 1) {
      setTimeout(() => { setTransitionEnabled(false); setCurrentImageIndex(1); }, 500);
    }
    if (currentImageIndex === 0) {
      setTimeout(() => { setTransitionEnabled(false); setCurrentImageIndex(images.length - 2); }, 500);
    }
  }, [currentImageIndex, images.length]);

  useEffect(() => {
    if (!transitionEnabled) {
      const id = requestAnimationFrame(() => setTransitionEnabled(true));
      return () => cancelAnimationFrame(id);
    }
  }, [transitionEnabled]);

  const goNext = () => setCurrentImageIndex((p) => p + 1);
  const goPrev = () => setCurrentImageIndex((p) => p - 1);

  const handlePointerDown = (e: React.PointerEvent) => {
    setPointerStart(e.clientX);
    carouselRef.current?.setPointerCapture(e.pointerId);
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (pointerStart === null) return;
    const d = pointerStart - e.clientX;
    if (d > 50) { goNext(); setPointerStart(e.clientX); }
    if (d < -50) { goPrev(); setPointerStart(e.clientX); }
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
      toast.error(`Only ${maxAdditionalCartons} carton(s) available for this variant`);
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
    <div className={`bg-white rounded-3xl overflow-hidden border shadow-sm group transition-all duration-300 ${
      isOutOfStock
        ? "border-slate-200 opacity-75"
        : "border-slate-200 hover:shadow-xl hover:border-indigo-200"
    }`}>
      {/* Image + Magnifier */}
      <div
        ref={carouselRef}
        className="relative aspect-square overflow-hidden cursor-crosshair"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        style={{ userSelect: "none", touchAction: "pan-y" }}
      >
        {/* Carousel strip */}
        <div
          className="flex h-full"
          style={{
            transform: `translateX(-${currentImageIndex * 100}%)`,
            transition: transitionEnabled ? "transform 500ms ease" : "none",
          }}
        >
          {images.map((img, idx) => (
            <img
              key={idx}
              src={img}
              alt={`${article.name} ${idx + 1}`}
              loading="lazy"
              decoding="async"
              className="w-full h-full object-cover shrink-0"
            />
          ))}
        </div>

        {/* Amazon zoom panel — rendered via portal so it escapes overflow:hidden */}
        {zoom.visible && currentImageUrl && createPortal(
          <div
            className="pointer-events-none fixed z-[9999] rounded-2xl overflow-hidden border-2 border-slate-200 shadow-2xl"
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
          {Array.from(new Set((article.variants || []).map((v) => v.color))).map((c, i) => (
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

        {/* Stock badge (shown when not out of stock) */}
        {!isOutOfStock && maxCartonsFromStock <= 10 && (
          <div className="absolute top-3 right-3 z-10 bg-amber-500 text-white text-[10px] font-black px-2 py-1 rounded-full shadow-md">
            Only {maxCartonsFromStock} CTN left
          </div>
        )}

        <div className="absolute top-4 left-4 flex flex-col gap-2 z-10">
          <div className="bg-white/95 backdrop-blur shadow-sm px-3 py-1.5 rounded-full text-[10px] font-black text-indigo-600 uppercase tracking-widest border border-indigo-50">
            {article.category}
          </div>
        </div>
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
          <div className="space-y-0.5">
            <p className="text-xl font-black text-indigo-700">
              ₹{Math.round(priceView === "pair" ? discountedPricePerPair : discountedPricePerCarton).toLocaleString()}
              <span className="text-xs font-semibold text-slate-400 ml-1">
                /{priceView === "pair" ? "pair" : "carton"}
              </span>
            </p>
            {discountPercentage > 0 && (
              <p className="text-[10px] font-bold text-slate-400 line-through">
                MRP ₹{Math.round(priceView === "pair" ? fullPricePerPair : fullPricePerPair * PAIRS_PER_CARTON).toLocaleString()}
              </p>
            )}
            {discountPercentage === 0 && (
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                MRP: ₹{variantMrp.toLocaleString()}
              </p>
            )}
          </div>
          <div className="bg-indigo-50 p-2 rounded-xl">
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
                  <span className="text-[10px] font-black text-indigo-600">{sz}</span>
                  <span className="text-[10px] font-bold text-slate-400">{qty}</span>
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
              <span className="text-sm font-black text-slate-900 leading-none">{isOutOfStock ? 0 : cartonCount}</span>
            </div>
            <button
              onClick={() => setCartonCount((p) => Math.min(maxAdditionalCartons, p + 1))}
              className="p-2 hover:bg-white rounded-xl text-slate-500 hover:text-indigo-600 transition-all disabled:opacity-20"
              disabled={isOutOfStock || isAtMax}
            >
              <Plus size={14} />
            </button>
          </div>

          <button
            onClick={handleAdd}
            disabled={totalPairs === 0 || isOutOfStock || maxAdditionalCartons === 0}
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-2xl px-6 font-black text-sm transition-all shadow-lg shadow-indigo-100 flex items-center justify-center gap-2 group/btn active:scale-95"
          >
            <ShoppingCart size={16} className="group-hover/btn:scale-110 transition-transform" />
            {/* <span>Add to Cart</span> */}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Shop (page) ────────────────────────────────────────────────────────────
const Shop: React.FC<ShopProps> = ({
  articles,
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
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 24;
  useEffect(() => { setPage(1); }, [search]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return articles.filter(
      (a) =>
        a.status !== "WISHLIST" &&
        (!q || a.name.toLowerCase().includes(q) || (a.sku || "").toLowerCase().includes(q))
    );
  }, [articles, search]);

  // Build color groups — filtered by distributor tag
  const allColorGroups = useMemo(() => {
    return filtered.flatMap((article) => {
      const variants = article.variants || [];
      const groups: Record<string, Variant[]> = {};
      variants.forEach((v) => {
        if (distributorTag && v.tag && v.tag !== distributorTag) return;
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
  }, [filtered, distributorTag]);

  const totalPages = Math.ceil(allColorGroups.length / PAGE_SIZE);
  const colorGroups = useMemo(
    () => allColorGroups.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [allColorGroups, page, PAGE_SIZE]
  );

  return (
    <div className="space-y-8 pb-20">
      {/* Search + filters bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            type="text"
            placeholder="Search by article name or SKU..."
            className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
          />
        </div>

        <div className="flex gap-2 w-full md:w-auto items-center">
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
              Per Pair
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
              Per Carton
            </button>
          </div>

          {cartItemsCount > 0 && (
            <button
              onClick={goToCart}
              className="flex-1 md:flex-none bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all"
            >
              <ShoppingCart size={18} />
              View Cart ({cartItemsCount})
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

      {/* Grid */}
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
            />
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={(p) => { setPage(p); window.scrollTo({ top: 0, behavior: "smooth" }); }}
            totalItems={allColorGroups.length}
            itemsPerPage={PAGE_SIZE}
          />
        </div>
      )}

      {allColorGroups.length === 0 && (
        <div className="py-20 flex flex-col items-center gap-3 text-slate-400">
          <Package size={40} />
          <p className="text-sm">No articles found</p>
        </div>
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
