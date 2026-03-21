import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  ShoppingCart,
  Plus,
  Minus,
  Info,
  Search,
  Filter,
  ArrowRight,
  Package,
} from "lucide-react";
import { Article, Inventory, Variant } from "../../types";
import { toast } from "sonner";
import { getImageUrl } from "../../utils/imageUtils";

// Props for Shop component
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
}

// Grouping unit for the shop
interface ColorGroup {
  article: Article;
  color: string;
  variants: Variant[];
}

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

// Article card component
const ArticleCard: React.FC<{
  group: ColorGroup;
  inv?: Inventory;
  inCartPairs: number;
  addToCart: ShopProps["addToCart"];
}> = ({ group, inv, inCartPairs, addToCart }) => {
  const { article, color, variants } = group;

  // Selected variant ID (single selection)
  const [selectedVariantId, setSelectedVariantId] = useState<string>(
    variants.length > 0 ? variants[0].id : ""
  );

  // Carton multiplier
  const [cartonCount, setCartonCount] = useState(1);

  const selectedVariant = variants.find((v) => v.id === selectedVariantId);

  // Calculate total pairs and breakdown for the selection
  const baseBreakdown = selectedVariant?.sizeQuantities || {};

  const totalPairsPerCarton = Object.values(baseBreakdown).reduce(
    (a, b) => a + (Number(b) || 0),
    0
  );
  const totalPairs = totalPairsPerCarton * cartonCount;

  // priority for images: colorMedia (match by color) > variant specific images > article primary/secondary images
  const images = useMemo(() => {
    const colorMedia = (article as any).colorMedia || [];
    const targetColor = (color || "").toLowerCase().trim();
    const mediaMatch = colorMedia.find(
      (m: any) => (m.color || "").toLowerCase().trim() === targetColor
    );

    let gallery: string[] = [];

    if (mediaMatch && mediaMatch.images && mediaMatch.images.length > 0) {
      gallery = mediaMatch.images.map((img: any) =>
        getImageUrl(typeof img === "object" ? img.url : img)
      );
    } else {
      const variantImages = variants.flatMap((v) => v.images || []);
      const absoluteVariantImages = variantImages.map(img => getImageUrl(img));
      
      gallery =
        absoluteVariantImages.length > 0
          ? absoluteVariantImages
          : ([
              getImageUrl(article.imageUrl),
              ...(article.secondaryImages || []).map((s: any) => getImageUrl(s.url)),
            ].filter(Boolean) as string[]);
    }

    if (gallery.length > 1) {
      return [gallery[gallery.length - 1], ...gallery, gallery[0]];
    }
    return gallery;
  }, [article, color, variants]);

  const [currentImageIndex, setCurrentImageIndex] = useState(images.length > 1 ? 1 : 0);
  const [transitionEnabled, setTransitionEnabled] = useState(true);

  useEffect(() => {
    setCurrentImageIndex(images.length > 1 ? 1 : 0);
  }, [images.length]);

  useEffect(() => {
    if (images.length <= 1) return;

    const interval = setInterval(() => {
      setCurrentImageIndex((prev) => prev + 1);
    }, 3000);

    return () => clearInterval(interval);
  }, [images.length]);

  useEffect(() => {
    if (images.length <= 1) return;

    if (currentImageIndex === images.length - 1) {
      setTimeout(() => {
        setTransitionEnabled(false);
        setCurrentImageIndex(1);
      }, 500);
    }

    if (currentImageIndex === 0) {
      setTimeout(() => {
        setTransitionEnabled(false);
        setCurrentImageIndex(images.length - 2);
      }, 500);
    }
  }, [currentImageIndex, images.length]);

  useEffect(() => {
    if (!transitionEnabled) {
      const id = requestAnimationFrame(() => {
        setTransitionEnabled(true);
      });
      return () => cancelAnimationFrame(id);
    }
  }, [transitionEnabled]);

  const carouselRef = useRef<HTMLDivElement>(null);

  // pointer-based swipe detection covers both touch and mouse input
  const [pointerStart, setPointerStart] = useState<number | null>(null);

  const goNext = () => setCurrentImageIndex((prev) => prev + 1);
  const goPrev = () => setCurrentImageIndex((prev) => prev - 1);

  const handlePointerDown = (e: React.PointerEvent) => {
    // start tracking the horizontal position
    setPointerStart(e.clientX);
    carouselRef.current?.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (pointerStart === null) return;
    const distance = pointerStart - e.clientX;
    if (distance > 50) {
      goNext();
      setPointerStart(e.clientX);
    }
    if (distance < -50) {
      goPrev();
      setPointerStart(e.clientX);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (pointerStart === null) return;

    const distance = pointerStart - e.clientX;
    if (distance > 50) goNext();
    if (distance < -50) goPrev();

    setPointerStart(null);
    carouselRef.current?.releasePointerCapture(e.pointerId);
  };

  // optional: detect cancel events to clear state
  const handlePointerCancel = (e: React.PointerEvent) => {
    setPointerStart(null);
    carouselRef.current?.releasePointerCapture(e.pointerId);
  };

  const handleAdd = () => {
    if (!selectedVariant || totalPairs === 0) return;

    // Combine all size quantities scaled by cartons
    const finalSizeQty: Record<string, number> = {};
    Object.entries(baseBreakdown).forEach(([sz, qty]) => {
      finalSizeQty[sz] = (Number(qty) || 0) * cartonCount;
    });

    // The current addToCart signature takes a single variantId. 
    addToCart(article.id, selectedVariant.id, finalSizeQty);

    setCartonCount(1);
    toast.success(`${article.name} (${color}) added to cart`);
  };

  return (
    <div className="bg-white rounded-3xl overflow-hidden border border-slate-200 shadow-sm group hover:shadow-xl hover:border-indigo-200 transition-all duration-300">
      <div
        ref={carouselRef}
        className="relative aspect-square overflow-hidden"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        style={{ userSelect: "none", touchAction: "pan-y" }}
      >
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

        {/* Color Bar (Showing all available colors for this article) */}
        <div className="absolute bottom-0 left-0 right-0 h-1.5 z-10 flex">
          {Array.from(new Set((article.variants || []).map(v => v.color))).map((c, i) => (
            <div 
              key={i}
              className="h-full flex-1"
              style={{ backgroundColor: colorToHex(c) }}
              title={`Available Color: ${c}`}
            />
          ))}
        </div>

        <div className="absolute top-4 left-4 flex flex-col gap-2">
          <div className="bg-white/95 backdrop-blur shadow-sm px-3 py-1.5 rounded-full text-[10px] font-black text-indigo-600 uppercase tracking-widest border border-indigo-50">
            {article.category}
          </div>
        </div>
      </div>

      <div className="p-5">
        <div className="mb-4">
          <h4 className="font-extrabold text-slate-900 group-hover:text-indigo-600 transition-all">
            {article.name} <span className="text-slate-400 font-medium">({color})</span>
          </h4>
          <p className="text-[10px] text-slate-400 font-mono mt-0.5 tracking-wider uppercase">
            {article.sku}
          </p>
        </div>

        <div className="flex items-center justify-between mb-5">
          <div className="space-y-0.5">
            <p className="text-xl font-black text-slate-900">
              ₹{article.pricePerPair.toLocaleString()}
            </p>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              MRP: ₹{article.mrp || article.pricePerPair * 2}
            </p>
          </div>
          <div className="bg-indigo-50 p-2 rounded-xl">
             <Package size={16} className="text-indigo-600" />
          </div>
        </div>

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
                <div key={sz} className="flex flex-col items-center bg-white border border-slate-200 rounded-lg px-2 py-1 min-w-[32px]">
                   <span className="text-[10px] font-black text-indigo-600">{sz}</span>
                   <span className="text-[10px] font-bold text-slate-400">{qty}</span>
                </div>
              ))}
            </div>
            <div className="mt-2 pt-2 border-t border-slate-200/50 px-1 flex justify-between items-center">
               <span className="text-[10px] font-bold text-slate-500 uppercase">Carton Total</span>
               <span className="text-xs font-black text-slate-900">{totalPairsPerCarton} Pairs</span>
            </div>
          </div>
        )}

        <div className="flex items-stretch gap-3">
          <div className="flex items-center bg-slate-50 border border-slate-200 rounded-2xl p-1 shadow-inner group/carton">
             <button 
               onClick={() => setCartonCount(prev => Math.max(1, prev - 1))}
               className="p-2 hover:bg-white rounded-xl text-slate-500 hover:text-indigo-600 transition-all disabled:opacity-20"
               disabled={cartonCount <= 1}
             >
               <Minus size={14} />
             </button>
             
             <div className="flex flex-col items-center justify-center min-w-[56px] px-1">
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter mb-0.5 leading-none">Cartons</span>
                <span className="text-sm font-black text-slate-900 leading-none">{cartonCount}</span>
             </div>

             <button 
               onClick={() => setCartonCount(prev => prev + 1)}
               className="p-2 hover:bg-white rounded-xl text-slate-500 hover:text-indigo-600 transition-all"
             >
               <Plus size={14} />
             </button>
          </div>

          <button
            onClick={handleAdd}
            disabled={totalPairs === 0}
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-2xl px-6 font-black text-sm transition-all shadow-lg shadow-indigo-100 flex items-center justify-center gap-2 group/btn active:scale-95"
          >
            <ShoppingCart size={16} className="group-hover/btn:scale-110 transition-transform" />
            <span>Book</span>
          </button>
        </div>
      </div>
    </div>
  );
};

