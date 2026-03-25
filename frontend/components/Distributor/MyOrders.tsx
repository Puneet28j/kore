import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Package, 
  Truck, 
  Clock, 
  CheckCircle, 
  ChevronRight, 
  Search, 
  Filter, 
  TrendingUp,
  CreditCard,
  X,
  FileText,
  Loader2
} from 'lucide-react';
import { Order, OrderStatus, Article } from '../../types';
import OrderDetail from './OrderDetail';
import { distributorOrderService } from '../../services/distributorOrderService';
import Pagination from '../ui/Pagination';
import { toast } from 'sonner';

interface MyOrdersProps {
  userId: string;
  articles: Article[];
  isLoading?: boolean;
  lastUpdated?: Date;
}

const MyOrders: React.FC<MyOrdersProps> = ({ userId, articles, isLoading: globalLoading, lastUpdated }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'ALL'>('ALL');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  
  // Pagination & Server-side State
  const [orders, setOrders] = useState<Order[]>([]);
  const [meta, setMeta] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const fetchOrders = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const res = await distributorOrderService.getOrdersByDistributor(userId, {
        page: currentPage,
        limit: 10,
        q: searchQuery,
        status: statusFilter === 'ALL' ? undefined : statusFilter,
      });
      setOrders(res.items);
      setMeta(res.meta);
    } catch (err) {
      console.error("Failed to fetch orders", err);
      toast.error("Failed to load orders");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [userId, currentPage, searchQuery, statusFilter]);

  // Refetch when dependencies change
  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Also refetch when global lastUpdated changes (socket update)
  useEffect(() => {
    if (lastUpdated) fetchOrders(true);
  }, [lastUpdated]);

  // Statistics from backend meta
  const stats = useMemo(() => {
    if (meta?.stats) {
      return {
        totalOrders: meta.stats.count || 0,
        totalSpent: meta.stats.totalSpent || 0,
        activeOrders: meta.stats.activeOrders || 0
      };
    }
    return { totalOrders: 0, totalSpent: 0, activeOrders: 0 };
  }, [meta]);

  const selectedOrder = useMemo(() => 
    orders.find(o => o.id === selectedOrderId), 
    [orders, selectedOrderId]
  );

  if (selectedOrder) {
    return (
      <OrderDetail 
        order={selectedOrder} 
        articles={articles} 
        onBack={() => setSelectedOrderId(null)} 
      />
    );
  }

  const isAnyLoading = loading || globalLoading;

  return (
    <div className="space-y-4 animate-in fade-in duration-500 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">Orders History</h2>
        {lastUpdated && (
          <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-50 border border-slate-100 rounded-lg">
            <div className={`w-1.5 h-1.5 rounded-full bg-emerald-500 ${isAnyLoading ? 'animate-pulse' : ''}`} />
            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
              Synced: {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>
        )}
      </div>

      {/* Stats Row - More Compact */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard 
          label="Orders" 
          value={stats.totalOrders} 
          icon={<Package size={16} className="text-indigo-600" />}
          color="bg-indigo-50"
        />
        <StatCard 
          label="Total Spent" 
          value={`₹${stats.totalSpent.toLocaleString()}`} 
          icon={<CreditCard size={18} className="text-emerald-600" />}
          color="bg-emerald-50"
        />
        <StatCard 
          label="Active" 
          value={stats.activeOrders} 
          icon={<Truck size={18} className="text-amber-600" />}
          color="bg-amber-50"
        />
      </div>

      {/* Filters Section - Streamlined */}
      <div className="bg-white px-4 py-3 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
          <input 
            type="text" 
            placeholder="Search #OR-00002..." 
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-50 border-none focus:ring-1 focus:ring-indigo-500 transition-all font-medium text-xs text-slate-900"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 w-full md:w-auto scrollbar-hide">
          <Filter className="text-slate-300 mr-1 shrink-0" size={14} />
          {(['ALL', ...Object.values(OrderStatus)] as const).map((status) => (
            <button
              key={status}
              onClick={() => {
                setStatusFilter(status);
                setCurrentPage(1);
              }}
              className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider whitespace-nowrap transition-all border ${
                statusFilter === status 
                ? 'bg-slate-900 text-white border-slate-900' 
                : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
              }`}
            >
              {status.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Orders List - More Dense */}
      <div className="relative min-h-[200px]">
        {loading && !orders.length && (
          <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] z-10 flex items-center justify-center rounded-2xl">
            <Loader2 className="animate-spin text-indigo-600" size={32} />
          </div>
        )}

        {orders.length === 0 && !loading ? (
          <div className="bg-white rounded-2xl p-12 border border-dashed border-slate-200 text-center">
            <Package className="text-slate-200 mx-auto mb-3" size={32} />
            <p className="text-slate-400 text-sm font-medium">No orders found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            {orders.map(order => (
              <div 
                key={order.id} 
                onClick={() => setSelectedOrderId(order.id)}
                className="bg-white rounded-xl border border-slate-100 shadow-sm hover:border-indigo-200 transition-all cursor-pointer group flex flex-col"
              >
                <div className="px-5 py-4 flex items-center justify-between gap-4">
                  <div className="flex gap-4 items-center">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      order.status === OrderStatus.DISPATCHED ? 'bg-emerald-50 text-emerald-600' : 
                      order.status === OrderStatus.PENDING ? 'bg-amber-50 text-amber-600' :
                      'bg-slate-50 text-slate-400'
                    }`}>
                      <FileText size={20} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-bold text-sm text-slate-900 tracking-tight">#{order.orderNumber || order.id.slice(-6).toUpperCase()}</span>
                        <StatusBadge status={order.status} />
                      </div>
                      <div className="flex items-center gap-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                        <span className="flex items-center gap-1"><Clock size={12} /> {order.date}</span>
                        <span className="flex items-center gap-1"><Package size={12} /> {order.totalCartons} ctn</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Total</p>
                      <p className="text-sm font-bold text-slate-900">₹{(order.finalAmount || order.totalAmount).toLocaleString()}</p>
                    </div>
                    <ChevronRight size={16} className="text-slate-300 group-hover:text-indigo-600 group-hover:translate-x-1 transition-all" />
                  </div>
                </div>
                
                {/* Condensed Items List */}
                <div className="px-5 pb-3 flex flex-wrap gap-1.5">
                  {order.items.slice(0, 5).map((item, idx) => {
                    const article = articles.find(a => a.id === item.articleId);
                    return (
                      <span key={idx} className="bg-slate-50 px-2 py-0.5 rounded-md border border-slate-100 text-[9px] font-bold text-slate-500">
                        <span className="text-indigo-600 mr-1">{item.cartonCount}×</span>
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
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {meta && meta.totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={meta.totalPages}
          onPageChange={setCurrentPage}
          totalItems={meta.total}
          itemsPerPage={meta.limit}
        />
      )}
    </div>
  );
};

const StatCard: React.FC<{ label: string; value: string | number; icon: React.ReactNode; color: string }> = ({ label, value, icon, color }) => (
  <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
    <div className={`p-2.5 rounded-xl ${color}`}>
      {icon}
    </div>
    <div>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</p>
      <p className="text-lg font-bold text-slate-900 tracking-tight">{value}</p>
    </div>
  </div>
);

const StatusBadge: React.FC<{ status: OrderStatus }> = ({ status }) => {
  const config = {
    [OrderStatus.BOOKED]: { color: 'bg-indigo-50 text-indigo-500 border-indigo-100' },
    [OrderStatus.PENDING]: { color: 'bg-amber-50 text-amber-500 border-amber-100' },
    [OrderStatus.READY_FOR_DISPATCH]: { color: 'bg-blue-50 text-blue-500 border-blue-100' },
    [OrderStatus.DISPATCHED]: { color: 'bg-emerald-50 text-emerald-500 border-emerald-100' },
    [OrderStatus.DELIVERED]: { color: 'bg-slate-50 text-slate-500 border-slate-100' },
  };

  const { color } = config[status];
  return (
    <span className={`inline-flex px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider border ${color}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
};


export default MyOrders;
