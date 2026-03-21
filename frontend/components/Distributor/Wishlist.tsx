
import React, { useState, useEffect, useRef, useMemo } from "react";
import { 
  Package, 
  Clock, 
  Info,
  Star,
  Search,
  Filter,
  ShoppingCart,
  Minus,
  Plus
} from "lucide-react";
import { toast } from "sonner";
import { Article, Inventory, Variant } from "../../types";
import { getImageUrl } from "../../utils/imageUtils";

// Grouping unit for the wishlist
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

const WishlistCard: React.FC<{ 
  group: ColorGroup;
  addToCart: (
    articleId: string,
    variantId: string | undefined,
    sizeQuantities: Record<string, number>
  ) => void;
}> = ({ group, addToCart }) => {
  const { article, color, variants } = group;

  // Selected variant ID (single selection)
  const [selectedVariantId, setSelectedVariantId] = useState<string>(
    variants.length > 0 ? variants[0].id : ""
  );

  const selectedVariant = variants.find((v) => v.id === selectedVariantId);
  const baseBreakdown = selectedVariant?.sizeQuantities || {};

  const totalPairsPerCarton = Object.values(baseBreakdown).reduce(
    (a, b) => a + (Number(b) || 0),
    0
  );

  const [cartonCount, setCartonCount] = useState(1);

  const handleAddToCart = () => {
    if (!selectedVariantId) {
      toast.error("Please select a variant");
      return;
    }

    const sizeQuantities: Record<string, number> = {};
    Object.entries(baseBreakdown).forEach(([size, pairs]) => {
      sizeQuantities[size] = Number(pairs) * cartonCount;
    });

    addToCart(article.id, selectedVariantId, sizeQuantities);
    toast.success(`${article.name} added to cart!`);
    setCartonCount(1);
  };

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
  const [pointerStart, setPointerStart] = useState<number | null>(null);

  const goNext = () => setCurrentImageIndex((prev) => prev + 1);
  const goPrev = () => setCurrentImageIndex((prev) => prev - 1);

  const handlePointerDown = (e: React.PointerEvent) => {
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

  const handlePointerCancel = (e: React.PointerEvent) => {
    setPointerStart(null);
    carouselRef.current?.releasePointerCapture(e.pointerId);
  };

  return (
    <div className="bg-white rounded-3xl overflow-hidden border border-slate-200 shadow-sm group hover:shadow-xl hover:border-amber-200 transition-all duration-300">
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
              className="w-full h-full object-cover shrink-0"
            />
          ))}
        </div>

        {/* Color Bar */}
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
          <div className="bg-white/95 backdrop-blur shadow-sm px-3 py-1.5 rounded-full text-[10px] font-black text-amber-600 uppercase tracking-widest border border-amber-50 flex items-center gap-1.5">
            <Star size={10} fill="currentColor" />
            Wishlist
          </div>
          <div className="bg-white/95 backdrop-blur shadow-sm px-3 py-1.5 rounded-full text-[10px] font-black text-slate-600 uppercase tracking-widest border border-slate-100 italic">
            {article.category}
          </div>
        </div>
      </div>

      <div className="p-5">
        <div className="mb-4">
          <h4 className="font-extrabold text-slate-900 group-hover:text-amber-600 transition-all">
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
              Expected MRP: ₹{article.mrp || article.pricePerPair * 2}
            </p>
          </div>
          <div className="bg-amber-50 p-2 rounded-xl">
             <Clock size={16} className="text-amber-600" />
          </div>
        </div>

        <div className="mb-4 space-y-2">
          <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider ml-1">
            Expected Size Range
          </label>
          <select
            value={selectedVariantId}
            onChange={(e) => setSelectedVariantId(e.target.value)}
            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 transition-all font-bold text-slate-700 text-xs cursor-pointer shadow-sm"
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
              Expected Assortment
            </p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(baseBreakdown).map(([sz, qty]) => (
                <div key={sz} className="flex flex-col items-center bg-white border border-slate-200 rounded-lg px-2 py-1 min-w-[32px]">
                   <span className="text-[10px] font-black text-amber-600">{sz}</span>
                   <span className="text-[10px] font-bold text-slate-400">{qty}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="pt-4 border-t border-slate-100 space-y-4">
          <div className="flex items-stretch gap-3">
            <div className="flex items-center bg-slate-50 border border-slate-200 rounded-2xl p-1 shadow-inner group/carton">
               <button 
                 onClick={() => setCartonCount(prev => Math.max(1, prev - 1))}
                 className="p-2 hover:bg-white rounded-xl text-slate-500 hover:text-amber-600 transition-all disabled:opacity-20"
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
                 className="p-2 hover:bg-white rounded-xl text-slate-500 hover:text-amber-600 transition-all"
               >
                 <Plus size={14} />
               </button>
            </div>

            <button
              onClick={handleAddToCart}
              disabled={cartonCount <= 0}
              className="flex-1 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-2xl px-6 font-black text-sm transition-all shadow-lg shadow-amber-100 flex items-center justify-center gap-2 group/btn active:scale-95"
            >
              <ShoppingCart size={16} className="group-hover/btn:scale-110 transition-transform" />
              <span>Pre-Order</span>
            </button>
          </div>

          <div className="bg-amber-50/50 rounded-2xl p-4 border border-amber-100 flex items-center gap-3">
            <Clock size={16} className="text-amber-600 shrink-0" />
            <div>
              <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest leading-none mb-1">
                Available From
              </p>
              <p className="text-sm font-black text-slate-900 tracking-tight">
                {article.expectedDate ? new Date(article.expectedDate).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric'
                }) : "Coming Soon"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

interface WishlistProps {
  articles: Article[];
  addToCart: (
    articleId: string,
    variantId: string | undefined,
    sizeQuantities: Record<string, number>
  ) => void;
}

const Wishlist: React.FC<WishlistProps> = ({ articles, addToCart }) => {
  const [searchQuery, setSearchQuery] = useState("");

  const colorGroups = useMemo(() => {
    const wishlistArticles = articles.filter(a => a.status === "WISHLIST");
    
    return wishlistArticles.flatMap((article) => {
      const variants = article.variants || [];
      const groups: Record<string, Variant[]> = {};
      variants.forEach((v) => {
        if (!groups[v.color]) groups[v.color] = [];
        groups[v.color].push(v);
      });

      return Object.entries(groups).map(([color, colorVariants]) => ({
        article,
        color,
        variants: colorVariants,
      }));
    }).filter(group => 
      group.article.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      group.article.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
      group.color.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [articles, searchQuery]);

  if (colorGroups.length === 0 && searchQuery === "") {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 bg-white rounded-3xl border border-slate-200 shadow-sm">
        <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center mb-6">
          <Star size={40} className="text-slate-200" />
        </div>
        <h3 className="text-xl font-bold text-slate-900 mb-2">
          Your wishlist is empty
        </h3>
        <p className="text-slate-500 max-w-xs text-center text-sm">
          Upcoming articles will appear here. Stay tuned for new launches!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex items-center gap-4 flex-1">
          <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center shrink-0">
            <Star className="text-amber-600" size={20} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 leading-tight">Wishlist</h2>
            <p className="text-slate-500 text-xs">Upcoming articles & pre-launch preview.</p>
          </div>
        </div>

        <div className="relative w-full md:max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Search wishlist..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all text-sm font-medium"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
        {colorGroups.map((group) => (
          <WishlistCard 
            key={`${group.article.id}-${group.color}`} 
            group={group} 
            addToCart={addToCart}
          />
        ))}
      </div>
    </div>
  );
};

export default Wishlist;