const Shop: React.FC<ShopProps> = ({
  articles, 
  inventory,
  cart,
  addToCart,
  removeFromCart,
  goToCart,
}) => {
  const cartItemsCount = cart.reduce((sum, item) => sum + item.pairCount, 0);

  return (
    <div className="space-y-8 pb-20">
      {/* Search and Filters Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:max-w-md">
          <Search
            className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
            size={18}
          />
          <input
            type="text"
            placeholder="Search by article name or SKU..."
            className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
          />
        </div>

        <div className="flex gap-2 w-full md:w-auto">
          <button className="flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-3 border border-slate-200 rounded-xl font-bold text-slate-700 hover:bg-slate-50 transition-all">
            <Filter size={18} />
            Filter
          </button>

          {cartItemsCount > 0 && (
            <button
              onClick={goToCart}
              className="flex-1 md:flex-none bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all"
            >
              <ShoppingCart size={18} />
              Checkout ({cartItemsCount})
            </button>
          )}
        </div>
      </div>

      {/* Article Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
        {articles
          .filter((a) => a.status !== "WISHLIST")
          .flatMap((article) => {
            const variants = article.variants || [];
            // Group variants by color
            const colorGroups: Record<string, Variant[]> = {};
            variants.forEach((v) => {
              if (!colorGroups[v.color]) colorGroups[v.color] = [];
              colorGroups[v.color].push(v);
            });

            return Object.entries(colorGroups).map(([color, colorVariants]) => {
              const group: ColorGroup = {
                article,
                color,
                variants: colorVariants,
              };

              const inv = inventory.find((i) => i.articleId === article.id);

              const pairsInCart = cart
                .filter((c) => c.articleId === article.id)
                .reduce((sum, i) => sum + i.pairCount, 0);

              return (
                <ArticleCard
                  key={`${article.id}-${color}`}
                  group={group}
                  inv={inv}
                  inCartPairs={pairsInCart}
                  addToCart={addToCart}
                />
              );
            });
          })}
      </div>

      {/* Persistent Cart Bar (Mobile) */}
      {cartItemsCount > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-md z-30 sm:hidden">
          <button
            onClick={goToCart}
            className="w-full bg-indigo-600 text-white p-5 rounded-2xl shadow-2xl flex items-center justify-between font-bold"
          >
            <div className="flex items-center gap-3">
              <ShoppingCart size={24} />
              <span>View Booking Cart</span>
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
