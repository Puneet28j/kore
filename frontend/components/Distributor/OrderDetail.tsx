
import React from 'react';
import { 
  ArrowLeft, 
  Package, 
  Truck, 
  Clock, 
  CheckCircle, 
  MapPin, 
  CreditCard, 
  Calendar,
  ChevronRight,
  Printer,
  Download
} from 'lucide-react';
import { Order, OrderStatus, Article } from '../../types';

interface OrderDetailProps {
  order: Order;
  articles: Article[];
  onBack: () => void;
}

const OrderDetail: React.FC<OrderDetailProps> = ({ order, articles, onBack }) => {
  const statusSteps = [
    { status: OrderStatus.BOOKED, label: 'Booked', icon: <Clock size={20} /> },
    { status: OrderStatus.PENDING, label: 'Processing', icon: <Package size={20} /> },
    { status: OrderStatus.READY_FOR_DISPATCH, label: 'Ready', icon: <Package size={20} /> },
    { status: OrderStatus.DISPATCHED, label: 'Dispatched', icon: <Truck size={20} /> },
    { status: OrderStatus.DELIVERED, label: 'Delivered', icon: <CheckCircle size={20} /> },
  ];

  const currentStatusIndex = statusSteps.findIndex(s => s.status === order.status);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="p-3 rounded-2xl bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-all active:scale-95"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-2xl font-black text-slate-900">Order {order.id}</h2>
              <StatusBadge status={order.status} />
            </div>
            <p className="text-slate-500 text-sm font-medium flex items-center gap-2">
              <Calendar size={14} /> Placed on {order.date}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-2xl border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50 transition-all">
            <Printer size={18} /> Print
          </button>
          <button className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100">
            <Download size={18} /> Invoice
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {/* Status Timeline */}
          <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900 mb-8">Order Journey</h3>
            <div className="relative flex justify-between">
              {/* Progress Line */}
              <div className="absolute top-5 left-0 w-full h-1 bg-slate-100 z-0">
                <div 
                  className="h-full bg-indigo-500 transition-all duration-1000" 
                  style={{ width: `${(currentStatusIndex / (statusSteps.length - 1)) * 100}%` }}
                ></div>
              </div>

              {statusSteps.map((step, index) => {
                const isActive = index <= currentStatusIndex;
                const isCurrent = index === currentStatusIndex;

                return (
                  <div key={step.status} className="relative z-10 flex flex-col items-center group">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-500 border-4 border-white shadow-md ${
                      isActive ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-400'
                    } ${isCurrent ? 'ring-4 ring-indigo-100 scale-110' : ''}`}>
                      {isActive && index < currentStatusIndex ? <CheckCircle size={20} /> : step.icon}
                    </div>
                    <span className={`mt-3 text-[11px] font-bold uppercase tracking-wider transition-colors ${
                      isActive ? 'text-indigo-600' : 'text-slate-400'
                    }`}>
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Items Detail */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-8 py-6 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">Order Items</h3>
            </div>
            <div className="divide-y divide-slate-100">
              {order.items.map((item, idx) => {
                const article = articles.find(a => a.id === item.articleId);
                const variant = article?.variants?.find(v => v.id === item.variantId);

                return (
                  <div key={idx} className="p-6 flex items-center gap-6 group hover:bg-slate-50 transition-colors">
                    <div className="w-20 h-20 rounded-2xl overflow-hidden border border-slate-200 shadow-sm shrink-0">
                      <img 
                        src={variant?.images?.[0] || article?.imageUrl || ''} 
                        alt={article?.name || 'Article'} 
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-bold text-slate-900 line-clamp-1">{article?.name || 'Unknown Article'}</h4>
                      <div className="flex flex-wrap gap-2 mt-1">
                        <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                          {variant?.color || 'N/A'}
                        </span>
                        <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                          {item.cartonCount} Cartons
                        </span>
                        <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                          {item.pairCount} Pairs
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-slate-900">₹{item.price.toLocaleString()}</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">₹{(item.price / (item.pairCount || 1)).toFixed(2)} / Pair</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Sidebar info */}
        <div className="space-y-8">
          {/* Order Summary */}
          <div className="bg-slate-900 text-white p-8 rounded-3xl shadow-xl shadow-slate-200">
            <h3 className="text-lg font-bold mb-6 border-b border-white/10 pb-4">Order Summary</h3>
            <div className="space-y-4 mb-6">
              <div className="flex justify-between text-slate-400">
                <span className="text-sm">Total Cartons</span>
                <span className="font-bold text-white">{order.totalCartons}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span className="text-sm">Total Pairs</span>
                <span className="font-bold text-white">{order.totalPairs}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span className="text-sm">Subtotal</span>
                <span className="font-bold text-white">₹{order.totalAmount.toLocaleString()}</span>
              </div>
              <div className="pt-4 border-t border-white/10">
                <div className="flex justify-between items-center">
                  <span className="text-lg font-bold">Grand Total</span>
                  <span className="text-2xl font-black text-indigo-400">₹{order.totalAmount.toLocaleString()}</span>
                </div>
              </div>
            </div>
            <div className="bg-white/5 p-4 rounded-2xl flex gap-3">
              <CreditCard size={20} className="text-indigo-400" />
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-300">Payment Status</p>
                <p className="text-sm font-medium">Payment on Delivery / Terms</p>
              </div>
            </div>
          </div>

          {/* Shipping Info */}
          <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                <MapPin size={20} />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Shipping To</h3>
            </div>
            <div className="space-y-2">
              <p className="font-bold text-slate-900">{order.distributorName}</p>
              <p className="text-sm text-slate-500 leading-relaxed">
                4th Floor, Tech Park Towers,<br />
                Phase 3, Industrial Area,<br />
                Mumbai, Maharashtra - 400001
              </p>
              <div className="pt-4 mt-4 border-t border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Contact Details</p>
                <p className="text-sm font-medium text-slate-700">+91 98765 43210</p>
                <p className="text-sm font-medium text-slate-700">logistics@distributor.com</p>
              </div>
            </div>
          </div>
        </div>
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
    [OrderStatus.DELIVERED]: { color: 'bg-slate-100 text-slate-600', icon: <CheckCircle size={12} /> },
  };

  const { color, icon } = config[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-widest border border-current opacity-90 ${color}`}>
      {icon}
      {status.replace(/_/g, ' ')}
    </span>
  );
};

export default OrderDetail;
