import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Package,
  Truck,
  Clock,
  ChevronRight,
  Search,
  Filter,
  FileText,
  Loader2,
  Trash2,
  Calendar,
  Phone,
  Download,
  CheckCircle,
} from 'lucide-react';
import { Order, OrderStatus, Article, Inventory } from '../../types';
import OrderDetail from './OrderDetail';
import { distributorOrderService } from '../../services/distributorOrderService';
import Pagination from '../ui/Pagination';
import { usePageSize } from '../../utils/usePageSize';
import { toast } from 'sonner';

interface MyOrdersProps {
  userId: string;
  articles: Article[];
  inventory: Inventory[];
  isLoading?: boolean;
  lastUpdated?: Date;
  initialOrder?: Order | null;
  onInitialOrderHandled?: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  [OrderStatus.PENDING]:   'Pending',
  [OrderStatus.BOOKED]:    'Pending',
  [OrderStatus.PFD]:       'Dispatched',
  [OrderStatus.RFD]:       'In Transit',
  [OrderStatus.RECEIVED]:  'Delivered',
  [OrderStatus.PARTIAL]:   'Partial',
  [OrderStatus.CANCELLED]: 'Cancelled',
};

const StatusBadge: React.FC<{ status: OrderStatus }> = ({ status }) => {
  const config: Record<string, string> = {
    [OrderStatus.PENDING]:   'bg-slate-100 text-slate-600 border-slate-200',
    [OrderStatus.BOOKED]:    'bg-indigo-50 text-indigo-500 border-indigo-100',
    [OrderStatus.PFD]:       'bg-amber-50 text-amber-500 border-amber-100',
    [OrderStatus.RFD]:       'bg-blue-50 text-blue-500 border-blue-100',
    [OrderStatus.RECEIVED]:  'bg-green-100 text-green-700 border-green-200',
    [OrderStatus.PARTIAL]:   'bg-orange-100 text-orange-700 border-orange-200',
    [OrderStatus.CANCELLED]: 'bg-rose-50 text-rose-600 border-rose-200',
  };
  const color = config[status] || 'bg-gray-50 text-gray-500 border-gray-100';
  return (
    <span className={`inline-flex px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider border ${color}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
};

const MyOrders: React.FC<MyOrdersProps> = ({ userId, articles, inventory, isLoading: globalLoading, lastUpdated, initialOrder, onInitialOrderHandled }) => {
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'ALL'>('ALL');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(initialOrder || null);

  const [orders, setOrders] = useState<Order[]>([]);
  const [meta, setMeta] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = usePageSize('myOrders', 10);
  const [loading, setLoading] = useState(false);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortDesc, setSortDesc] = useState(true);

  // 400ms debounce on search
  useEffect(() => {
    const t = setTimeout(() => { setSearchQuery(searchInput); setCurrentPage(1); }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchOrders = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const res = await distributorOrderService.getOrdersByDistributor(userId, {
        page: currentPage,
        limit: pageSize,
        q: searchQuery,
        status: statusFilter === 'ALL' ? undefined : statusFilter,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        sortBy,
        sortDesc,
      });
      setOrders(res.items);
      setMeta(res.meta);
    } catch (err) {
      console.error('Failed to fetch orders', err);
      toast.error('Failed to load orders');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [userId, currentPage, pageSize, searchQuery, statusFilter, startDate, endDate, sortBy, sortDesc]);

  const fetchOrdersRef = useRef(fetchOrders);
  useEffect(() => { fetchOrdersRef.current = fetchOrders; }, [fetchOrders]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  // Keep the order passed from the dashboard available while this page loads.
  // Clear the parent handoff after mounting so it is not reopened later.
  useEffect(() => {
    if (initialOrder) onInitialOrderHandled?.();
  }, [initialOrder, onInitialOrderHandled]);

  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; return; }
    fetchOrdersRef.current(true);
  }, [lastUpdated]);

  const statusCounts: Record<string, number> = useMemo(() => meta?.stats?.statusCounts || {}, [meta]);

  if (selectedOrder) {
    return (
      <OrderDetail
        order={selectedOrder}
        articles={articles}
        inventory={inventory}
        onBack={() => setSelectedOrder(null)}
        isDistributor={true}
      />
    );
  }

  const isAnyLoading = loading || globalLoading;

  const statCards = [
    { label: 'Total CTN',  val: statusCounts.total    || 0, color: 'text-slate-700',   bg: 'bg-slate-50',   border: 'border-slate-200', filter: 'ALL' as const },
    { label: 'Pending',    val: statusCounts.BOOKED   || 0, color: 'text-rose-600',    bg: 'bg-rose-50',    border: 'border-rose-100',  filter: OrderStatus.BOOKED    },
    { label: 'Dispatched', val: statusCounts.PFD       || 0, color: 'text-amber-600',   bg: 'bg-amber-50',   border: 'border-amber-100', filter: OrderStatus.PFD       },
    { label: 'In Transit', val: statusCounts.RFD       || 0, color: 'text-blue-600',    bg: 'bg-blue-50',    border: 'border-blue-100',  filter: OrderStatus.RFD       },
    { label: 'Delivered',  val: statusCounts.RECEIVED  || 0, color: 'text-green-700',   bg: 'bg-green-50',   border: 'border-green-100', filter: OrderStatus.RECEIVED  },
  ];

  return (
    <div className="space-y-4 animate-in fade-in duration-500 pb-10">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Order History</h2>
          <p className="text-slate-400 text-xs font-medium">Track your orders · Pending → Dispatched → In Transit → Delivered</p>
        </div>
        {lastUpdated && (
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 bg-slate-100 rounded-lg">
            <div className={`w-1.5 h-1.5 rounded-full bg-emerald-500 ${isAnyLoading ? 'animate-pulse' : ''}`} />
            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
              Last Synced: {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>
        )}
      </div>

      {/* Stats Bar — clickable filters */}
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${statCards.length}, 1fr)` }}>
        {statCards.map(s => (
          <button
            key={s.label}
            onClick={() => { setStatusFilter(s.filter as any); setCurrentPage(1); }}
            className={`${s.bg} border ${s.border} rounded-xl p-3 text-left transition-all hover:shadow-sm cursor-pointer ${statusFilter === s.filter ? 'ring-2 ring-indigo-400/40' : ''}`}
          >
            <p className={`text-lg font-black ${s.color} leading-none`}>{s.val}</p>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mt-1">{s.label}</p>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Row 1: Search + Date + Sort */}
        <div className="px-4 py-3 flex flex-wrap gap-2 items-center border-b border-slate-100">
          <div className="relative flex-1 min-w-[160px] max-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
            <input
              type="text"
              placeholder="Search order #..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-50 border-none focus:ring-1 focus:ring-indigo-500 text-xs font-medium text-slate-900 outline-none"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setCurrentPage(1); }}
              className="px-2 py-1.5 rounded-xl bg-slate-50 border border-slate-100 focus:ring-1 focus:ring-indigo-400 text-xs font-medium text-slate-600 outline-none"
            />
            <span className="text-slate-300 text-xs">→</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setCurrentPage(1); }}
              className="px-2 py-1.5 rounded-xl bg-slate-50 border border-slate-100 focus:ring-1 focus:ring-indigo-400 text-xs font-medium text-slate-600 outline-none"
            />
          </div>

          <select
            value={`${sortBy}-${sortDesc}`}
            onChange={(e) => {
              const [val, desc] = e.target.value.split('-');
              setSortBy(val);
              setSortDesc(desc === 'true');
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

        {/* Row 2: Status pills */}
        <div className="px-4 py-2 flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
          <Filter className="text-slate-300 shrink-0" size={12} />
          {(['ALL', 'BOOKED', 'PFD', 'RFD', 'RECEIVED', 'CANCELLED'] as const).map((status) => (
            <button
              key={status}
              onClick={() => { setStatusFilter(status as any); setCurrentPage(1); }}
              className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider whitespace-nowrap transition-all border shrink-0 ${
                statusFilter === status
                  ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                  : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
              }`}
            >
              {status === 'ALL' ? 'All' : STATUS_LABELS[status as OrderStatus] || status}
            </button>
          ))}
        </div>
      </div>

      {/* Orders List */}
      <div className="relative min-h-[200px]">
        {loading && !orders.length && (
          <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] z-10 flex items-center justify-center rounded-2xl">
            <Loader2 className="animate-spin text-indigo-600" size={32} />
          </div>
        )}

        <div className="grid grid-cols-1 gap-2">
          {orders.map(order => {
            const fulfilled = order.items.reduce((acc, item) => acc + (item.fulfilledCartonCount || 0), 0);
            const total = order.totalCartons;
            const progress = total > 0 ? Math.round((fulfilled / total) * 100) : 0;
            const isTransitioning = order.status === OrderStatus.PARTIAL;

            return (
              <div
                key={order.id}
                onClick={() => setSelectedOrder(order)}
                className="bg-white rounded-xl border border-slate-100 shadow-sm hover:border-indigo-100 transition-all group overflow-hidden cursor-pointer relative"
              >
                <div className="px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex gap-4 items-center flex-1 min-w-0">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-slate-50 text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                      <Package size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <h4 className="font-bold text-sm text-slate-900 tracking-tight">
                          {order.orderNumber ? `#${order.orderNumber}` : (
                            <span className="text-slate-400 italic text-xs font-medium">Awaiting Confirmation</span>
                          )}
                        </h4>
                        <StatusBadge status={order.status} />
                      </div>
                      <div className="flex items-center gap-x-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none flex-wrap gap-y-1">
                        <span className="flex items-center gap-1"><Clock size={10} /> {order.date}</span>
                        <span className="w-1 h-1 rounded-full bg-slate-200" />
                        <div className="flex items-center gap-1.5">
                          <Package size={10} className={fulfilled > 0 ? 'text-emerald-500' : 'text-slate-300'} />
                          <span className={fulfilled > 0 ? 'text-slate-900' : 'text-slate-400'}>
                            {fulfilled > 0 ? `${fulfilled} / ` : ''}{total} <span className="text-[8px] opacity-70">Cartons</span>
                          </span>
                          {isTransitioning && <span className="text-emerald-600 lowercase font-black text-[8px] tracking-normal">({progress}%)</span>}
                        </div>
                        <span className="w-1 h-1 rounded-full bg-slate-200" />
                        <span className="text-indigo-600 font-black">₹{(order.finalAmount || order.totalAmount || 0).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right side actions */}
                  <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                    {/* Expected dispatch date chip */}
                    {order.status === OrderStatus.BOOKED && order.expectedDispatchDate && (
                      <span className="hidden sm:flex items-center gap-1 px-2 py-1 bg-indigo-50 border border-indigo-100 rounded-lg text-[9px] font-bold text-indigo-600">
                        <Calendar size={9} />
                        {new Date(order.expectedDispatchDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </span>
                    )}


                    {/* Bill download */}
                    {order.status === OrderStatus.RECEIVED && order.billUrl && (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const base = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5005/api';
                          window.open(`${base.replace('/api', '')}${order.billUrl}`, '_blank');
                        }}
                        className="px-2.5 py-1 bg-white border border-slate-200 text-slate-600 rounded-lg font-bold text-[9px] uppercase hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-all tracking-wider flex items-center gap-1"
                      >
                        <FileText size={11} /> Bill
                      </button>
                    )}

                    {/* Delete — only PENDING */}
                    {order.status === OrderStatus.PENDING && (
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (!window.confirm(`Delete order? This cannot be undone.`)) return;
                          try {
                            await distributorOrderService.deleteOrder(order.id);
                            setOrders(prev => prev.filter(o => o.id !== order.id));
                            toast.success('Order deleted');
                          } catch (err: any) {
                            toast.error(err?.response?.data?.message || 'Failed to delete');
                          }
                        }}
                        className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                        title="Delete order"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}

                    <ChevronRight size={14} className="text-slate-200 group-hover:text-indigo-600 group-hover:translate-x-1 transition-all" />
                  </div>
                </div>

                {/* Item chips */}
                {order.items.length > 0 && (
                  <div className="px-5 pb-3 flex flex-wrap gap-1.5">
                    {order.items.slice(0, 5).map((item, idx) => {
                      const article = articles.find(a => a.id === item.articleId);
                      const isFulfilled = (item.fulfilledCartonCount || 0) > 0;
                      return (
                        <span key={idx} className={`px-2 py-0.5 rounded-md border text-[9px] font-bold ${
                          isFulfilled ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-slate-50 border-slate-100 text-slate-500'
                        }`}>
                          <span className={`${isFulfilled ? 'text-emerald-600' : 'text-indigo-600'} mr-1`}>
                            {isFulfilled ? `${item.fulfilledCartonCount}/` : ''}{item.cartonCount}×
                          </span>
                          {article?.name || 'Item'}
                        </span>
                      );
                    })}
                    {order.items.length > 5 && (
                      <span className="text-[9px] font-bold text-indigo-400 italic flex items-center">
                        +{order.items.length - 5} more
                      </span>
                    )}
                  </div>
                )}

                {/* Mobile: booked expected date */}
                {order.status === OrderStatus.BOOKED && order.expectedDispatchDate && (
                  <div className="sm:hidden px-5 pb-3">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 border border-indigo-100 rounded-lg">
                      <Calendar size={10} className="text-indigo-500 shrink-0" />
                      <p className="text-[10px] font-bold text-indigo-600">
                        Expected dispatch: <span className="font-black">
                          {new Date(order.expectedDispatchDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      </p>
                    </div>
                  </div>
                )}


                {/* Sleek progress edge */}
                {isTransitioning && (
                  <div className="absolute bottom-0 left-0 h-[2px] w-full bg-slate-100">
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
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">No matching orders</p>
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

export default MyOrders;
