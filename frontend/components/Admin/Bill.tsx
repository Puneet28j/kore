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
import { vendorService } from "../../services/vendorService";
import BillDetails from "./BillDetails";
import { exportPOToPDF, exportOrderToExcel } from "../../utils/exportPO";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const Bill: React.FC = () => {
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalBills, setTotalBills] = useState(0);

  // Fetch bills on mount and when search/page changes
  useEffect(() => {
    fetchBills();
  }, [currentPage, searchTerm]);

  const fetchBills = async () => {
    try {
      setLoading(true);
      const res = await billService.getBills({
        page: currentPage,
        limit: 20,
        q: searchTerm || undefined,
      });
      setBills(res.data);
      if (res.meta) {
        setTotalPages(res.meta.totalPages || 1);
        setTotalBills(res.meta.total || 0);
      }
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
      bill.poNumber.toLowerCase().includes(q) ||
      bill.vendorName.toLowerCase().includes(q)
    );
  });

  // helpers to export list view
  const exportListToExcel = (list: Bill[]) => {
    const rows: string[][] = [];
    rows.push(["Date", "PO Number", "Vendor", "Total", "Status", "Remark"]);
    list.forEach((b) => {
      rows.push([
        new Date(b.date).toLocaleDateString("en-IN"),
        b.poNumber,
        b.vendorName,
        b.total?.toString() || "",
        b.billStatus,
        b.billRemark || "",
      ]);
    });
    const csv = rows
      .map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bills-list.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportListToPDF = (list: Bill[]) => {
    const COMPANY_INFO = {
      name: "INNOVATIVE LIFESTYLE TECHNOLOGY PRIVATE LIMITED",
      cin: "U511909DL2020PTC3711873",
      gst: "07AAFC18644A1ZP",
      brand: "YOHO",
    };

    const doc = new jsPDF("portrait", "pt", "a4");

    // Title and company info
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Bills List Report", 40, 40);

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(COMPANY_INFO.name, 40, 60);
    doc.text(`GST: ${COMPANY_INFO.gst} | CIN: ${COMPANY_INFO.cin}`, 40, 72);

    // Summary info
    const dateFrom =
      list.length > 0
        ? new Date(list[list.length - 1].date).toLocaleDateString("en-IN")
        : "—";
    const dateTo =
      list.length > 0
        ? new Date(list[0].date).toLocaleDateString("en-IN")
        : "—";
    const totalAmount = list.reduce((sum, b) => sum + (b.total || 0), 0);

    doc.setFont("helvetica", "bold");
    doc.text(`Period: ${dateFrom} to ${dateTo}`, 40, 90);
    doc.text(`Total Bills: ${list.length}`, 40, 102);
    doc.text(
      `Total Amount: ₹${totalAmount.toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`,
      40,
      114
    );

    // Table
    const body = list.map((b) => [
      new Date(b.date).toLocaleDateString("en-IN"),
      b.poNumber,
      b.vendorName,
      b.total?.toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }) || "",
      b.billStatus,
      b.billRemark || "—",
    ]);

    autoTable(doc, {
      startY: 130,
      margin: { left: 40, right: 40 },
      head: [
        ["Date", "Bill Number", "Vendor", "Total Amount", "Status", "Remark"],
      ],
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
        0: { cellWidth: 50 },
        1: { cellWidth: 60 },
        2: { cellWidth: 80 },
        3: { cellWidth: 70, halign: "right" },
        4: { cellWidth: 50, halign: "center" },
        5: { cellWidth: "auto" },
      },
    });

    doc.save("bills-list.pdf");
  };

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
        <div className="flex flex-col">
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            Bills
          </h2>
          <p className="text-slate-500 text-xs font-medium">
            Manage bill approvals and rejections
          </p>
        </div>
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => exportListToPDF(filteredBills)}
            className="flex items-center gap-1 px-3 py-1 bg-emerald-50 text-emerald-600 rounded-xl text-xs font-semibold hover:bg-emerald-100 transition-all"
          >
            <FileText size={14} /> List PDF
          </button>
          <button
            onClick={() => exportListToExcel(filteredBills)}
            className="flex items-center gap-1 px-3 py-1 bg-emerald-50 text-emerald-600 rounded-xl text-xs font-semibold hover:bg-emerald-100 transition-all"
          >
            XLS
          </button>
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
                  <th className="px-6 py-3.5 text-[10px] font-bold text-emerald-600 uppercase tracking-wider text-center">
                    Export
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
                      {new Date(bill.date).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        <span className="font-bold text-slate-900 text-sm group-hover:text-emerald-600 transition-colors">
                          {bill.poNumber}
                        </span>
                        {bill.isRevised && (
                          <span className="inline-flex items-center w-fit px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-700 border border-indigo-200 uppercase tracking-tight">
                            Revised {bill.revisionCount ? `(v${bill.revisionCount})` : ""}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-700 font-medium">
                      {bill.vendorName}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-900 font-bold text-right">
                      ₹{bill.total.toLocaleString("en-IN")}
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
                    <td
                      className="px-6 py-4 text-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex gap-1 justify-center">
                        <button
                          onClick={async () => {
                            let v;
                            try {
                              const res = await vendorService.getVendor(
                                bill.vendorId
                              );
                              v = res.data;
                            } catch {
                              v = undefined;
                            }
                            exportPOToPDF(bill, v, { isBill: true });
                          }}
                          className="p-2 text-emerald-600 hover:bg-emerald-100 rounded-xl transition-all inline-flex items-center gap-1 font-semibold text-xs"
                          title="Download PDF"
                        >
                          <FileText size={16} />
                          PDF
                        </button>
                        <button
                          onClick={async () => {
                            let v;
                            try {
                              const res = await vendorService.getVendor(
                                bill.vendorId
                              );
                              v = res.data;
                            } catch {
                              v = undefined;
                            }
                            exportOrderToExcel(bill, v);
                          }}
                          className="p-2 text-emerald-600 hover:bg-emerald-100 rounded-xl transition-all inline-flex items-center gap-1 font-semibold text-xs"
                          title="Download Excel"
                        >
                          XLS
                        </button>
                      </div>
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
