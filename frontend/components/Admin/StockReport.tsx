import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Search, Download, Package, RefreshCw, ChevronDown, ChevronRight,
  AlertCircle, Filter, TrendingDown, AlertTriangle, CheckCircle2,
  XCircle, BarChart3, IndianRupee,
} from "lucide-react";
import { apiFetch } from "../../services/api";
import Pagination from "../ui/Pagination";
import { usePageSize } from "../../utils/usePageSize";

interface SizeCell { qty: number; }

interface Variant {
  variantId: string;
  itemName: string;
  color: string;
  sizeRange: string;
  mrp: number;
  listingStatus: string;
  sizeQuantities: Record<string, number>;
  sizeStock: Record<string, SizeCell>;
  totalStock: number;
}

interface StockRow {
  articleId: string;
  articleName: string;
  sku: string;
  category: string;
  brand: string;
  totalVariants: number;
  totalStock: number;
  variants: Variant[];
}

type StockFilter = "ALL" | "IN_STOCK" | "LOW" | "OUT";

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

const StockReport: React.FC = () => {
  const [pageSize, setPageSize] = usePageSize("stockReport", 30);
  const [rows, setRows] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [stockFilter, setStockFilter] = useState<StockFilter>("ALL");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(pageSize) });
      if (search) params.set("q", search);
      const d = await apiFetch(`/reports/stock?${params.toString()}`);
      setRows(d.data || []);
      setTotal(d.meta?.total || 0);
      setTotalPages(d.meta?.totalPages || 1);
    } catch (err: any) {
      setError(err?.message || "Failed to load stock report");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Real-time: refresh when GRN received or catalog changes
  useEffect(() => {
    const handler = () => fetchData();
    window.addEventListener("grnRefetch",    handler);
    window.addEventListener("catalogRefetch", handler);
    window.addEventListener("orderUpdatedSocket", handler);
    return () => {
      window.removeEventListener("grnRefetch",    handler);
      window.removeEventListener("catalogRefetch", handler);
      window.removeEventListener("orderUpdatedSocket", handler);
    };
  }, [fetchData]);

  const handleSearch = () => { setPage(1); setSearch(searchInput); };

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const expandAll = () => setExpanded(new Set(filteredRows.map(r => r.articleId)));
  const collapseAll = () => setExpanded(new Set());

  const filteredRows = useMemo(() => {
    if (stockFilter === "ALL") return rows;
    return rows.filter(r => getStockHealth(r.totalStock) === stockFilter);
  }, [rows, stockFilter]);

  // Summary stats computed from all loaded rows
  const stats = useMemo(() => {
    const totalArticles = total;
    let totalPairs = 0;
    let totalVariants = 0;
    let outCount = 0;
    let lowCount = 0;
    let totalValue = 0;

    rows.forEach(r => {
      totalPairs += r.totalStock;
      totalVariants += r.totalVariants;
      const h = getStockHealth(r.totalStock);
      if (h === "OUT") outCount++;
      if (h === "LOW") lowCount++;
      r.variants.forEach(v => {
        totalValue += (v.totalStock || 0) * (v.mrp || 0);
      });
    });

    return { totalArticles, totalPairs, totalVariants, outCount, lowCount, totalValue };
  }, [rows, total]);

  const exportCsv = () => {
    const lines = ["Article,SKU,Category,Brand,Variant,Color,Size Range,MRP,Status,Stock Health,Total Stock,Stock by Size (qty/blocked)"];
    filteredRows.forEach(r => {
      r.variants.forEach(v => {
        const sizes = Object.entries(v.sizeStock || {})
          .sort((a, b) => Number(a[0]) - Number(b[0]))
          .map(([s, c]) => `${s}:${c.qty}`)
          .join(" ");
        const health = getStockHealth(v.totalStock);
        lines.push(`"${r.articleName}","${r.sku}","${r.category}","${r.brand}","${v.itemName}","${v.color}","${v.sizeRange}",${v.mrp},"${v.listingStatus}","${health}",${v.totalStock},"${sizes}"`);
      });
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "stock_report.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <BarChart3 size={20} className="text-indigo-500" /> Stock Report
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">{total} articles · live inventory snapshot</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchData} className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 text-slate-600 rounded-xl text-sm font-semibold hover:bg-slate-200 transition-all">
            <RefreshCw size={14} /> Refresh
          </button>
          <button onClick={exportCsv} className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition-all">
            <Download size={14} /> Export CSV
          </button>
        </div>
      </div>

      {/* KPI Summary Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "Articles",       value: stats.totalArticles.toLocaleString(),            icon: <Package size={14} />,     color: "text-indigo-600",  bg: "bg-indigo-50" },
          { label: "Variants",       value: stats.totalVariants.toLocaleString(),            icon: <Package size={14} />,     color: "text-blue-600",    bg: "bg-blue-50" },
          { label: "Total Pairs",    value: stats.totalPairs.toLocaleString(),               icon: <BarChart3 size={14} />,   color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "Stock Value",    value: `₹${(stats.totalValue/100000).toFixed(1)}L`,    icon: <IndianRupee size={14} />, color: "text-teal-600",    bg: "bg-teal-50" },
          { label: "Low Stock",      value: stats.lowCount.toLocaleString(),                 icon: <AlertTriangle size={14} />, color: "text-amber-600", bg: "bg-amber-50" },
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

        {/* Stock level filter tabs */}
        <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 ml-auto">
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

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        {/* Table toolbar */}
        <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
          <span className="text-xs text-slate-500 font-medium">
            {stockFilter !== "ALL"
              ? `Showing ${filteredRows.length} filtered / ${rows.length} loaded`
              : `${rows.length} articles loaded`}
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
            {stockFilter !== "ALL" ? `No articles with "${stockFilter.toLowerCase().replace("_", " ")}" status` : "No stock data found"}
          </div>
        ) : (
          <table className="w-full text-left text-sm">
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
                          {(row.totalStock ?? 0).toLocaleString()} pr
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
                            <table className="w-full text-xs">
                              <thead className="bg-white border-b border-slate-100">
                                <tr>
                                  <th className="px-3 py-2.5 text-left font-bold text-slate-400 uppercase tracking-wider text-[10px]">Variant / Color</th>
                                  <th className="px-3 py-2.5 text-left font-bold text-slate-400 uppercase tracking-wider text-[10px]">Size Range</th>
                                  <th className="px-3 py-2.5 text-right font-bold text-slate-400 uppercase tracking-wider text-[10px]">MRP</th>
                                  <th className="px-3 py-2.5 text-left font-bold text-slate-400 uppercase tracking-wider text-[10px]">Status</th>
                                  <th className="px-3 py-2.5 text-left font-bold text-slate-400 uppercase tracking-wider text-[10px]">Health</th>
                                  <th className="px-3 py-2.5 text-right font-bold text-slate-400 uppercase tracking-wider text-[10px]">Stock (pr)</th>
                                  <th className="px-3 py-2.5 text-right font-bold text-slate-400 uppercase tracking-wider text-[10px]">Value</th>
                                  <th className="px-3 py-2.5 text-left font-bold text-slate-400 uppercase tracking-wider text-[10px]">Size Breakdown (qty/blocked)</th>
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
                                        <p className="text-slate-400 mt-0.5 flex items-center gap-1">
                                          <span className="w-2.5 h-2.5 rounded-full border border-slate-300 inline-block" style={{ backgroundColor: v.color?.toLowerCase() }} />
                                          {v.color}
                                        </p>
                                      </td>
                                      <td className="px-3 py-2.5 font-mono text-slate-500">{v.sizeRange}</td>
                                      <td className="px-3 py-2.5 text-right font-bold text-indigo-600">₹{v.mrp?.toLocaleString()}</td>
                                      <td className="px-3 py-2.5">
                                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${v.listingStatus === "available" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                                          {v.listingStatus?.toUpperCase()}
                                        </span>
                                      </td>
                                      <td className="px-3 py-2.5">
                                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-black ${vhc.chipClass}`}>
                                          {vhc.icon}{vhc.label}
                                        </span>
                                      </td>
                                      <td className="px-3 py-2.5 text-right font-black text-emerald-700">{(v.totalStock ?? 0).toLocaleString()}</td>
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
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
        <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} totalItems={total} itemsPerPage={pageSize} onPageSizeChange={setPageSize} />
      </div>
    </div>
  );
};

export default StockReport;
