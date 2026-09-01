import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Search, Download, Package, RefreshCw, ChevronDown, ChevronRight,
  AlertCircle, Filter, TrendingDown, AlertTriangle, CheckCircle2,
  XCircle, BarChart3, IndianRupee, Lock, ShoppingCart,
} from "lucide-react";
import { apiFetch } from "../../services/api";
import Pagination from "../ui/Pagination";
import { usePageSize } from "../../utils/usePageSize";

interface SizeCell { qty: number; }

interface Variant {
  variantId: string;
  itemName: string;
  sku: string;
  color: string;
  sizeRange: string;
  mrp: number;
  costPrice: number;
  // Still-incoming pairs (PO planned − GRN received) — used with totalStock
  // to classify RFD/Pre-Order below; never a stored field.
  poPendingPairs: number;
  sizeQuantities: Record<string, number>;
  sizeStock: Record<string, SizeCell>;
  totalStock: number;
  booked: number;
}

interface StockRow {
  articleId: string;
  articleName: string;
  gender: string;
  category: string;
  brand: string;
  company: string;
  totalVariants: number;
  totalStock: number;
  variants: Variant[];
}

type StockFilter = "ALL" | "IN_STOCK" | "LOW" | "OUT";
type StageFilter = "ALL" | "RFD" | "PREORDER";

// Classifies a variant the same way the rest of the app does: live stock
// (totalStock) > 0 is RFD; 0 stock with a pending PO is PREORDER; otherwise
// it's not orderable at all.
function classifyVariant(v: Variant): "RFD" | "PREORDER" | "NONE" {
  if (v.totalStock > 0) return "RFD";
  if (v.poPendingPairs > 0) return "PREORDER";
  return "NONE";
}

const LOW_STOCK_THRESHOLD = 20;

function getStockHealth(qty: number): StockFilter {
  if (qty === 0) return "OUT";
  if (qty <= LOW_STOCK_THRESHOLD) return "LOW";
  return "IN_STOCK";
}

const healthConfig: Record<string, { label: string; icon: React.ReactNode; chipClass: string; rowClass: string }> = {
  IN_STOCK: {
    label: "In Stock",
    icon: <CheckCircle2 size={12} />,
    chipClass: "bg-emerald-100 text-emerald-700",
    rowClass: "",
  },
  LOW: {
    label: "Low Stock",
    icon: <AlertTriangle size={12} />,
    chipClass: "bg-amber-100 text-amber-700",
    rowClass: "bg-amber-50/30",
  },
  OUT: {
    label: "Out of Stock",
    icon: <XCircle size={12} />,
    chipClass: "bg-rose-100 text-rose-700",
    rowClass: "bg-rose-50/20",
  },
};

// Pairs-per-carton convention used throughout the app.
const PAIRS_PER_CTN = 24;
const toCtn = (pairs: number) => Math.floor((pairs || 0) / PAIRS_PER_CTN);

// RFD/Pre-Order filter is per-VARIANT, not per-article — a mixed article
// (some variants already arrived via GRN, some still pending) must show up
// in BOTH tabs, each showing only the variants relevant to it. Rows whose
// variants are all filtered out disappear entirely (same convention as
// Master Stock's stageForTab split).
function applyStageFilter(rows: StockRow[], stage: StageFilter): StockRow[] {
  if (stage === "ALL") return rows;
  return rows
    .map(r => {
      const variants = r.variants.filter(v => classifyVariant(v) === stage);
      if (variants.length === 0) return null;
      return {
        ...r,
        variants,
        totalVariants: variants.length,
        totalStock: variants.reduce((s, v) => s + v.totalStock, 0),
      };
    })
    .filter((r): r is StockRow => r !== null);
}

