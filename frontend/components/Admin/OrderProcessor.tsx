import React, { useState, useEffect, useCallback } from "react";
import {
  Package,
  Truck,
  CheckCircle2,
  Clock,
  Eye,
  Download,
  Search,
  Filter,
  X,
  User,
  AlertCircle,
  ChevronRight,
  Loader2,
  FileText,
  ImageIcon,
  CheckCheck,
  Hourglass,
  Calendar,
  Zap,
  StickyNote,
  CheckSquare,
  BoxesIcon,
} from "lucide-react";
import { Order, OrderStatus, Article, Inventory } from "../../types";
import OrderDetail from "../Distributor/OrderDetail";
import { distributorOrderService } from "../../services/distributorOrderService";
import Pagination from "../ui/Pagination";
import { usePageSize } from "../../utils/usePageSize";
import { toast } from "sonner";

interface OrderProcessorProps {
  articles: Article[];
  inventory: Inventory[];
  updateStatus: (id: string, status: OrderStatus) => void;
  isLoading?: boolean;
  lastUpdated?: Date;
  orderToOpen?: Order | null;
  onExternalOrderBack?: () => void;
}

const OrderProcessor: React.FC<OrderProcessorProps> = ({
  articles,
  inventory,
  updateStatus,
  isLoading: globalLoading,
  lastUpdated,
  orderToOpen,
  onExternalOrderBack,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "ALL">("ALL");
  const [lifecycleFilter, setLifecycleFilter] = useState<"DISPATCHED" | "IN_TRANSIT" | "RECEIVED" | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [bookingOrder, setBookingOrder] = useState<Order | null>(null);
  const [stats, setStats] = useState<Record<string, number>>({});

  // Pagination & Server-side State
  const [orders, setOrders] = useState<Order[]>([]);
  const [meta, setMeta] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = usePageSize("orderProcessor", 20);
  const [loading, setLoading] = useState(false);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortDesc, setSortDesc] = useState(true);

  useEffect(() => {
    distributorOrderService
      .getOrderStats()
      .then(setStats)
      .catch(() => {});
  }, [lastUpdated]);

  const fetchOrders = useCallback(
    async (silent = false) => {
      try {
        if (!silent) setLoading(true);
        const res = await distributorOrderService.getAllOrders({
          page: currentPage,
          limit: pageSize,
          q: searchQuery,
          status: statusFilter === "ALL" ? undefined : statusFilter,
          lifecycle: lifecycleFilter || undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          sortBy,
          sortDesc,
        });
        setOrders(res.items);
        setMeta(res.meta);
      } catch (err) {
        console.error("Failed to fetch orders", err);
        toast.error("Failed to load orders");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [
      currentPage,
      pageSize,
      searchQuery,
      statusFilter,
      lifecycleFilter,
      startDate,
      endDate,
      sortBy,
      sortDesc,
    ]
  );

  // Refetch when dependencies change
  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Also refetch when global lastUpdated changes (socket update)
  useEffect(() => {
    if (lastUpdated) fetchOrders(true); // Silent update for socket events
  }, [lastUpdated]);

  const selectedOrder = orderToOpen || orders.find((o) => o.id === selectedOrderId);

  if (selectedOrder) {
    return (
      <OrderDetail
        order={selectedOrder}
        articles={articles}
        inventory={inventory}
        onBack={() => {
          const wasOpenedExternally = Boolean(orderToOpen);
          setSelectedOrderId(null);
          if (wasOpenedExternally) onExternalOrderBack?.();
        }}
      />
    );
  }

  const isAnyLoading = loading || globalLoading;

  return (
    <div className="space-y-4 animate-in fade-in duration-500 pb-10">
      {bookingOrder && (
        <BookingConfirmModal
          order={bookingOrder}
          articles={articles}
          onClose={() => setBookingOrder(null)}
          onSuccess={() => {
            setBookingOrder(null);
            fetchOrders(true);
          }}
        />
      )}
      {/* Header - Compact */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            Sales Orders
          </h2>
          <p className="text-slate-400 text-xs font-medium">
            Manage distributor order flow · Pending → Dispatched → In Transit →
            Delivered
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 bg-slate-100 rounded-lg">
              <div
                className={`w-1.5 h-1.5 rounded-full bg-emerald-500 ${
                  isAnyLoading ? "animate-pulse" : ""
                }`}
              />
              <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                Last Synced:{" "}
                {lastUpdated.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>
            </div>
          )}
          <button className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl font-bold text-xs text-slate-700 hover:bg-slate-50 transition-all shadow-sm">
            <Download size={14} /> Export
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      {(() => {
        const statCards = [
          {
            label: "Total CTN",
            val: stats.totalCartons || 0,
            color: "text-slate-700",
            bg: "bg-slate-50",
            border: "border-slate-200",
            filter: "ALL" as const,
            lifecycle: null,
          },
          {
            label: "Pending",
            val: stats.BOOKED || 0,
            color: "text-rose-600",
            bg: "bg-rose-50",
            border: "border-rose-100",
            filter: OrderStatus.BOOKED,
            lifecycle: null,
          },
          {
            label: "Dispatched",
            val: stats.PFD || 0,
            color: "text-amber-600",
            bg: "bg-amber-50",
            border: "border-amber-100",
            filter: "ALL" as const,
            lifecycle: "DISPATCHED" as const,
          },
          {
            label: "In Transit",
            val: stats.RFD || 0,
            color: "text-blue-600",
            bg: "bg-blue-50",
            border: "border-blue-100",
            filter: "ALL" as const,
            lifecycle: "IN_TRANSIT" as const,
          },
          // {
          //   label: "Out for Del",
          //   val: stats.OFD || 0,
          //   color: "text-emerald-600",
          //   bg: "bg-emerald-50",
          //   border: "border-emerald-100",
          //   filter: OrderStatus.OFD,
          // },
          {
            label: "Delivered",
            val: stats.RECEIVED || 0,
            color: "text-green-700",
            bg: "bg-green-50",
            border: "border-green-100",
            filter: "ALL" as const,
            lifecycle: "RECEIVED" as const,
          },
        ];
        return (
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: `repeat(${statCards.length}, 1fr)` }}
          >
            {statCards.map((s) => (
              <button
                key={s.label}
                onClick={() => {
                  setStatusFilter(s.filter);
                  setLifecycleFilter(s.lifecycle);
                  setCurrentPage(1);
                }}
                className={`${s.bg} border ${
                  s.border
                } rounded-xl p-3 text-left transition-all hover:shadow-sm ${
                  s.filter !== null ? "cursor-pointer" : "cursor-default"
                } ${
                  statusFilter === s.filter && lifecycleFilter === s.lifecycle ? "ring-2 ring-indigo-400/40" : ""
                }`}
              >
                <p className={`text-lg font-black ${s.color} leading-none`}>
                  {s.val}
                </p>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mt-1">
                  {s.label}
                </p>
              </button>
            ))}
          </div>
        );
      })()}

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Row 1: Search + Date + Sort */}
        <div className="px-4 py-3 flex flex-wrap gap-2 items-center border-b border-slate-100">
          <div className="relative flex-1 min-w-[160px] max-w-[220px]">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              size={13}
            />
            <input
              type="text"
              placeholder="Search order / distributor..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-50 border-none focus:ring-1 focus:ring-indigo-500 text-xs font-medium text-slate-900 outline-none"
            />
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setCurrentPage(1);
              }}
              className="px-2 py-1.5 rounded-xl bg-slate-50 border border-slate-100 focus:ring-1 focus:ring-indigo-400 text-xs font-medium text-slate-600 outline-none"
            />
            <span className="text-slate-300 text-xs">→</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setCurrentPage(1);
              }}
              className="px-2 py-1.5 rounded-xl bg-slate-50 border border-slate-100 focus:ring-1 focus:ring-indigo-400 text-xs font-medium text-slate-600 outline-none"
            />
          </div>

          <select
            value={`${sortBy}-${sortDesc}`}
            onChange={(e) => {
              const [val, desc] = e.target.value.split("-");
              setSortBy(val);
              setSortDesc(desc === "true");
              setCurrentPage(1);
            }}
            className="px-2.5 py-1.5 rounded-xl bg-slate-50 border border-slate-100 focus:ring-1 focus:ring-indigo-400 text-xs font-medium text-slate-600 outline-none cursor-pointer"
          >
            <option value="createdAt-true">Newest First</option>
            <option value="createdAt-false">Oldest First</option>
            <option value="finalAmount-true">Amount ↓</option>
            <option value="finalAmount-false">Amount ↑</option>
          </select>
        </div>

        {/* Row 2: Status filters — scrollable */}
        <div className="px-4 py-2 flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
          <Filter className="text-slate-300 shrink-0" size={12} />
          {(
            [
              "ALL",
              "BOOKED",
              "PFD",
              "RFD",
              "RECEIVED",
              "CANCELLED",
            ] as const
          ).map((status) => (
            <button
              key={status}
              onClick={() => {
                setStatusFilter(status as any);
                setLifecycleFilter(null);
                setCurrentPage(1);
              }}
              className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider whitespace-nowrap transition-all border shrink-0 ${
                statusFilter === status
                  ? "bg-slate-900 text-white border-slate-900 shadow-sm"
                  : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
              }`}
            >
              {status === "ALL"
                ? "All"
                : STATUS_LABELS[status as OrderStatus] ||
                  status.replace(/_/g, " ")}
            </button>
          ))}
        </div>
      </div>

      {/* List - Compact */}
      <div className="relative min-h-[200px]">
        {loading && !orders.length && (
          <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] z-10 flex items-center justify-center rounded-2xl">
            <Loader2 className="animate-spin text-indigo-600" size={32} />
          </div>
        )}

        <div className="grid grid-cols-1 gap-2">
          {orders.map((order) => {
            const fulfilled = order.items.reduce(
              (acc, item) => acc + (item.fulfilledCartonCount || 0),
              0
            );
            const total = order.totalCartons;
            const progress =
              total > 0 ? Math.round((fulfilled / total) * 100) : 0;
            const isTransitioning = order.status === OrderStatus.PARTIAL;

            return (
              <div
                key={order.id}
                onClick={() => setSelectedOrderId(order.id)}
                className="bg-white rounded-xl border border-slate-100 shadow-sm hover:border-indigo-100 transition-all group overflow-hidden cursor-pointer relative"
                title={
                  order.status === OrderStatus.PENDING
                    ? `Pending: ${order.totalCartons} cartons · ${
                        order.totalPairs
                      } pairs · ₹${(
                        order.finalAmount || order.totalAmount
                      )?.toLocaleString()}`
                    : undefined
                }
              >
                <div className="px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex gap-4 items-center flex-1 min-w-0">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-slate-50 text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                      <Package size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <h4 className="font-bold text-sm text-slate-900 tracking-tight">
                          {order.orderNumber ? (
                            `#${order.orderNumber}`
                          ) : (
                            <span className="text-slate-400 italic text-xs font-medium">
                              Pending Booking
                            </span>
                          )}
                        </h4>
                        <span className="text-[10px] text-slate-300 font-medium hidden sm:block">
                          •
                        </span>
                        <span className="text-[11px] font-bold text-slate-600 truncate max-w-[150px]">
                          {order.distributorName}
                        </span>
                        <StatusBadge status={order.status} />
                        {order.items?.some(
                          (i) => i.bookingType === "PREORDER"
                        ) && (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-amber-50 text-amber-600 border border-amber-100">
                            Has Pre-Order Items
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-x-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                        <span className="flex items-center gap-1">
                          <Clock size={10} /> {order.date}
                        </span>
                        <span className="w-1 h-1 rounded-full bg-slate-200" />
                        <div className="flex items-center gap-1.5">
                          <Package
                            size={10}
                            className={
                              fulfilled > 0
                                ? "text-emerald-500"
                                : "text-slate-300"
                            }
                          />
                          <span
                            className={
                              fulfilled > 0
                                ? "text-slate-900"
                                : "text-slate-400"
                            }
                          >
                            {fulfilled} / {total}{" "}
                            <span className="text-[8px] opacity-70">
                              Cartons
                            </span>
                          </span>
                          {isTransitioning && (
                            <span className="text-emerald-600 lowercase font-black text-[8px] tracking-normal">
                              ({progress}%)
                            </span>
                          )}
                        </div>
                        <span className="w-1 h-1 rounded-full bg-slate-200" />
                        <span className="text-indigo-600 font-black">
                          ₹{order.finalAmount?.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div
                    className="flex items-center justify-end gap-3"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex gap-2">
                      {order.status === OrderStatus.PENDING && (
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setBookingOrder(order);
                          }}
                          className="px-2.5 py-1 bg-indigo-600 text-white rounded-lg font-bold text-[9px] uppercase hover:bg-indigo-700 transition-all tracking-wider flex items-center gap-1 shadow-sm shadow-indigo-100"
                        >
                          <CheckCheck size={11} /> Confirm Order
                        </button>
                      )}
                      {/* {order.status === OrderStatus.BOOKED && (
                        <span className="px-2 py-1 bg-amber-50 text-amber-600 rounded-lg font-bold text-[8px] uppercase tracking-wider border border-amber-100 flex items-center gap-1">
                          <AlertCircle size={10} /> Needs Allocation
                        </span>
                      )} */}
                      {order.status === OrderStatus.RECEIVED &&
                        order.billUrl && (
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const baseUrl =
                                import.meta.env.VITE_API_BASE_URL ||
                                "http://localhost:5005/api";
                              window.open(
                                `${baseUrl.replace("/api", "")}${
                                  order.billUrl
                                }`,
                                "_blank"
                              );
                            }}
                            className="px-2.5 py-1 bg-white border border-slate-200 text-slate-600 rounded-lg font-bold text-[9px] uppercase hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-all tracking-wider flex items-center gap-1"
                          >
                            <FileText size={12} /> Bill
                          </button>
                        )}
                    </div>
                    <ChevronRight
                      size={14}
                      className="text-slate-200 group-hover:text-indigo-600 group-hover:translate-x-1 transition-all"
                    />
                  </div>
                </div>

                {/* Sleek Progress Edge */}
                {isTransitioning && (
                  <div className="absolute bottom-0 left-0 h-[1.5px] w-full bg-slate-100/50">
                    <div
                      className="h-full bg-emerald-500 transition-all duration-1000 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                )}
              </div>
            );
          })}

          {orders.length === 0 && !loading && (
            <div className="bg-white rounded-2xl p-12 border border-dashed border-slate-200 text-center">
              <Package className="text-slate-200 mx-auto mb-3" size={32} />
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">
                No matching orders
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Pagination */}
      {meta && (
        <Pagination
          currentPage={currentPage}
          totalPages={meta.totalPages}
          onPageChange={setCurrentPage}
          totalItems={meta.total}
          itemsPerPage={pageSize}
          onPageSizeChange={setPageSize}
        />
      )}
    </div>
  );
};

