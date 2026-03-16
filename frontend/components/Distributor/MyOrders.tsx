
import React, { useState, useMemo } from 'react';
import { 
  Package, 
  Truck, 
  Clock, 
  CheckCircle, 
  ChevronRight, 
  Download, 
  Search, 
  Filter, 
  ArrowUpRight,
  TrendingUp,
  CreditCard,
  X,
  Loader2
} from 'lucide-react';
import { Order, OrderStatus, Article } from '../../types';
import OrderDetail from './OrderDetail';

interface MyOrdersProps {
  orders: Order[];
  articles: Article[];
  isLoading?: boolean;
}

const MyOrders: React.FC<MyOrdersProps> = ({ orders, articles, isLoading }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'ALL'>('ALL');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  // Statistics
  const stats = useMemo(() => {
    const totalOrders = orders.length;
    const totalSpent = orders.reduce((sum, o) => sum + o.totalAmount, 0);
    const activeOrders = orders.filter(o => 
      o.status !== OrderStatus.DELIVERED
    ).length;

    return { totalOrders, totalSpent, activeOrders };
  }, [orders]);

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

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard 
          label="Total Orders" 
          value={stats.totalOrders.toString()} 
          icon={<Package className="text-indigo-600" size={24} />}
          trend="+12% from last month"
          color="bg-indigo-50"
        />
        <StatCard 
          label="Total Spent" 
          value={`₹${stats.totalSpent.toLocaleString()}`} 
          icon={<CreditCard className="text-emerald-600" size={24} />}
          trend="+8.4% from last month"
          color="bg-emerald-50"
        />
        <StatCard 
          label="Active Orders" 
          value={stats.activeOrders.toString()} 
          icon={<Truck className="text-amber-600" size={24} />}
          trend="4 ready for dispatch"
          color="bg-amber-50"
        />
      </div>

      {/* Filters Section */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Search by Order ID..." 
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
              className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-all border ${
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

      {/* Orders List */}
      {filteredOrders.length === 0 ? (
        <div className="bg-white rounded-3xl p-20 border border-dashed border-slate-200 text-center">
          <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <Package className="text-slate-300" size={40} />
          </div>
          <h3 className="text-2xl font-black text-slate-900 mb-2">No orders found</h3>
          <p className="text-slate-500 max-w-sm mx-auto">
            We couldn't find any orders matching your current search or filters. 
            Try adjusting your criteria.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredOrders.map(order => (
            <div 
              key={order.id} 
              onClick={() => setSelectedOrderId(order.id)}
              className="bg-white rounded-3xl border border-slate-100 shadow-sm hover:shadow-xl hover:shadow-slate-200/50 hover:border-indigo-100 transition-all cursor-pointer group overflow-hidden"
            >
              <div className="p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex gap-6 items-center">
                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-110 duration-500 ${
                    order.status === OrderStatus.DISPATCHED ? 'bg-emerald-100 text-emerald-600' : 
                    order.status === OrderStatus.PENDING ? 'bg-amber-100 text-amber-600' :
                    'bg-slate-100 text-slate-500'
                  }`}>
                    <Package size={28} />
                  </div>
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <h4 className="font-black text-xl text-slate-900">#{order.id}</h4>
                      <StatusBadge status={order.status} />
                    </div>
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-bold text-slate-400 uppercase tracking-widest">
                      <span className="flex items-center gap-2"><Clock size={16} /> {order.date}</span>
                      <span className="flex items-center gap-2"><Package size={16} /> {order.totalCartons} Cartons</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between md:justify-end gap-8 border-t md:border-t-0 pt-6 md:pt-0">
                  <div className="text-left md:text-right">
                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] mb-1">Total Amount</p>
                    <p className="text-2xl font-black text-slate-900">₹{order.totalAmount.toLocaleString()}</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-50 text-slate-400 group-hover:bg-indigo-600 group-hover:text-white transition-all">
                    <ChevronRight size={24} />
                  </div>
                </div>
              </div>
              
              {/* Peek at items */}
              <div className="bg-slate-50/50 border-t border-slate-100 px-8 py-4 flex flex-wrap gap-3">
                {order.items.slice(0, 4).map((item, idx) => {
                  const article = articles.find(a => a.id === item.articleId);
                  return (
                    <div key={idx} className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 text-[11px] font-bold text-slate-600 shadow-sm">
                      <span className="text-indigo-600">{item.cartonCount}×</span>
                      <span className="line-clamp-1 max-w-[120px]">{article?.name}</span>
                    </div>
                  );
                })}
                {order.items.length > 4 && (
                  <div className="flex items-center px-3 py-1.5 text-xs font-black text-indigo-600 italic">
                    +{order.items.length - 4} more items
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const StatCard: React.FC<{ label: string; value: string; icon: React.ReactNode; trend: string; color: string }> = ({ label, value, icon, trend, color }) => (
  <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm group hover:border-indigo-500 transition-all">
    <div className="flex justify-between items-start mb-4">
      <div className={`p-3 rounded-2xl ${color} transition-transform group-hover:scale-110`}>
        {icon}
      </div>
      <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">
        <TrendingUp size={12} /> {trend.split(' ')[0]}
      </div>
    </div>
    <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-1">{label}</h3>
    <p className="text-3xl font-black text-slate-900">{value}</p>
    <p className="text-[10px] text-slate-400 mt-2 font-medium">{trend}</p>
  </div>
);

const StatusBadge: React.FC<{ status: OrderStatus }> = ({ status }) => {
  const config = {
    [OrderStatus.BOOKED]: { color: 'bg-indigo-50 text-indigo-600', icon: <Clock size={12} /> },
    [OrderStatus.PENDING]: { color: 'bg-amber-50 text-amber-600', icon: <Clock size={12} /> },
    [OrderStatus.READY_FOR_DISPATCH]: { color: 'bg-blue-50 text-blue-600', icon: <Package size={12} /> },
    [OrderStatus.DISPATCHED]: { color: 'bg-emerald-50 text-emerald-600', icon: <Truck size={12} /> },
    [OrderStatus.DELIVERED]: { color: 'bg-slate-100 text-slate-600', icon: <CheckCircle size={12} /> },
  };

  const { color, icon } = config[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-widest border border-current opacity-80 ${color}`}>
      {icon}
      {status.replace(/_/g, ' ')}
    </span>
  );
};

export default MyOrders;
