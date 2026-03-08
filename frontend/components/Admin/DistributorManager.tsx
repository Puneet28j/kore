import React, { useState, useEffect } from "react";
import { User, UserRole } from "../../types";
import {
  Users,
  Plus,
  Search,
  ChevronRight,
  ArrowLeft,
  Building2,
  Mail,
  Phone,
  FileText,
  CreditCard,
  MapPin,
  Percent,
  Wallet,
  Shield,
  AlertCircle,
  Loader,
  Trash2,
  Edit,
} from "lucide-react";
import Switch from "../ui/Switch";
import distributorService from "../../services/distributorService";

interface DistributorManagerProps {
  orders: any[]; // Used just for the list
}

type ViewState = "LIST" | "CREATE" | "DETAILS";

const DistributorManager: React.FC<DistributorManagerProps> = ({ orders }) => {
  // --- Draft Persistence ---
  const savedDraftStr = localStorage.getItem("kore_distributor_draft");
  const savedDraft = savedDraftStr ? JSON.parse(savedDraftStr) : null;

  const [view, setView] = useState<ViewState>(savedDraft?.view || "LIST");
  const [distributors, setDistributors] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [creatingLoading, setCreatingLoading] = useState(false);

  const [selectedDistributor, setSelectedDistributor] = useState<User | null>(
    savedDraft?.selectedDistributor || null
  );

  // --- Create/Edit Form State ---
  const [editingId, setEditingId] = useState<string | null>(
    savedDraft?.editingId || null
  );
  const [isCustomPayment, setIsCustomPayment] = useState(
    savedDraft?.isCustomPayment || false
  );
  const [formData, setFormData] = useState<Partial<User>>(
    savedDraft?.formData || {
      name: "",
      email: "",
      phone: "",
      companyName: "",
      gstNumber: "",
      billingAddress: "",
      shippingAddress: "",
      paymentTerms: "30 days",
      discountPercentage: 0,
      creditLimit: 0,
      loginEmail: "",
      loginPassword: "",
      loginEnabled: true,
    }
  );

  React.useEffect(() => {
    if (view !== "LIST") {
      localStorage.setItem(
        "kore_distributor_draft",
        JSON.stringify({
          view,
          selectedDistributor,
          editingId,
          isCustomPayment,
          formData,
        })
      );
    } else {
      localStorage.removeItem("kore_distributor_draft");
    }
  }, [view, selectedDistributor, editingId, isCustomPayment, formData]);

  // --- Fetch distributors on mount ---
  React.useEffect(() => {
    const fetchDistributors = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await distributorService.listDistributors({
          search: searchQuery || undefined,
        });
        setDistributors(response.items || []);
      } catch (err: any) {
        setError(err.message || "Failed to load distributors");
        console.error("Error fetching distributors:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchDistributors();
  }, [searchQuery]);

  const handleCreateDistributor = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      setCreatingLoading(true);
      setError(null);

      // Prepare payload
      const payload: Partial<User> = {
        name: formData.name || "",
        email: formData.email || "",
        phone: formData.phone || "",
        companyName: formData.companyName || "",
        gstNumber: formData.gstNumber || "",
        billingAddress: formData.billingAddress || "",
        shippingAddress: formData.shippingAddress || "",
        paymentTerms: formData.paymentTerms || "30 days",
        discountPercentage: Number(formData.discountPercentage) || 0,
        creditLimit: Number(formData.creditLimit) || 0,
        loginEmail: formData.loginEmail || "",
        loginPassword: formData.loginPassword || "",
        loginEnabled: formData.loginEnabled ?? true,
        isActive: true,
      };

      if (editingId) {
        // Update existing distributor
        await distributorService.updateDistributor(editingId, payload);
      } else {
        // Create new distributor
        await distributorService.createDistributor(payload);
      }

      // Refresh the list
      const response = await distributorService.listDistributors();
      setDistributors(response.items || []);

      setView("LIST");

      // Reset form
      setEditingId(null);
      setIsCustomPayment(false);
      setFormData({
        name: "",
        email: "",
        phone: "",
        companyName: "",
        gstNumber: "",
        billingAddress: "",
        shippingAddress: "",
        paymentTerms: "30 days",
        discountPercentage: 0,
        creditLimit: 0,
        loginEmail: "",
        loginPassword: "",
        loginEnabled: true,
      });
      localStorage.removeItem("kore_distributor_draft");
    } catch (err: any) {
      const errorMsg = err.message || "Failed to save distributor";
      setError(errorMsg);
      console.error("Error saving distributor:", err);
    } finally {
      setCreatingLoading(false);
    }
  };

  const handleLoginToggle = async (distributor: User, enabled: boolean) => {
    try {
      setError(null);
      await distributorService.updateDistributor(distributor.id, {
        loginEnabled: enabled,
      });

      // Update local state
      setDistributors((prev) =>
        prev.map((d) =>
          d.id === distributor.id ? { ...d, loginEnabled: enabled } : d
        )
      );
    } catch (err: any) {
      const errorMsg = err.message || "Failed to update login status";
      setError(errorMsg);
      console.error("Error toggling login:", err);
    }
  };

  const handleRowClick = (dist: User) => {
    setSelectedDistributor(dist);
    setView("DETAILS");
  };

  const handleEditDistributor = (dist: User) => {
    setSelectedDistributor(dist);
    setEditingId(dist.id);
    setFormData({
      name: dist.name,
      email: dist.email,
      phone: dist.phone,
      companyName: dist.companyName,
      gstNumber: dist.gstNumber,
      billingAddress: dist.billingAddress,
      shippingAddress: dist.shippingAddress,
      paymentTerms: dist.paymentTerms,
      discountPercentage: dist.discountPercentage,
      creditLimit: dist.creditLimit,
      loginEmail: dist.loginEmail,
      loginPassword: dist.loginPassword,
      loginEnabled: dist.loginEnabled,
    });
    setView("CREATE");
  };

  const handleDeleteDistributor = async (id: string) => {
    if (window.confirm("Are you sure you want to delete this distributor?")) {
      try {
        setError(null);
        await distributorService.deleteDistributor(id);

        // Refresh the list
        const response = await distributorService.listDistributors();
        setDistributors(response.items || []);

        if (selectedDistributor?.id === id) {
          setSelectedDistributor(null);
          setView("LIST");
        }
      } catch (err: any) {
        const errorMsg = err.message || "Failed to delete distributor";
        setError(errorMsg);
        console.error("Error deleting distributor:", err);
      }
    }
  };

  if (view === "CREATE") {
    return (
      <div className="space-y-6 max-w-full mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => {
              setView("LIST");
              setEditingId(null);
              setIsCustomPayment(false);
              setFormData({
                name: "",
                email: "",
                phone: "",
                companyName: "",
                gstNumber: "",
                billingAddress: "",
                shippingAddress: "",
                paymentTerms: "30 days",
                discountPercentage: 0,
                creditLimit: 0,
                loginEmail: "",
                loginPassword: "",
                loginEnabled: true,
              });
              localStorage.removeItem("kore_distributor_draft");
            }}
            className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              {editingId ? "Edit Distributor" : "Create Distributor"}
            </h2>
            <p className="text-sm text-slate-500">
              {editingId
                ? "Update existing partner details"
                : "Add a new partner to your distribution network"}
            </p>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle size={20} className="text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-900">{error}</p>
              <button
                type="button"
                onClick={() => setError(null)}
                className="text-sm text-red-600 hover:text-red-700 mt-1"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        <form
          onSubmit={handleCreateDistributor}
          className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden"
        >
          <div className="p-6 md:p-8 space-y-8">
            {/* Base Details */}
            <div>
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 border-b pb-2">
                Basic Information
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Field label="Contact Person Name" icon={<Users size={14} />}>
                  <input
                    type="text"
                    required
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                  />
                </Field>
                <Field label="Company Name" icon={<Building2 size={14} />}>
                  <input
                    type="text"
                    required
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none"
                    value={formData.companyName}
                    onChange={(e) =>
                      setFormData({ ...formData, companyName: e.target.value })
                    }
                  />
                </Field>
                <Field label="Email Address" icon={<Mail size={14} />}>
                  <input
                    type="email"
                    required
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none"
                    value={formData.email}
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                  />
                </Field>
                <Field label="Phone Number" icon={<Phone size={14} />}>
                  <input
                    type="tel"
                    required
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none"
                    value={formData.phone}
                    onChange={(e) =>
                      setFormData({ ...formData, phone: e.target.value })
                    }
                  />
                </Field>
                <Field label="GST Number" icon={<FileText size={14} />}>
                  <input
                    type="text"
                    required
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none uppercase"
                    value={formData.gstNumber}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        gstNumber: e.target.value.toUpperCase(),
                      })
                    }
                  />
                </Field>
              </div>
            </div>

            {/* Address Details */}
            <div>
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 border-b pb-2">
                Location
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Field label="Billing Address" icon={<MapPin size={14} />}>
                  <textarea
                    required
                    rows={3}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none resize-none"
                    value={formData.billingAddress}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        billingAddress: e.target.value,
                      })
                    }
                  />
                </Field>
                <Field label="Shipping Address" icon={<MapPin size={14} />}>
                  <textarea
                    required
                    rows={3}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none resize-none"
                    value={formData.shippingAddress}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        shippingAddress: e.target.value,
                      })
                    }
                  />
                </Field>
              </div>
            </div>

            {/* Financial Details */}
            <div>
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 border-b pb-2">
                Financial Setup
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Field label="Payment Terms" icon={<CreditCard size={14} />}>
                  <div className="flex gap-2">
                    <select
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none"
                      value={isCustomPayment ? "Custom" : formData.paymentTerms}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "Custom") {
                          setIsCustomPayment(true);
                          setFormData({ ...formData, paymentTerms: "" }); // clear for custom input
                        } else {
                          setIsCustomPayment(false);
                          setFormData({ ...formData, paymentTerms: val });
                        }
                      }}
                    >
                      <option value="30 days">30 Days</option>
                      <option value="45 days">45 Days</option>
                      <option value="90 days">90 Days</option>
                      <option value="Custom">Custom</option>
                    </select>
                    {isCustomPayment && (
                      <input
                        type="text"
                        placeholder="e.g. 60 days net"
                        required
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none"
                        value={formData.paymentTerms}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            paymentTerms: e.target.value,
                          })
                        }
                      />
                    )}
                  </div>
                </Field>
                <Field
                  label="Discount % (Optional)"
                  icon={<Percent size={14} />}
                >
                  <input
                    type="number"
                    min="0"
                    max="100"
                    placeholder="0"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none"
                    value={formData.discountPercentage || ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        discountPercentage: Number(e.target.value),
                      })
                    }
                  />
                </Field>
                <Field
                  label="Credit Limit (Optional)"
                  icon={<Wallet size={14} />}
                >
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    placeholder="0"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none"
                    value={formData.creditLimit || ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        creditLimit: Number(e.target.value),
                      })
                    }
                  />
                </Field>
              </div>
            </div>

            {/* Login Credentials */}
            <div>
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 border-b pb-2">
                Login Credentials
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Field label="Login Email" icon={<Mail size={14} />}>
                  <input
                    type="email"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none"
                    value={formData.loginEmail}
                    onChange={(e) =>
                      setFormData({ ...formData, loginEmail: e.target.value })
                    }
                  />
                </Field>
                <Field label="Login Password" icon={<Wallet size={14} />}>
                  <input
                    type="password"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none"
                    value={formData.loginPassword}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        loginPassword: e.target.value,
                      })
                    }
                  />
                </Field>
                <Field label="Enable Login Access" icon={<Shield size={14} />}>
                  <label className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      checked={formData.loginEnabled ?? true}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          loginEnabled: e.target.checked,
                        })
                      }
                      className="w-4 h-4 text-indigo-600 bg-slate-50 border-slate-300 rounded focus:ring-indigo-500 focus:ring-2"
                    />
                    <span className="text-sm text-slate-700">
                      Login access enabled
                    </span>
                  </label>
                </Field>
              </div>
            </div>
          </div>

          <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                setView("LIST");
                setEditingId(null);
                setIsCustomPayment(false);
                setFormData({
                  name: "",
                  email: "",
                  phone: "",
                  companyName: "",
                  gstNumber: "",
                  billingAddress: "",
                  shippingAddress: "",
                  paymentTerms: "30 days",
                  discountPercentage: 0,
                  creditLimit: 0,
                  loginEmail: "",
                  loginPassword: "",
                  loginEnabled: true,
                });
                localStorage.removeItem("kore_distributor_draft");
              }}
              className="px-6 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creatingLoading}
              className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-md shadow-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {creatingLoading ? (
                <>
                  <Loader size={16} className="animate-spin" />
                  Saving...
                </>
              ) : (
                <>{editingId ? "Update Distributor" : "Save Distributor"}</>
              )}
            </button>
          </div>
        </form>
      </div>
    );
  }

  if (view === "DETAILS" && selectedDistributor) {
    const d = selectedDistributor;
    return (
      <div className="space-y-6 max-w-full mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                setView("LIST");
                setSelectedDistributor(null);
                localStorage.removeItem("kore_distributor_draft");
              }}
              className="p-2 hover:bg-white rounded-lg text-slate-500 transition-colors border border-transparent hover:border-slate-200 shadow-sm"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <h2 className="text-2xl font-bold text-slate-900 leading-tight">
                {d.companyName}
              </h2>
              <div className="flex items-center gap-2 mt-1">
                <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded text-[10px] font-black uppercase tracking-wider">
                  Active Partner
                </span>
                <span className="text-xs text-slate-500 font-mono">{d.id}</span>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => handleEditDistributor(d)}
              className="px-4 py-2 bg-white text-slate-700 border border-slate-200 rounded-xl font-bold hover:bg-slate-50 transition-colors shadow-sm text-sm"
            >
              Edit
            </button>
            <button
              onClick={() => handleDeleteDistributor(d.id)}
              className="px-4 py-2 bg-red-50 text-red-700 border border-red-200 rounded-xl font-bold hover:bg-red-100 transition-colors shadow-sm text-sm"
            >
              Delete
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Quick Contact */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4">
                Contact Info
              </h3>

              <div className="space-y-4">
                <InfoRow
                  icon={<Users size={16} />}
                  label="Contact Person"
                  value={d.name}
                />
                <InfoRow
                  icon={<Mail size={16} />}
                  label="Email"
                  value={d.email}
                />
                <InfoRow
                  icon={<Phone size={16} />}
                  label="Phone"
                  value={d.phone || "—"}
                />
                <InfoRow
                  icon={<FileText size={16} />}
                  label="GSTIN"
                  value={d.gstNumber || "—"}
                  mono
                />
              </div>
            </div>

            {/* Login Credentials */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4">
                Login Credentials
              </h3>

              <div className="space-y-4">
                <InfoRow
                  icon={<Mail size={16} />}
                  label="Login Email"
                  value={d.loginEmail || "—"}
                />
                <InfoRow
                  icon={<Wallet size={16} />}
                  label="Login Password"
                  value={d.loginPassword ? "••••••••" : "—"}
                />
                <div className="flex items-center justify-between py-3 px-3 bg-slate-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Shield size={16} className="text-slate-400" />
                    <div>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        Status
                      </p>
                      <p className="text-sm font-medium text-slate-900">
                        {d.loginEnabled !== false ? "✓ Enabled" : "✗ Disabled"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Important Financial Settings block placed at the bottom-left specifically */}
            <div className="bg-indigo-600 text-white rounded-2xl shadow-md p-6 relative overflow-hidden">
              <div className="relative z-10">
                <h3 className="text-sm font-bold uppercase tracking-wider text-indigo-200 mb-6">
                  Financial Terms
                </h3>

                <div className="space-y-5">
                  <div>
                    <p className="text-indigo-200 text-xs font-medium mb-1 flex items-center gap-1.5">
                      <CreditCard size={14} /> Payment Terms
                    </p>
                    <p className="text-lg font-bold">
                      {d.paymentTerms || "30 days"}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-4 border-t border-indigo-500/50">
                    <div>
                      <p className="text-indigo-200 text-xs font-medium mb-1">
                        Discount Config
                      </p>
                      <p className="text-2xl font-black text-amber-300">
                        {d.discountPercentage || 0}%
                      </p>
                    </div>
                    <div>
                      <p className="text-indigo-200 text-xs font-medium mb-1">
                        Credit Limit
                      </p>
                      <p className="text-xl font-bold">
                        ₹{(d.creditLimit || 0).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="absolute -bottom-8 -right-8 opacity-10 blur-[1px]">
                <Wallet size={120} />
              </div>
            </div>
          </div>

          {/* Right Column: Addresses & Stats */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4">
                Addresses
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <h4 className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    <MapPin size={14} className="text-indigo-500" /> Billing
                    Address
                  </h4>
                  <p className="text-sm text-slate-800 whitespace-pre-wrap">
                    {d.billingAddress || "No billing address provided."}
                  </p>
                </div>

                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <h4 className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    <MapPin size={14} className="text-emerald-500" /> Shipping
                    Address
                  </h4>
                  <p className="text-sm text-slate-800 whitespace-pre-wrap">
                    {d.shippingAddress || "No shipping address provided."}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4">
                Activity Overview
              </h3>
              <div className="py-12 flex flex-col items-center justify-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <FileText className="text-slate-300 mb-2" size={32} />
                <p className="text-sm text-slate-500 font-medium">
                  No order history available for this distributor yet.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // default: LIST VIEW
  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle size={20} className="text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-red-900">{error}</p>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-sm text-red-600 hover:text-red-700 mt-1"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            size={18}
          />
          <input
            type="text"
            placeholder="Search distributors..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 shadow-sm"
          />
        </div>

        <button
          onClick={() => {
            setEditingId(null);
            setFormData({
              name: "",
              email: "",
              phone: "",
              companyName: "",
              gstNumber: "",
              billingAddress: "",
              shippingAddress: "",
              paymentTerms: "30 days",
              discountPercentage: 0,
              creditLimit: 0,
              loginEmail: "",
              loginPassword: "",
              loginEnabled: true,
            });
            setView("CREATE");
          }}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl font-bold hover:bg-indigo-700 transition shadow-sm"
        >
          <Plus size={18} />
          Create Distributor
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader size={32} className="animate-spin text-slate-400" />
            </div>
          ) : (
            <table className="w-full text-left">
              <thead className="bg-slate-50/80 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-widest">
                    Company & Contact
                  </th>
                  <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-widest">
                    Location
                  </th>
                  <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-widest">
                    Terms
                  </th>
                  <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-widest">
                    Login
                  </th>
                  <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-widest">
                    Total Orders
                  </th>
                  <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-widest text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {distributors.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-6 py-12 text-center text-slate-500 font-medium"
                    >
                      No distributors found. Click "Create Distributor" to add
                      one.
                    </td>
                  </tr>
                ) : (
                  distributors.map((dist) => {
                    const hasOrders = orders.filter(
                      (o) => o.distributorId === dist.id
                    ).length;

                    return (
                      <tr
                        key={dist.id}
                        onClick={() => handleRowClick(dist)}
                        className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                      >
                        <td className="px-6 py-4">
                          <p className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                            {dist.companyName || dist.name}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {dist.name} • {dist.phone || dist.email}
                          </p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-slate-700 font-medium">
                            {dist.location || "N/A"}
                          </p>
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 font-bold text-[10px] uppercase tracking-wider border border-slate-200">
                            {dist.paymentTerms || "30 DAYS"}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <Switch
                            checked={dist.loginEnabled !== false}
                            onCheckedChange={(checked) =>
                              handleLoginToggle(dist, checked)
                            }
                            className="scale-90"
                          />
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`w-2 h-2 rounded-full ${
                                hasOrders > 0
                                  ? "bg-emerald-500"
                                  : "bg-slate-300"
                              }`}
                            />
                            <span
                              className={`font-bold ${
                                hasOrders > 0
                                  ? "text-slate-900"
                                  : "text-slate-400"
                              }`}
                            >
                              {hasOrders}
                            </span>
                            <span className="text-xs text-slate-500">
                              Orders
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditDistributor(dist);
                              }}
                              className="text-slate-400 hover:text-blue-600 p-1.5 rounded-lg hover:bg-blue-50 transition-colors"
                              title="Edit"
                            >
                              <Edit size={18} />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteDistributor(dist.id);
                              }}
                              className="text-slate-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                              title="Delete"
                            >
                              <Trash2 size={18} />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRowClick(dist);
                              }}
                              className="text-slate-400 hover:text-indigo-600 p-1.5 rounded-lg hover:bg-indigo-50 transition-colors"
                              title="View Details"
                            >
                              <ChevronRight size={18} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default DistributorManager;

// --- Sub-components ---
const Field: React.FC<{
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}> = ({ label, icon, children }) => (
  <div className="space-y-1.5">
    <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-widest pl-1">
      {icon && <span className="text-slate-400">{icon}</span>}
      {label}
    </label>
    {children}
  </div>
);

const InfoRow: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
}> = ({ icon, label, value, mono }) => (
  <div className="flex gap-3">
    <div className="mt-0.5 text-slate-400">{icon}</div>
    <div>
      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <p
        className={`text-sm text-slate-800 font-medium ${
          mono ? "font-mono" : ""
        }`}
      >
        {value}
      </p>
    </div>
  </div>
);