const STATUS_LABELS: Record<string, string> = {
  [OrderStatus.PRE_BOOKED]: "Pre-Booked",
  [OrderStatus.CONFIRMED]: "Confirmed",
  [OrderStatus.PENDING]: "Pending Confirmation",
  [OrderStatus.BOOKED]: "Pending",
  [OrderStatus.PFD]: "Dispatched",
  [OrderStatus.RFD]: "In Transit",
  [OrderStatus.RECEIVED]: "Delivered",
  [OrderStatus.PARTIAL]: "Partial Delivered",
  [OrderStatus.CANCELLED]: "Cancelled",
};

const StatusBadge: React.FC<{ status: OrderStatus }> = ({ status }) => {
  const config: Record<string, { color: string }> = {
    [OrderStatus.PRE_BOOKED]: {
      color: "bg-amber-50 text-amber-700 border-amber-200",
    },
    [OrderStatus.CONFIRMED]: {
      color: "bg-indigo-50 text-indigo-700 border-indigo-200",
    },
    [OrderStatus.PENDING]: {
      color: "bg-slate-100 text-slate-600 border-slate-200",
    },
    [OrderStatus.BOOKED]: {
      color: "bg-indigo-50 text-indigo-500 border-indigo-100",
    },
    [OrderStatus.PFD]: { color: "bg-amber-50 text-amber-500 border-amber-100" },
    [OrderStatus.RFD]: { color: "bg-blue-50 text-blue-500 border-blue-100" },
    [OrderStatus.RECEIVED]: {
      color: "bg-green-100 text-green-700 border-green-200",
    },
    [OrderStatus.PARTIAL]: {
      color: "bg-orange-100 text-orange-700 border-orange-200",
    },
    [OrderStatus.CANCELLED]: {
      color: "bg-rose-50 text-rose-600 border-rose-200",
    },
  };

  const { color } = config[status] || {
    color: "bg-gray-50 text-gray-500 border-gray-100",
  };
  return (
    <span
      className={`inline-flex px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider border ${color}`}
    >
      {STATUS_LABELS[status] || status}
    </span>
  );
};

