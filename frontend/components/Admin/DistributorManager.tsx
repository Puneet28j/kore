import React, { useState, useEffect, useCallback } from "react";
import { User, UserRole, DistributorAddress } from "../../types";
import {
  Users,
  Plus,
  Search,
  ChevronRight,
  ArrowLeft,
  Building2,
  Mail,
  Phone,
  FileText,
  CreditCard,
  MapPin,
  Percent,
  Wallet,
  Shield,
  AlertCircle,
  Loader,
  Edit,
  Eye,
  EyeOff,
  Copy,
  TrendingUp,
  Package,
  RefreshCw,
  RotateCcw,
  IndianRupee,
  Clock,
  Tag,
  X,
} from "lucide-react";
import { apiFetch } from "../../services/api";
import GSTVerifyInput, { type GSTVerifyResult } from "../shared/GSTVerifyInput";
import Switch from "../ui/Switch";
import ConfirmDialog, { useConfirm } from "../ui/ConfirmDialog";
import distributorService from "../../services/distributorService";
import { toast } from "sonner";
import Pagination from "../ui/Pagination";
import { usePageSize } from "../../utils/usePageSize";

interface DistributorManagerProps {
  orders: any[]; // Used just for the list
}

type ViewState = "LIST" | "CREATE" | "DETAILS";

// --- Styling Constants (Shared with VendorManager) ---
const inputClass =
  "w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all font-medium text-slate-800 text-sm";
const selectClass =
  "w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all font-medium text-slate-700 text-sm cursor-pointer";
const labelClass =
  "block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1";

// --- Indian States ---
const indianStates = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  "Delhi",
  "Jammu & Kashmir",
  "Ladakh",
  "Puducherry",
  "Chandigarh",
  "Andaman & Nicobar",
  "Dadra & Nagar Haveli",
  "Lakshadweep",
];

// --- Helpers & Sub-components ---

const emptyAddress = (): DistributorAddress => ({
  attention: "",
  country: "India",
  address1: "",
  address2: "",
  city: "",
  state: "",
  pinCode: "",
});

const Field: React.FC<{
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}> = ({ label, icon, children }) => (
  <div className="space-y-1.5">
    <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-widest pl-1">
      {icon && <span className="text-slate-400">{icon}</span>}
      {label}
    </label>
    {children}
  </div>
);

const STATUS_META: Record<string, { label: string; color: string }> = {
  BOOKED:   { label: "Booked",   color: "bg-slate-100 text-slate-600" },
  PFD:      { label: "PFD",      color: "bg-violet-100 text-violet-700" },
  RFD:      { label: "RFD",      color: "bg-blue-100 text-blue-700" },
  RECEIVED: { label: "Received", color: "bg-emerald-100 text-emerald-700" },
  PARTIAL:  { label: "Partial",  color: "bg-orange-100 text-orange-700" },
};

interface PendingCartonItemEntry {
  articleName: string;
  color: string;
  sizeRange: string;
  bookingType: string;
  pendingCartons: number;
  totalCartons: number;
}

interface PendingCartonBreakdownEntry {
  orderId: string;
  orderNumber?: string;
  status: string;
  date: string;
  pendingCartons: number;
  totalCartons: number;
  items: PendingCartonItemEntry[];
}

interface DistributorSummary {
  totalOrders: number;
  totalAmount: number;
  totalPairs: number;
  paidAmount: number;
  pendingAmount: number;
  totalPendingCartons: number;
  pendingCartonBreakdown: PendingCartonBreakdownEntry[];
  statusCounts: Record<string, number>;
  recentOrders: any[];
  totalReturns: number;
  returnPairs: number;
  recentReturns: any[];
}

