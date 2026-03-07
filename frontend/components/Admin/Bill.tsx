import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  FileText,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
} from "lucide-react";
import { type Bill, billService } from "../../services/billService";
import BillDetails from "./BillDetails";

const Bill: React.FC = () => {
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);

  // Fetch bills on mount
  useEffect(() => {
    fetchBills();
  }, []);

  const fetchBills = async () => {
    try {
      setLoading(true);
      const res = await billService.getBills();
      setBills(res.data);
    } catch (err) {
      console.error("Failed to fetch bills", err);
      toast.error("Failed to load bills");
    } finally {
      setLoading(false);
    }
  };

  const filteredBills = bills.filter((bill) => {
    const q = searchTerm.toLowerCase().trim();
    if (!q) return true;
    return (
      bill.purchaseOrder.poNumber.toLowerCase().includes(q) ||
      bill.purchaseOrder.vendorName.toLowerCase().includes(q)
    );
  });

  if (selectedBill) {
    return (
      <BillDetails
        bill={selectedBill}
        onBack={() => {
          setSelectedBill(null);
          fetchBills();
        }}
        onStatusChange={() => {
          fetchBills();
          setSelectedBill(null);
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-emerald-600 text-white rounded-xl shadow-lg shadow-emerald-600/20">
          <FileText size={22} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            Bills
          </h2>
          <p className="text-slate-500 text-xs font-medium">
            Manage bill approvals and rejections
          </p>
        </div>
      </div>

      {/* Search & Table Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200">
        <div className="p-4 border-b border-slate-100">
          <div className="relative max-w-md">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              placeholder="Search by PO number or vendor…"
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-all text-sm font-medium text-slate-700"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <div className="py-20 text-center">
            <Loader2
              size={32}
              className="animate-spin text-slate-400 mx-auto mb-4"
            />
            <p className="text-slate-400 font-semibold text-sm">
              Loading bills...
            </p>
          </div>
        ) : filteredBills.length === 0 ? (
          <div className="py-20 text-center">
            <div className="inline-flex p-4 bg-slate-50 rounded-full mb-4">
              <FileText size={32} className="text-slate-300" />
            </div>
            <p className="text-slate-400 font-semibold text-sm">
              {bills.length === 0
                ? "No bills yet. Save a PO to create a bill."
                : "No bills match your search."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[800px]">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3.5 text-[10px] font-bold text-emerald-600 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3.5 text-[10px] font-bold text-emerald-600 uppercase tracking-wider">
                    PO Number
                  </th>
                  <th className="px-6 py-3.5 text-[10px] font-bold text-emerald-600 uppercase tracking-wider">
                    Vendor
                  </th>
                  <th className="px-6 py-3.5 text-[10px] font-bold text-emerald-600 uppercase tracking-wider text-right">
                    Total
                  </th>
                  <th className="px-6 py-3.5 text-[10px] font-bold text-emerald-600 uppercase tracking-wider text-center">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredBills.map((bill) => (
                  <tr
                    key={bill.id}
                    onClick={() => setSelectedBill(bill)}
                    className="hover:bg-emerald-50/50 transition-colors group cursor-pointer"
                  >
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {new Date(bill.purchaseOrder.date).toLocaleDateString(
                        "en-IN",
                        {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        }
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-bold text-slate-900 text-sm group-hover:text-emerald-600 transition-colors">
                        {bill.purchaseOrder.poNumber}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-700 font-medium">
                      {bill.purchaseOrder.vendorName}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-900 font-bold text-right">
                      ₹{bill.purchaseOrder.total.toLocaleString("en-IN")}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full ${
                          bill.billStatus === "APPROVED"
                            ? "text-emerald-700 bg-emerald-50"
                            : bill.billStatus === "REJECTED"
                            ? "text-rose-700 bg-rose-50"
                            : "text-amber-700 bg-amber-50"
                        }`}
                      >
                        {bill.billStatus === "APPROVED" ? (
                          <CheckCircle2 size={12} />
                        ) : bill.billStatus === "REJECTED" ? (
                          <XCircle size={12} />
                        ) : (
                          <Clock size={12} />
                        )}
                        {bill.billStatus}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Bill;