const OrderProgress: React.FC<{
  status: OrderStatus;
}> = ({ status }) => {
  const stages = [
    OrderStatus.BOOKED,
    OrderStatus.PFD,
    OrderStatus.RFD,
    OrderStatus.RECEIVED,
  ];

  let currentIndex = stages.indexOf(status);

  if (status === OrderStatus.PARTIAL) {
    currentIndex = 2.5;
  }

  return (
    <div className="flex items-center gap-1.5 w-full max-w-[320px]">
      {stages.map((s, idx) => {
        const isCompleted = idx <= currentIndex;
        const isActive = idx === currentIndex;

        return (
          <React.Fragment key={s}>
            <div
              className={`h-1.5 rounded-full flex-1 transition-all duration-300 relative group/step ${
                isCompleted ? "bg-indigo-600" : "bg-slate-100"
              } ${isActive ? "ring-2 ring-indigo-500/20" : ""}`}
            >
              {/* Tooltip */}
              <span className="absolute -top-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[8px] font-black uppercase px-2 py-1 rounded opacity-0 group-hover/step:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                {STATUS_LABELS[s] || s}
              </span>
            </div>
            {idx < stages.length - 1 && (
              <div
                className={`w-0.5 h-0.5 rounded-full ${
                  idx < currentIndex ? "bg-indigo-600" : "bg-slate-200"
                }`}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

// ─── Booking Confirm Modal ────────────────────────────────────────────────────
const BookingConfirmModal: React.FC<{
  order: Order;
  articles: Article[];
  onClose: () => void;
  onSuccess: () => void;
}> = ({ order, onClose, onSuccess }) => {
  const [expectedDispatchDate, setExpectedDispatchDate] = useState("");
  const [bookingPriority, setBookingPriority] = useState<"NORMAL" | "URGENT">(
    "NORMAL"
  );
  const [adminNote, setAdminNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    try {
      setSubmitting(true);
      await distributorOrderService.updateOrderStatus(
        order.id,
        OrderStatus.BOOKED,
        {
          expectedDispatchDate: expectedDispatchDate || undefined,
          bookingPriority,
          adminNote: adminNote.trim() || undefined,
        }
      );
      toast.success("Order booked — Ready to dispatch");
      onSuccess();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Order book nahi hua");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">
              Confirm Booking
            </p>
            <h2 className="text-sm font-bold text-slate-900 mt-0.5">
              {order.distributorName}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Order Summary */}
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
            <Package size={14} className="text-slate-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                Order Summary
              </p>
              <p className="text-xs font-bold text-slate-700">
                {order.items.length} article(s) · {order.totalCartons} CTN ·{" "}
                {order.totalPairs} pairs
              </p>
            </div>
            <span className="text-xs font-black text-slate-900">
              ₹
              {(order.finalAmount ?? order.totalAmount)?.toLocaleString(
                "en-IN"
              )}
            </span>
          </div>

          {/* Expected Dispatch Date (optional) */}
          <div>
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
              <Calendar size={10} /> Expected Dispatch Date{" "}
              <span className="font-normal normal-case text-slate-300">
                (optional)
              </span>
            </label>
            <input
              type="date"
              value={expectedDispatchDate}
              onChange={(e) => setExpectedDispatchDate(e.target.value)}
              min={new Date().toISOString().split("T")[0]}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-400 text-sm font-medium text-slate-700"
            />
          </div>

          {/* Priority */}
          <div>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
              <Zap size={10} /> Priority
            </p>
            <div className="flex gap-2">
              {(["NORMAL", "URGENT"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setBookingPriority(p)}
                  className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider border-2 transition-all ${
                    bookingPriority === p
                      ? p === "URGENT"
                        ? "border-orange-500 bg-orange-50 text-orange-700"
                        : "border-slate-400 bg-slate-100 text-slate-700"
                      : "border-slate-100 bg-white text-slate-400 hover:border-slate-200"
                  }`}
                >
                  {p === "NORMAL" ? "Normal" : "⚡ Urgent"}
                </button>
              ))}
            </div>
          </div>

          {/* Admin Note */}
          <div>
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
              <StickyNote size={10} /> Internal Note{" "}
              <span className="font-normal normal-case text-slate-300">
                (optional)
              </span>
            </label>
            <textarea
              value={adminNote}
              onChange={(e) => setAdminNote(e.target.value)}
              rows={2}
              placeholder="e.g. Stock Monday ko aa rha hai, Tuesday dispatch hoga..."
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-400 text-xs font-medium resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-5 pb-5">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-xs hover:bg-indigo-700 transition-all shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submitting ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <CheckSquare size={13} />
            )}
            Book Order
          </button>
        </div>
      </div>
    </div>
  );
};

export default OrderProcessor;