const DistributorActivityOverview: React.FC<{ distributorId: string }> = ({ distributorId }) => {
  const [summary, setSummary] = useState<DistributorSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPendingBreakdown, setShowPendingBreakdown] = useState(false);
  const [expandedPendingOrders, setExpandedPendingOrders] = useState<Set<string>>(new Set());

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    if (!silent) setError(null);
    try {
      const res = await apiFetch(`/distributors/${distributorId}/summary`);
      setSummary(res.data);
    } catch (e: any) {
      if (!silent) setError(e?.message || "Failed to load activity");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [distributorId]);

  useEffect(() => { load(); }, [load]);

  // Paid/Pending/Active Orders here are order-derived — refresh in the
  // background (no loading spinner) when an order updates or a return is
  // filed elsewhere, so this stays live while the details view is open.
  useEffect(() => {
    const handler = () => load(true);
    window.addEventListener("orderUpdatedSocket", handler);
    window.addEventListener("returnRefetch", handler);
    return () => {
      window.removeEventListener("orderUpdatedSocket", handler);
      window.removeEventListener("returnRefetch", handler);
    };
  }, [load]);

  if (loading) return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex items-center justify-center py-16">
      <RefreshCw size={20} className="animate-spin text-slate-400 mr-2" />
      <span className="text-sm text-slate-400">Loading activity...</span>
    </div>
  );

  if (error) return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
      <div className="flex items-center gap-2 text-rose-500 text-sm">
        <AlertCircle size={16} /> {error}
      </div>
    </div>
  );

  if (!summary) return null;

  const noActivity = summary.totalOrders === 0;

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <TrendingUp size={15} className="text-indigo-500" /> Activity Overview
          </h3>
          <button onClick={() => load()} className="text-slate-400 hover:text-indigo-600 p-1 rounded-lg hover:bg-slate-50 transition-colors">
            <RefreshCw size={14} />
          </button>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
          {[
            { label: "Total Orders",  value: summary.totalOrders.toLocaleString(),            icon: <Package size={14} />,      color: "text-indigo-600",  bg: "bg-indigo-50" },
            { label: "Total Value",   value: `₹${summary.totalAmount.toLocaleString()}`,       icon: <IndianRupee size={14} />,   color: "text-emerald-600", bg: "bg-emerald-50" },
            { label: "Total CTN",   value: Math.floor(summary.totalPairs / 24).toLocaleString(),   icon: <Package size={14} />,      color: "text-blue-600",    bg: "bg-blue-50" },
            {
              label: "Pending CTN",
              value: summary.totalPendingCartons.toLocaleString(),
              icon: <Clock size={14} />,
              color: "text-rose-600",
              bg: "bg-rose-50",
              onClick: summary.totalPendingCartons > 0 ? () => setShowPendingBreakdown(true) : undefined,
            },
            { label: "Returns",       value: `${summary.totalReturns} (${Math.floor(summary.returnPairs / 24)} ctn)`, icon: <RotateCcw size={14} />, color: "text-amber-600",   bg: "bg-amber-50" },
          ].map(s => (
            <div
              key={s.label}
              onClick={s.onClick}
              className={`${s.bg} rounded-xl p-3 text-left ${s.onClick ? "cursor-pointer hover:shadow-sm transition-shadow" : ""}`}
            >
              <div className={`${s.color} mb-1`}>{s.icon}</div>
              <p className={`text-base font-black ${s.color}`}>{s.value}</p>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Payment split */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-emerald-50 rounded-xl p-3 flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
            <div>
              <p className="text-xs text-slate-500 font-medium">Paid</p>
              <p className="text-sm font-black text-emerald-700">₹{summary.paidAmount.toLocaleString()}</p>
            </div>
          </div>
          <div className="bg-rose-50 rounded-xl p-3 flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0" />
            <div>
              <p className="text-xs text-slate-500 font-medium">Pending Payment</p>
              <p className="text-sm font-black text-rose-700">₹{summary.pendingAmount.toLocaleString()}</p>
            </div>
          </div>
        </div>

        {/* Status breakdown chips */}
        {!noActivity && (
          <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-slate-100">
            {Object.entries(summary.statusCounts).map(([status, count]) => {
              const meta = STATUS_META[status] || { label: status, color: "bg-slate-100 text-slate-600" };
              return (
                <span key={status} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${meta.color}`}>
                  {meta.label} <span className="opacity-70">× {count}</span>
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent Orders */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
          <Clock size={13} className="text-slate-400" />
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Recent Orders</h4>
          <span className="ml-auto text-[10px] text-slate-400">Last 10</span>
        </div>
        {noActivity ? (
          <div className="py-12 flex flex-col items-center justify-center">
            <FileText className="text-slate-200 mb-2" size={28} />
            <p className="text-sm text-slate-400">No orders yet for this distributor</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-2.5 font-bold text-slate-500 uppercase tracking-wider">Order #</th>
                  <th className="px-4 py-2.5 font-bold text-slate-500 uppercase tracking-wider">Date</th>
                  <th className="px-4 py-2.5 font-bold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-2.5 font-bold text-slate-500 uppercase tracking-wider text-right">Pairs</th>
                  <th className="px-4 py-2.5 font-bold text-slate-500 uppercase tracking-wider text-right">Amount</th>
                  <th className="px-4 py-2.5 font-bold text-slate-500 uppercase tracking-wider">Payment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {summary.recentOrders.map((o: any) => {
                  const meta = STATUS_META[o.status] || { label: o.status, color: "bg-slate-100 text-slate-600" };
                  return (
                    <tr key={o._id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-2.5 font-mono font-semibold text-indigo-600">#{o.orderNumber}</td>
                      <td className="px-4 py-2.5 text-slate-500">{o.date ? new Date(o.date).toLocaleDateString("en-IN") : "—"}</td>
                      <td className="px-4 py-2.5">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-black ${meta.color}`}>{meta.label}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-700 font-semibold">{(o.totalPairs || 0).toLocaleString()}</td>
                      <td className={`px-4 py-2.5 text-right font-bold ${o.status === "CANCELLED" ? "text-slate-400" : "text-emerald-700"}`}>₹{(o.finalAmount || o.totalAmount || 0).toLocaleString()}</td>
                      <td className="px-4 py-2.5">
                        {o.status === "CANCELLED" ? (
                          <span className="text-[10px] font-bold text-slate-400">— N/A —</span>
                        ) : (
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-black ${o.paymentStatus === "PAID" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                            {o.paymentStatus || "PENDING"}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent Returns */}
      {summary.recentReturns.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
            <RotateCcw size={13} className="text-amber-500" />
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Recent Returns</h4>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-2.5 font-bold text-slate-500 uppercase tracking-wider">Return #</th>
                  <th className="px-4 py-2.5 font-bold text-slate-500 uppercase tracking-wider">Date</th>
                  <th className="px-4 py-2.5 font-bold text-slate-500 uppercase tracking-wider">Reason</th>
                  <th className="px-4 py-2.5 font-bold text-slate-500 uppercase tracking-wider text-right">Cartons</th>
                  <th className="px-4 py-2.5 font-bold text-slate-500 uppercase tracking-wider text-right">Pairs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {summary.recentReturns.map((r: any) => (
                  <tr key={r._id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-2.5 font-mono font-semibold text-amber-600">#{r.returnNumber || r._id?.toString().slice(-6)}</td>
                    <td className="px-4 py-2.5 text-slate-500">{r.createdAt ? new Date(r.createdAt).toLocaleDateString("en-IN") : "—"}</td>
                    <td className="px-4 py-2.5 text-slate-600">{r.reason || "—"}</td>
                    <td className="px-4 py-2.5 text-right text-slate-700 font-semibold">{r.totalCartons || 0}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-amber-700">{r.totalPairs || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pending CTN breakdown */}
      {showPendingBreakdown && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
          onClick={() => setShowPendingBreakdown(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Pending Cartons Breakdown</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {summary.totalPendingCartons.toLocaleString()} carton(s) not yet scanned out, across {summary.pendingCartonBreakdown.length} order(s)
                </p>
              </div>
              <button
                onClick={() => setShowPendingBreakdown(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors shrink-0"
              >
                <X size={16} />
              </button>
            </div>
            <div className="overflow-y-auto divide-y divide-slate-50">
              {summary.pendingCartonBreakdown.map((p) => {
                const meta = STATUS_META[p.status] || { label: p.status, color: "bg-slate-100 text-slate-600" };
                const isExpanded = expandedPendingOrders.has(p.orderId);
                return (
                  <div key={p.orderId}>
                    <button
                      type="button"
                      onClick={() => setExpandedPendingOrders(prev => {
                        const next = new Set(prev);
                        if (next.has(p.orderId)) next.delete(p.orderId);
                        else next.add(p.orderId);
                        return next;
                      })}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-xs hover:bg-slate-50/60 transition-colors text-left"
                    >
                      <ChevronRight
                        size={13}
                        className={`text-slate-300 shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                      />
                      <span className="font-mono font-semibold text-indigo-600 shrink-0">
                        {p.orderNumber ? `#${p.orderNumber}` : "—"}
                      </span>
                      <span className="text-slate-400 shrink-0">
                        {p.date ? new Date(p.date).toLocaleDateString("en-IN") : "—"}
                      </span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-black shrink-0 ${meta.color}`}>{meta.label}</span>
                      <span className="ml-auto font-black text-rose-600 shrink-0">
                        {p.pendingCartons} / {p.totalCartons} CTN
                      </span>
                    </button>
                    {isExpanded && (
                      <div className="bg-slate-50/70 px-4 py-2 pl-10">
                        <table className="w-full text-left text-[11px]">
                          <thead>
                            <tr>
                              <th className="py-1 font-bold text-slate-400 uppercase tracking-wider">Item</th>
                              <th className="py-1 font-bold text-slate-400 uppercase tracking-wider text-right">Pending CTN</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {p.items.map((it, idx) => (
                              <tr key={idx}>
                                <td className="py-1.5 text-slate-700 font-medium">
                                  {it.articleName}
                                  {it.color && <span className="text-slate-400"> — {it.color}</span>}
                                  {it.sizeRange && <span className="text-slate-400"> ({it.sizeRange})</span>}
                                  {it.bookingType === "PREORDER" && (
                                    <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase bg-amber-50 text-amber-600 border border-amber-100">
                                      Pre-Order
                                    </span>
                                  )}
                                </td>
                                <td className="py-1.5 text-right font-bold text-rose-600 shrink-0">
                                  {it.pendingCartons} / {it.totalCartons}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const InfoRow: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
}> = ({ icon, label, value, mono }) => (
  <div className="flex gap-3">
    <div className="mt-0.5 text-slate-400">{icon}</div>
    <div>
      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <p
        className={`text-sm text-slate-800 font-medium ${
          mono ? "font-mono" : ""
        }`}
      >
        {value}
      </p>
    </div>
  </div>
);

const AddressForm: React.FC<{
  value: DistributorAddress;
  onChange: (field: keyof DistributorAddress, val: string) => void;
}> = ({ value, onChange }) => {
  return (
    <div className="space-y-4">
      <div>
        <label className={labelClass}>Attention</label>
        <input
          type="text"
          className={inputClass}
          value={value.attention || ""}
          onChange={(e) => onChange("attention", e.target.value)}
        />
      </div>
      <div>
        <label className={labelClass}>Country / Region</label>
        <select
          className={selectClass}
          value={value.country || ""}
          onChange={(e) => onChange("country", e.target.value)}
        >
          <option value="">Select</option>
          <option>India</option>
          <option>United States</option>
          <option>United Kingdom</option>
          <option>Other</option>
        </select>
      </div>
      <div>
        <label className={labelClass}>Address</label>
        <input
          type="text"
          placeholder="Street 1"
          className={`${inputClass} mb-3`}
          value={value.address1 || ""}
          onChange={(e) => onChange("address1", e.target.value)}
        />
        <input
          type="text"
          placeholder="Street 2"
          className={inputClass}
          value={value.address2 || ""}
          onChange={(e) => onChange("address2", e.target.value)}
        />
      </div>
      <div>
        <label className={labelClass}>City</label>
        <input
          type="text"
          className={inputClass}
          value={value.city || ""}
          onChange={(e) => onChange("city", e.target.value)}
        />
      </div>
      <div>
        <label className={labelClass}>State</label>
        <select
          className={selectClass}
          value={value.state || ""}
          onChange={(e) => onChange("state", e.target.value)}
        >
          <option value="">Select</option>
          {indianStates.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelClass}>Pin Code</label>
        <input
          type="text"
          className={inputClass}
          value={value.pinCode || ""}
          onChange={(e) => onChange("pinCode", e.target.value)}
        />
      </div>
    </div>
  );
};

const DistributorManager: React.FC<DistributorManagerProps> = ({ orders }) => {
  const savedDraftStr = localStorage.getItem("kore_distributor_draft");
  const savedDraft = savedDraftStr ? JSON.parse(savedDraftStr) : null;

  // Instead of always restoring the view, if the saved view is DETAILS, we default back to LIST.
  // We only want to restore CREATE view (form drafts).
  const initialView = savedDraft?.view === "CREATE" ? "CREATE" : "LIST";

  const [view, setView] = useState<ViewState>(initialView);
  const [distributors, setDistributors] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = usePageSize("distributorManager", 20);
  React.useEffect(() => { setPage(1); }, [searchQuery]);
  const [creatingLoading, setCreatingLoading] = useState(false);

  // If restoring CREATE view, we can restore the selected distributor. Otherwise, clear it.
  const [selectedDistributor, setSelectedDistributor] = useState<User | null>(
    initialView === "CREATE" ? (savedDraft?.selectedDistributor || null) : null
  );

  // Credit "Used Limit" for the Financial Terms card — sourced from the same
  // eligible-orders rule the login credit check uses, so it never disagrees
  // with what actually blocks checkout.
  const [usedLimit, setUsedLimit] = useState<number | null>(null);
  React.useEffect(() => {
    if (view !== "DETAILS" || !selectedDistributor?.id) {
      setUsedLimit(null);
      return;
    }
    let cancelled = false;
    const fetchUsedLimit = () =>
      apiFetch(`/distributors/${selectedDistributor.id}/summary`)
        .then((res) => { if (!cancelled) setUsedLimit(res.data?.creditUsed ?? 0); })
        .catch(() => { if (!cancelled) setUsedLimit(null); });

    fetchUsedLimit();
    // Order updates/payments change what counts as "used" against the limit.
    window.addEventListener("orderUpdatedSocket", fetchUsedLimit);
    return () => {
      cancelled = true;
      window.removeEventListener("orderUpdatedSocket", fetchUsedLimit);
    };
  }, [view, selectedDistributor?.id]);

  // confirmation helper
  const { confirm, dialog: confirmDialog } = useConfirm();

  // --- Create/Edit Form State ---
  const [editingId, setEditingId] = useState<string | null>(
    savedDraft?.editingId || null
  );
  const [isCustomPayment, setIsCustomPayment] = useState(
    savedDraft?.isCustomPayment || false
  );
  const [formData, setFormData] = useState<Partial<User>>(
    savedDraft?.formData || {
      name: "",
      email: "",
      phone: "",
      companyName: "",
      gstNumber: "",
      billingAddress: emptyAddress(),
      shippingAddress: emptyAddress(),
      paymentTerms: "30 days",
      discountPercentage: 0,
      creditLimit: 0,
      tag: "online",
      loginEmail: "",
      loginPassword: "",
      loginEnabled: true,
    }
  );

  // password visibility toggles
  const [showPasswordEdit, setShowPasswordEdit] = useState(false);

  // --- Separate "Update Login Credentials" modal state (kept independent
  // from the profile-edit form so saving profile changes never touches
  // login email/password) ---
  const [showCredentialsModal, setShowCredentialsModal] = useState(false);
  const [credEmail, setCredEmail] = useState("");
  const [credPassword, setCredPassword] = useState("");
  const [showCredPassword, setShowCredPassword] = useState(false);
  const [credSaving, setCredSaving] = useState(false);

  React.useEffect(() => {
    if (view !== "LIST") {
      // avoid persisting sensitive password in draft storage
      const draft = {
        view,
        selectedDistributor,
        editingId,
        isCustomPayment,
        formData: { ...formData },
      };
      if (draft.formData.loginPassword) delete draft.formData.loginPassword;

      localStorage.setItem("kore_distributor_draft", JSON.stringify(draft));
    } else {
      localStorage.removeItem("kore_distributor_draft");
    }
  }, [view, selectedDistributor, editingId, isCustomPayment, formData]);

  // --- Fetch distributors on mount / page / search ---
  React.useEffect(() => {
    const fetchDistributors = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await distributorService.listDistributors({
          search: searchQuery || undefined,
          page,
          limit: pageSize,
        });
        const mapped = (response.items || []).map((d: any) => ({
          ...d,
          id: d._id || d.id,
        }));
        setDistributors(mapped);
        setTotalPages((response.meta as any)?.pages || (response.meta as any)?.totalPages || 1);
        setTotal(response.meta?.total || 0);
      } catch (err: any) {
        setError(err.message || "Failed to load distributors");
        console.error("Error fetching distributors:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchDistributors();
  }, [searchQuery, page, pageSize]);

  // Real-time: refresh distributor list when any distributor is updated/toggled
  React.useEffect(() => {
    const handler = () => {
      const fetchDistributors = async () => {
        try {
          const response = await distributorService.listDistributors({ search: searchQuery || undefined, page, limit: pageSize });
          const mapped = (response.items || []).map((d: any) => ({ ...d, id: d._id || d.id }));
          setDistributors(mapped);
          setTotalPages((response.meta as any)?.pages || (response.meta as any)?.totalPages || 1);
          setTotal(response.meta?.total || 0);
        } catch {}
      };
      fetchDistributors();
    };
    window.addEventListener("distributorRefetch", handler);
    return () => window.removeEventListener("distributorRefetch", handler);
  }, [searchQuery, page, pageSize]);

  const handleCreateDistributor = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      // Check for financial changes if editing
      if (editingId && selectedDistributor) {
        const changes = [];
        if (Number(formData.discountPercentage) !== (selectedDistributor.discountPercentage || 0)) {
          changes.push(`Discount %: ${selectedDistributor.discountPercentage || 0}% → ${formData.discountPercentage}%`);
        }
        if (Number(formData.creditLimit) !== (selectedDistributor.creditLimit || 0)) {
          changes.push(`Credit Limit: ₹${(selectedDistributor.creditLimit || 0).toLocaleString()} → ₹${(Number(formData.creditLimit) || 0).toLocaleString()}`);
        }

        if (changes.length > 0) {
          const ok = await confirm({
            title: "Confirm Financial Changes",
            description: (
              <div className="space-y-2">
                <p>Are you sure you want to update the financial terms for <strong>{selectedDistributor.companyName}</strong>?</p>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1">
                  {changes.map((change, i) => (
                    <p key={i} className="text-sm font-medium text-amber-800">{change}</p>
                  ))}
                </div>
              </div>
            ),
            confirmText: "Yes, Update",
            cancelText: "Cancel",
          });
          if (!ok) return;
        }
      }

      setCreatingLoading(true);
      setError(null);

      // Prepare payload — profile fields only. Login email/password are
      // intentionally excluded here for edits; they're only set at creation
      // time or via the separate "Update Login Credentials" modal, so that
      // saving a profile change (name, address, GST, etc.) can never
      // accidentally overwrite login credentials.
      const payload: any = {
        name: formData.name || "",
        email: formData.email || "",
        phone: formData.phone || "",
        companyName: formData.companyName || "",
        gstNumber: formData.gstNumber || "",
        billingAddress: formData.billingAddress,
        shippingAddress: formData.shippingAddress,
        paymentTerms: formData.paymentTerms || "30 days",
        discountPercentage: Number(formData.discountPercentage) || 0,
        creditLimit: Number(formData.creditLimit) || 0,
        tag: formData.tag || "online",
        isActive: true,
      };

      if (!editingId) {
        // New distributor — login credentials are set as part of creation.
        payload.loginEmail = formData.loginEmail || "";
        payload.loginEnabled = !!(formData.loginEmail && formData.loginPassword);
        if (formData.loginPassword && formData.loginPassword.trim().length > 0) {
          payload.loginPassword = formData.loginPassword;
        }
      }

      let updatedDistributor: any = null;
      if (editingId) {
        // Update existing distributor
        updatedDistributor = await distributorService.updateDistributor(editingId, payload);
      } else {
        // Create new distributor
        // For new distributors, password might be required by backend
        if (!payload.loginPassword && payload.loginEnabled) {
          throw new Error("Login password is required for new distributors with login enabled");
        }
        await distributorService.createDistributor(payload);
      }

      // Refresh the list
      const response = await distributorService.listDistributors();
      const mapped = (response.items || []).map((d: any) => ({
        ...d,
        id: d._id || d.id,
      }));
      setDistributors(mapped);

      // Instant UI Update: If we were editing, update the selected distributor and show details
      if (editingId && updatedDistributor) {
        const normalized = {
          ...updatedDistributor,
          id: updatedDistributor._id || updatedDistributor.id
        };
        setSelectedDistributor(normalized);
        setView("DETAILS");
      } else {
        setView("LIST");
      }

      // Reset form
      setEditingId(null);
      setIsCustomPayment(false);
      setFormData({
        name: "",
        email: "",
        phone: "",
        companyName: "",
        gstNumber: "",
        billingAddress: emptyAddress(),
        shippingAddress: emptyAddress(),
        paymentTerms: "30 days",
        discountPercentage: 0,
        creditLimit: 0,
        tag: "online",
        loginEmail: "",
        loginPassword: "",
        loginEnabled: true,
      });
      localStorage.removeItem("kore_distributor_draft");
    } catch (err: any) {
      const errorMsg = err.message || "Failed to save distributor";
      setError(errorMsg);
      console.error("Error saving distributor:", err);
    } finally {
      setCreatingLoading(false);
    }
  };

  const handleLoginToggle = async (distributor: User, enabled: boolean) => {
    try {
      setError(null);
      if (!distributor.id) {
        throw new Error("Missing distributor id");
      }
      await distributorService.updateDistributor(distributor.id, {
        loginEnabled: enabled,
      });
      toast.success(
        `Login ${enabled ? "enabled" : "disabled"} for ${
          distributor.companyName
        }`
      );
      // Update local state
      setDistributors((prev) =>
        prev.map((d) =>
          d.id === distributor.id ? { ...d, loginEnabled: enabled } : d
        )
      );
    } catch (err: any) {
      const errorMsg = err.message || "Failed to update login status";
      setError(errorMsg);
      console.error("Error toggling login:", err);
    }
  };

  const handleToggleActiveStatus = async (distributor: User) => {
    try {
      setError(null);
      if (!distributor.id) {
        throw new Error("Missing distributor id");
      }
      const updated: any = await distributorService.toggleDistributorStatus(
        distributor.id
      );
      const nextActive = updated.isActive;
      toast.success(
        `${distributor.companyName} marked ${nextActive ? "Active" : "Inactive"}`
      );
      setDistributors((prev) =>
        prev.map((d) =>
          d.id === distributor.id ? { ...d, isActive: nextActive } : d
        )
      );
    } catch (err: any) {
      const errorMsg = err.message || "Failed to update status";
      setError(errorMsg);
      console.error("Error toggling active status:", err);
    }
  };

  const handleUpdateCredentials = async () => {
    if (!selectedDistributor?.id) return;
    try {
      setCredSaving(true);
      const payload: any = {
        loginEmail: credEmail || "",
        loginEnabled: true,
      };
      if (credPassword.trim().length > 0) {
        payload.loginPassword = credPassword;
      }
      console.log("[UpdateLoginCredentials] sending payload:", payload, "for distributor id:", selectedDistributor.id);
      const updated: any = await distributorService.updateDistributor(
        selectedDistributor.id,
        payload
      );
      console.log("[UpdateLoginCredentials] response from server:", updated);
      const normalized = { ...updated, id: updated._id || updated.id };
      console.log("[UpdateLoginCredentials] normalized (loginEmail =", normalized.loginEmail, "):", normalized);
      setSelectedDistributor(normalized);
      setDistributors((prev) =>
        prev.map((d) => (d.id === normalized.id ? { ...d, ...normalized } : d))
      );
      toast.success("Login credentials updated");
      setShowCredentialsModal(false);
      setCredPassword("");
    } catch (err: any) {
      console.error("[UpdateLoginCredentials] FAILED:", err);
      toast.error(err?.message || "Failed to update login credentials");
    } finally {
      setCredSaving(false);
    }
  };

  const handleRowClick = (dist: User) => {
    setSelectedDistributor(dist);
    setShowPasswordEdit(false);
    setView("DETAILS");
  };

  const handleEditDistributor = (dist: User) => {
    setSelectedDistributor(dist);
    setEditingId(dist.id);
    setFormData({
      name: dist.name,
      email: dist.email,
      phone: dist.phone,
      companyName: dist.companyName,
      gstNumber: dist.gstNumber,
      billingAddress:
        typeof dist.billingAddress === "object"
          ? { ...emptyAddress(), ...dist.billingAddress }
          : emptyAddress(),
      shippingAddress:
        typeof dist.shippingAddress === "object"
          ? { ...emptyAddress(), ...dist.shippingAddress }
          : emptyAddress(),
      paymentTerms: dist.paymentTerms,
      discountPercentage: dist.discountPercentage,
      creditLimit: dist.creditLimit,
      tag: dist.tag || "online",
      loginEmail: dist.loginEmail,
      // password is stored only on the User model; show blank so admin must
      // re-enter if they want to change it
      loginPassword: "",
      loginEnabled: dist.loginEnabled !== false,
    });
    setShowPasswordEdit(false);
    setView("CREATE");
  };

  const copyBillingToShipping = () => {
    setFormData((prev) => ({
      ...prev,
      shippingAddress: { ...(prev.billingAddress as object) } as DistributorAddress,
    }));
    toast.info("Billing address copied to shipping");
  };

  const handleDeleteDistributor = async (id: string) => {
    const ok = await confirm({
      title: "Delete distributor",
      description:
        "Are you sure you want to delete this distributor? This action cannot be undone.",
      confirmText: "Delete",
      cancelText: "Cancel",
    });
    if (!ok) return;

    try {
      setError(null);
      await distributorService.deleteDistributor(id);

      // Refresh the list
      const response = await distributorService.listDistributors();
      const mapped = (response.items || []).map((d: any) => ({
        ...d,
        id: d._id || d.id,
      }));
      setDistributors(mapped);

      if (selectedDistributor?.id === id) {
        setSelectedDistributor(null);
        setView("LIST");
      }
    } catch (err: any) {
      const errorMsg = err.message || "Failed to delete distributor";
      setError(errorMsg);
      console.error("Error deleting distributor:", err);
    }
  };

  if (view === "CREATE") {
    return (
      <>
        {confirmDialog}
        <div className="space-y-6 max-w-full mx-auto">
          <div className="flex items-center gap-4 mb-6">
            <button
              onClick={() => {
                setView("LIST");
                setEditingId(null);
                setIsCustomPayment(false);
                setShowPasswordEdit(false);
                setFormData({
                  name: "",
                  email: "",
                  phone: "",
                  companyName: "",
                  gstNumber: "",
                  billingAddress: emptyAddress(),
                  shippingAddress: emptyAddress(),
                  paymentTerms: "30 days",
                  discountPercentage: 0,
                  creditLimit: 0,
                  tag: "online",
                  loginEmail: "",
                  loginPassword: "",
                  loginEnabled: true,
                });
                localStorage.removeItem("kore_distributor_draft");
              }}
              className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <h2 className="text-xl font-bold text-slate-900">
                {editingId ? "Edit Distributor" : "Create Distributor"}
              </h2>
              <p className="text-sm text-slate-500">
                {editingId
                  ? "Update existing partner details"
                  : "Add a new partner to your distribution network"}
              </p>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
              <AlertCircle size={20} className="text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-red-900">{error}</p>
                <button
                  type="button"
                  onClick={() => setError(null)}
                  className="text-sm text-red-600 hover:text-red-700 mt-1"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          <form
            onSubmit={handleCreateDistributor}
            className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden"
          >
            <div className="p-6 md:p-8 space-y-8">
              {/* Base Details */}
              <div>
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 border-b pb-2">
                  Basic Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Field label="Contact Person Name" icon={<Users size={14} />}>
                    <input
                      type="text"
                      required
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Company Name" icon={<Building2 size={14} />}>
                    <input
                      type="text"
                      required
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none"
                      value={formData.companyName}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          companyName: e.target.value,
                        })
                      }
                    />
                  </Field>
                  <Field label="Email Address" icon={<Mail size={14} />}>
                    <input
                      type="email"
                      required
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none"
                      value={formData.email}
                      onChange={(e) =>
                        setFormData({ ...formData, email: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Phone Number" icon={<Phone size={14} />}>
                    <input
                      type="tel"
                      required
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none"
                      value={formData.phone}
                      onChange={(e) =>
                        setFormData({ ...formData, phone: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="GST Number" icon={<FileText size={14} />}>
                    <GSTVerifyInput
                      value={formData.gstNumber || ""}
                      onChange={(val) => setFormData({ ...formData, gstNumber: val })}
                      onVerified={(data: GSTVerifyResult) => {
                        setFormData((prev) => {
                          const addr = data.address
                            ? {
                                ...(prev.billingAddress as DistributorAddress),
                                address1: data.address.address1,
                                address2: data.address.address2,
                                city:     data.address.city,
                                state:    data.address.state,
                                pinCode:  data.address.pinCode,
                              } as DistributorAddress
                            : prev.billingAddress;
                          return {
                            ...prev,
                            companyName: prev.companyName || data.tradeName || data.legalName || "",
                            billingAddress: addr,
                          };
                        });
                      }}
                    />
                  </Field>
                </div>
              </div>

              {/* Address Details */}
              <div>
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 border-b pb-2">
                  Location
                </h3>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2 pb-2 border-b border-slate-100">
                      <MapPin size={14} className="text-indigo-500" /> Billing
                      Address
                    </h4>
                    <AddressForm
                      value={formData.billingAddress as DistributorAddress}
                      onChange={(field, val) =>
                        setFormData((prev) => ({
                          ...prev,
                          billingAddress: {
                            ...(prev.billingAddress as object),
                            [field]: val,
                          } as unknown as DistributorAddress,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                        <MapPin size={14} className="text-emerald-500" /> Shipping
                        Address
                      </h4>
                      <button
                        type="button"
                        onClick={copyBillingToShipping}
                        className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-700 transition-colors"
                      >
                        <Copy size={12} />
                        Copy billing address
                      </button>
                    </div>
                    <AddressForm
                      value={formData.shippingAddress as DistributorAddress}
                      onChange={(field, val) =>
                        setFormData((prev) => ({
                          ...prev,
                          shippingAddress: {
                            ...(prev.shippingAddress as object),
                            [field]: val,
                          } as unknown as DistributorAddress,
                        }))
                      }
                    />
                  </div>
                </div>
              </div>

              {/* Financial Details */}
              <div>
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 border-b pb-2">
                  Financial Setup
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <Field label="Channel" icon={<Tag size={14} />}>
                    <div className="flex gap-2">
                      {(["online", "offline"] as const).map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setFormData({ ...formData, tag: opt })}
                          className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition-all border ${
                            formData.tag === opt
                              ? opt === "online"
                                ? "bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-100"
                                : "bg-amber-500 text-white border-amber-500 shadow-md shadow-amber-100"
                              : "bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100"
                          }`}
                        >
                          {opt === "online" ? "Online" : "Offline"}
                        </button>
                      ))}
                    </div>
                  </Field>
                  <Field label="Payment Terms" icon={<CreditCard size={14} />}>
                    <div className="flex gap-2">
                      <select
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none"
                        value={
                          isCustomPayment ? "Custom" : formData.paymentTerms
                        }
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === "Custom") {
                            setIsCustomPayment(true);
                            setFormData({ ...formData, paymentTerms: "" }); // clear for custom input
                          } else {
                            setIsCustomPayment(false);
                            setFormData({ ...formData, paymentTerms: val });
                          }
                        }}
                      >
                        <option value="30 days">30 Days</option>
                        <option value="45 days">45 Days</option>
                        <option value="90 days">90 Days</option>
                        <option value="Custom">Custom</option>
                      </select>
                      {isCustomPayment && (
                        <input
                          type="text"
                          placeholder="e.g. 60 days net"
                          required
                          className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none"
                          value={formData.paymentTerms}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              paymentTerms: e.target.value,
                            })
                          }
                        />
                      )}
                    </div>
                  </Field>
                  <Field
                    label="Discount"
                    icon={<Percent size={14} />}
                  >
                    <input
                      type="number"
                      min="0"
                      // required
                      max="100"
                      step="any"
                      placeholder="0"
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none"
                      value={formData.discountPercentage || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          discountPercentage: Number(e.target.value),
                        })
                      }
                    />
                  </Field>
                  <Field
                    label="Credit Limit"
                    icon={<Wallet size={14} />}
                  >
                    <input
                      type="number"
                      min="0"
                      step="1000"
                      placeholder="0"
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none"
                      value={formData.creditLimit || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          creditLimit: Number(e.target.value),
                        })
                      }
                    />
                  </Field>
                </div>
              </div>

              {/* Login Credentials — only set at creation time. For an
                  existing distributor, use the separate "Update Login
                  Credentials" action on the Details page instead, so
                  profile edits here never touch login email/password. */}
              {!editingId && (
                <div>
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 border-b pb-2">
                    Login Credentials
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Field label="Login Email" icon={<Mail size={14} />}>
                      <input
                        type="email"
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none"
                        value={formData.loginEmail}
                        onChange={(e) =>
                          setFormData({ ...formData, loginEmail: e.target.value })
                        }
                      />
                    </Field>
                    <Field label="Login Password" icon={<Wallet size={14} />}>
                      <div className="relative">
                        <input
                          type={showPasswordEdit ? "text" : "password"}
                          className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none"
                          value={formData.loginPassword}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              loginPassword: e.target.value,
                            })
                          }
                        />
                        <button
                          type="button"
                          onClick={() => setShowPasswordEdit((v) => !v)}
                          className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-slate-700"
                        >
                          {showPasswordEdit ? (
                            <EyeOff size={16} />
                          ) : (
                            <Eye size={16} />
                          )}
                        </button>
                      </div>
                    </Field>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setView("LIST");
                  setEditingId(null);
                  setIsCustomPayment(false);
                  setShowPasswordEdit(false);
                  setFormData({
                    name: "",
                    email: "",
                    phone: "",
                    companyName: "",
                    gstNumber: "",
                    billingAddress: emptyAddress(),
                    shippingAddress: emptyAddress(),
                    paymentTerms: "30 days",
                    discountPercentage: 0,
                    creditLimit: 0,
                    tag: "online",
                    loginEmail: "",
                    loginPassword: "",
                    loginEnabled: true,
                  });
                  localStorage.removeItem("kore_distributor_draft");
                }}
                className="px-6 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creatingLoading}
                className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-md shadow-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {creatingLoading ? (
                  <>
                    <Loader size={16} className="animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>{editingId ? "Update Distributor" : "Save Distributor"}</>
                )}
              </button>
            </div>
          </form>
        </div>
      </>
    );
  }

  if (view === "DETAILS" && selectedDistributor) {
    const d = selectedDistributor;
    return (
      <>
        {confirmDialog}
        <div className="space-y-6 max-w-full mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => {
                  setView("LIST");
                  setSelectedDistributor(null);
                  localStorage.removeItem("kore_distributor_draft");
                }}
                className="p-2 hover:bg-white rounded-lg text-slate-500 transition-colors border border-transparent hover:border-slate-200 shadow-sm"
              >
                <ArrowLeft size={20} />
              </button>
              <div>
                <h2 className="text-2xl font-bold text-slate-900 leading-tight">
                  {d.companyName}
                </h2>
                {/* <div className="flex items-center gap-2 mt-1">
                  <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded text-[10px] font-black uppercase tracking-wider">
                    Active
                  </span>
                  <span className="text-xs text-slate-500 font-mono">
                    {d.id}
                  </span>
                </div> */}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => handleEditDistributor(d)}
                className="px-4 py-2 bg-white text-slate-700 border border-slate-200 rounded-xl font-bold hover:bg-slate-50 transition-colors shadow-sm text-sm"
              >
                Edit
              </button>
              <button
                onClick={() => handleDeleteDistributor(d.id)}
                className="px-4 py-2 bg-red-50 text-red-700 border border-red-200 rounded-xl font-bold hover:bg-red-100 transition-colors shadow-sm text-sm"
              >
                Delete
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column: Quick Contact */}
            <div className="lg:col-span-1 space-y-6">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4">
                  Contact Info
                </h3>

                <div className="space-y-4">
                  <InfoRow
                    icon={<Users size={16} />}
                    label="Contact Person"
                    value={d.name}
                  />
                  <InfoRow
                    icon={<Mail size={16} />}
                    label="Email"
                    value={d.email}
                  />
                  <InfoRow
                    icon={<Phone size={16} />}
                    label="Phone"
                    value={d.phone || "—"}
                  />
                  <InfoRow
                    icon={<FileText size={16} />}
                    label="GSTIN"
                    value={d.gstNumber || "—"}
                    mono
                  />
                </div>
              </div>

              {/* Login Credentials */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                    Login Credentials
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      setCredEmail(d.loginEmail || "");
                      setCredPassword("");
                      setShowCredPassword(false);
                      setShowCredentialsModal(true);
                    }}
                    className="text-xs font-bold text-indigo-600 hover:text-indigo-700 transition-colors"
                  >
                    Update Login Credentials
                  </button>
                </div>

                <div className="space-y-4">
                  <InfoRow
                    icon={<Mail size={16} />}
                    label="Login Email"
                    value={d.loginEmail || "—"}
                  />
                  <div className="flex gap-3">
                    <div className="mt-0.5 text-slate-400"><Wallet size={16} /></div>
                    <div className="flex-1">
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Login Password</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-sm text-slate-800 font-mono font-medium">
                          {showPasswordEdit ? (d.loginPasswordPlain || "—") : "••••••••"}
                        </p>
                        <button
                          type="button"
                          onClick={() => setShowPasswordEdit((v) => !v)}
                          className="text-slate-400 hover:text-indigo-600 transition-colors"
                        >
                          {showPasswordEdit ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between py-3 px-3 bg-slate-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Shield size={16} className="text-slate-400" />
                      <div>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                          Status
                        </p>
                        <p className="text-sm font-medium text-slate-900">
                          {d.loginEnabled !== false
                            ? "✓ Enabled"
                            : "✗ Disabled"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Important Financial Settings block placed at the bottom-left specifically */}
              <div className="bg-indigo-600 text-white rounded-2xl shadow-md p-6 relative overflow-hidden">
                <div className="relative z-10">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-indigo-200 mb-6">
                    Financial Terms
                  </h3>

                  <div className="space-y-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-indigo-200 text-xs font-medium mb-1 flex items-center gap-1.5">
                          <CreditCard size={14} /> Payment Terms
                        </p>
                        <p className="text-lg font-bold">
                          {d.paymentTerms || "30 days"}
                        </p>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${
                        d.tag === "offline"
                          ? "bg-amber-400 text-amber-900"
                          : "bg-blue-400 text-blue-900"
                      }`}>
                        {d.tag || "online"}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-indigo-500/50">
                      <div>
                        <p className="text-indigo-200 text-xs font-medium mb-1">
                          Discount Config
                        </p>
                        <p className="text-2xl font-black text-amber-300">
                          {d.discountPercentage || 0}%
                        </p>
                      </div>
                      <div>
                        <p className="text-indigo-200 text-xs font-medium mb-1">
                          Credit Limit
                        </p>
                        <p className="text-xl font-bold">
                          ₹{(d.creditLimit || 0).toLocaleString()}
                        </p>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-indigo-500/50">
                      <p className="text-indigo-200 text-xs font-medium mb-1">
                        Used Limit
                      </p>
                      <p className="text-xl font-bold text-rose-300">
                        {usedLimit === null ? "…" : `₹${usedLimit.toLocaleString()}`}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="absolute -bottom-8 -right-8 opacity-10 blur-[1px]">
                  <Wallet size={120} />
                </div>
              </div>
            </div>

            {/* Right Column: Addresses & Stats */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2 pb-2 border-b border-slate-100">
                      <MapPin size={14} className="text-indigo-500" /> Billing
                      Address
                    </h4>
                    <div className="bg-slate-50/50 rounded-xl p-4 border border-slate-200">
                      <div className="text-sm text-slate-800 space-y-3">
                        {typeof d.billingAddress === "object" ? (
                          <div className="grid grid-cols-1 gap-4">
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-0.5">Attention</p>
                              <p className="font-semibold text-slate-900">{d.billingAddress.attention || "—"}</p>
                            </div>
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-0.5">Address</p>
                              <p className="font-medium text-slate-800">
                                {d.billingAddress.address1}
                                {d.billingAddress.address2 && <>, {d.billingAddress.address2}</>}
                              </p>
                              <p className="font-medium text-slate-800">
                                {d.billingAddress.city}, {d.billingAddress.state} - {d.billingAddress.pinCode}
                              </p>
                              <p className="font-medium text-slate-800">{d.billingAddress.country}</p>
                            </div>
                          </div>
                        ) : (
                          <p className="whitespace-pre-wrap">
                            {d.billingAddress || "No billing address provided."}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2 pb-2 border-b border-slate-100">
                      <MapPin size={14} className="text-emerald-500" /> Shipping
                      Address
                    </h4>
                    <div className="bg-slate-50/50 rounded-xl p-4 border border-slate-200">
                      <div className="text-sm text-slate-800 space-y-3">
                        {typeof d.shippingAddress === "object" ? (
                          <div className="grid grid-cols-1 gap-4">
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-0.5">Attention</p>
                              <p className="font-semibold text-slate-900">{d.shippingAddress.attention || "—"}</p>
                            </div>
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-0.5">Address</p>
                              <p className="font-medium text-slate-800">
                                {d.shippingAddress.address1}
                                {d.shippingAddress.address2 && <>, {d.shippingAddress.address2}</>}
                              </p>
                              <p className="font-medium text-slate-800">
                                {d.shippingAddress.city}, {d.shippingAddress.state} - {d.shippingAddress.pinCode}
                              </p>
                              <p className="font-medium text-slate-800">{d.shippingAddress.country}</p>
                            </div>
                          </div>
                        ) : (
                          <p className="whitespace-pre-wrap">
                            {d.shippingAddress || "No shipping address provided."}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <DistributorActivityOverview distributorId={d.id} />
            </div>
          </div>
        </div>

        {showCredentialsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="fixed inset-0 bg-black/50"
              onClick={() => !credSaving && setShowCredentialsModal(false)}
            />
            <div className="relative z-10 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
              <h2 className="text-lg font-bold text-slate-900 mb-1">
                Update Login Credentials
              </h2>
              <p className="text-xs text-slate-500 mb-5">
                Changes here only affect {d.companyName}'s login email/password
                — no other profile fields are touched.
              </p>
              <div className="space-y-4">
                <Field label="Login Email" icon={<Mail size={14} />}>
                  <input
                    type="email"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none"
                    value={credEmail}
                    onChange={(e) => setCredEmail(e.target.value)}
                  />
                </Field>
                <Field label="New Login Password" icon={<Wallet size={14} />}>
                  <div className="relative">
                    <input
                      type={showCredPassword ? "text" : "password"}
                      placeholder="Leave blank to keep current password"
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none"
                      value={credPassword}
                      onChange={(e) => setCredPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowCredPassword((v) => !v)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-slate-700"
                    >
                      {showCredPassword ? (
                        <EyeOff size={16} />
                      ) : (
                        <Eye size={16} />
                      )}
                    </button>
                  </div>
                </Field>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  disabled={credSaving}
                  onClick={() => setShowCredentialsModal(false)}
                  className="px-5 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={credSaving}
                  onClick={handleUpdateCredentials}
                  className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-md shadow-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {credSaving ? (
                    <>
                      <Loader size={16} className="animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save"
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  // default: LIST VIEW
  return (
    <>
      {confirmDialog}
      <div className="space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle size={20} className="text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-900">{error}</p>
              <button
                type="button"
                onClick={() => setError(null)}
                className="text-sm text-red-600 hover:text-red-700 mt-1"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              size={18}
            />
            <input
              type="text"
              placeholder="Search distributors..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 shadow-sm"
            />
          </div>

          <button
            onClick={() => {
              setEditingId(null);
              setFormData({
                name: "",
                email: "",
                phone: "",
                companyName: "",
                gstNumber: "",
                billingAddress: emptyAddress(),
                shippingAddress: emptyAddress(),
                paymentTerms: "30 days",
                discountPercentage: 0,
                creditLimit: 0,
                tag: "online",
                loginEmail: "",
                loginPassword: "",
                loginEnabled: true,
              });
              setView("CREATE");
            }}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl font-bold hover:bg-indigo-700 transition shadow-sm"
          >
            <Plus size={18} />
            Create Distributor
          </button>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader size={32} className="animate-spin text-slate-400" />
              </div>
            ) : (
              <table className="w-full text-left">
                <thead className="bg-slate-50/80 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-widest">
                      Company & Contact
                    </th>
                    <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-widest">
                      Location
                    </th>
                    <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-widest">
                      Terms
                    </th>
                    <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-widest">
                      Login
                    </th>
                    <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-widest">
                      Total Orders
                    </th>
                    <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-widest text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {distributors.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-6 py-12 text-center text-slate-500 font-medium"
                      >
                        No distributors found. Click "Create Distributor" to add
                        one.
                      </td>
                    </tr>
                  ) : (
                    distributors.map((dist) => {
                      // Order.distributorId references the linked login
                      // User._id — NOT the Distributor's own _id (dist.id) —
                      // so match against dist.userId. It also comes back
                      // either as a plain string or, when the backend
                      // populates it for display, as an object ({ id/_id,
                      // name, email, ... }).
                      const distUserId = (dist as any).userId;
                      const hasOrders = orders.filter((o) => {
                        const oDistId =
                          typeof o.distributorId === "string"
                            ? o.distributorId
                            : (o.distributorId as any)?.id || (o.distributorId as any)?._id;
                        return (
                          !!oDistId &&
                          !!distUserId &&
                          String(oDistId) === String(distUserId) &&
                          o.status !== "CANCELLED"
                        );
                      }).length;

                      return (
                        <tr
                          key={dist.id}
                          onClick={() => handleRowClick(dist)}
                          className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <p className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                                {dist.companyName || dist.name}
                              </p>
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                                dist.tag === "offline"
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-blue-100 text-blue-700"
                              }`}>
                                {dist.tag || "online"}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {dist.name} • {dist.phone || dist.email}
                            </p>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-sm text-slate-700 font-medium">
                              {dist.location || "N/A"}
                            </p>
                          </td>
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 font-bold text-[10px] uppercase tracking-wider border border-slate-200">
                              {dist.paymentTerms || "30 DAYS"}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div onClick={(e) => e.stopPropagation()}>
                              <Switch
                                checked={dist.loginEnabled !== false}
                                onCheckedChange={(checked) =>
                                  handleLoginToggle(dist, checked)
                                }
                                className="scale-90"
                              />
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`w-2 h-2 rounded-full ${
                                  hasOrders > 0
                                    ? "bg-emerald-500"
                                    : "bg-slate-300"
                                }`}
                              />
                              <span
                                className={`font-bold ${
                                  hasOrders > 0
                                    ? "text-slate-900"
                                    : "text-slate-400"
                                }`}
                              >
                                {hasOrders}
                              </span>
                              <span className="text-xs text-slate-500">
                                Orders
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-3">
                              <div
                                onClick={(e) => e.stopPropagation()}
                                className="flex items-center gap-1.5"
                                title={dist.isActive !== false ? "Active" : "Inactive"}
                              >
                                <span className={`text-[10px] font-black uppercase tracking-wider ${
                                  dist.isActive !== false ? "text-emerald-600" : "text-slate-400"
                                }`}>
                                  {dist.isActive !== false ? "Active" : "Inactive"}
                                </span>
                                <Switch
                                  checked={dist.isActive !== false}
                                  onCheckedChange={() => handleToggleActiveStatus(dist)}
                                  className="scale-90"
                                />
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRowClick(dist);
                                }}
                                className="text-slate-400 hover:text-indigo-600 p-1.5 rounded-lg hover:bg-indigo-50 transition-colors"
                                title="View Details"
                              >
                                <ChevronRight size={18} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            )}
            <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} totalItems={total} itemsPerPage={pageSize} onPageSizeChange={setPageSize} />
          </div>
        </div>
      </div>
    </>
  );
};

export default DistributorManager;
