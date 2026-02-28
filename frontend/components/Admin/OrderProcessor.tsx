
import React from 'react';
import { Package, Truck, CheckCircle2, Clock, Eye, Download } from 'lucide-react';
import { Order, OrderStatus, Article } from '../../types';

interface OrderProcessorProps {
  orders: Order[];
  articles: Article[];
  updateStatus: (id: string, status: OrderStatus) => void;
}

const OrderProcessor: React.FC<OrderProcessorProps> = ({ orders, articles, updateStatus }) => {
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <h3 className="font-bold text-slate-700">Recent Purchase Orders</h3>
          <button className="text-sm font-medium text-indigo-600 flex items-center gap-2">
            <Download size={16} /> Export CSV
          </button>
        </div>
        {/* Mobile View: Cards */}
        <div className="md:hidden divide-y divide-slate-100">
          {orders.map(order => (
            <div key={order.id} className="p-4 space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-bold text-slate-900 text-lg">{order.id}</p>
                  <p className="text-[10px] text-slate-500 font-medium">{order.date}</p>
                </div>
                <StatusBadge status={order.status} />
              </div>

              <div className="bg-slate-50 p-3 rounded-xl space-y-2">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500">Distributor</span>
                  <span className="font-bold text-slate-900">{order.distributorName}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500">Total Pairs</span>
                  <span className="font-bold text-slate-900">{order.totalPairs} Pairs</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500">Volume</span>
                  <span className="font-bold text-indigo-600">{order.totalCartons} Cartons</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-1 flex gap-2">
                  {order.status === OrderStatus.BOOKED && (
                    <button 
                      onClick={() => updateStatus(order.id, OrderStatus.READY_FOR_DISPATCH)}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-indigo-100"
                    >
                      <Package size={18} /> Ready
                    </button>
                  )}
                  {order.status === OrderStatus.READY_FOR_DISPATCH && (
                    <button 
                      onClick={() => updateStatus(order.id, OrderStatus.DISPATCHED)}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-emerald-100"
                    >
                      <Truck size={18} /> Dispatch
                    </button>
                  )}
                </div>
                <button className="p-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-colors shadow-sm">
                  <Eye size={20} />
                </button>
              </div>
            </div>
          ))}
          {orders.length === 0 && (
            <div className="p-12 text-center text-slate-400 italic">No orders found.</div>
          )}
        </div>

        {/* Desktop View: Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-white">
              <tr>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Order ID</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Distributor</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-center">Volume</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.map(order => (
                <tr key={order.id} className="hover:bg-slate-50/50">
                  <td className="px-6 py-4">
                    <p className="font-bold text-slate-900">{order.id}</p>
                    <p className="text-[10px] text-slate-500">{order.date}</p>
                  </td>
                  <td className="px-6 py-4">
                    <p className="font-medium text-slate-800">{order.distributorName}</p>
                    <p className="text-xs text-slate-500">PO Quantity: {order.totalPairs} pairs</p>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="font-bold text-slate-600">{order.totalCartons}</span>
                    <p className="text-[10px] text-slate-400">Cartons</p>
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={order.status} />
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-3">
                      {order.status === OrderStatus.BOOKED && (
                        <button 
                          onClick={() => updateStatus(order.id, OrderStatus.READY_FOR_DISPATCH)}
                          className="p-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100"
                          title="Ready for Dispatch"
                        >
                          <Package size={18} />
                        </button>
                      )}
                      {order.status === OrderStatus.READY_FOR_DISPATCH && (
                        <button 
                          onClick={() => updateStatus(order.id, OrderStatus.DISPATCHED)}
                          className="p-2 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100"
                          title="Dispatch Now"
                        >
                          <Truck size={18} />
                        </button>
                      )}
                      <button className="p-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200">
                        <Eye size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                    No orders found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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
    [OrderStatus.DELIVERED]: { color: 'bg-slate-100 text-slate-600', icon: <CheckCircle2 size={12} /> },
  };

  const { color, icon } = config[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${color}`}>
      {icon}
      {status.replace(/_/g, ' ')}
    </span>
  );
};

export default OrderProcessor;
