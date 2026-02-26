// src/components/Layout/Sidebar.tsx
import React from "react";
import {
  LayoutDashboard,
  Factory,
  FileText,
  ScanLine,
  Boxes,
  BookOpen,
  Database,
  ClipboardList,
  ShoppingCart,
  RotateCcw,
  Users,
  BarChart3,
  PackageCheck,
  Truck,
  FileBarChart,
  LogOut,
  Package,
  Menu,
  X,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
} from "lucide-react";

import { User, UserRole } from "../../types";

type SidebarProps = {
  user: User;
  activeTab: string;
  setActiveTab: (tab: string) => void;

  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;

  cartItemsCount: number;
  onLogout: () => void;

  // ✅ Desktop collapse
  isCollapsed: boolean;
  setIsCollapsed: (v: boolean) => void;
};

const Sidebar: React.FC<SidebarProps> = ({
  user,
  activeTab,
  setActiveTab,
  isSidebarOpen,
  setIsSidebarOpen,
  cartItemsCount,
  onLogout,
  isCollapsed,
  setIsCollapsed,
}) => {
  const [openGroups, setOpenGroups] = React.useState<Record<string, boolean>>({
    manufacturing: true,
    inventory: true,
    sales: true,
    partners: true,
    reports: true,
  });

  const go = (tab: string) => {
    setActiveTab(tab);
    setIsSidebarOpen(false);
  };

  const toggleGroup = (key: string) => {
    setOpenGroups((p) => ({ ...p, [key]: !p[key] }));
  };

  const GroupHeader: React.FC<{
    icon: React.ReactNode;
    label: string;
    groupKey: string;
  }> = ({ icon, label, groupKey }) => (
    <button
      onClick={() => toggleGroup(groupKey)}
      className={`w-full flex items-center justify-between rounded-xl text-xs font-bold uppercase tracking-wider text-slate-500 hover:bg-slate-50 transition ${
        isCollapsed ? "px-2 py-2" : "px-3 py-2"
      }`}
      title={isCollapsed ? label : undefined}
    >
      <span className="flex items-center gap-2">
        <span className="text-slate-400">{icon}</span>
        {!isCollapsed && label}
      </span>

      {!isCollapsed && (
        <ChevronDown
          size={16}
          className={`transition-transform ${
            openGroups[groupKey] ? "rotate-180" : "rotate-0"
          }`}
        />
      )}
    </button>
  );

  return (
    <>
      {/* Mobile Header */}
      <header className="md:hidden fixed top-0 left-0 right-0 flex items-center justify-between p-4 bg-white border-b border-slate-200 z-30 h-16">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-100">
            <Package className="text-white" size={18} />
          </div>
          <h1 className="font-bold text-lg tracking-tight">
            Kore <span className="text-indigo-600">Kollective</span>
          </h1>
        </div>

        <button
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
        >
          {isSidebarOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </header>

      {/* Backdrop Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-20 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 z-20 h-screen bg-white border-r border-slate-200
          flex flex-col overflow-y-auto transition-all duration-300 ease-in-out
          ${isCollapsed ? "w-20" : "w-64"}
          ${isSidebarOpen ? "translate-x-0 pt-16 md:pt-0" : "-translate-x-full md:translate-x-0"}
        `}
      >
        {/* ✅ Desktop Collapse Toggle Button (Right side center) */}
        <button
          type="button"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="hidden md:flex items-center justify-center
                     absolute top-1/2 -translate-y-1/2 -right-3
                     w-7 h-7 rounded-full bg-white border border-slate-200
                     shadow-sm hover:shadow-md transition"
          aria-label="Toggle sidebar"
          title="Toggle sidebar"
        >
          {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>

        <div className={`${isCollapsed ? "p-4" : "p-6"}`}>
          {/* Brand */}
          <div className={`flex items-center gap-2 ${isCollapsed ? "mb-4" : "mb-6"}`}>
            <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-100">
              <Package className="text-white" size={24} />
            </div>

            {!isCollapsed && (
              <h1 className="font-bold text-xl tracking-tight">
                Kore <span className="text-indigo-600">Kollective</span>
              </h1>
            )}
          </div>

          <nav className="space-y-1">
            {/* Dashboard */}
            <NavItem
              icon={<LayoutDashboard size={20} />}
              label="Dashboard"
              active={activeTab === "dashboard"}
              onClick={() => go("dashboard")}
              isCollapsed={isCollapsed}
            />

            {/* Admin menus only */}
            {user.role === UserRole.ADMIN ? (
              <>
                {/* Manufacturing */}
                <div className="pt-2">
                  <GroupHeader
                    icon={<Factory size={16} />}
                    label="Manufacturing"
                    groupKey="manufacturing"
                  />
                  {!isCollapsed && openGroups.manufacturing && (
                    <div className="mt-1 ml-2 space-y-1 border-l border-slate-100 pl-3">
                      <NavItem
                        icon={<FileText size={18} />}
                        label="PO"
                        active={activeTab === "po"}
                        onClick={() => go("po")}
                        compact
                        isCollapsed={isCollapsed}
                      />
                      <NavItem
                        icon={<ScanLine size={18} />}
                        label="GRN"
                        active={activeTab === "grn"}
                        onClick={() => go("grn")}
                        compact
                        isCollapsed={isCollapsed}
                      />
                    </div>
                  )}
                </div>

                {/* Inventory */}
                <div className="pt-2">
                  <GroupHeader
                    icon={<Boxes size={16} />}
                    label="Inventory"
                    groupKey="inventory"
                  />
                  {!isCollapsed && openGroups.inventory && (
                    <div className="mt-1 ml-2 space-y-1 border-l border-slate-100 pl-3">
                      <NavItem
                        icon={<BookOpen size={18} />}
                        label="Catalogue"
                        active={activeTab === "catalogue"}
                        onClick={() => go("catalogue")}
                        compact
                        isCollapsed={isCollapsed}
                      />
                      <NavItem
                        icon={<Database size={18} />}
                        label="Master Stock"
                        active={activeTab === "master_inventory"}
                        onClick={() => go("master_inventory")}
                        compact
                        isCollapsed={isCollapsed}
                      />
                      <NavItem
                        icon={<ClipboardList size={18} />}
                        label="Booking Status"
                        active={activeTab === "booking_inventory"}
                        onClick={() => go("booking_inventory")}
                        compact
                        isCollapsed={isCollapsed}
                      />
                    </div>
                  )}
                </div>

                {/* Sales */}
                <div className="pt-2">
                  <GroupHeader icon={<ShoppingCart size={16} />} label="Sales" groupKey="sales" />
                  {!isCollapsed && openGroups.sales && (
                    <div className="mt-1 ml-2 space-y-1 border-l border-slate-100 pl-3">
                      <NavItem
                        icon={<PackageCheck size={18} />}
                        label="Orders"
                        active={activeTab === "orders"}
                        onClick={() => go("orders")}
                        compact
                        isCollapsed={isCollapsed}
                      />
                      <NavItem
                        icon={<RotateCcw size={18} />}
                        label="Returns"
                        active={activeTab === "returns"}
                        onClick={() => go("returns")}
                        compact
                        isCollapsed={isCollapsed}
                      />
                    </div>
                  )}
                </div>

                {/* Partners */}
                <div className="pt-2">
                  <GroupHeader icon={<Users size={16} />} label="Partners" groupKey="partners" />
                  {!isCollapsed && openGroups.partners && (
                    <div className="mt-1 ml-2 space-y-1 border-l border-slate-100 pl-3">
                      <NavItem
                        icon={<Users size={18} />}
                        label="Distributors"
                        active={activeTab === "distributors"}
                        onClick={() => go("distributors")}
                        compact
                        isCollapsed={isCollapsed}
                      />
                    </div>
                  )}
                </div>

                {/* Reports */}
                <div className="pt-2">
                  <GroupHeader icon={<BarChart3 size={16} />} label="Reports" groupKey="reports" />
                  {!isCollapsed && openGroups.reports && (
                    <div className="mt-1 ml-2 space-y-1 border-l border-slate-100 pl-3">
                      <NavItem
                        icon={<FileBarChart size={18} />}
                        label="Stock Report"
                        active={activeTab === "report_stock"}
                        onClick={() => go("report_stock")}
                        compact
                        isCollapsed={isCollapsed}
                      />
                      <NavItem
                        icon={<Truck size={18} />}
                        label="Dispatch Report"
                        active={activeTab === "report_dispatch"}
                        onClick={() => go("report_dispatch")}
                        compact
                        isCollapsed={isCollapsed}
                      />
                      <NavItem
                        icon={<RotateCcw size={18} />}
                        label="Return Report"
                        active={activeTab === "report_return"}
                        onClick={() => go("report_return")}
                        compact
                        isCollapsed={isCollapsed}
                      />
                    </div>
                  )}
                </div>
              </>
            ) : (
              /* Distributor menus */
              <>
                <NavItem
                  icon={<BookOpen size={20} />}
                  label="Catalogue"
                  active={activeTab === "shop"}
                  onClick={() => go("shop")}
                  isCollapsed={isCollapsed}
                />
                <NavItem
                  icon={<ShoppingCart size={20} />}
                  label="My Cart"
                  active={activeTab === "cart"}
                  badge={cartItemsCount > 0 ? cartItemsCount : undefined}
                  onClick={() => go("cart")}
                  isCollapsed={isCollapsed}
                />
                <NavItem
                  icon={<Clock size={20} />}
                  label="Order History"
                  active={activeTab === "orders"}
                  onClick={() => go("orders")}
                  isCollapsed={isCollapsed}
                />
              </>
            )}
          </nav>
        </div>

        {/* Footer */}
        <div className={`mt-auto border-t border-slate-100 ${isCollapsed ? "p-4" : "p-6"}`}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center font-bold text-indigo-600 border border-indigo-100">
              {user.name.charAt(0)}
            </div>

            {!isCollapsed && (
              <div className="overflow-hidden">
                <p className="text-sm font-semibold truncate text-slate-900">{user.name}</p>
                <p className="text-xs text-slate-500 truncate capitalize">
                  {user.role.toLowerCase()}
                </p>
              </div>
            )}
          </div>

          <button
            onClick={onLogout}
            className={`flex items-center gap-2 text-sm text-red-600 hover:text-red-700 font-medium transition-colors w-full hover:bg-red-50 rounded-lg ${
              isCollapsed ? "p-2 justify-center" : "p-2"
            }`}
            title={isCollapsed ? "Logout" : undefined}
          >
            <LogOut size={18} />
            {!isCollapsed && "Logout"}
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;

/* ---------------- NavItem ---------------- */

const NavItem: React.FC<{
  icon: React.ReactNode;
  label: string;
  active: boolean;
  badge?: number;
  compact?: boolean;
  onClick: () => void;
  isCollapsed: boolean;
}> = ({ icon, label, active, badge, compact = false, onClick, isCollapsed }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center justify-between gap-3 rounded-xl font-medium transition-all ${
      compact ? "px-3 py-2 text-sm" : "px-4 py-3 text-sm"
    } ${
      active
        ? "bg-indigo-600 text-white shadow-lg shadow-indigo-100"
        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
    } ${isCollapsed ? "justify-center" : ""}`}
    title={isCollapsed ? label : undefined}
  >
    <div className={`flex items-center ${isCollapsed ? "gap-0" : "gap-3"}`}>
      {icon}
      {!isCollapsed && label}
    </div>

    {!isCollapsed && badge !== undefined && (
      <span
        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
          active ? "bg-white text-indigo-600" : "bg-indigo-600 text-white"
        }`}
      >
        {badge}
      </span>
    )}
  </button>
);