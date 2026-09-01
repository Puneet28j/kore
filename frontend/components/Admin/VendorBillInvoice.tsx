import React, { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  Receipt,
  Search,
  Loader2,
  IndianRupee,
  X,
  Plus,
  CheckCircle,
  Wallet,
} from "lucide-react";
import { type Bill, billService } from "../../services/billService";
import { Article } from "../../types";
import BillDetails from "./BillDetails";

const PAYMENT_META: Record<string, { label: string; color: string }> = {
  UNPAID: { label: "Unpaid", color: "bg-rose-50 text-rose-700 border-rose-100" },
  PARTIAL: { label: "Partial", color: "bg-amber-50 text-amber-700 border-amber-100" },
  PAID: { label: "Paid", color: "bg-emerald-50 text-emerald-700 border-emerald-100" },
};

type StatusFilter = "ALL" | "PENDING" | "APPROVED" | "REJECTED";

const getTotalInvoiced = (bill: Bill): number => {
  if (bill.invoices && bill.invoices.length > 0) {
    return bill.invoices.reduce((s, inv) => s + (inv.invoiceAmount || 0), 0);
  }
  return bill.total || 0;
};

interface VendorBillInvoiceProps {
  articles: Article[];
}

const VendorBillInvoice: React.FC<VendorBillInvoiceProps> = ({ articles }) => {
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);

  const [invoiceModalBill, setInvoiceModalBill] = useState<Bill | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceAmount, setInvoiceAmount] = useState("");
  const [savingInvoice, setSavingInvoice] = useState(false);

  const [paymentModalBill, setPaymentModalBill] = useState<Bill | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [recording, setRecording] = useState(false);

  const fetchBills = useCallback(async () => {
    try {
      setLoading(true);
      const res = await billService.getBills({
        page: currentPage,
        limit: 20,
        q: searchTerm || undefined,
        billStatus: statusFilter === "ALL" ? undefined : statusFilter,
      });
      setBills(res.data);
      if (res.meta) setTotalPages(res.meta.totalPages || 1);
    } catch (err) {
      console.error("Failed to fetch vendor invoices", err);
      toast.error("Failed to load vendor invoices");
    } finally {
      setLoading(false);
    }
  }, [currentPage, searchTerm, statusFilter]);

  useEffect(() => {
    fetchBills();
  }, [fetchBills]);

  useEffect(() => {
    const handler = () => fetchBills();
    window.addEventListener("billRefetch", handler);
    return () => window.removeEventListener("billRefetch", handler);
  }, [fetchBills]);

  // Keep the open detail view's data in sync whenever the list refreshes
  // (e.g. after approve/reject/invoice/payment actions inside BillDetails).
  useEffect(() => {
    if (!selectedBill) return;
    const fresh = bills.find((b) => b.id === selectedBill.id);
    if (fresh) setSelectedBill(fresh);
  }, [bills, selectedBill]);

  const openInvoiceModal = (bill: Bill) => {
    setInvoiceModalBill(bill);
    setInvoiceNumber("");
    setInvoiceAmount("");
  };

  const handleSaveInvoice = async () => {
    if (!invoiceModalBill) return;
    const amt = Number(invoiceAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("Enter a valid invoice amount");
      return;
    }
    setSavingInvoice(true);
    try {
      await billService.addInvoice(invoiceModalBill.id, invoiceNumber.trim(), amt);
      toast.success("Invoice added");
      setInvoiceModalBill(null);
      fetchBills();
    } catch (err: any) {
      toast.error(err?.message || "Failed to save invoice details");
    } finally {
      setSavingInvoice(false);
    }
  };

  const openPaymentModal = (bill: Bill) => {
    const invoiceAmt = getTotalInvoiced(bill);
    const remaining = Math.max(0, invoiceAmt - (bill.amountPaid || 0));
    setPaymentModalBill(bill);
    setPaymentAmount(String(remaining));
    setPaymentNote("");
  };

  const handleRecordPayment = async () => {
    if (!paymentModalBill) return;
    const amt = Number(paymentAmount);
    const invoiceAmt = getTotalInvoiced(paymentModalBill);
    const remaining = Math.max(0, invoiceAmt - (paymentModalBill.amountPaid || 0));
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
      await billService.recordPayment(paymentModalBill.id, amt, paymentNote);
      toast.success("Payment recorded");
      setPaymentModalBill(null);
      fetchBills();
    } catch (err: any) {
      toast.error(err?.message || "Failed to record payment");
    } finally {
      setRecording(false);
    }
  };

  // Only APPROVED bills are real payables — a still-pending bill has no
  // confirmed invoice amount to count yet, regardless of which filter tab
  // is currently being viewed.
  const totals = bills
    .filter((b) => b.billStatus === "APPROVED")
    .reduce(
      (acc, b) => {
        const invoiceAmt = getTotalInvoiced(b);
        const paid = b.amountPaid || 0;
        acc.payable += invoiceAmt;
        acc.paid += paid;
        acc.outstanding += Math.max(0, invoiceAmt - paid);
        return acc;
      },
      { payable: 0, paid: 0, outstanding: 0 }
    );

  if (selectedBill) {
    return (
      <BillDetails
        bill={selectedBill}
        articles={articles}
        onBack={() => setSelectedBill(null)}
        onStatusChange={fetchBills}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-lg shadow-indigo-600/20">
          <Receipt size={22} />
        </div>
        <div className="flex flex-col">
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            Vendor Bill / Invoice
          </h2>
          <p className="text-slate-500 text-xs font-medium">
            Click any PO to view full details, approve/reject, and track vendor invoice + payment
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Payable</p>
          <p className="text-xl font-black text-slate-900 mt-1">₹{totals.payable.toLocaleString()}</p>
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
        <div className="p-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
          <div className="relative max-w-md flex-1 min-w-[220px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by PO number or vendor…"
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all text-sm font-medium text-slate-700"
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            />
          </div>
          <div className="flex items-center gap-1.5">
            {(["ALL", "APPROVED", "PENDING", "REJECTED"] as StatusFilter[]).map((s) => (
              <button
                key={s}
                onClick={() => { setStatusFilter(s); setCurrentPage(1); }}
                className={`px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all border ${
                  statusFilter === s
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                }`}
              >
                {s === "ALL" ? "All" : s === "APPROVED" ? "Payable" : s === "PENDING" ? "Pending Approval" : "Rejected"}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="py-20 text-center">
            <Loader2 size={32} className="animate-spin text-slate-400 mx-auto mb-4" />
            <p className="text-slate-400 font-semibold text-sm">Loading vendor invoices...</p>
          </div>
        ) : bills.length === 0 ? (
          <div className="py-20 text-center">
            <div className="inline-flex p-4 bg-slate-50 rounded-full mb-4">
              <Receipt size={32} className="text-slate-300" />
            </div>
            <p className="text-slate-400 font-semibold text-sm">
              {statusFilter === "PENDING"
                ? "No bills waiting for approval."
                : "No bills match this view."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[900px]">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3.5 text-[10px] font-bold text-indigo-600 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3.5 text-[10px] font-bold text-indigo-600 uppercase tracking-wider">PO Number</th>
                  <th className="px-6 py-3.5 text-[10px] font-bold text-indigo-600 uppercase tracking-wider">Vendor</th>
                  <th className="px-6 py-3.5 text-[10px] font-bold text-indigo-600 uppercase tracking-wider">Vendor Invoice(s)</th>
                  <th className="px-6 py-3.5 text-[10px] font-bold text-indigo-600 uppercase tracking-wider text-right">Invoice Amount</th>
                  <th className="px-6 py-3.5 text-[10px] font-bold text-indigo-600 uppercase tracking-wider text-right">Paid</th>
                  <th className="px-6 py-3.5 text-[10px] font-bold text-indigo-600 uppercase tracking-wider text-right">Remaining</th>
                  <th className="px-6 py-3.5 text-[10px] font-bold text-indigo-600 uppercase tracking-wider text-center">Bill Status</th>
                  <th className="px-6 py-3.5 text-[10px] font-bold text-indigo-600 uppercase tracking-wider text-center">Payment</th>
                  <th className="px-6 py-3.5 text-[10px] font-bold text-indigo-600 uppercase tracking-wider text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bills.map((bill) => {
                  const isApproved = bill.billStatus === "APPROVED";
                  const invoiceAmt = getTotalInvoiced(bill);
                  const paid = bill.amountPaid || 0;
                  const remaining = Math.max(0, invoiceAmt - paid);
                  const paymentStatus = bill.paymentStatus || "UNPAID";
                  const paymentMeta = PAYMENT_META[paymentStatus] || PAYMENT_META.UNPAID;
                  const invoices = bill.invoices || [];
                  return (
                    <tr
                      key={bill.id}
                      onClick={() => setSelectedBill(bill)}
                      className="hover:bg-indigo-50/40 transition-colors cursor-pointer"
                    >
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {new Date(bill.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                      </td>
                      <td className="px-6 py-4 text-sm font-bold text-slate-900">{bill.poNumber || "Pending Approval"}</td>
                      <td className="px-6 py-4 text-sm text-slate-700 font-medium">{bill.vendorName}</td>
                      {isApproved ? (
                        <>
                          <td className="px-6 py-4 text-sm text-slate-600">
                            {invoices.length === 0 ? (
                              <span className="text-slate-300 italic">not set</span>
                            ) : invoices.length === 1 ? (
                              invoices[0].invoiceNumber || <span className="text-slate-300 italic">unnumbered</span>
                            ) : (
                              <span className="font-semibold text-indigo-600">{invoices.length} invoices</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-sm font-bold text-slate-900 text-right">
                            ₹{invoiceAmt.toLocaleString("en-IN")}
                          </td>
                          <td className="px-6 py-4 text-sm font-bold text-emerald-700 text-right">
                            ₹{paid.toLocaleString("en-IN")}
                          </td>
                          <td className="px-6 py-4 text-sm font-bold text-rose-700 text-right">
                            ₹{remaining.toLocaleString("en-IN")}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border bg-emerald-50 text-emerald-700 border-emerald-100">
                              Approved
                            </span>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${paymentMeta.color}`}>
                              {paymentMeta.label}
                            </span>
                          </td>
                          <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => openInvoiceModal(bill)}
                                title="Add vendor invoice"
                                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-indigo-600 transition-colors"
                              >
                                <Plus size={14} />
                              </button>
                              {paymentStatus !== "PAID" && (
                                <button
                                  onClick={() => openPaymentModal(bill)}
                                  className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 text-white rounded-lg text-[10px] font-bold hover:bg-emerald-700 transition-all shadow-sm"
                                >
                                  <IndianRupee size={11} /> Pay
                                </button>
                              )}
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-6 py-4 text-sm text-slate-300 italic" colSpan={5}>
                            {bill.billStatus === "REJECTED"
                              ? bill.billRemark
                                ? `Rejected — ${bill.billRemark}`
                                : "Rejected"
                              : "Awaiting bill approval"}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span
                              className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${
                                bill.billStatus === "REJECTED"
                                  ? "bg-rose-50 text-rose-700 border-rose-100"
                                  : "bg-amber-50 text-amber-700 border-amber-100"
                              }`}
                            >
                              {bill.billStatus === "REJECTED" ? "Rejected" : "Pending"}
                            </span>
                          </td>
                          <td className="px-6 py-4" />
                        </>
                      )}
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

      {/* Add Invoice modal */}
      {invoiceModalBill && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-start mb-4">
              <div className="p-2.5 bg-indigo-50 rounded-xl">
                <Plus size={20} className="text-indigo-600" />
              </div>
              <button onClick={() => setInvoiceModalBill(null)} className="text-slate-400 hover:text-slate-600 p-1">
                <X size={18} />
              </button>
            </div>
            <h3 className="font-bold text-slate-900 mb-1">Add Vendor Invoice</h3>
            <p className="text-sm text-slate-500 mb-4">
              {invoiceModalBill.poNumber} — {invoiceModalBill.vendorName}
            </p>
            {(invoiceModalBill.invoices || []).length > 0 && (
              <div className="mb-4 rounded-xl border border-slate-100 bg-slate-50 divide-y divide-slate-200 max-h-32 overflow-y-auto">
                {(invoiceModalBill.invoices || []).map((inv, idx) => (
                  <div key={idx} className="flex items-center justify-between px-3 py-2 text-xs">
                    <span className="text-slate-600 font-medium">
                      {inv.invoiceNumber || <span className="italic text-slate-400">unnumbered</span>}
                    </span>
                    <span className="font-bold text-slate-800">₹{(inv.invoiceAmount || 0).toLocaleString("en-IN")}</span>
                  </div>
                ))}
              </div>
            )}
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Invoice Number <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <input
              type="text"
              placeholder="e.g. INV-2026-0142"
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 mb-4"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              autoFocus
            />
            <label className="block text-xs font-bold text-slate-700 mb-1.5">Invoice Amount</label>
            <div className="relative mb-4">
              <IndianRupee size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="number"
                min={0}
                className="w-full pl-8 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500/20"
                value={invoiceAmount}
                onChange={(e) => setInvoiceAmount(e.target.value)}
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setInvoiceModalBill(null)}
                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveInvoice}
                disabled={savingInvoice}
                className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {savingInvoice ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Record Payment modal */}
      {paymentModalBill && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-start mb-4">
              <div className="p-2.5 bg-emerald-50 rounded-xl">
                <Wallet size={20} className="text-emerald-600" />
              </div>
              <button onClick={() => setPaymentModalBill(null)} className="text-slate-400 hover:text-slate-600 p-1">
                <X size={18} />
              </button>
            </div>
            <h3 className="font-bold text-slate-900 mb-1">Record Payment to Vendor</h3>
            <p className="text-sm text-slate-500 mb-4">
              {paymentModalBill.poNumber} — {paymentModalBill.vendorName}
            </p>
            {(paymentModalBill.amountPaid || 0) > 0 && (
              <p className="text-[11px] text-emerald-600 font-bold mb-3">
                ₹{(paymentModalBill.amountPaid || 0).toLocaleString()} already paid
              </p>
            )}
            <label className="block text-xs font-bold text-slate-700 mb-1.5">Amount paid</label>
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
              placeholder="e.g. NEFT, Cheque..."
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500/20 mb-4"
              value={paymentNote}
              onChange={(e) => setPaymentNote(e.target.value)}
            />
            <div className="flex gap-3">
              <button
                onClick={() => setPaymentModalBill(null)}
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

export default VendorBillInvoice;
