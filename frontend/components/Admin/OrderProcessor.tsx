import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  ChevronRight,
  Loader2
} from 'lucide-react';
import { Order, OrderStatus, Article } from '../../types';
import OrderDetail from '../Distributor/OrderDetail';
import { distributorOrderService } from '../../services/distributorOrderService';
import Pagination from '../ui/Pagination';
import { toast } from 'sonner';

interface OrderProcessorProps {
  articles: Article[];
  updateStatus: (id: string, status: OrderStatus) => void;
  isLoading?: boolean;
  lastUpdated?: Date;
}

const OrderProcessor: React.FC<OrderProcessorProps> = ({ articles, updateStatus, isLoading: globalLoading, lastUpdated }) => {
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
      const res = await distributorOrderService.getAllOrders({
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
  }, [currentPage, searchQuery, statusFilter]);

  // Refetch when dependencies change
  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Also refetch when global lastUpdated changes (socket update)
  useEffect(() => {
    if (lastUpdated) fetchOrders(true); // Silent update for socket events
  }, [lastUpdated]);

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
      {/* Header - Compact */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Purchase Orders</h2>
          <p className="text-slate-400 text-xs font-medium">Manage distributor sales flow</p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 bg-slate-100 rounded-lg">
              <div className={`w-1.5 h-1.5 rounded-full bg-emerald-500 ${isAnyLoading ? 'animate-pulse' : ''}`} />
              <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                Last Synced: {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>
          )}
          <button className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl font-bold text-xs text-slate-700 hover:bg-slate-50 transition-all shadow-sm">
            <Download size={14} /> Export
          </button>
        </div>
      </div>

      {/* Filters - Compact */}
      <div className="bg-white px-4 py-3 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
          <input 
            type="text" 
            placeholder="Search #OR-00002 or distributor..." 
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1); // Reset to first page on search
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
                ? 'bg-slate-900 text-white border-slate-900 shadow-sm' 
                : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
              }`}
            >
              {status.replace(/_/g, ' ')}
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
          {orders.map(order => (
            <div 
              key={order.id} 
              onClick={() => setSelectedOrderId(order.id)}
              className="bg-white rounded-xl border border-slate-100 shadow-sm hover:border-indigo-100 transition-all group overflow-hidden cursor-pointer"
            >
              <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex gap-4 items-center flex-1">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-slate-50 text-slate-400`}>
                    <Package size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <h4 className="font-bold text-sm text-slate-900 tracking-tight">#{order.orderNumber || order.id.slice(-6).toUpperCase()}</h4>
                      <StatusBadge status={order.status} />
                    </div>
                    
                    {/* Interactive Progress Timeline */}
                    <div className="mb-2 hidden md:block" onClick={(e) => e.stopPropagation()}>
                      <OrderProgress 
                        status={order.status} 
                        onUpdate={(newStatus) => updateStatus(order.id, newStatus)}
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                      <span className="flex items-center gap-1.5"><User size={12} className="text-slate-300" /> {order.distributorName}</span>
                      <span className="flex items-center gap-1.5"><Clock size={12} /> {order.date}</span>
                      <span className="text-indigo-600 font-black">₹{(order.finalAmount || order.totalAmount).toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between sm:justify-end gap-3 border-t sm:border-t-0 pt-3 sm:pt-0" onClick={(e) => e.stopPropagation()}>
                  <div className="md:hidden">
                    <StatusBadge status={order.status} />
                  </div>
                  
                  <div className="flex gap-2">
                    {order.status === OrderStatus.BOOKED && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); updateStatus(order.id, OrderStatus.PENDING); }}
                        className="px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg font-bold text-[10px] uppercase hover:bg-indigo-600 hover:text-white transition-all tracking-wider"
                      >
                        Process
                      </button>
                    )}
                    {order.status === OrderStatus.PENDING && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); updateStatus(order.id, OrderStatus.READY_FOR_DISPATCH); }}
                        className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg font-bold text-[10px] uppercase hover:bg-blue-600 hover:text-white transition-all tracking-wider"
                      >
                        Mark Ready
                      </button>
                    )}
                    {order.status === OrderStatus.READY_FOR_DISPATCH && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); updateStatus(order.id, OrderStatus.DISPATCHED); }}
                        className="px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-lg font-bold text-[10px] uppercase hover:bg-emerald-600 hover:text-white transition-all tracking-wider"
                      >
                        Dispatch
                      </button>
                    )}
                    {order.status === OrderStatus.DISPATCHED && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); updateStatus(order.id, OrderStatus.DELIVERED); }}
                        className="px-3 py-1.5 bg-slate-900 text-white rounded-lg font-bold text-[10px] uppercase hover:bg-slate-800 transition-all tracking-wider flex items-center gap-1.5"
                      >
                        <CheckCircle2 size={12} /> Deliver
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
          
          {orders.length === 0 && !loading && (
            <div className="bg-white rounded-2xl p-12 border border-dashed border-slate-200 text-center">
              <Package className="text-slate-200 mx-auto mb-3" size={32} />
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">No matching orders</p>
            </div>
          )}
        </div>
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
    <span className={`inline-flex px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider border ${color}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
};

const OrderProgress: React.FC<{ 
  status: OrderStatus;
  onUpdate?: (status: OrderStatus) => void;
}> = ({ status, onUpdate }) => {
  const stages = [
    OrderStatus.BOOKED,
    OrderStatus.PENDING,
    OrderStatus.READY_FOR_DISPATCH,
    OrderStatus.DISPATCHED,
    OrderStatus.DELIVERED
  ];
  
  const currentIndex = stages.indexOf(status);
  
  return (
    <div className="flex items-center gap-1.5 w-full max-w-[320px]">
      {stages.map((s, idx) => {
        const isCompleted = idx <= currentIndex;
        const isActive = idx === currentIndex;
        const isNext = idx === currentIndex + 1;
        
        return (
          <React.Fragment key={s}>
            <button
              onClick={() => onUpdate && onUpdate(s)}
              disabled={!onUpdate || idx <= currentIndex}
              className={`h-1.5 rounded-full flex-1 transition-all duration-300 relative group/step ${
                isCompleted ? 'bg-indigo-600' : 'bg-slate-100 hover:bg-slate-200'
              } ${isActive ? 'ring-2 ring-indigo-500/20' : ''} ${isNext ? 'ring-1 ring-indigo-200 ring-offset-1' : ''}`}
            >
              {/* Tooltip */}
              <span className="absolute -top-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[8px] font-black uppercase px-2 py-1 rounded opacity-0 group-hover/step:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                {s.replace(/_/g, ' ')}
              </span>
            </button>
            {idx < stages.length - 1 && (
              <div className={`w-0.5 h-0.5 rounded-full ${idx < currentIndex ? 'bg-indigo-600' : 'bg-slate-200'}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

export default OrderProcessor;
