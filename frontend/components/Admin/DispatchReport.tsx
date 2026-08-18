import React, { useState, useEffect, useCallback } from "react";
import { Truck, Download, RefreshCw, Calendar, AlertCircle } from "lucide-react";
import { apiFetch } from "../../services/api";
import Pagination from "../ui/Pagination";
import { usePageSize } from "../../utils/usePageSize";
import { Order } from "../../types";

interface DispatchOrder extends Order {
  _id: string;
  dispatchedAmount: number;
  dispatchedCartons: number;
}

interface Summary {
  totalOrders: number;
  totalCartons: number;
  totalAmount: number;
}

const statusColor: Record<string, string> = {
  RFD:      "bg-blue-100 text-blue-700",
  RECEIVED: "bg-emerald-100 text-emerald-700",
  PARTIAL:  "bg-amber-100 text-amber-700",
};

interface DispatchReportProps {
  onOpenOrder: (order: Order) => void;
}

const DispatchReport: React.FC<DispatchReportProps> = ({ onOpenOrder }) => {
  const [pageSize, setPageSize]   = usePageSize("dispatchReport", 20);
  const [rows, setRows]           = useState<DispatchOrder[]>([]);
  const [summary, setSummary]     = useState<Summary>({ totalOrders: 0, totalCartons: 0, totalAmount: 0 });
  const [loading, setLoading]     = useState(false);
  const [page, setPage]           = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal]         = useState(0);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate]     = useState("");
  const [error, setError]         = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(pageSize) });
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      const d = await apiFetch(`/reports/dispatch?${params.toString()}`);
      setRows(d.data || []);
      setSummary(d.summary || { totalOrders: 0, totalCartons: 0, totalAmount: 0 });
      setTotal(d.meta?.total || 0);
      setTotalPages(d.meta?.totalPages || 1);
    } catch (err: any) {
      setError(err?.message || "Failed to load dispatch report");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, startDate, endDate]);

  useEffect(() => { fetch(); }, [fetch]);

  // Real-time: refresh when order status changes (dispatch, delivery, etc.)
  useEffect(() => {
    const handler = () => fetch();
    window.addEventListener("orderUpdatedSocket", handler);
    return () => window.removeEventListener("orderUpdatedSocket", handler);
  }, [fetch]);

  const handleFilter = () => { setPage(1); fetch(); };

  const exportCsv = () => {
    const lines = ["Order #,Distributor,Date,Status,Dispatched Cartons,Dispatched Amount"];
    rows.forEach(r => {
      lines.push(`"${r.orderNumber}","${r.distributorName}","${new Date(r.date).toLocaleDateString()}","${r.status}",${r.dispatchedCartons},${r.dispatchedAmount}`);
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "dispatch_report.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Truck size={20} className="text-blue-500" /> Dispatch Report
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">Dispatched cartons and their prorated order value</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetch} className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 text-slate-600 rounded-xl text-sm font-semibold hover:bg-slate-200 transition-all">
            <RefreshCw size={14} /> Refresh
          </button>
          <button onClick={exportCsv} className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition-all">
            <Download size={14} /> Export CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Total Orders", value: summary.totalOrders.toLocaleString(), color: "text-indigo-600" },
          { label: "Dispatched Revenue", value: `₹${summary.totalAmount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`, color: "text-emerald-600" },
          { label: "Dispatched Cartons", value: summary.totalCartons.toLocaleString(), color: "text-blue-600" },
        ].map(card => (
          <div key={card.label} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1">{card.label}</p>
            <p className={`text-2xl font-black ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 items-end flex-wrap">
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">From Date</label>
          <div className="relative">
            <Calendar size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400" />
          </div>
        </div>
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">To Date</label>
          <div className="relative">
            <Calendar size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400" />
          </div>
        </div>
        <button onClick={handleFilter} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-all">Apply</button>
        {(startDate || endDate) && (
          <button onClick={() => { setStartDate(""); setEndDate(""); setPage(1); }} className="px-3 py-2 text-sm text-slate-500 hover:text-slate-800">Clear</button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400">
            <RefreshCw size={20} className="animate-spin mr-2" /> Loading...
          </div>
        ) : error ? (
          <div className="flex items-center justify-center gap-3 py-20 text-rose-500">
            <AlertCircle size={20} />
            <span className="text-sm font-medium">{error}</span>
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-20 text-slate-400">No dispatched cartons found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 font-bold text-slate-500 uppercase tracking-wider text-xs">Order #</th>
                  <th className="px-4 py-3 font-bold text-slate-500 uppercase tracking-wider text-xs">Distributor</th>
                  <th className="px-4 py-3 font-bold text-slate-500 uppercase tracking-wider text-xs">Date</th>
                  <th className="px-4 py-3 font-bold text-slate-500 uppercase tracking-wider text-xs">Status</th>
                  <th className="px-4 py-3 font-bold text-slate-500 uppercase tracking-wider text-xs text-center">Dispatched Cartons</th>
                  <th className="px-4 py-3 font-bold text-slate-500 uppercase tracking-wider text-xs text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map(r => (
                  <tr
                    key={r._id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Open order ${r.orderNumber}`}
                    onClick={() => onOpenOrder(r)}
                    onKeyDown={e => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onOpenOrder(r);
                      }
                    }}
                    className="cursor-pointer hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500"
                  >
                    <td className="px-4 py-3 font-mono font-semibold text-indigo-600">#{r.orderNumber}</td>
                    <td className="px-4 py-3 text-slate-800 font-medium">{r.distributorName}</td>
                    <td className="px-4 py-3 text-slate-500">{new Date(r.date).toLocaleDateString("en-IN")}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${statusColor[r.status] || "bg-slate-100 text-slate-600"}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center font-semibold text-slate-700">{r.dispatchedCartons?.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-700">₹{r.dispatchedAmount?.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} totalItems={total} itemsPerPage={pageSize} onPageSizeChange={setPageSize} />
      </div>
    </div>
  );
};

export default DispatchReport;
