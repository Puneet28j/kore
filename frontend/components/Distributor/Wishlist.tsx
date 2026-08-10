
import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Package,
  Clock,
  Info,
  Star,
  Search,
  Filter,
  Loader2,
  CheckCircle2,
  Minus,
  Plus
} from "lucide-react";
import { toast } from "sonner";
import { Article, Inventory, Variant } from "../../types";
import { getImageUrl } from "../../utils/imageUtils";
import { masterCatalogService } from "../../services/masterCatalogService";

// Grouping unit for the pre-order
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

const PreOrderCard: React.FC<{
  group: ColorGroup;
  onPlacePreOrder: (
    articleId: string,
    variantId: string,
    sizeQuantities: Record<string, number>,
    cartonCount: number,
    pairCount: number,
    price: number
  ) => Promise<void>;
}> = ({ group, onPlacePreOrder }) => {
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

  // PO-capped booking: a pre-order can only claim what the Purchase Orders
  // planned for this variant minus what's already pre-booked by anyone
  // (backend enforces the same cap on order creation).
  const plannedPairs = Number(selectedVariant?.plannedPairs) || 0;
  const preBookedPairs = Number(selectedVariant?.preBookedPairs) || 0;
  const remainingPairs = Math.max(0, plannedPairs - preBookedPairs);
  const maxCartons =
    totalPairsPerCarton > 0
      ? Math.floor(remainingPairs / totalPairsPerCarton)
      : 0;
  const noPoYet = plannedPairs === 0;
  const fullyBooked = !noPoYet && maxCartons === 0;

  const [cartonCount, setCartonCount] = useState(1);
  const [placing, setPlacing] = useState(false);
  const [placed, setPlaced] = useState(false);

  // Reset/clamp when switching variants — each variant has its own cap.
  useEffect(() => {
    setCartonCount(1);
  }, [selectedVariantId]);

  const handlePlacePreOrder = async () => {
    if (!selectedVariantId) {
      toast.error("Please select a variant");
      return;
    }
    if (maxCartons === 0) {
      toast.error(
        noPoYet
          ? "This item cannot be pre-booked yet — no Purchase Order raised"
          : "This variant is fully pre-booked"
      );
      return;
    }
    if (cartonCount > maxCartons) {
      toast.error(`Only ${maxCartons} carton(s) can still be pre-booked`);
      return;
    }

    const sizeQuantities: Record<string, number> = {};
    Object.entries(baseBreakdown).forEach(([size, pairs]) => {
      sizeQuantities[size] = Number(pairs) * cartonCount;
    });

    const pairCount = totalPairsPerCarton * cartonCount;
    const price = article.pricePerPair * pairCount;

    setPlacing(true);
    try {
      await onPlacePreOrder(article.id, selectedVariantId, sizeQuantities, cartonCount, pairCount, price);
      setPlaced(true);
      setCartonCount(1);
      setTimeout(() => setPlaced(false), 3000);
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || "Failed to place pre-order";
      toast.error(msg);
    } finally {
      setPlacing(false);
    }
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
            Pre-Order
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
                 onClick={() => setCartonCount(prev => Math.min(Math.max(1, maxCartons), prev + 1))}
                 className="p-2 hover:bg-white rounded-xl text-slate-500 hover:text-amber-600 transition-all disabled:opacity-20"
                 disabled={cartonCount >= maxCartons}
               >
                 <Plus size={14} />
               </button>
            </div>

            <button
              onClick={handlePlacePreOrder}
              disabled={cartonCount <= 0 || maxCartons === 0 || placing || placed}
              className={`flex-1 rounded-2xl px-6 font-black text-sm transition-all shadow-lg flex items-center justify-center gap-2 active:scale-95 disabled:cursor-not-allowed
                ${placed
                  ? 'bg-emerald-500 shadow-emerald-100 text-white'
                  : 'bg-amber-600 hover:bg-amber-700 shadow-amber-100 text-white disabled:bg-slate-200 disabled:text-slate-400'
                }`}
            >
              {placing ? (
                <><Loader2 size={16} className="animate-spin" /><span>Placing...</span></>
              ) : placed ? (
                <><CheckCircle2 size={16} /><span>Pre-Order Placed!</span></>
              ) : noPoYet ? (
                <><Star size={16} /><span>No PO Raised Yet</span></>
              ) : fullyBooked ? (
                <><Star size={16} /><span>Fully Pre-Booked</span></>
              ) : (
                <><Star size={16} fill="currentColor" /><span>Pre-Order Now</span></>
              )}
            </button>
          </div>

          {/* PO-capped availability */}
          {maxCartons > 0 && (
            <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest text-center -mt-1">
              {maxCartons} carton{maxCartons > 1 ? "s" : ""} bookable
              {preBookedPairs > 0 && (
                <span className="text-slate-400"> · {Math.floor(preBookedPairs / Math.max(1, totalPairsPerCarton))} already booked</span>
              )}
            </p>
          )}

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

interface PreOrderProps {
  articles: Article[];
  onPlacePreOrder: (
    articleId: string,
    variantId: string,
    sizeQuantities: Record<string, number>,
    cartonCount: number,
    pairCount: number,
    price: number
  ) => Promise<void>;
}// Helper to map DB master catalog item to Article interface
const mapDocToArticle = (doc: any): Article => ({
  id: doc._id || doc.id,
  sku: doc.variants?.[0]?.hsnCode || doc._id,
  name: doc.articleName,
  category: doc.gender || doc.categoryId?.name,
  assortmentId: doc._id,
  pricePerPair: doc.mrp || doc.variants?.[0]?.sellingPrice || doc.variants?.[0]?.mrp || 0,
  imageUrl: doc.primaryImage?.url || doc.variants?.[0]?.images?.[0] || "",
  images: doc.secondaryImages?.map((i: any) => i.url) || [],
  secondaryImages: doc.secondaryImages || [],
  colorMedia: doc.colorMedia || [],
  mrp: doc.mrp,
  soleColor: doc.soleColor,
  productCategory: doc.categoryId?.name,
  brand: doc.brandId?.name,
  status: doc.stage || "PREORDER",
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
    images: (v.images || []).map((i: any) => typeof i === "string" ? i : i.url),
    isActive: v.isActive !== false,
    tag: v.tag,
    onlineMrp: v.onlineMrp,
    offlineMrp: v.offlineMrp,
    stage: v.stage,
    expectedAvailableDate: v.expectedAvailableDate,
    // PO-derived planned + already pre-booked pairs (backend-injected) —
    // caps how much can still be pre-booked.
    poPlannedQty: v.poPlannedQty || {},
    plannedPairs: v.plannedPairs || 0,
    preBookedPairs: v.preBookedPairs || 0,
    poPendingPairs: v.poPendingPairs || 0,
  })),
});

