import React, { useState, useMemo } from 'react';
import { 
  Package, 
  Truck, 
  CheckCircle2, 
  Clock, 
  Eye, 
  Download, 
  Search, 
  Filter,
  ArrowUpRight,
  ChevronRight,
  TrendingUp,
  X
} from 'lucide-react';
import { Order, OrderStatus, Article } from '../../types';
import OrderDetail from '../Distributor/OrderDetail';

interface OrderProcessorProps {
  orders: Order[];
  articles: Article[];
  updateStatus: (id: string, status: OrderStatus) => void;
  isLoading?: boolean;
}

const OrderProcessor: React.FC<OrderProcessorProps> = ({ orders, articles, updateStatus, isLoading }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'ALL'>('ALL');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  // Filtering
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const matchesSearch = order.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           order.distributorName.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'ALL' || order.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [orders, searchQuery, statusFilter]);

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

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div>
        <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Loading orders...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header & Export */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900">Purchase Orders</h2>
          <p className="text-slate-500 font-medium">Manage and process distributor orders</p>
        </div>
        <button className="flex items-center gap-2 px-6 py-3 bg-white border border-slate-200 rounded-2xl font-bold text-slate-700 hover:bg-slate-50 transition-all shadow-sm">
          <Download size={18} /> Export Reports
        </button>
      </div>

      {/* Filters Section */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Search Order ID or Distributor..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-indigo-500 transition-all font-medium text-slate-900"
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X size={16} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 w-full md:w-auto scrollbar-hide">
          <Filter className="text-slate-400 mr-2 shrink-0" size={18} />
          {(['ALL', ...Object.values(OrderStatus)] as const).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider whitespace-nowrap transition-all border ${
                statusFilter === status 
                ? 'bg-slate-900 text-white border-slate-900 shadow-lg' 
                : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
              }`}
            >
              {status.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Orders Grid/List */}
      <div className="grid grid-cols-1 gap-4">
        {filteredOrders.map(order => (
          <div 
            key={order.id} 
            className="bg-white rounded-3xl border border-slate-100 shadow-sm hover:shadow-xl hover:shadow-slate-200/50 hover:border-indigo-100 transition-all group overflow-hidden"
          >
            <div className="p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="flex gap-6 items-center flex-1">
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-110 duration-500 bg-slate-100 text-slate-500`}>
                  <Package size={28} />
                </div>
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-3 mb-2">
                    <h4 className="font-black text-xl text-slate-900">#{order.id}</h4>
                    <StatusBadge status={order.status} />
                    <span className="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-1 rounded-lg font-black uppercase tracking-widest ml-auto md:ml-0">
                      {order.distributorName}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-bold text-slate-400 uppercase tracking-widest">
                    <span className="flex items-center gap-2 font-medium shrink-0"><Clock size={16} /> {order.date}</span>
                    <span className="flex items-center gap-2 font-medium shrink-0"><Package size={16} /> {order.totalCartons} Cartons</span>
                    <span className="text-indigo-600 font-black">₹{order.totalAmount.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 border-t md:border-t-0 pt-6 md:pt-0">
                {/* Actions */}
                <div className="flex gap-2 mr-4">
                  {order.status === OrderStatus.BOOKED && (
                    <button 
                      onClick={() => updateStatus(order.id, OrderStatus.READY_FOR_DISPATCH)}
                      className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl font-bold text-xs hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
                    >
                      Process Order
                    </button>
                  )}
                  {order.status === OrderStatus.READY_FOR_DISPATCH && (
                    <button 
                      onClick={() => updateStatus(order.id, OrderStatus.DISPATCHED)}
                      className="px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl font-bold text-xs hover:bg-emerald-600 hover:text-white transition-all shadow-sm"
                    >
                      Dispatch Now
                    </button>
                  )}
                </div>
                
                <button 
                  onClick={() => setSelectedOrderId(order.id)}
                  className="p-4 rounded-2xl bg-slate-50 text-slate-400 hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
                  title="View Details"
                >
                  <Eye size={20} />
                </button>
              </div>
            </div>
            
            {/* Peek at items */}
            <div className="bg-slate-50/30 border-t border-slate-100 px-8 py-4 flex flex-wrap gap-3">
              {order.items.slice(0, 3).map((item, idx) => {
                const article = articles.find(a => a.id === item.articleId);
                return (
                  <div key={idx} className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 text-[10px] font-bold text-slate-600 shadow-sm">
                    <span className="text-indigo-600">{item.cartonCount}×</span>
                    <span className="line-clamp-1 max-w-[150px]">{article?.name || item.articleId}</span>
                  </div>
                );
              })}
              {order.items.length > 3 && (
                <div className="flex items-center px-3 py-1.5 text-xs font-black text-indigo-600 italic">
                  +{order.items.length - 3} more
                </div>
              )}
            </div>
          </div>
        ))}
        
        {filteredOrders.length === 0 && (
          <div className="bg-white rounded-3xl p-20 border border-dashed border-slate-200 text-center">
            <Package className="text-slate-200 mx-auto mb-4" size={48} />
            <h3 className="font-black text-slate-900 border-none">No Matching Orders</h3>
            <p className="text-slate-500">Try adjusting your filters or search terms.</p>
          </div>
        )}
      </div>
    </div>
  );
};

const StatusBadge: React.FC<{ status: OrderStatus }> = ({ status }) => {
  const config = {
    [OrderStatus.BOOKED]: { color: 'bg-indigo-50 text-indigo-600', icon: <Clock size={12} /> },
    [OrderStatus.PENDING]: { color: 'bg-amber-50 text-amber-600', icon: <Clock size={12} /> },
    [OrderStatus.READY_FOR_DISPATCH]: { color: 'bg-blue-50 text-blue-600', icon: <Package size={12} /> },
    [OrderStatus.DISPATCHED]: { color: 'bg-emerald-50 text-emerald-600', icon: <Truck size={12} /> },
    [OrderStatus.DELIVERED]: { color: 'bg-slate-100 text-slate-600', icon: <CheckCircle2 size={12} /> },
  };

  const { color, icon } = config[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border border-current opacity-80 ${color}`}>
      {icon}
      {status.replace(/_/g, ' ')}
    </span>
  );
};

export default OrderProcessor;
