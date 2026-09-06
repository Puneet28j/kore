import React, { useState, useEffect, useMemo } from "react";
import {
  ArrowLeft,
  Edit2,
  Trash2,
  Tag,
  Package,
  Layers,
  Copy,
  Check,
  ShoppingBag,
  RotateCcw,
  Loader2,
  Save,
} from "lucide-react";
import { Article, Variant } from "../../types";
import { toast } from "sonner";
import { getImageUrl } from "../../utils/imageUtils";
import { formatAssortment } from "../../utils/assortmentUtils";
import { masterCatalogService } from "../../services/masterCatalogService";
import { getVariantAvailability } from "../../utils/catalogAvailability";

interface VariantDetailsPageProps {
  article: Article;
  variant: Variant;
  onBack: () => void;
  onEditArticle: (id: string) => void;
  onDelete: (id: string) => void;
}

// BASE_URL removed in favor of getImageUrl utility

const VariantDetailsPage: React.FC<VariantDetailsPageProps> = ({
  article,
  variant,
  onBack,
  onEditArticle,
  onDelete,
}) => {
  const [activeImage, setActiveImage] = useState(0);
  const [copiedSku, setCopiedSku] = useState<string | null>(null);
  const [ctnSkuValue, setCtnSkuValue] = useState(variant.sku || "");
  const [savingCtnSku, setSavingCtnSku] = useState(false);
  const [stockData, setStockData] = useState<{
    poMap: Record<string, number>;
    liveStockMap: Record<string, number>;
    blockedStockMap: Record<string, number>;
  } | null>(null);
  const [loadingStock, setLoadingStock] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Compute per-size SKUs on the fly from carton SKU.
  // Gender letter (e.g. M/F/W/K) before the size range is stripped from per-pair SKUs.
  const perSizeSkus = useMemo(() => {
    const ctnSku = (variant.sku || "").trim();
    const sizeRange = (variant.sizeRange || "").trim();
    const sizeKeys = Object.keys(variant.sizeQuantities || {});
    if (!ctnSku || !sizeKeys.length) return variant.sizeSkus || {};
    const result: Record<string, string> = {};
    let base: string | null = null;
    // Strategy 1: exact sizeRange suffix match (e.g. "amr-gry-7-11" ends with "7-11")
    if (sizeRange && ctnSku.endsWith(sizeRange)) {
      base = ctnSku.slice(0, ctnSku.length - sizeRange.length);
    }
    // Strategy 2: regex — strip trailing -startSize-endSize regardless of stored sizeRange
    if (base === null) {
      const m = ctnSku.match(/^(.*)-\d+-\d+$/);
      if (m) base = m[1] + "-";
    }
    if (base !== null) {
      // Strip single-letter gender segment (e.g. "ARM-NVY-M-" → "ARM-NVY-")
      const withoutTrail = base.endsWith("-") ? base.slice(0, -1) : base;
      const segments = withoutTrail.split("-");
      const lastSeg = segments[segments.length - 1] || "";
      if (lastSeg.length === 1 && /^[A-Za-z]$/.test(lastSeg)) {
        base = withoutTrail.slice(0, -(lastSeg.length + 1)) + "-";
      }
      sizeKeys.forEach((sz) => {
        result[sz] = `${base}${sz}`;
      });
    } else {
      sizeKeys.forEach((sz) => {
        result[sz] = `${ctnSku}-${sz}`;
      });
    }
    return result;
  }, [
    variant.sku,
    variant.sizeRange,
    variant.sizeQuantities,
    variant.sizeSkus,
  ]);

  const fetchStock = async () => {
    if (!variant.id) return;
    setLoadingStock(true);
    try {
      const url =
        import.meta.env.VITE_API_BASE_URL +
        `/master-catalog/variants/${variant.id}/stock`;
      console.log("[VariantDetailsPage] Fetching stock from:", url);
      const token = localStorage.getItem("kore_token");
      const res = await fetch(url, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      console.log("[VariantDetailsPage] Fetch response status:", res.status);
      const json = await res.json();
      console.log("[VariantDetailsPage] Stock data received:", json.data);
      setStockData(json.data);
    } catch (err) {
      console.error("Failed to fetch variant stock", err);
    } finally {
      setLoadingStock(false);
    }
  };

  const handleResetStock = async () => {
    if (!variant.id) return;
    if (
      !window.confirm(
        "WARNING: This will DELETE all GRNs and clear all Order Fulfillment records for THIS variant. This action cannot be undone. Proceed?"
      )
    )
      return;

    setResetting(true);
    try {
      const url =
        import.meta.env.VITE_API_BASE_URL +
        `/master-catalog/variants/${variant.id}/reset-stock`;
      const res = await fetch(url, { method: "POST" });
      if (!res.ok) throw new Error("Failed to reset stock");

      toast.success("Variant stock and orders reset successfully!");
      fetchStock(); // Refresh display
    } catch (err) {
      console.error("Reset failed", err);
      toast.error("Failed to reset inventory");
    } finally {
      setResetting(false);
    }
  };

  const handleSaveCtnSku = async () => {
    if (!variant.id) return;
    const trimmed = ctnSkuValue.trim();
    if (!trimmed) {
      toast.error("Carton SKU cannot be blank");
      return;
    }
    setSavingCtnSku(true);
    try {
      await masterCatalogService.updateVariantSku(variant.id, trimmed);
      setCtnSkuValue(trimmed);
      toast.success("SKU saved — per-size SKUs regenerated");
    } catch (err: any) {
      toast.error(err?.message || "Failed to save SKU");
    } finally {
      setSavingCtnSku(false);
    }
  };

  useEffect(() => {
    if (variant.id) {
      fetchStock();
    }
  }, [variant.id]);

  const imgSrc = (url: string | undefined) => {
    if (!url) return "";
    return getImageUrl(url);
  };

  const colorMediaList = article.colorMedia || [];

  const matchedColorMedia = colorMediaList.find(
    (cm) =>
      (cm?.color || "").trim().toLowerCase() ===
      (variant.color || "").trim().toLowerCase()
  );

  const allImages =
    matchedColorMedia &&
    matchedColorMedia.images &&
    matchedColorMedia.images.length > 0
      ? matchedColorMedia.images
          .map((img: any) => img.url || img)
          .filter(Boolean)
      : [
          article.imageUrl,
          ...(article.secondaryImages || []).map((img: any) => img.url || img),
        ].filter(Boolean);

  const variantName =
    variant.itemName ||
    `${article.name} – ${variant.color} - ${variant.sizeRange}`;

  const parseSizeRange = (range: string) => {
    const cleaned = range.trim().replace(/\s/g, "");
    const m = cleaned.match(/^(\d+)-(\d+)$/);
    if (!m) return [];
    const start = Number(m[1]);
    const end = Number(m[2]);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return [];
    if (end >= start) {
      // Normal adult/regular range: 5-10, 6-9, etc.
      const out: string[] = [];
      for (let i = start; i <= end; i++) out.push(String(i));
      return out;
    } else {
      // Kids wrap-around range: 11-3, 12-2, etc.
      // Sequence: start → 13 (child), then 1 → end (junior) — every size is
      // always keyed as a plain unpadded number, same as a normal range.
      const out: string[] = [];
      for (let i = start; i <= 13; i++) out.push(String(i));
      for (let i = 1; i <= end; i++) out.push(String(i));
      return out;
    }
  };

  const sizes =
    Object.keys(variant.sizeSkus || {}).length > 0
      ? Object.keys(variant.sizeSkus)
      : parseSizeRange(variant.sizeRange || article.sizeRange || "");

  // sizeQuantities = assortment breakup (plain numbers: {"4": 3, "5": 6})
  // sizeMap = stock/inventory data ({"4": {qty: 0, sku: "..."}}) — qty is stock, NOT assortment
  const currentAssortmentMap = variant.sizeQuantities || {};
  const currentSizeMap = variant.sizeMap || {};
  const currentLiveStockMap = stockData?.liveStockMap || {};
  const currentBlockedStockMap: Record<string, number> =
    stockData?.blockedStockMap || {};

  const totalAssortment = Object.values(currentAssortmentMap).reduce(
    (s: number, v) => s + (Number(v) || 0),
    0
  );

  const totalBlocked = Object.values(currentBlockedStockMap).reduce(
    (s: number, v) => s + (Number(v) || 0),
    0
  );

  // Assortment-aware live stock calculation
  const calculateAssortmentCartons = (stockMap: Record<string, number>) => {
    if (
      !variant.sizeQuantities ||
      Object.keys(variant.sizeQuantities).length === 0
    )
      return 0;
    const possibleCartons = Object.entries(variant.sizeQuantities).map(
      ([sz, count]) => {
        const req = Number(count) || 0;
        if (req <= 0) return Infinity;

        const cleanSz = sz.trim();
        const avail = Number(stockMap[cleanSz] ?? stockMap[sz]) || 0;
        return Math.floor(avail / req);
      }
    );
    const result = Math.min(...possibleCartons);
    return result === Infinity || isNaN(result) ? 0 : result;
  };

  // Available stock — live stock already excludes booked/dispatched orders
  // (deducted directly at booking time), so it IS the available quantity.
  // blockedStockMap is shown separately as informational context only.
  const availableStockMap: Record<string, number> = {};
  sizes.forEach((sz) => {
    availableStockMap[sz] = Math.max(0, currentLiveStockMap[sz] || 0);
  });

  const liveCartonsCount = calculateAssortmentCartons(availableStockMap);

  // Clear identity: Variant SKU or Article SKU, no auto-generated strings
  const primarySku = variant.sku || article.sku || "";

  const copySku = (sku: string) => {
    navigator.clipboard.writeText(sku);
    setCopiedSku(sku);
    setTimeout(() => setCopiedSku(null), 1500);
  };

  const mrp = variant.mrp || article.mrp || 0;
  const selling = variant.sellingPrice || 0;
  const cost = variant.costPrice || 0;
  const margin =
    selling > 0 && cost > 0
      ? Math.round(((selling - cost) / selling) * 100)
      : 0;

  return (
    <div className="max-w-full mx-auto space-y-4">
      {/* Top Bar */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-indigo-600 transition-colors group"
        >
          <ArrowLeft
            size={16}
            className="group-hover:-translate-x-0.5 transition-transform"
          />
          Catalogue
        </button>
        <div className="flex items-center gap-1.5">
          {/* <button
            onClick={handleResetStock}
            disabled={resetting}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-bold text-amber-600 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors disabled:opacity-50"
          >
            {resetting ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
            Reset Inventory
          </button> */}
          <button
            onClick={() => onEditArticle(article.id)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
          >
            <Edit2 size={14} /> Edit
          </button>
          <button
            onClick={() => {
              if (window.confirm(`Delete "${article.name}"?`))
                onDelete(article.id);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-lg transition-colors"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Main 3-column layout (EXACTLY AS BEFORE) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* ─── Col 1: Image ─── */}
        <div className="lg:col-span-3">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3 lg:sticky lg:top-4">
            <div className="aspect-square rounded-xl overflow-hidden bg-slate-100 border border-slate-200 relative">
              {allImages.length > 0 ? (
                <img
                  src={imgSrc(allImages[activeImage])}
                  alt={variantName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-300">
                  <Package size={48} />
                </div>
              )}
              {allImages.length > 1 && (
                <div className="absolute bottom-2 right-2 bg-black/60 text-white text-[10px] font-bold px-2 py-0.5 rounded-md backdrop-blur-sm">
                  {activeImage + 1}/{allImages.length}
                </div>
              )}
            </div>
            {allImages.length > 1 && (
              <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                {allImages.map((img, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveImage(i)}
                    className={`w-12 h-12 shrink-0 rounded-lg overflow-hidden border-2 transition-all ${
                      i === activeImage
                        ? "border-indigo-500 ring-2 ring-indigo-200"
                        : "border-slate-200 hover:border-slate-300 opacity-60 hover:opacity-100"
                    }`}
                  >
                    <img
                      src={imgSrc(img)}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ─── Col 2: Core Details (Identity + Pricing + Size) ─── */}
        <div className="lg:col-span-5 space-y-4">
          {/* Identity Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-lg font-bold text-slate-900 leading-snug truncate">
                  {variantName}
                </h1>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <p className="text-xs text-slate-400 truncate max-w-full">
                    Master:{" "}
                    <span className="font-medium text-slate-500">
                      {article.name}
                    </span>
                  </p>
                  {variant.sizeQuantities && (
                    <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-600 text-[10px] font-bold rounded border border-indigo-100">
                      Assortment: {formatAssortment(variant.sizeQuantities)}
                    </span>
                  )}
                </div>
              </div>
              <span
                className={`shrink-0 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                  getVariantAvailability(variant) === "PREORDER"
                    ? "bg-rose-50 text-rose-600 border border-rose-100"
                    : "bg-emerald-50 text-emerald-600 border border-emerald-100"
                }`}
              >
                {getVariantAvailability(variant) === "PREORDER" ? "Wish" : "Live"}
              </span>
            </div>

            {/* SKU + Tags */}
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <button
                onClick={() => copySku(primarySku)}
                className="inline-flex items-center gap-1.5 font-mono text-xs font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-md border border-indigo-100 hover:bg-indigo-100 transition-colors"
              >
                {copiedSku === primarySku ? (
                  <Check size={11} />
                ) : (
                  <Copy size={11} />
                )}
                {primarySku}
              </button>
              <Badge icon={<Tag size={8} />} text={article.category} />
              {article.productCategory && (
                <Badge
                  icon={<Package size={8} />}
                  text={article.productCategory}
                />
              )}
              {article.brand && (
                <Badge icon={<Layers size={8} />} text={article.brand} />
              )}
            </div>
          </div>

          {/* Pricing Row */}
          <div className="grid grid-cols-3 gap-2">
            <PriceBox label="Online MRP" value={variant.onlineMrp || mrp} accent="indigo" />
            <PriceBox label="Offline MRP" value={variant.offlineMrp || mrp} accent="emerald" />
            <PriceBox label="Cost" value={cost} accent="slate" />
          </div>

          {/* Assortment Breakdown (Compact) */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <Layers size={12} className="text-indigo-500" />
              Assortment Breakdown
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {sizes.map((sz) => {
                const qty = Number(currentAssortmentMap[sz]) || 0;
                return (
                  <div
                    key={sz}
                    className="flex flex-col items-center min-w-12 bg-white border border-slate-200 rounded-lg py-1.5"
                  >
                    <span className="text-[9px] font-black text-slate-400">
                      {sz}
                    </span>
                    <span
                      className={`text-xs font-bold ${
                        qty > 0 ? "text-indigo-600" : "text-slate-300"
                      }`}
                    >
                      {qty || 0}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ─── Col 3: Specs sidebar ─── */}
        <div className="lg:col-span-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-0">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
              Specifications
            </h3>
            <SpecRow
              label="Color"
              value={variant.color || "—"}
              // dot={variant.color}
            />
            <SpecRow label="Sole Color" value={article.soleColor || "—"} />
            <SpecRow label="HSN Code" value={variant.hsnCode || "—"} mono />
            {/* <SpecRow
              label="Assortment Qty"
              value={String(totalAssortment)}
              badge={
                totalAssortment > 0 && (totalAssortment as number) % 24 === 0
                  ? "emerald"
                  : undefined
              }
            /> */}
            {/* <SpecRow label="Live Stock" value={`${totalPairs} prs`} /> */}
            {/* <SpecRow label="Blocked Stock" value={`${totalBlocked} prs`} badge={totalBlocked > 0 ? "rose" : undefined} /> */}
            {/* <SpecRow label="Live Stock (Ctn)" value={`${liveCartonsCount} Ctn`} badge={liveCartonsCount > 0 ? "emerald" : "rose"} /> */}
            <SpecRow label="Manufacturer" value={article.manufacturer || "—"} />
            <SpecRow label="Unit" value={article.unit || "—"} />
          </div>
        </div>
      </div>

      {/* ─── SKU Details ─── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-1.5">
          <Tag size={12} className="text-indigo-500" />
          SKU Details
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left: carton SKU (editable) */}
          <div className="space-y-4">
            {/* Carton SKU — editable */}
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">
                Carton SKU
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={ctnSkuValue}
                  onChange={(e) => setCtnSkuValue(e.target.value)}
                  placeholder="e.g. slk-blk-5-9"
                  className="font-mono text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 min-w-0 flex-1"
                />
                <button
                  onClick={handleSaveCtnSku}
                  disabled={savingCtnSku}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold text-white bg-indigo-500 hover:bg-indigo-600 rounded-md transition-colors disabled:opacity-50"
                >
                  {savingCtnSku ? (
                    <Loader2 size={10} className="animate-spin" />
                  ) : (
                    <Save size={10} />
                  )}
                  Save
                </button>
              </div>
              <p className="text-[9px] text-slate-400 mt-1">
                Save karne ke baad per-size SKUs auto-regenerate honge
              </p>
            </div>
          </div>

          {/* Right: per-size SKUs */}
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">
              Per-Size SKUs
            </p>
            {Object.keys(perSizeSkus).length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(perSizeSkus)
                  .sort(([a], [b]) => {
                    const aJ = a.startsWith("0") && a.length === 2;
                    const bJ = b.startsWith("0") && b.length === 2;
                    if (aJ && !bJ) return 1;
                    if (!aJ && bJ) return -1;
                    return Number(a) - Number(b);
                  })
                  .map(([sz, sku]) => (
                    <button
                      key={sz}
                      onClick={() => copySku(sku)}
                      className="flex items-center gap-1 font-mono text-[10px] font-bold text-slate-600 bg-slate-50 border border-slate-200 px-2 py-1 rounded-md hover:bg-slate-100 hover:border-indigo-300 transition-colors"
                      title="Click to copy"
                    >
                      <span className="text-slate-400 text-[9px]">{sz}</span>
                      <span>{sku}</span>
                      {copiedSku === sku ? (
                        <Check size={9} className="text-emerald-500" />
                      ) : (
                        <Copy size={9} className="text-slate-300" />
                      )}
                    </button>
                  ))}
              </div>
            ) : (
              <p className="text-xs text-slate-300 italic">
                No SKUs yet — save a carton SKU to auto-generate
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default VariantDetailsPage;

/* ── Sub-components ── */

const Badge: React.FC<{ icon: React.ReactNode; text: string }> = ({
  icon,
  text,
}) => (
  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-slate-50 text-slate-500 rounded text-[9px] font-bold uppercase tracking-wider border border-slate-200">
    {icon} {text}
  </span>
);

const PriceBox: React.FC<{
  label: string;
  value: number;
  accent: "indigo" | "emerald" | "slate";
}> = ({ label, value, accent }) => {
  const c = {
    indigo: {
      bg: "bg-indigo-50 border-indigo-100",
      label: "text-indigo-400",
      val: "text-indigo-700",
    },
    emerald: {
      bg: "bg-emerald-50 border-emerald-100",
      label: "text-emerald-400",
      val: "text-emerald-700",
    },
    slate: {
      bg: "bg-slate-50 border-slate-200",
      label: "text-slate-400",
      val: "text-slate-700",
    },
  }[accent];
  return (
    <div className={`rounded-xl border p-3 ${c.bg}`}>
      <p
        className={`text-[9px] font-black uppercase tracking-wider ${c.label}`}
      >
        {label}
      </p>
      <p className={`text-lg font-black leading-tight ${c.val}`}>
        ₹{(value * 24).toLocaleString()}
        <span className={`text-[10px] font-normal ml-0.5 ${c.label}`}>
          /ctn
        </span>
      </p>
      <p className={`text-[9px] mt-0.5 ${c.label}`}>
        ₹{value.toLocaleString()}/pr
      </p>
    </div>
  );
};

const SpecRow: React.FC<{
  label: string;
  value: string;
  dot?: string;
  mono?: boolean;
  badge?: "emerald" | "rose";
}> = ({ label, value, dot, mono, badge }) => (
  <div className="flex items-center justify-between py-2.5 border-b border-slate-50 last:border-0">
    <span className="text-xs text-slate-400 font-medium">{label}</span>
    <div className="flex items-center gap-1.5">
      {dot && (
        <span
          className="w-2.5 h-2.5 rounded-full border border-slate-300 shrink-0"
          style={{ backgroundColor: dot.toLowerCase() }}
        />
      )}
      <span
        className={`text-sm font-semibold ${
          badge === "emerald"
            ? "text-emerald-600"
            : badge === "rose"
            ? "text-rose-500"
            : "text-slate-700"
        } ${mono ? "font-mono text-xs" : ""}`}
      >
        {value}
      </span>
    </div>
  </div>
);
