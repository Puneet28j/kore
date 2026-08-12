import React, { useState } from "react";
import {
  Receipt,
  AlertTriangle,
  FileText,
  IndianRupee,
  TrendingDown,
} from "lucide-react";
import Bill from "./Bill";
import OverduePayments from "../shared/OverduePayments";

type ActiveTab = "bills" | "overdue";

const AccountantPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>("bills");

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-rose-50 rounded-xl">
            <IndianRupee size={24} className="text-rose-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              Accounts & Finance
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Distributor invoice management · Overdue payment tracking
            </p>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-2 mt-5">
          <button
            onClick={() => setActiveTab("bills")}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${
              activeTab === "bills"
                ? "bg-slate-900 text-white shadow-sm"
                : "bg-slate-100 text-slate-500 hover:bg-slate-200"
            }`}
          >
            <FileText size={16} />
            Distributor Invoice
          </button>
          <button
            onClick={() => setActiveTab("overdue")}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${
              activeTab === "overdue"
                ? "bg-rose-600 text-white shadow-sm"
                : "bg-slate-100 text-slate-500 hover:bg-slate-200"
            }`}
          >
            <AlertTriangle size={16} />
            Overdue Payments
          </button>
        </div>
      </div>

      {/* Tab content */}
      {activeTab === "bills" && <Bill />}

      {activeTab === "overdue" && (
        <OverduePayments isAdmin={true} showAll={true} />
      )}
    </div>
  );
};

export default AccountantPage;
