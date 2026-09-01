import React, { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  FileText,
  Search,
  Loader2,
  IndianRupee,
  X,
  CheckCircle,
  Wallet,
  Download,
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { distributorOrderService } from "../../services/distributorOrderService";
import { orderService } from "../../services/orderService";
import { Order } from "../../types";

const PAYMENT_META: Record<string, { label: string; color: string }> = {
  PENDING: { label: "Pending", color: "bg-rose-50 text-rose-700 border-rose-100" },
  PARTIAL: { label: "Partial", color: "bg-amber-50 text-amber-700 border-amber-100" },
  PAID: { label: "Paid", color: "bg-emerald-50 text-emerald-700 border-emerald-100" },
};

interface DistributorInvoiceProps {
  onOpenOrder: (order: Order) => void;
}

const DistributorInvoice: React.FC<DistributorInvoiceProps> = ({ onOpenOrder }) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [paymentModalOrder, setPaymentModalOrder] = useState<Order | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [recording, setRecording] = useState(false);

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      const res = await distributorOrderService.getAllOrders({
        page: currentPage,
        limit: 20,
        q: searchTerm || undefined,
      });
      // A cancelled order was never fulfilled and nothing is owed on it —
      // it has no place in a payment ledger (matches the same exclusion
      // already applied to Activity Overview / credit-limit calculations).
      setOrders(res.items.filter((o) => o.status !== "CANCELLED"));
      setTotalPages(res.meta?.totalPages || 1);
    } catch (err) {
      console.error("Failed to fetch distributor invoices", err);
      toast.error("Failed to load distributor invoices");
    } finally {
      setLoading(false);
    }
  }, [currentPage, searchTerm]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    const handler = () => fetchOrders();
    window.addEventListener("orderUpdatedSocket", handler);
    return () => window.removeEventListener("orderUpdatedSocket", handler);
  }, [fetchOrders]);

  const openPaymentModal = (order: Order) => {
    const total = order.finalAmount || order.totalAmount || 0;
    const remaining = Math.max(0, total - (order.amountPaid || 0));
    setPaymentModalOrder(order);
    setPaymentAmount(String(remaining));
    setPaymentNote("");
  };

  const handleRecordPayment = async () => {
    if (!paymentModalOrder) return;
    const amt = Number(paymentAmount);
    const total = paymentModalOrder.finalAmount || paymentModalOrder.totalAmount || 0;
    const remaining = Math.max(0, total - (paymentModalOrder.amountPaid || 0));
    if (!amt || amt <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    if (amt > remaining) {
      toast.error(`Amount exceeds remaining balance (₹${remaining.toLocaleString()})`);
      return;
    }
    setRecording(true);
    try {
      await orderService.recordPayment(paymentModalOrder.id, amt, paymentNote);
      toast.success("Payment recorded — credit limit updated");
      setPaymentModalOrder(null);
      fetchOrders();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to record payment");
    } finally {
      setRecording(false);
    }
  };

  const exportListToPDF = () => {
    const COMPANY_INFO = {
      name: "INNOVATIVE LIFESTYLE TECHNOLOGY PRIVATE LIMITED",
      cin: "U511909DL2020PTC3711873",
      gst: "07AAFC18644A1ZP",
    };

    const doc = new jsPDF("portrait", "pt", "a4");

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Distributor Invoice — Payment Ledger", 40, 40);

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(COMPANY_INFO.name, 40, 60);
    doc.text(`GST: ${COMPANY_INFO.gst} | CIN: ${COMPANY_INFO.cin}`, 40, 72);

    doc.setFont("helvetica", "bold");
    doc.text(`Total Orders: ${orders.length}`, 40, 92);
    doc.text(`Total Value: Rs. ${totals.value.toLocaleString("en-IN")}`, 40, 104);
    doc.text(`Paid: Rs. ${totals.paid.toLocaleString("en-IN")}`, 40, 116);
    doc.text(`Outstanding: Rs. ${totals.outstanding.toLocaleString("en-IN")}`, 40, 128);

    const body = orders.map((o) => {
      const total = o.finalAmount || o.totalAmount || 0;
      const paid = o.amountPaid || 0;
      const remaining = Math.max(0, total - paid);
      return [
        o.date ? new Date(o.date).toLocaleDateString("en-IN") : "—",
        o.orderNumber ? `#${o.orderNumber}` : "—",
        o.distributorName || "",
        total.toLocaleString("en-IN"),
        paid.toLocaleString("en-IN"),
        remaining.toLocaleString("en-IN"),
        o.paymentStatus || "PENDING",
      ];
    });

    autoTable(doc, {
      startY: 144,
      margin: { left: 40, right: 40 },
      head: [["Date", "Order #", "Distributor", "Amount", "Paid", "Remaining", "Payment"]],
      body,
      theme: "grid",
      styles: {
        fontSize: 8,
        cellPadding: 4,
        textColor: [0, 0, 0],
        lineColor: [0, 0, 0],
        lineWidth: 0.5,
      },
      headStyles: {
        fillColor: [240, 245, 240],
        fontStyle: "bold",
        halign: "center",
      },
      columnStyles: {
        0: { cellWidth: 55 },
        1: { cellWidth: 60 },
        2: { cellWidth: 90 },
        3: { cellWidth: 70, halign: "right" },
        4: { cellWidth: 70, halign: "right" },
        5: { cellWidth: 70, halign: "right" },
        6: { cellWidth: "auto", halign: "center" },
      },
    });

    doc.save("distributor-invoice-list.pdf");
  };

  const totals = orders.reduce(
    (acc, o) => {
      const total = o.finalAmount || o.totalAmount || 0;
      const paid = o.amountPaid || 0;
      acc.value += total;
      acc.paid += paid;
      acc.outstanding += Math.max(0, total - paid);
      return acc;
    },
    { value: 0, paid: 0, outstanding: 0 }
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-emerald-600 text-white rounded-xl shadow-lg shadow-emerald-600/20">
          <FileText size={22} />
        </div>
        <div className="flex flex-col">
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            Distributor Invoice
          </h2>
          <p className="text-slate-500 text-xs font-medium">
            Every distributor order's payment ledger — record whatever comes in, credit limit updates automatically
          </p>
        </div>
        <button
          onClick={exportListToPDF}
          disabled={orders.length === 0}
          className="ml-auto flex items-center gap-1.5 px-3 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-xs font-semibold hover:bg-emerald-100 transition-all disabled:opacity-50"
        >
          <Download size={14} /> Download PDF
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Value</p>
          <p className="text-xl font-black text-slate-900 mt-1">₹{totals.value.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
          <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">Paid</p>
          <p className="text-xl font-black text-emerald-700 mt-1">₹{totals.paid.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
          <p className="text-[10px] font-bold text-rose-500 uppercase tracking-wider">Outstanding</p>
          <p className="text-xl font-black text-rose-700 mt-1">₹{totals.outstanding.toLocaleString()}</p>
        </div>
      </div>

      {/* Search & Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200">
        <div className="p-4 border-b border-slate-100">
          <div className="relative max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by order number or distributor…"
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-all text-sm font-medium text-slate-700"
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            />
          </div>
        </div>

        {loading ? (
          <div className="py-20 text-center">
            <Loader2 size={32} className="animate-spin text-slate-400 mx-auto mb-4" />
            <p className="text-slate-400 font-semibold text-sm">Loading distributor invoices...</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="py-20 text-center">
            <div className="inline-flex p-4 bg-slate-50 rounded-full mb-4">
              <FileText size={32} className="text-slate-300" />
            </div>
            <p className="text-slate-400 font-semibold text-sm">No orders match your search.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[900px]">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3.5 text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3.5 text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Order #</th>
                  <th className="px-6 py-3.5 text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Distributor</th>
                  <th className="px-6 py-3.5 text-[10px] font-bold text-emerald-600 uppercase tracking-wider text-right">Amount</th>
                  <th className="px-6 py-3.5 text-[10px] font-bold text-emerald-600 uppercase tracking-wider text-right">Paid</th>
                  <th className="px-6 py-3.5 text-[10px] font-bold text-emerald-600 uppercase tracking-wider text-right">Remaining</th>
                  <th className="px-6 py-3.5 text-[10px] font-bold text-emerald-600 uppercase tracking-wider text-center">Payment</th>
                  <th className="px-6 py-3.5 text-[10px] font-bold text-emerald-600 uppercase tracking-wider text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.map((order) => {
                  const total = order.finalAmount || order.totalAmount || 0;
                  const paid = order.amountPaid || 0;
                  const remaining = Math.max(0, total - paid);
                  const status = order.paymentStatus || "PENDING";
                  const meta = PAYMENT_META[status] || PAYMENT_META.PENDING;
                  return (
                    <tr
                      key={order.id}
                      onClick={() => onOpenOrder(order)}
                      className="hover:bg-emerald-50/40 transition-colors cursor-pointer"
                      title="Open order breakdown"
                    >
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {order.date ? new Date(order.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                      </td>
                      <td className="px-6 py-4 text-sm font-bold text-slate-900">
                        {order.orderNumber ? `#${order.orderNumber}` : "—"}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-700 font-medium">{order.distributorName}</td>
                      <td className="px-6 py-4 text-sm font-bold text-slate-900 text-right">
                        ₹{total.toLocaleString("en-IN")}
                      </td>
                      <td className="px-6 py-4 text-sm font-bold text-emerald-700 text-right">
                        ₹{paid.toLocaleString("en-IN")}
                      </td>
                      <td className="px-6 py-4 text-sm font-bold text-rose-700 text-right">
                        ₹{remaining.toLocaleString("en-IN")}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${meta.color}`}>
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                        {status !== "PAID" && order.status !== "CANCELLED" ? (
                          <button
                            onClick={() => openPaymentModal(order)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 text-white rounded-lg text-[10px] font-bold hover:bg-emerald-700 transition-all shadow-sm"
                          >
                            <IndianRupee size={11} /> Record Payment
                          </button>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-slate-100">
            <button
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-50 rounded-lg disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-xs text-slate-400 font-medium">Page {currentPage} of {totalPages}</span>
            <button
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-50 rounded-lg disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Record Payment modal */}
      {paymentModalOrder && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-start mb-4">
              <div className="p-2.5 bg-emerald-50 rounded-xl">
                <Wallet size={20} className="text-emerald-600" />
              </div>
              <button onClick={() => setPaymentModalOrder(null)} className="text-slate-400 hover:text-slate-600 p-1">
                <X size={18} />
              </button>
            </div>
            <h3 className="font-bold text-slate-900 mb-1">Record Payment</h3>
            <p className="text-sm text-slate-500 mb-4">
              {paymentModalOrder.orderNumber ? `#${paymentModalOrder.orderNumber}` : ""} — {paymentModalOrder.distributorName}
            </p>
            {(paymentModalOrder.amountPaid || 0) > 0 && (
              <p className="text-[11px] text-emerald-600 font-bold mb-3">
                ₹{(paymentModalOrder.amountPaid || 0).toLocaleString()} already paid
              </p>
            )}
            <label className="block text-xs font-bold text-slate-700 mb-1.5">Amount received</label>
            <div className="relative mb-4">
              <IndianRupee size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="number"
                min={1}
                className="w-full pl-8 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500/20"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                autoFocus
              />
            </div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Note <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Cheque, NEFT, Cash..."
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500/20 mb-4"
              value={paymentNote}
              onChange={(e) => setPaymentNote(e.target.value)}
            />
            <div className="flex gap-3">
              <button
                onClick={() => setPaymentModalOrder(null)}
                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleRecordPayment}
                disabled={recording}
                className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {recording ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DistributorInvoice;
