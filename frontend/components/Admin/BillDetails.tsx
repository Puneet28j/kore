import React, { useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Loader2,
  Package,
  FileText,
  Clock,
  Send,
} from "lucide-react";
import { type Bill } from "../../services/billService";
import { billService } from "../../services/billService";

const labelClass =
  "block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2";
const inputClass =
  "w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-all font-medium text-slate-800 text-sm";

interface BillDetailsProps {
  bill: Bill;
  onBack: () => void;
  onStatusChange: () => void;
}

const BillDetails: React.FC<BillDetailsProps> = ({
  bill,
  onBack,
  onStatusChange,
}) => {
  const [remarks, setRemarks] = useState("");
  const [actionType, setActionType] = useState<"approve" | "reject" | "">("");
  const [actionLoading, setActionLoading] = useState(false);
  const po = bill.purchaseOrder;

  const handleApprove = async () => {
    setActionLoading(true);
    try {
      await billService.approveBill(bill.id, remarks);
      toast.success("Bill approved successfully!");
      setActionType("");
      setRemarks("");
      onStatusChange();
    } catch (err) {
      toast.error("Failed to approve bill");
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!remarks.trim()) {
      toast.error("Please provide rejection details");
      return;
    }

    setActionLoading(true);
    try {
      await billService.rejectBill(bill.id, remarks);
      toast.success("Bill rejected successfully!");
      setActionType("");
      setRemarks("");
      onStatusChange();
    } catch (err) {
      toast.error("Failed to reject bill");
    } finally {
      setActionLoading(false);
    }
  };

  const statusColor = {
    PENDING: "bg-amber-50 border-amber-200 text-amber-700",
    APPROVED: "bg-emerald-50 border-emerald-200 text-emerald-700",
    REJECTED: "bg-red-50 border-red-200 text-red-700",
  };

  const statusIcon = {
    PENDING: <Clock className="w-4 h-4" />,
    APPROVED: <CheckCircle2 className="w-4 h-4" />,
    REJECTED: <XCircle className="w-4 h-4" />,
  };

  return (
    <div className="w-full space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 hover:bg-slate-100 rounded-xl transition-all text-slate-500"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="p-2.5 bg-emerald-600 text-white rounded-xl shadow-lg shadow-emerald-600/20">
            <FileText size={22} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">
              Bill - {po.poNumber}
            </h2>
            <p className="text-slate-500 text-xs font-medium">
              Review and approve or reject this bill
            </p>
          </div>
        </div>

        <div
          className={`px-4 py-2 rounded-lg border flex items-center gap-2 ${
            statusColor[bill.billStatus]
          }`}
        >
          {statusIcon[bill.billStatus]}
          {bill.billStatus}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200">
        {/* PO Details Section */}
        <div className="p-6 md:p-8 border-b border-slate-100 space-y-6">
          {/* Row 1: PO Number, Reference, Date, Delivery Date */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className={labelClass}>PO Number</label>
              <div className={`${inputClass} bg-white cursor-text`}>
                {po.poNumber}
              </div>
            </div>
            <div>
              <label className={labelClass}>Reference Number</label>
              <div className={`${inputClass} bg-white cursor-text`}>
                {po.referenceNumber || "—"}
              </div>
            </div>
            <div>
              <label className={labelClass}>PO Date</label>
              <div className={`${inputClass} bg-white cursor-text`}>
                {new Date(po.date).toLocaleDateString("en-IN", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </div>
            </div>
            <div>
              <label className={labelClass}>Delivery Date</label>
              <div className={`${inputClass} bg-white cursor-text`}>
                {po.deliveryDate
                  ? new Date(po.deliveryDate).toLocaleDateString("en-IN", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })
                  : "—"}
              </div>
            </div>
          </div>

          {/* Row 2: Vendor, Payment Terms, Shipment */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Vendor Name</label>
              <div className={`${inputClass} bg-white cursor-text`}>
                {po.vendorName}
              </div>
            </div>
            <div>
              <label className={labelClass}>Payment Terms</label>
              <div className={`${inputClass} bg-white cursor-text`}>
                {po.paymentTerms || "—"}
              </div>
            </div>
            <div>
              <label className={labelClass}>Shipment Preference</label>
              <div className={`${inputClass} bg-white cursor-text`}>
                {po.shipmentPreference || "—"}
              </div>
            </div>
          </div>
        </div>

        {/* Item Table */}
        <div className="p-6 md:p-8 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-4">
            <Package size={16} className="text-emerald-500" />
            Item Table
          </h3>

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left min-w-[1100px]">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-3 text-[10px] font-bold text-emerald-600 uppercase tracking-wider w-[200px]">
                    Item Details
                  </th>
                  <th className="px-2 py-3 text-[10px] font-bold text-emerald-600 uppercase tracking-wider w-[50px]">
                    Image
                  </th>
                  <th className="px-2 py-3 text-[10px] font-bold text-emerald-600 uppercase tracking-wider">
                    Tax Code
                  </th>
                  <th className="px-2 py-3 text-[10px] font-bold text-emerald-600 uppercase tracking-wider w-[70px]">
                    Qty
                  </th>
                  <th className="px-2 py-3 text-[10px] font-bold text-emerald-600 uppercase tracking-wider w-[70px]">
                    Tax Rate %
                  </th>
                  <th className="px-2 py-3 text-[10px] font-bold text-emerald-600 uppercase tracking-wider text-right">
                    MRP (₹)
                  </th>
                  <th className="px-2 py-3 text-[10px] font-bold text-emerald-600 uppercase tracking-wider text-right">
                    Unit Price (₹)
                  </th>
                  <th className="px-2 py-3 text-[10px] font-bold text-emerald-600 uppercase tracking-wider text-right">
                    Tax/Item
                  </th>
                  <th className="px-2 py-3 text-[10px] font-bold text-emerald-600 uppercase tracking-wider text-right">
                    Unit Total
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {po.items.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-slate-50/50 transition-colors"
                  >
                    {/* Item Details */}
                    <td className="px-3 py-3">
                      <div className="text-sm">
                        <p className="font-semibold text-slate-900">
                          {item.itemName || "—"}
                        </p>
                        {/* <p className="text-[10px] text-slate-500 mt-1">
                          SKU: {item.sku || "—"}
                        </p> */}
                        <p className="text-[10px] text-slate-500">
                          Brand: {item.skuCompany || "—"}
                        </p>
                      </div>
                    </td>

                    {/* Image */}
                    <td className="px-2 py-3">
                      {item.image ? (
                        <img
                          src={item.image}
                          alt={item.itemName}
                          className="w-10 h-10 rounded-lg object-cover border border-slate-200"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center">
                          <Package size={14} className="text-slate-400" />
                        </div>
                      )}
                    </td>

                    {/* Tax Code */}
                    <td className="px-2 py-3 text-sm text-slate-700">
                      {item.itemTaxCode || "—"}
                    </td>

                    {/* Quantity */}
                    <td className="px-2 py-3 text-center">
                      <div className="text-sm font-semibold text-slate-900">
                        {item.quantity}
                      </div>
                    </td>

                    {/* Tax Rate */}
                    <td className="px-2 py-3 text-center">
                      <div className="text-sm font-semibold text-slate-900">
                        {item.taxRate}%
                      </div>
                    </td>

                    {/* MRP */}
                    <td className="px-2 py-3 text-right">
                      <div className="text-sm font-semibold text-slate-900">
                        ₹{item.mrp?.toFixed(2) || "0.00"}
                      </div>
                    </td>

                    {/* Unit Price */}
                    <td className="px-2 py-3 text-right">
                      <div className="text-sm font-semibold text-slate-900">
                        ₹{item.basePrice?.toFixed(2) || "0.00"}
                      </div>
                    </td>

                    {/* Tax Per Item */}
                    <td className="px-2 py-3 text-right">
                      <div className="text-sm font-semibold text-slate-900">
                        ₹{item.taxPerItem?.toFixed(2) || "0.00"}
                      </div>
                    </td>

                    {/* Unit Total */}
                    <td className="px-2 py-3 text-right">
                      <div className="text-sm font-bold text-slate-900">
                        ₹{item.unitTotal?.toFixed(2) || "0.00"}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Summary Section */}
        <div className="p-6 md:p-8 border-b border-slate-100">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Notes & Terms (Read-only) */}
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Notes</label>
                <div className={`${inputClass} bg-white resize-none`}>
                  {po.notes || "—"}
                </div>
              </div>
              <div>
                <label className={labelClass}>Terms & Conditions</label>
                <div className={`${inputClass} bg-white resize-none`}>
                  {po.termsAndConditions || "—"}
                </div>
              </div>
            </div>

            {/* Totals */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-3 self-start">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Sub Total</span>
                <span className="text-sm font-bold text-slate-900">
                  ₹{po.subTotal?.toFixed(2) || "0.00"}
                </span>
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-slate-600">
                  Discount ({po.discountPercent}%)
                </span>
                <span className="text-sm font-bold text-red-600">
                  -₹{po.discountAmount?.toFixed(2) || "0.00"}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Total Tax</span>
                <span className="text-sm font-bold text-slate-700">
                  ₹{po.totalTax?.toFixed(2) || "0.00"}
                </span>
              </div>

              <div className="border-t border-slate-200 pt-3 flex items-center justify-between">
                <span className="text-base font-bold text-slate-900">
                  Total
                </span>
                <span className="text-lg font-black text-emerald-600">
                  ₹{po.total?.toFixed(2) || "0.00"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Action Section */}
        {bill.billStatus === "PENDING" ? (
          <div className="p-6 md:p-8 border-b border-slate-100">
            <div className="max-w-2xl mx-auto space-y-4">
              <div>
                <label className={labelClass}>Select Action</label>
                <select
                  value={actionType}
                  onChange={(e) => {
                    setActionType(e.target.value as "approve" | "reject" | "");
                    setRemarks("");
                  }}
                  className={`${inputClass} bg-white`}
                >
                  <option value="">-- Choose Action --</option>
                  <option value="approve">Approve Bill</option>
                  <option value="reject">Reject Bill</option>
                </select>
              </div>

              {actionType && (
                <div
                  className={`p-4 rounded-xl border ${
                    actionType === "approve"
                      ? "bg-emerald-50 border-emerald-200"
                      : "bg-red-50 border-red-200"
                  }`}
                >
                  <label
                    className={`${labelClass} ${
                      actionType === "approve"
                        ? "text-emerald-700"
                        : "text-red-700"
                    }`}
                  >
                    {actionType === "approve" ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 inline mr-2" />
                        Approval Remarks
                      </>
                    ) : (
                      <>
                        <XCircle className="w-4 h-4 inline mr-2" />
                        Rejection Details
                      </>
                    )}
                  </label>
                  <textarea
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    placeholder={
                      actionType === "approve"
                        ? "Add approval remarks (optional)..."
                        : "Explain why you're rejecting (required)..."
                    }
                    rows={3}
                    className={`${inputClass} resize-none mb-4`}
                  />

                  <div className="flex gap-3">
                    <button
                      onClick={
                        actionType === "approve" ? handleApprove : handleReject
                      }
                      disabled={
                        actionLoading ||
                        (actionType === "reject" && !remarks.trim())
                      }
                      className={`flex-1 px-4 py-3 text-white font-bold rounded-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2 ${
                        actionType === "approve"
                          ? "bg-emerald-600 hover:bg-emerald-700"
                          : "bg-red-600 hover:bg-red-700"
                      }`}
                    >
                      {actionLoading ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : actionType === "approve" ? (
                        <CheckCircle2 size={16} />
                      ) : (
                        <XCircle size={16} />
                      )}
                      {actionType === "approve" ? "Approve" : "Reject"}
                    </button>

                    <button
                      onClick={() => {
                        setActionType("");
                        setRemarks("");
                      }}
                      disabled={actionLoading}
                      className="px-6 py-3 border border-slate-300 text-slate-700 font-bold rounded-lg hover:bg-slate-50 transition-all disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="p-6 md:p-8">
            {bill.billStatus === "APPROVED" && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <h4 className="font-bold text-emerald-900">Bill Approved</h4>
                </div>
                <p className="text-sm text-emerald-800 font-medium mb-2">
                  Remarks:
                </p>
                <p className="text-sm text-emerald-700 mb-3">
                  {bill.approvalRemarks}
                </p>
                {bill.approvedAt && (
                  <p className="text-xs text-emerald-600">
                    Approved on{" "}
                    {new Date(bill.approvedAt).toLocaleString("en-IN")}
                  </p>
                )}
              </div>
            )}

            {bill.billStatus === "REJECTED" && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <XCircle className="w-5 h-5 text-red-600" />
                  <h4 className="font-bold text-red-900">Bill Rejected</h4>
                </div>
                <p className="text-sm text-red-800 font-medium mb-2">
                  Remarks:
                </p>
                <p className="text-sm text-red-700 mb-3">
                  {bill.rejectionRemarks}
                </p>
                {bill.rejectedAt && (
                  <p className="text-xs text-red-600">
                    Rejected on{" "}
                    {new Date(bill.rejectedAt).toLocaleString("en-IN")}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="p-6 md:p-8 flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center justify-center gap-2 px-6 py-3 text-sm font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all"
          >
            Back to Bills
          </button>
        </div>
      </div>
    </div>
  );
};

export default BillDetails;
