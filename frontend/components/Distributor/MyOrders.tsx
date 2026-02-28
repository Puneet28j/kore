
import React from 'react';
import { Package, Truck, Clock, CheckCircle, ChevronRight, Download } from 'lucide-react';
import { Order, OrderStatus, Article } from '../../types';

interface MyOrdersProps {
  orders: Order[];
  articles: Article[];
}

const MyOrders: React.FC<MyOrdersProps> = ({ orders, articles }) => {
  return (
    <div className="space-y-6">
      {orders.length === 0 ? (
        <div className="bg-white rounded-xl p-12 border-2 border-dashed border-slate-200 text-center">
          <Package className="mx-auto text-slate-300 mb-4" size={48} />
          <h3 className="text-xl font-bold text-slate-600">No orders found</h3>
          <p className="text-slate-400 mt-1">Start your distribution journey by placing your first order!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {orders.map(order => (
            <div key={order.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden group hover:border-indigo-500 transition-colors">
              <div className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex gap-4 items-start">
                  <div className={`p-3 rounded-xl ${
                    order.status === OrderStatus.DISPATCHED ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'
                  }`}>
                    <Package size={24} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-bold text-lg text-slate-900">{order.id}</h4>
                      <StatusBadge status={order.status} />
                    </div>
                    <div className="flex items-center gap-4 text-sm text-slate-500">
                      <span className="flex items-center gap-1"><Clock size={14} /> {order.date}</span>
                      <span className="flex items-center gap-1"><Package size={14} /> {order.totalCartons} Cartons</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between md:justify-end gap-6 border-t md:border-t-0 pt-4 md:pt-0">
                  <div className="text-left md:text-right">
                    <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-0.5">Order Value</p>
                    <p className="text-xl font-bold text-slate-900">₹{order.totalAmount.toLocaleString()}</p>
                  </div>
                  <button className="bg-slate-50 p-2 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all">
                    <Download size={20} />
                  </button>
                  <button className="bg-slate-50 px-4 py-2 rounded-lg text-indigo-600 font-bold text-sm hover:bg-indigo-50 transition-all flex items-center gap-1">
                    Details <ChevronRight size={16} />
                  </button>
                </div>
              </div>
              
              <div className="bg-slate-50 px-6 py-4 flex flex-wrap gap-4">
                {order.items.slice(0, 3).map(item => {
                  const article = articles.find(a => a.id === item.articleId);
                  return (
                    <div key={item.articleId} className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium">
                      <span className="text-slate-400">{item.cartonCount}×</span>
                      <span className="text-slate-700">{article?.name}</span>
                    </div>
                  );
                })}
                {order.items.length > 3 && (
                  <div className="flex items-center px-3 py-1.5 rounded-lg text-xs font-bold text-indigo-600 italic">
                    +{order.items.length - 3} more articles
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
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${color}`}>
      {icon}
      {status.replace(/_/g, ' ')}
    </span>
  );
};

export default MyOrders;
