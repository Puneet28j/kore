
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
  Printer,
  Download,
  FileText
} from 'lucide-react';
import { Order, OrderStatus, Article } from '../../types';
import { getImageUrl } from '../../utils/imageUtils';

interface OrderDetailProps {
  order: Order;
  articles: Article[];
  onBack: () => void;
}

const OrderDetail: React.FC<OrderDetailProps> = ({ order, articles, onBack }) => {
  const statusSteps = [
    { status: OrderStatus.BOOKED, label: 'Booked', icon: <Clock size={16} /> },
    { status: OrderStatus.PENDING, label: 'Processing', icon: <Package size={16} /> },
    { status: OrderStatus.READY_FOR_DISPATCH, label: 'Ready', icon: <Package size={16} /> },
    { status: OrderStatus.DISPATCHED, label: 'Dispatched', icon: <Truck size={16} /> },
    { status: OrderStatus.DELIVERED, label: 'Delivered', icon: <CheckCircle size={16} /> },
  ];

  const currentStatusIndex = statusSteps.findIndex(s => s.status === order.status);

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
      {/* Header - Compact */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white px-5 py-4 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-50 text-slate-500 hover:bg-slate-900 hover:text-white transition-all active:scale-95"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">Order #{order.orderNumber || order.id.slice(-6).toUpperCase()}</h2>
              <StatusBadge status={order.status} />
            </div>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5">
              <Calendar size={12} /> {order.date}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-1.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50 transition-all">
            <Printer size={14} /> Print
          </button>
          <button className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-1.5 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-slate-800 transition-all shadow-sm">
            <Download size={14} /> Invoice
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3 space-y-4">
          {/* Status Timeline - Compact */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="relative flex justify-between">
              {/* Progress Line */}
              <div className="absolute top-4 left-0 w-full h-0.5 bg-slate-100 z-0">
                <div 
                  className="h-full bg-indigo-500 transition-all duration-1000" 
                  style={{ width: `${(currentStatusIndex / (statusSteps.length - 1)) * 100}%` }}
                ></div>
              </div>

              {statusSteps.map((step, index) => {
                const isActive = index <= currentStatusIndex;
                const isCurrent = index === currentStatusIndex;

                return (
                  <div key={step.status} className="relative z-10 flex flex-col items-center">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-500 border-2 border-white shadow-sm ${
                      isActive ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-400'
                    } ${isCurrent ? 'ring-2 ring-indigo-100 scale-110' : ''}`}>
                      {isActive && index < currentStatusIndex ? <CheckCircle size={14} /> : step.icon}
                    </div>
                    <span className={`mt-2 text-[8px] font-bold uppercase tracking-wider ${
                      isActive ? 'text-indigo-600' : 'text-slate-400'
                    }`}>
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Items Detail - Compact */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-widest">Order Items</h3>
            </div>
            <div className="divide-y divide-slate-100">
              {order.items.map((item, idx) => {
                const article = articles.find(a => a.id === item.articleId);
                const variant = article?.variants?.find(v => v.id === item.variantId);

                return (
                  <div key={idx} className="px-6 py-4 flex items-center gap-4 hover:bg-slate-50 transition-colors">
                    <div className="w-12 h-12 rounded-lg overflow-hidden border border-slate-200 bg-slate-50 shrink-0">
                      <img 
                        src={getImageUrl(variant?.images?.[0] || article?.imageUrl || '')} 
                        alt={article?.name || 'Article'} 
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-sm text-slate-900 truncate tracking-tight">
                        {article?.name || 'Unknown Article'} 
                        {variant && ` - ${variant.color} - ${variant.sizeRange}`}
                      </h4>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-[10px] font-semibold text-slate-400">
                          {variant?.color || 'N/A'}
                        </span>
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] font-bold text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded">
                            {item.cartonCount} Ctn
                          </span>
                          <span className="text-[10px] font-semibold text-slate-400">
                            {item.pairCount} Pairs
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-sm text-slate-900 tracking-tight">₹{item.price.toLocaleString()}</p>
                      <p className="text-[8px] text-slate-400 font-bold uppercase tracking-wider">₹{(item.price / (item.pairCount || 1)).toFixed(0)} / Pair</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Sidebar info - Compact */}
        <div className="space-y-4">
          {/* Order Summary */}
          <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-lg">
            <h3 className="text-xs font-bold uppercase tracking-[0.2em] mb-4 border-b border-white/10 pb-3 text-slate-400">Payment Breakdown</h3>
            <div className="space-y-3 mb-5">
              <div className="flex justify-between text-slate-400 text-[11px]">
                <span>Total Cartons</span>
                <span className="font-bold text-white">{order.totalCartons}</span>
              </div>
              <div className="flex justify-between text-slate-400 text-[11px]">
                <span>Total Pairs</span>
                <span className="font-bold text-white">{order.totalPairs}</span>
              </div>
              <div className="pt-3 border-t border-white/10">
                <div className="flex justify-between items-end">
                  <span className="text-xs font-bold text-slate-300">Total Amount</span>
                  <span className="text-xl font-black text-indigo-400 tracking-tight">₹{order.totalAmount.toLocaleString()}</span>
                </div>
              </div>
            </div>
            <div className="bg-white/5 p-3 rounded-xl flex items-center gap-3 mt-4 border border-white/5">
              <CreditCard size={16} className="text-indigo-400" />
              <div>
                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Terms</p>
                <p className="text-[11px] font-medium">Net 30 Days</p>
              </div>
            </div>
          </div>

          {/* Shipping Info */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <MapPin size={16} className="text-indigo-600" />
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-widest">Delivery</h3>
            </div>
            <div className="space-y-2">
              <p className="font-bold text-sm text-slate-900 tracking-tight">{order.distributorName}</p>
              <p className="text-[10px] text-slate-500 leading-relaxed font-medium">
                Warehouse 7A, Logistics Park,<br />
                Indore, MP - 452001
              </p>
              <div className="pt-4 mt-4 border-t border-slate-100 space-y-1">
                <p className="text-[10px] font-semibold text-slate-700">+91 99999 88888</p>
                <p className="text-[10px] font-semibold text-slate-700">ops@distributor.com</p>
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

export default OrderDetail;
