import React, { useState, useEffect, useCallback } from 'react';
import {
  Clock, CheckCircle2, Package, Search, ChevronRight,
  Loader2, IndianRupee, Calendar, Trash2, RefreshCw, Star,
} from 'lucide-react';
import { Order, OrderStatus, Article, Inventory } from '../../types';
import { distributorOrderService } from '../../services/distributorOrderService';
import OrderDetail from './OrderDetail';
import Pagination from '../ui/Pagination';
import { usePageSize } from '../../utils/usePageSize';
import { toast } from 'sonner';

interface Props {
  userId: string;
  articles: Article[];
  inventory: Inventory[];
  lastUpdated?: Date;
}

const STATUS_CONFIG: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  PRE_BOOKED: {
    label: 'Pre-Booked',
    cls: 'bg-amber-50 text-amber-700 border border-amber-200',
    icon: <Clock size={10} />,
  },
  CONFIRMED: {
    label: 'Confirmed',
    cls: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
    icon: <CheckCircle2 size={10} />,
  },
};

const DistributorPreOrders: React.FC<Props> = ({ userId, articles, inventory, lastUpdated }) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [meta, setMeta] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = usePageSize('distributorPreOrders', 10);
  const [search, setSearch] = useState('');

  const fetchOrders = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await distributorOrderService.getOrdersByDistributor(userId, {
        page: currentPage,
        limit: pageSize,
        q: search || undefined,
        orderType: 'PREORDER',
      });
      setOrders(res.items);
      setMeta(res.meta);
    } catch {
      toast.error('Failed to load pre-orders');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [userId, currentPage, pageSize, search]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);
  useEffect(() => { if (lastUpdated) fetchOrders(true); }, [lastUpdated]);

  const selectedOrder = orders.find(o => o.id === selectedOrderId || (o as any)._id === selectedOrderId);

  if (selectedOrder) {
    return (
      <OrderDetail
        order={selectedOrder}
        articles={articles}
        inventory={inventory}
        onBack={() => setSelectedOrderId(null)}
        isDistributor
      />
    );
  }

  const preBooked = orders.filter(o => o.status === OrderStatus.PRE_BOOKED).length;
  const confirmed = orders.filter(o => o.status === OrderStatus.CONFIRMED).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
            <Star size={16} className="text-amber-500" />
            My Pre-Orders
          </h3>
          <p className="text-[11px] text-slate-400 font-medium mt-0.5">
            Articles reserved before availability · confirmed by admin when in stock
          </p>
        </div>
        <div className="flex items-center gap-2">
          {preBooked > 0 && (
            <span className="px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-xs font-bold">
              {preBooked} Awaiting Confirmation
            </span>
          )}
          {confirmed > 0 && (
            <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full text-xs font-bold">
              {confirmed} Confirmed
            </span>
          )}
          <button
            onClick={() => fetchOrders()}
            className="p-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all"
          >
            <RefreshCw size={13} className="text-slate-500" />
          </button>
        </div>
      </div>

      {/* Info banner */}
      <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex items-start gap-3">
        <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
          <Star size={14} className="text-amber-600" />
        </div>
        <div>
          <p className="text-xs font-black text-amber-800">Pre-Order Flow</p>
          <p className="text-[11px] text-amber-700 font-medium mt-0.5">
            Pre-Booked → Admin Confirms → Article Available → Converted to Regular Order (PENDING)
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Search pre-orders..."
          value={search}
          onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
          className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-amber-100 focus:border-amber-400 transition-all"
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-amber-500" />
        </div>
      ) : orders.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center mb-4">
            <Star size={24} className="text-amber-300" />
          </div>
          <p className="text-sm font-bold text-slate-900">No Pre-Orders Yet</p>
          <p className="text-xs text-slate-400 mt-1 max-w-xs">
            Browse the Pre-Order catalogue and reserve articles before they're available.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map(order => {
            const cfg = STATUS_CONFIG[order.status] || { label: order.status, cls: 'bg-slate-50 text-slate-500 border border-slate-200', icon: null };
            const dateStr = order.date
              ? new Date(order.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
              : '—';
            const articleNames = order.items.slice(0, 2).map(item => {
              const art = articles.find(a => a.id === item.articleId || (a as any)._id === item.articleId);
              return art?.name || '—';
            }).join(', ') + (order.items.length > 2 ? ` +${order.items.length - 2}` : '');

            return (
              <button
                key={order.id}
                onClick={() => setSelectedOrderId(order.id)}
                className="w-full bg-white rounded-2xl border border-slate-200 hover:border-amber-300 hover:shadow-lg hover:shadow-amber-100/50 transition-all p-4 text-left group"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0 group-hover:bg-amber-100 transition-colors">
                      <Star size={16} className="text-amber-500" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-black text-slate-900 leading-tight">
                          {order.orderNumber ? `#${order.orderNumber}` : 'Pre-Order'}
                        </p>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${cfg.cls}`}>
                          {cfg.icon}
                          {cfg.label}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 font-medium mt-0.5 truncate">{articleNames}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    <div className="hidden sm:flex flex-col items-end">
                      <div className="flex items-center gap-1">
                        <Package size={11} className="text-slate-400" />
                        <span className="text-[11px] font-bold text-slate-600">{order.totalCartons} Ctns</span>
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <Calendar size={10} className="text-slate-300" />
                        <span className="text-[10px] text-slate-400">{dateStr}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end">
                      <div className="flex items-center gap-1">
                        <IndianRupee size={11} className="text-indigo-500" />
                        <span className="text-sm font-black text-slate-900">
                          {(order.finalAmount ?? order.totalAmount ?? 0).toLocaleString('en-IN')}
                        </span>
                      </div>
                      <span className="text-[9px] text-slate-400 font-medium">
                        {order.discountPercentage ? `After ${order.discountPercentage}% disc.` : 'Subtotal'}
                      </span>
                    </div>
                    <ChevronRight size={16} className="text-slate-300 group-hover:text-amber-400 group-hover:translate-x-0.5 transition-all" />
                  </div>
                </div>

                {order.status === OrderStatus.CONFIRMED && (
                  <div className="mt-3 px-3 py-2 bg-indigo-50 rounded-xl flex items-center gap-2">
                    <CheckCircle2 size={12} className="text-indigo-500 shrink-0" />
                    <p className="text-[11px] text-indigo-700 font-bold">
                      Admin ne confirm kar diya — stock available hone par regular order mein convert hoga
                    </p>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

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

export default DistributorPreOrders;