const StockReport: React.FC = () => {
  const [pageSize, setPageSize] = usePageSize("stockReport", 30);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [stockFilter, setStockFilter] = useState<StockFilter>("ALL");
  const [stageFilter, setStageFilter] = useState<StageFilter>("ALL");

  // Single source of truth — the FULL (search-matched, unpaginated) dataset.
  // Stock-level filtering, page-slicing, KPI totals and CSV/PDF export all
  // derive from this so they never disagree with each other (previously the
  // table paginated on the server while filtering client-side on just that
  // page, which broke the filter+search+pagination combination).
  const [allRows, setAllRows] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(false);

  // KPI summary bar always reflects the WHOLE catalogue, never the search
  // box — fetched separately (no `q` param) so typing a search doesn't
  // change the numbers above it.
  const [globalRows, setGlobalRows] = useState<StockRow[]>([]);

  const fetchAllData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: "1", limit: "10000" });
      if (search) params.set("q", search);
      const d = await apiFetch(`/reports/stock?${params.toString()}`);
      setAllRows(d.data || []);
    } catch (err: any) {
      setError(err?.message || "Failed to load stock report");
      setAllRows([]);
    } finally {
      setLoading(false);
    }
  }, [search]);

  const fetchGlobalData = useCallback(async () => {
    try {
      const d = await apiFetch(`/reports/stock?page=1&limit=10000`);
      setGlobalRows(d.data || []);
    } catch {
      setGlobalRows([]);
    }
  }, []);

  useEffect(() => { fetchAllData(); }, [fetchAllData]);
  useEffect(() => { fetchGlobalData(); }, [fetchGlobalData]);

  // Real-time: refresh when GRN received or catalog changes
  useEffect(() => {
    const handler = () => { fetchAllData(); fetchGlobalData(); };
    window.addEventListener("grnRefetch",    handler);
    window.addEventListener("catalogRefetch", handler);
    window.addEventListener("orderUpdatedSocket", handler);
    return () => {
      window.removeEventListener("grnRefetch",    handler);
      window.removeEventListener("catalogRefetch", handler);
      window.removeEventListener("orderUpdatedSocket", handler);
    };
  }, [fetchAllData, fetchGlobalData]);

  // Reset to page 1 whenever the result set changes shape (new search or filter),
  // otherwise you can land on a now-nonexistent page (e.g. filtered to 0 rows).
  useEffect(() => { setPage(1); }, [search, stockFilter, stageFilter, pageSize]);

  const handleSearch = () => { setSearch(searchInput); };

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Full-dataset filtered set — used for KPI totals, CSV/PDF export, and as
  // the source for the on-screen table's client-side pagination. Stage
  // filter narrows variants first (recomputing each row's totals), then
  // stock-health filters on those recomputed totals.
  const allFilteredRows = useMemo(() => {
    const staged = applyStageFilter(allRows, stageFilter);
    if (stockFilter === "ALL") return staged;
    return staged.filter(r => getStockHealth(r.totalStock) === stockFilter);
  }, [allRows, stageFilter, stockFilter]);

  const totalPages = Math.max(1, Math.ceil(allFilteredRows.length / pageSize));
  // Clamp in render (not just via the reset effect) so shrinking the result
  // set below the current page number never leaves the table blank.
  const safePage = Math.min(page, totalPages);

  const filteredRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return allFilteredRows.slice(start, start + pageSize);
  }, [allFilteredRows, safePage, pageSize]);

  const expandAll = () => setExpanded(new Set(filteredRows.map(r => r.articleId)));
  const collapseAll = () => setExpanded(new Set());

  // Summary stats computed from globalRows (whole catalogue, unaffected by
  // search or the stock-level filter tabs) — not allRows/allFilteredRows,
  // so the KPI bar never shifts while the user is searching or filtering.
  // Stage filter DOES apply here though — same as Master Stock's header
  // cards changing per RFD/Pre-Order tab, so the KPIs stay meaningful for
  // whichever slice is selected.
  const stats = useMemo(() => {
    const staged = applyStageFilter(globalRows, stageFilter);
    const totalArticles = staged.length;
    let totalPairs = 0;
    let totalBookedPairs = 0;
    let totalPoPendingPairs = 0;
    let totalVariants = 0;
    let outCount = 0;
    let lowCount = 0;
    let totalValue = 0;

    staged.forEach(r => {
      totalPairs += r.totalStock;
      totalVariants += r.totalVariants;
      const h = getStockHealth(r.totalStock);
      if (h === "OUT") outCount++;
      if (h === "LOW") lowCount++;
      r.variants.forEach(v => {
        totalValue += (v.totalStock || 0) * (v.mrp || 0);
        totalBookedPairs += v.booked || 0;
        totalPoPendingPairs += v.poPendingPairs || 0;
      });
    });

    return {
      totalArticles,
      totalCartons: toCtn(totalPairs),
      totalBookedCartons: toCtn(totalBookedPairs),
      totalPoPendingCartons: toCtn(totalPoPendingPairs),
      totalVariants,
      outCount,
      lowCount,
      totalValue,
    };
  }, [globalRows, stageFilter]);

  const exportCsv = () => {
    // Exports the FULL dataset (allFilteredRows), not just the current page.
    const lines = ["Article,SKU,Category,Brand,Company,Variant,Color,Size Range,Stage,MRP,Cost,Stock Health,Total Stock (CTN),Booked (CTN),PO Pending (CTN),Stock by Size (pairs)"];
    allFilteredRows.forEach(r => {
      r.variants.forEach(v => {
        const sizes = Object.entries(v.sizeStock || {})
          .sort((a, b) => Number(a[0]) - Number(b[0]))
          .map(([s, c]) => `${s}:${c.qty}`)
          .join(" ");
        const health = getStockHealth(v.totalStock);
        const cls = classifyVariant(v);
        const stageLabel = cls === "PREORDER" ? "Pre-Order" : cls === "RFD" ? "RFD" : "Unavailable";
        lines.push(`"${r.articleName}","${v.sku || ""}","${r.category}","${r.brand}","${r.company}","${v.itemName}","${v.color}","${v.sizeRange}","${stageLabel}",${v.mrp},${v.costPrice || 0},"${health}",${toCtn(v.totalStock)},${toCtn(v.booked)},${toCtn(v.poPendingPairs)},"${sizes}"`);
      });
    });
    lines.push(`"TOTAL","","","","","","","",,,,,${stats.totalCartons},${stats.totalBookedCartons},${stats.totalPoPendingCartons},`);
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "stock_report.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = async () => {
    const { default: jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");

    const doc = new jsPDF("landscape", "pt", "a4");
    const margin = 28;

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Stock Report", margin, 32);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(
      `Generated ${new Date().toLocaleString("en-IN")} — ${allFilteredRows.length} article(s), all in CTN`,
      margin,
      46
    );

    // One row per variant — exports the FULL dataset, not just the page on screen.
    const body: (string | number)[][] = [];
    allFilteredRows.forEach((r) => {
      r.variants.forEach((v) => {
        const health = getStockHealth(v.totalStock);
        const cls = classifyVariant(v);
        body.push([
          r.articleName,
          v.sku || "",
          r.category || "",
          r.brand || "",
          r.company || "",
          v.itemName,
          v.color,
          v.sizeRange,
          cls === "PREORDER" ? "Pre-Order" : cls === "RFD" ? "RFD" : "Unavailable",
          // jsPDF's built-in "helvetica" font has no ₹ glyph — it renders as
          // a garbled superscript character. "Rs." is plain ASCII and always safe.
          `Rs. ${(v.mrp || 0).toLocaleString()}`,
          `Rs. ${(v.costPrice || 0).toLocaleString()}`,
          health.replace("_", " "),
          toCtn(v.totalStock),
          toCtn(v.booked),
          toCtn(v.poPendingPairs),
        ]);
      });
    });

    autoTable(doc, {
      startY: 58,
      margin: { left: margin, right: margin },
      styles: { fontSize: 7.5, cellPadding: 4 },
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: "bold" },
      head: [["Article", "SKU", "Category", "Brand", "Company", "Variant", "Color", "Size Range", "Stage", "MRP", "Cost", "Health", "Stock (CTN)", "Booked (CTN)", "PO Pending (CTN)"]],
      body,
      columnStyles: { 12: { halign: "right", fontStyle: "bold" }, 13: { halign: "right", fontStyle: "bold" }, 14: { halign: "right", fontStyle: "bold" } },
      foot: [[
        { content: "Total", colSpan: 12, styles: { halign: "right", fontStyle: "bold" } },
        { content: stats.totalCartons.toString(), styles: { halign: "right", fontStyle: "bold" } },
        { content: stats.totalBookedCartons.toString(), styles: { halign: "right", fontStyle: "bold" } },
        { content: stats.totalPoPendingCartons.toString(), styles: { halign: "right", fontStyle: "bold" } },
      ]],
      showFoot: "lastPage",
    });

    doc.save("stock_report.pdf");
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <BarChart3 size={20} className="text-indigo-500" /> Stock Report
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">{globalRows.length} articles · live inventory snapshot</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchAllData} className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 text-slate-600 rounded-xl text-sm font-semibold hover:bg-slate-200 transition-all">
            <RefreshCw size={14} /> Refresh
          </button>
          <button onClick={exportCsv} disabled={loading} className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition-all disabled:opacity-50">
            <Download size={14} /> Export CSV
          </button>
          <button onClick={exportPdf} disabled={loading} className="flex items-center gap-1.5 px-3 py-2 bg-rose-600 text-white rounded-xl text-sm font-semibold hover:bg-rose-700 transition-all disabled:opacity-50">
            <Download size={14} /> Export PDF
          </button>
        </div>
      </div>

      {/* KPI Summary Bar — Booked/PO Pending use the exact same per-variant
          sources (booked-map for RFD, getPreBookedQtyMap for Pre-Order) as
          the table rows below, so this bar always tallies with them. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        {[
          { label: "Articles",       value: stats.totalArticles.toLocaleString(),            icon: <Package size={14} />,     color: "text-indigo-600",  bg: "bg-indigo-50" },
          { label: "Variants",       value: stats.totalVariants.toLocaleString(),            icon: <Package size={14} />,     color: "text-blue-600",    bg: "bg-blue-50" },
          { label: "Total CTN",      value: stats.totalCartons.toLocaleString(),             icon: <BarChart3 size={14} />,   color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "Booked",         value: stats.totalBookedCartons.toLocaleString(),        icon: <Lock size={14} />,        color: "text-amber-600",  bg: "bg-amber-50" },
          { label: "PO Pending",     value: stats.totalPoPendingCartons.toLocaleString(),     icon: <ShoppingCart size={14} />, color: "text-violet-600", bg: "bg-violet-50" },
          { label: "Stock Value",    value: `₹${(stats.totalValue/100000).toFixed(1)}L`,    icon: <IndianRupee size={14} />, color: "text-teal-600",    bg: "bg-teal-50" },
          { label: "Out of Stock",   value: stats.outCount.toLocaleString(),                 icon: <TrendingDown size={14} />, color: "text-rose-600",   bg: "bg-rose-50" },
        ].map(s => (
          <div key={s.label} className={`${s.bg} rounded-2xl p-3.5`}>
            <div className={`${s.color} mb-1.5`}>{s.icon}</div>
            <p className={`text-lg font-black ${s.color}`}>{s.value}</p>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Search + Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSearch()}
            placeholder="Search article name..."
            className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 shadow-sm"
          />
        </div>
        <button onClick={handleSearch} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-all shadow-sm">
          Search
        </button>

        <div className="flex items-center gap-2 ml-auto">
          {/* RFD / Pre-Order filter tabs — per-variant, same convention as Master Stock */}
          <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
            {(["ALL", "RFD", "PREORDER"] as StageFilter[]).map(f => {
              const labels: Record<string, string> = { ALL: "All", RFD: "RFD", PREORDER: "Pre-Order" };
              const active = stageFilter === f;
              return (
                <button
                  key={f}
                  onClick={() => setStageFilter(f)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${active ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
                >
                  {labels[f]}
                </button>
              );
            })}
          </div>

          {/* Stock level filter tabs */}
          <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
            <Filter size={12} className="text-slate-400 ml-1" />
            {(["ALL", "IN_STOCK", "LOW", "OUT"] as StockFilter[]).map(f => {
              const labels: Record<string, string> = { ALL: "All", IN_STOCK: "In Stock", LOW: "Low", OUT: "Out" };
              const active = stockFilter === f;
              return (
                <button
                  key={f}
                  onClick={() => setStockFilter(f)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${active ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
                >
                  {labels[f]}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        {/* Table toolbar */}
        <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
          <span className="text-xs text-slate-500 font-medium">
            {stockFilter !== "ALL"
              ? `Showing ${allFilteredRows.length} filtered (page ${safePage}/${totalPages}) / ${allRows.length} total`
              : `${allFilteredRows.length} articles (page ${safePage}/${totalPages})`}
          </span>
          <div className="flex gap-2">
            <button onClick={expandAll} className="text-[11px] font-semibold text-indigo-600 hover:underline">Expand All</button>
            <span className="text-slate-300">|</span>
            <button onClick={collapseAll} className="text-[11px] font-semibold text-slate-400 hover:text-slate-600 hover:underline">Collapse All</button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400">
            <RefreshCw size={20} className="animate-spin mr-2" /> Loading...
          </div>
        ) : error ? (
          <div className="flex items-center justify-center gap-3 py-20 text-rose-500">
            <AlertCircle size={20} />
            <span className="text-sm font-medium">{error}</span>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            {stageFilter !== "ALL"
              ? `No ${stageFilter === "RFD" ? "RFD" : "Pre-Order"} variants match the current filters`
              : stockFilter !== "ALL"
              ? `No articles with "${stockFilter.toLowerCase().replace("_", " ")}" status`
              : "No stock data found"}
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-left text-sm min-w-[760px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 w-8"></th>
                <th className="px-4 py-3 font-bold text-slate-500 uppercase tracking-wider text-xs">Article</th>
                {/* <th className="px-4 py-3 font-bold text-slate-500 uppercase tracking-wider text-xs">SKU</th>
                <th className="px-4 py-3 font-bold text-slate-500 uppercase tracking-wider text-xs">Category</th>
                <th className="px-4 py-3 font-bold text-slate-500 uppercase tracking-wider text-xs">Brand</th> */}
                <th className="px-4 py-3 font-bold text-slate-500 uppercase tracking-wider text-xs">Health</th>
                <th className="px-4 py-3 font-bold text-slate-500 uppercase tracking-wider text-xs text-right">Variants</th>
                <th className="px-4 py-3 font-bold text-slate-500 uppercase tracking-wider text-xs text-right">Total Stock</th>
                <th className="px-4 py-3 font-bold text-slate-500 uppercase tracking-wider text-xs text-right">Est. Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRows.map(row => {
                const health = getStockHealth(row.totalStock);
                const hc = healthConfig[health];
                const estValue = row.variants.reduce((s, v) => s + (v.totalStock || 0) * (v.mrp || 0), 0);

                return (
                  <React.Fragment key={row.articleId}>
                    <tr
                      className={`hover:bg-slate-50/80 cursor-pointer ${hc.rowClass}`}
                      onClick={() => toggleExpand(row.articleId)}
                    >
                      <td className="px-4 py-3 text-slate-400">
                        {expanded.has(row.articleId) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-800">{row.articleName}</td>
                      {/* <td className="px-4 py-3 font-mono text-xs text-slate-500">{row.sku}</td>
                      <td className="px-4 py-3 text-slate-600">{row.category}</td>
                      <td className="px-4 py-3 text-slate-600">{row.brand}</td> */}
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black ${hc.chipClass}`}>
                          {hc.icon}{hc.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="bg-indigo-100 text-indigo-700 text-xs font-bold px-2 py-0.5 rounded-full">{row.totalVariants}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`text-xs font-black px-2 py-0.5 rounded-full ${health === "OUT" ? "bg-rose-100 text-rose-700" : health === "LOW" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                          {toCtn(row.totalStock).toLocaleString()} ctn
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-teal-700 text-xs">
                        ₹{estValue.toLocaleString()}
                      </td>
                    </tr>

                    {expanded.has(row.articleId) && (
                      <tr>
                        <td colSpan={9} className="px-4 pb-4 bg-slate-50/70">
                          <div className="rounded-xl border border-slate-200 overflow-hidden mt-2">
                            <div className="overflow-x-auto">
                            <table className="w-full text-xs min-w-[900px]">
                              <thead className="bg-white border-b border-slate-100">
                                <tr>
                                  <th className="px-3 py-2.5 text-left font-bold text-slate-400 uppercase tracking-wider text-[10px]">Variant / Color</th>
                                  <th className="px-3 py-2.5 text-left font-bold text-slate-400 uppercase tracking-wider text-[10px]">Size Range</th>
                                  <th className="px-3 py-2.5 text-right font-bold text-slate-400 uppercase tracking-wider text-[10px]">MRP</th>
                                  <th className="px-3 py-2.5 text-right font-bold text-slate-400 uppercase tracking-wider text-[10px]">Cost</th>
                                  {/* <th className="px-3 py-2.5 text-left font-bold text-slate-400 uppercase tracking-wider text-[10px]">Status</th> */}
                                  <th className="px-3 py-2.5 text-left font-bold text-slate-400 uppercase tracking-wider text-[10px]">Health</th>
                                  <th className="px-3 py-2.5 text-right font-bold text-slate-400 uppercase tracking-wider text-[10px]">Stock (ctn)</th>
                                  <th className="px-3 py-2.5 text-right font-bold text-slate-400 uppercase tracking-wider text-[10px]">Booked (ctn)</th>
                                  <th className="px-3 py-2.5 text-right font-bold text-slate-400 uppercase tracking-wider text-[10px]">PO Pending (ctn)</th>
                                  <th className="px-3 py-2.5 text-right font-bold text-slate-400 uppercase tracking-wider text-[10px]">Value</th>
                                  <th className="px-3 py-2.5 text-left font-bold text-slate-400 uppercase tracking-wider text-[10px]">Size Breakdown (pairs)</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-50">
                                {row.variants.map(v => {
                                  const vh = getStockHealth(v.totalStock);
                                  const vhc = healthConfig[vh];
                                  const variantValue = (v.totalStock || 0) * (v.mrp || 0);
                                  return (
                                    <tr key={v.variantId} className={`hover:bg-slate-50 ${vhc.rowClass}`}>
                                      <td className="px-3 py-2.5">
                                        <p className="font-semibold text-slate-700">{v.itemName}</p>
                                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                          {row.gender && (
                                            <span className="px-1.5 py-0.5 rounded bg-slate-100 text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                                              {row.gender}
                                            </span>
                                          )}
                                          <span className="text-slate-400">{v.color}</span>
                                        </div>
                                      </td>
                                      <td className="px-3 py-2.5 font-mono text-slate-500">{v.sizeRange}</td>
                                      <td className="px-3 py-2.5 text-right font-bold text-indigo-600">₹{v.mrp?.toLocaleString()}</td>
                                      <td className="px-3 py-2.5 text-right font-bold text-slate-600">₹{v.costPrice?.toLocaleString()}</td>
                                      {/* <td className="px-3 py-2.5">
                                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${v.listingStatus === "available" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                                          {v.listingStatus?.toUpperCase()}
                                        </span>
                                      </td> */}
                                      <td className="px-3 py-2.5">
                                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-black ${vhc.chipClass}`}>
                                          {vhc.icon}{vhc.label}
                                        </span>
                                      </td>
                                      <td className="px-3 py-2.5 text-right font-black text-emerald-700">{toCtn(v.totalStock).toLocaleString()}</td>
                                      <td className="px-3 py-2.5 text-right font-black text-amber-600">{toCtn(v.booked).toLocaleString()}</td>
                                      <td className="px-3 py-2.5 text-right font-black text-violet-600">{toCtn(v.poPendingPairs).toLocaleString()}</td>
                                      <td className="px-3 py-2.5 text-right font-bold text-teal-600">₹{variantValue.toLocaleString()}</td>
                                      <td className="px-3 py-2.5">
                                        <div className="flex flex-wrap gap-x-3 gap-y-1">
                                          {Object.entries(v.sizeStock || {})
                                            .sort((a, b) => Number(a[0]) - Number(b[0]))
                                            .map(([s, c]) => (
                                              <span key={s} className="whitespace-nowrap">
                                                <span className="text-slate-500 font-bold">{s}</span>
                                                <span className="text-slate-300 mx-0.5">:</span>
                                                <span className={c.qty === 0 ? "text-rose-600 font-bold" : "text-emerald-700 font-semibold"}>{c.qty}</span>
                                              </span>
                                            ))}
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
        <Pagination currentPage={safePage} totalPages={totalPages} onPageChange={setPage} totalItems={allFilteredRows.length} itemsPerPage={pageSize} onPageSizeChange={setPageSize} />
      </div>
    </div>
  );
};

export default StockReport;
