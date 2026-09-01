import React, { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, CheckCircle, Clock, X, IndianRupee, Loader2, ArrowRight, Calendar, CreditCard, TrendingUp } from 'lucide-react';
import { orderService } from '../../services/orderService';
import { toast } from 'sonner';

interface OverdueOrder {
  _id: string;
  orderNumber: string;
  distributorName: string;
  date: string;
  deliveredAt?: string;
  finalAmount?: number;
  totalAmount: number;
  amountPaid: number;
  remainingAmount: number;
  daysSinceDelivery: number;
  daysOverdue: number;
  paymentTerms: string;
  paymentDays: number;
  urgency: 'YELLOW' | 'RED';
  status: string;
}

interface OverduePaymentsProps {
  isAdmin?: boolean;
  onPaymentMarked?: () => void;
  showAll?: boolean;
  onSeeAll?: () => void;
}

const DASHBOARD_LIMIT = 5;

const OverduePayments: React.FC<OverduePaymentsProps> = ({
  isAdmin = false,
  onPaymentMarked,
  showAll = false,
  onSeeAll,
}) => {
  const [orders, setOrders] = useState<OverdueOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [marking, setMarking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await orderService.getOverdueOrders();
      setOrders(res.data?.data || []);
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Real-time: refresh when any order is updated (payment marked, status change)
  useEffect(() => {
    const handler = () => load();
    window.addEventListener("orderUpdatedSocket", handler);
    return () => window.removeEventListener("orderUpdatedSocket", handler);
  }, [load]);

  const confirmOrder = orders.find(o => o._id === confirmId);

  const handleRecordPayment = async () => {
    if (!confirmId) return;
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    if (confirmOrder && amt > confirmOrder.remainingAmount) {
      toast.error(`Amount exceeds remaining balance (₹${confirmOrder.remainingAmount.toLocaleString()})`);
      return;
    }
    setMarking(true);
    try {
      await orderService.recordPayment(confirmId, amt, note);
      toast.success('Payment recorded');
      setConfirmId(null);
      setAmount('');
      setNote('');
      load();
      onPaymentMarked?.();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to record payment');
    } finally {
      setMarking(false);
    }
  };

  const red = orders.filter(o => o.urgency === 'RED');
  const yellow = orders.filter(o => o.urgency === 'YELLOW');
  const displayOrders = showAll ? orders : orders.slice(0, DASHBOARD_LIMIT);
  const hasMore = !showAll && orders.length > DASHBOARD_LIMIT;

  // Kabhi null return mat karo — hamesha section dikhao

  // Total overdue amount — remaining balance, not the full order value, so a
  // partially-paid order only counts what's actually still outstanding.
  const totalOverdue = orders.reduce((s, o) => s + (o.remainingAmount ?? (o.finalAmount || o.totalAmount || 0)), 0);

  return (
    <>
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-rose-50 rounded-xl">
              <AlertTriangle size={18} className="text-rose-600" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">
                {showAll ? 'Overdue Payments — Full List' : 'Overdue Payments'}
              </h3>
              <p className="text-[10px] text-slate-400">
                Based on distributor payment terms · {orders.length} order{orders.length !== 1 ? 's' : ''} overdue
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {red.length > 0 && (
              <span className="px-2 py-0.5 bg-rose-100 text-rose-700 rounded-full text-[10px] font-black">
                {red.length} Critical
              </span>
            )}
            {yellow.length > 0 && (
              <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-[10px] font-black">
                {yellow.length} Warning
              </span>
            )}
          </div>
        </div>

        {/* Summary strip — page mode only */}
        {showAll && !loading && orders.length > 0 && (
          <div className="grid grid-cols-3 divide-x divide-slate-100 bg-slate-50/60 border-b border-slate-100">
            <div className="px-5 py-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Overdue Amount</p>
              <div className="flex items-center gap-1 mt-1">
                <IndianRupee size={13} className="text-slate-700" />
                <span className="font-black text-slate-900">{totalOverdue.toLocaleString()}</span>
              </div>
            </div>
            <div className="px-5 py-3">
              <p className="text-[10px] font-bold text-rose-500 uppercase tracking-wider">🔴 Critical (&gt;30 days overdue)</p>
              <p className="font-black text-rose-600 mt-1">{red.length} orders</p>
            </div>
            <div className="px-5 py-3">
              <p className="text-[10px] font-bold text-amber-500 uppercase tracking-wider">🟡 Warning (overdue)</p>
              <p className="font-black text-amber-600 mt-1">{yellow.length} orders</p>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 size={22} className="animate-spin text-slate-300" />
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-center px-6">
            <div className="w-14 h-14 bg-emerald-50 rounded-full flex items-center justify-center mb-4">
              <CheckCircle size={28} className="text-emerald-500" />
            </div>
            <p className="font-bold text-slate-700 text-sm">No overdue payments!</p>
            <p className="text-xs text-slate-400 mt-1 max-w-xs">
              All delivered orders are paid within their payment terms. Great job!
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {displayOrders.map(o => {
              const isRed = o.urgency === 'RED';
              const orderTotal = o.finalAmount || o.totalAmount || 0;
              const remaining = o.remainingAmount ?? orderTotal;
              const hasPartialPayment = (o.amountPaid || 0) > 0;
              const deliveredDate = o.deliveredAt || o.date;

              return (
                <div
                  key={o._id}
                  className={`flex items-center gap-4 px-5 py-3.5 transition-colors ${
                    isRed
                      ? 'bg-rose-50/60 hover:bg-rose-50'
                      : 'bg-amber-50/40 hover:bg-amber-50/70'
                  }`}
                >
                  {/* Urgency dot */}
                  <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${isRed ? 'bg-rose-500 animate-pulse' : 'bg-amber-400'}`} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-slate-800">{o.orderNumber}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${isRed ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-600'}`}>
                        {o.daysOverdue}d overdue
                      </span>
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-500">
                        Terms: {o.paymentTerms || `${o.paymentDays} days`}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 truncate">{o.distributorName}</p>
                    {showAll && (
                      <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-400">
                        <span className="flex items-center gap-1">
                          <Calendar size={9} />
                          Delivered: {new Date(deliveredDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock size={9} />
                          Due by: {new Date(new Date(deliveredDate).getTime() + o.paymentDays * 86400000).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="text-right shrink-0">
                    <div className="flex items-center gap-0.5 justify-end">
                      <IndianRupee size={11} className="text-slate-600" />
                      <span className="font-black text-sm text-slate-800">{remaining.toLocaleString()}</span>
                    </div>
                    {hasPartialPayment ? (
                      <p className="text-[9px] text-emerald-600 font-bold mt-0.5">
                        ₹{(o.amountPaid || 0).toLocaleString()} paid of ₹{orderTotal.toLocaleString()}
                      </p>
                    ) : (
                      <div className="flex items-center gap-1 justify-end mt-0.5">
                        <Clock size={9} className="text-slate-400" />
                        <span className="text-[9px] text-slate-400">
                          {new Date(deliveredDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                        </span>
                      </div>
                    )}
                  </div>

                  {isAdmin && (
                    <button
                      onClick={() => { setConfirmId(o._id); setAmount(String(remaining)); setNote(''); }}
                      className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-[10px] font-bold hover:bg-emerald-700 transition-all shadow-sm"
                    >
                      <CheckCircle size={12} /> Record Payment
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* See All footer */}
        {!loading && hasMore && (
          <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between bg-slate-50/40">
            <span className="text-[11px] text-slate-400">
              Showing {DASHBOARD_LIMIT} of {orders.length} overdue orders
            </span>
            <button
              onClick={onSeeAll}
              className="flex items-center gap-1.5 text-rose-600 font-bold text-xs hover:text-rose-700 transition-colors"
            >
              See All <ArrowRight size={13} />
            </button>
          </div>
        )}
      </div>

      {/* Record Payment modal */}
      {confirmId && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-start mb-4">
              <div className="p-2.5 bg-emerald-50 rounded-xl">
                <CheckCircle size={22} className="text-emerald-600" />
              </div>
              <button onClick={() => setConfirmId(null)} className="text-slate-400 hover:text-slate-600 p-1">
                <X size={18} />
              </button>
            </div>
            <h3 className="font-bold text-slate-900 mb-1">Record Payment</h3>
            <p className="text-sm text-slate-500 mb-4">
              {confirmOrder?.orderNumber} — {confirmOrder?.distributorName}
            </p>
            {confirmOrder && (confirmOrder.amountPaid || 0) > 0 && (
              <p className="text-[11px] text-emerald-600 font-bold mb-3">
                ₹{(confirmOrder.amountPaid || 0).toLocaleString()} already paid · ₹{confirmOrder.remainingAmount.toLocaleString()} remaining
              </p>
            )}
            <label className="block text-xs font-bold text-slate-700 mb-1.5">Amount received</label>
            <div className="relative mb-4">
              <IndianRupee size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="number"
                min={1}
                max={confirmOrder?.remainingAmount}
                placeholder="0"
                className="w-full pl-8 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500/20"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                autoFocus
              />
            </div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">Note <span className="font-normal text-slate-400">(optional)</span></label>
            <input
              type="text"
              placeholder="e.g. Cheque, NEFT, Cash..."
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500/20 mb-4"
              value={note}
              onChange={e => setNote(e.target.value)}
            />
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmId(null)}
                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleRecordPayment}
                disabled={marking}
                className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {marking ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default OverduePayments;