const PreOrder: React.FC<PreOrderProps> = ({ articles: initialArticles, onPlacePreOrder }) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [genderFilter, setGenderFilter] = useState<string>("ALL");
  const [sortOption, setSortOption] = useState<string>("name_asc");

  // Server-side Infinite Scroll state
  const BATCH_SIZE = 12;
  const [page, setPage] = useState(1);
  const [hasMorePages, setHasMorePages] = useState(true);
  const [totalServerItems, setTotalServerItems] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [backendArticles, setBackendArticles] = useState<Article[]>([]);
  const observerRef = useRef<HTMLDivElement | null>(null);

  // Fetch Page 1 from backend
  const fetchInitialPage = React.useCallback(async () => {
    setLoading(true);
    setPage(1);
    try {
      const res = await masterCatalogService.listMasterItems({
        page: 1,
        limit: BATCH_SIZE,
        stage: "PREORDER",
        q: searchQuery || undefined,
        gender: genderFilter !== "ALL" ? genderFilter : undefined,
        sort: sortOption,
      });

      const docs = res.data || res.items || [];
      const fetchedArticles = docs.map(mapDocToArticle);
      setBackendArticles(fetchedArticles);

      const meta = res.meta || {};
      const totalPages = meta.totalPages || 1;
      const totalCount = meta.total || fetchedArticles.length;
      setTotalServerItems(totalCount);
      setHasMorePages(1 < totalPages);
    } catch {
      toast.error("Failed to load pre-orders");
    } finally {
      setLoading(false);
    }
  }, [searchQuery, genderFilter, sortOption]);

  // Load Next Page
  const loadNextPage = React.useCallback(async () => {
    if (loadingMore || !hasMorePages) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    try {
      const res = await masterCatalogService.listMasterItems({
        page: nextPage,
        limit: BATCH_SIZE,
        stage: "PREORDER",
        q: searchQuery || undefined,
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
      toast.error("Failed to load more pre-orders");
    } finally {
      setLoadingMore(false);
    }
  }, [page, hasMorePages, loadingMore, searchQuery, genderFilter, sortOption]);

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

  const colorGroups = useMemo(() => {
    return backendArticles.flatMap((article) => {
      // A variant that's already had its own GRN is genuinely in stock now —
      // it belongs in Shop as a regular purchase, not here as a preorder.
      // Only variants still effectively PREORDER stay on this page.
      const variants = (article.variants || []).filter(
        (v) => (v.stage || article.status) !== "AVAILABLE"
      );
      const groups: Record<string, Variant[]> = {};
      variants.forEach((v) => {
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
  }, [backendArticles]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex items-center gap-4 shrink-0">
          <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center shrink-0">
            <Star className="text-amber-600" size={20} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 leading-tight">Pre-Order</h2>
            <p className="text-slate-500 text-xs">Upcoming articles & pre-launch preview.</p>
          </div>
        </div>

        {/* Filter and Sort controls */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-between md:justify-end">
          {/* Gender Filter */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl gap-1">
            {["ALL", "MEN", "WOMEN", "KIDS"].map((g) => (
              <button
                key={g}
                onClick={() => setGenderFilter(g)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  genderFilter === g
                    ? "bg-white text-amber-700 shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {g === "ALL" ? "All" : g.charAt(0) + g.slice(1).toLowerCase()}
              </button>
            ))}
          </div>

          {/* Sort dropdown */}
          <select
            value={sortOption}
            onChange={(e) => setSortOption(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-amber-500/20 cursor-pointer"
          >
            <option value="default">Sort: Featured</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="price_desc">Price: High to Low</option>
            <option value="name_asc">Name: A to Z</option>
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
          </select>

          {/* Search box */}
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Search pre-order..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all text-xs font-medium"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 size={32} className="animate-spin text-amber-600" />
          <p className="text-xs font-bold text-slate-500">Loading pre-orders from server...</p>
        </div>
      ) : (
        <>
          {/* Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
            {colorGroups.map((group) => (
              <PreOrderCard
                key={`${group.article.id}-${group.color}`}
                group={group}
                onPlacePreOrder={onPlacePreOrder}
              />
            ))}
          </div>

          {/* Infinite Scroll Trigger */}
          {colorGroups.length > 0 && (
            <div className="flex flex-col items-center justify-center gap-3 pt-6 pb-4">
              {hasMorePages ? (
                <div ref={observerRef} className="flex flex-col items-center gap-2 py-4">
                  {loadingMore ? (
                    <div className="flex items-center gap-2 text-xs font-bold text-amber-600">
                      <Loader2 size={18} className="animate-spin" />
                      Loading more pre-orders...
                    </div>
                  ) : (
                    <button
                      onClick={loadNextPage}
                      className="text-xs font-bold text-amber-600 hover:text-amber-800 hover:underline"
                    >
                      Load more items ({totalServerItems - backendArticles.length} remaining)
                    </button>
                  )}
                </div>
              ) : (
                <div className="text-center py-4 border-t border-slate-100 w-full">
                  <p className="text-xs font-bold text-slate-400">
                    🎉 End of Pre-Orders catalogue ({colorGroups.length} items shown)
                  </p>
                </div>
              )}
            </div>
          )}

          {colorGroups.length === 0 && (
            <div className="py-20 flex flex-col items-center gap-3 text-slate-400">
              <Star size={40} className="text-slate-300" />
              <p className="text-sm">No matching pre-orders found</p>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default PreOrder;
