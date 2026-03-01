import React, { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import {
  FileText,
  Plus,
  Search,
  X,
  ArrowLeft,
  ChevronDown,
  Package,
  Trash2,
  Calendar,
  MapPin,
  CheckCircle2,
  Clock,
  Send,
  Save,
  Edit2,
} from "lucide-react";
import {
  Article,
  Vendor,
  PurchaseOrder,
  PurchaseOrderItem,
  POStatus,
} from "../../types";
import { poService } from "../../services/poService";
import { vendorService } from "../../services/vendorService";

// ─── Reusable styles ───────────────────────────────────
const inputClass =
  "w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all font-medium text-slate-800 text-sm";
const selectClass =
  "w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all font-medium text-slate-700 text-sm cursor-pointer";
const labelClass =
  "block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2";

// ─── Empty PO Item ─────────────────────────────────────
const emptyItem = (): PurchaseOrderItem => ({
  id: `poi-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  articleId: "",
  variantId: "",
  itemName: "",
  image: "",
  sku: "",
  skuCompany: "",
  itemTaxCode: "",
  quantity: 1,
  taxRate: 0,
  taxType: "GST",
  basePrice: 0,
  taxPerItem: 0,
  unitTotal: 0,
});

// ─── Generate PO Number ────────────────────────────────
const generatePONumber = (existingPOs: PurchaseOrder[]): string => {
  const maxNum = existingPOs.reduce((max, po) => {
    const match = po.poNumber.match(/PO-(\d+)/);
    return match ? Math.max(max, parseInt(match[1])) : max;
  }, 0);
  return `PO-${String(maxNum + 1).padStart(5, "0")}`;
};

// ─── Format date for input ─────────────────────────────
const todayStr = () => new Date().toISOString().split("T")[0];

interface POPageProps {
  articles: Article[];
}

// ═══════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════
const POPage: React.FC<POPageProps> = ({ articles }) => {
  // ── PO list from API ──
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [poRes, vendorRes] = await Promise.all([
        poService.listPOs(),
        vendorService.listVendors(),
      ]);
      setPurchaseOrders(poRes.data.map((p: any) => ({ ...p, id: p._id || p.id })));
      setVendors(vendorRes.data.map((v: any) => ({ ...v, id: v._id || v.id })));
    } catch (err) {
      console.error("Failed to fetch PO data", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // ── UI State ──
  const [view, setView] = useState<"list" | "form">("list");
  const [searchTerm, setSearchTerm] = useState("");
  const [editingPOId, setEditingPOId] = useState<string | null>(null);

  // ── Form State ──
  const [selectedVendorId, setSelectedVendorId] = useState("");
  const [vendorSearch, setVendorSearch] = useState("");
  const [showVendorDropdown, setShowVendorDropdown] = useState(false);
  const vendorDropdownRef = useRef<HTMLDivElement>(null);

  const [poNumber, setPONumber] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [poDate, setPODate] = useState(todayStr());
  const [deliveryDate, setDeliveryDate] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("Due on Receipt");
  const [shipmentPreference, setShipmentPreference] = useState("");
  const [notes, setNotes] = useState("");
  const [termsAndConditions, setTermsAndConditions] = useState("");
  const [items, setItems] = useState<PurchaseOrderItem[]>([emptyItem()]);
  const [discountPercent, setDiscountPercent] = useState(0);

  // ── Item picker state ──
  const [activeItemPickerIdx, setActiveItemPickerIdx] = useState<number | null>(
    null
  );
  const [pickerPos, setPickerPos] = useState({ top: 0, left: 0, width: 0, openUp: false });
  const [itemPickerSearch, setItemPickerSearch] = useState("");
  const itemPickerRef = useRef<HTMLDivElement>(null);

  // ── Click outside handlers ──
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        vendorDropdownRef.current &&
        !vendorDropdownRef.current.contains(e.target as Node)
      ) {
        setShowVendorDropdown(false);
      }
      if (
        itemPickerRef.current &&
        !itemPickerRef.current.contains(e.target as Node)
      ) {
        setActiveItemPickerIdx(null);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // ── Selected vendor object ──
  const selectedVendor = vendors.find((v) => v.id === selectedVendorId);

  // ── Filtered vendors for dropdown ──
  const filteredVendors = vendors.filter(
    (v) =>
      v.displayName.toLowerCase().includes(vendorSearch.toLowerCase()) ||
      v.companyName.toLowerCase().includes(vendorSearch.toLowerCase())
  );

  // ── Build flat item list from articles + variants ──
  const itemOptions = useMemo(() => {
    const list: {
      articleId: string;
      variantId: string;
      masterName: string;
      itemName: string;
      sku: string;
      brand: string;
      hsnCode: string;
      image: string;
      basePrice: number;
    }[] = [];

    articles.forEach((article) => {
      if (article.variants && article.variants.length > 0) {
        article.variants.forEach((variant) => {
          const baseItemName = variant.itemName || `${article.name} - ${variant.color}`;
          const variantSKUs = variant.sizeSkus || {};
          const sizes = Object.keys(variantSKUs);

          if (sizes.length > 0) {
            sizes.forEach((size) => {
              list.push({
                articleId: article.id,
                variantId: variant.id,
                masterName: article.name,
                itemName: `${baseItemName} - Size ${size}`,
                sku: variantSKUs[size],
                brand: article.brand || "",
                hsnCode: variant.hsnCode || article.sku, // Fallback to master sku or hsn if needed
                image: article.imageUrl || "",
                basePrice: variant.costPrice || variant.sellingPrice || article.pricePerPair || 0,
              });
            });
          } else {
            // Fallback if no sizes defined
            list.push({
              articleId: article.id,
              variantId: variant.id,
              masterName: article.name,
              itemName: baseItemName,
              sku: variant.sku || article.sku,
              brand: article.brand || "",
              hsnCode: variant.hsnCode || "",
              image: article.imageUrl || "",
              basePrice: variant.costPrice || variant.sellingPrice || article.pricePerPair || 0,
            });
          }
        });
      } else {
        list.push({
          articleId: article.id,
          variantId: "",
          masterName: article.name,
          itemName: article.name,
          sku: article.sku,
          brand: article.brand || "",
          hsnCode: "",
          image: article.imageUrl || "",
          basePrice: article.pricePerPair || 0,
        });
      }
    });

    return list;
  }, [articles]);

  // ── Grouped items for picker ──
  const groupedItems = useMemo(() => {
    const q = itemPickerSearch.toLowerCase().trim();
    const filtered = q
      ? itemOptions.filter(
          (it) =>
            it.itemName.toLowerCase().includes(q) ||
            it.sku.toLowerCase().includes(q) ||
            it.masterName.toLowerCase().includes(q)
        )
      : itemOptions;

    const groups: Record<
      string,
      typeof itemOptions
    > = {};
    filtered.forEach((item) => {
      if (!groups[item.masterName]) groups[item.masterName] = [];
      groups[item.masterName].push(item);
    });
    return groups;
  }, [itemOptions, itemPickerSearch]);

  // ── Computations ──
  const computeItem = (item: PurchaseOrderItem): PurchaseOrderItem => {
    const taxPerItem = (item.basePrice * item.taxRate) / 100;
    const unitTotal = (item.basePrice + taxPerItem) * item.quantity;
    return { ...item, taxPerItem: Math.round(taxPerItem * 100) / 100, unitTotal: Math.round(unitTotal * 100) / 100 };
  };

  const subTotal = items.reduce((sum, it) => sum + it.basePrice * it.quantity, 0);
  const discountAmount = Math.round((subTotal * discountPercent) / 100 * 100) / 100;
  const totalTax = items.reduce(
    (sum, it) => sum + it.taxPerItem * it.quantity,
    0
  );
  const total = Math.round((subTotal - discountAmount + totalTax) * 100) / 100;

  // ── Actions ──
  const resetForm = () => {
    setSelectedVendorId("");
    setVendorSearch("");
    setPONumber(generatePONumber(purchaseOrders));
    setReferenceNumber("");
    setPODate(todayStr());
    setDeliveryDate("");
    setPaymentTerms("Due on Receipt");
    setShipmentPreference("");
    setNotes("");
    setTermsAndConditions("");
    setItems([emptyItem()]);
    setDiscountPercent(0);
    setActiveItemPickerIdx(null);
    setItemPickerSearch("");
    setEditingPOId(null);
  };

  const openCreateForm = async () => {
    resetForm();
    try {
      const res = await poService.getNextPONumber();
      setPONumber(res.data.poNumber);
    } catch (err) {
      console.error("Failed to get next PO number", err);
      setPONumber(generatePONumber(purchaseOrders)); // fallback
    }
    setView("form");
  };

  const cancelForm = () => {
    setView("list");
    resetForm();
  };

  const handleEditPO = (po: PurchaseOrder) => {
    // Format dates correctly for <input type="date"> (YYYY-MM-DD)
    const formatDateForInput = (dateStr: string) => {
      if (!dateStr) return "";
      try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return "";
        return d.toISOString().split("T")[0];
      } catch (e) {
        return "";
      }
    };

    setSelectedVendorId(po.vendorId);
    setPONumber(po.poNumber);
    setReferenceNumber(po.referenceNumber || "");
    setPODate(formatDateForInput(po.date));
    setDeliveryDate(formatDateForInput(po.deliveryDate));
    setPaymentTerms(po.paymentTerms || "Due on Receipt");
    setShipmentPreference(po.shipmentPreference || "");
    setNotes(po.notes || "");
    setTermsAndConditions(po.termsAndConditions || "");
    setItems(po.items.map((it: any) => ({
      ...it,
      id: it.rowId || it._id || it.id || `poi-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    })));
    setDiscountPercent(po.discountPercent || 0);
    setEditingPOId(po.id);
    setView("form");
  };

  const addNewRow = () => {
    setItems((prev) => [...prev, emptyItem()]);
  };

  const removeRow = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  const updateItem = (
    id: string,
    field: keyof PurchaseOrderItem,
    value: any
  ) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it;
        const updated = { ...it, [field]: value };
        return computeItem(updated);
      })
    );
  };

  const toggleItemPicker = (idx: number, e: React.MouseEvent) => {
    if (activeItemPickerIdx === idx) {
      setActiveItemPickerIdx(null);
    } else {
      const rect = e.currentTarget.getBoundingClientRect();
      const windowHeight = window.innerHeight;
      const dropdownHeight = 320; // max-h-80 is 320px
      const spaceBelow = windowHeight - rect.bottom;
      const openUp = spaceBelow < dropdownHeight && rect.top > dropdownHeight;

      setPickerPos({
        top: rect.top + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width,
        openUp,
      });
      setActiveItemPickerIdx(idx);
      setItemPickerSearch("");
    }
  };

  const selectItemForRow = (
    rowId: string,
    option: (typeof itemOptions)[0]
  ) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== rowId) return it;
        return computeItem({
          ...it,
          articleId: option.articleId,
          variantId: option.variantId,
          itemName: option.itemName,
          sku: option.sku,
          skuCompany: option.brand,
          itemTaxCode: option.hsnCode,
          image: option.image,
          basePrice: option.basePrice,
        });
      })
    );
    setActiveItemPickerIdx(null);
    setItemPickerSearch("");
  };

  const savePO = async (status: POStatus) => {
    if (!selectedVendorId) return alert("Please select a vendor.");
    if (items.every((it) => !it.articleId))
      return alert("Please add at least one item.");

    const poData: Partial<PurchaseOrder> = {
      vendorId: selectedVendorId,
      vendorName: selectedVendor?.displayName || "",
      poNumber,
      referenceNumber,
      date: poDate,
      deliveryDate,
      paymentTerms,
      shipmentPreference,
      notes,
      termsAndConditions,
      items: items.filter((it) => it.articleId),
      subTotal,
      discountPercent,
      discountAmount,
      totalTax,
      total,
      status,
    };

    try {
      setLoading(true);
      if (editingPOId) {
        await poService.updatePO(editingPOId, poData);
        alert("Purchase Order Updated Successfully!");
      } else {
        await poService.createPO(poData);
        alert("Purchase Order Created Successfully!");
      }
      await fetchData();
      setView("list");
      resetForm();
    } catch (err: any) {
      alert(err.message || "Failed to save Purchase Order");
    } finally {
      setLoading(false);
    }
  };

  // ── Filtered PO list ──
  const filteredPOs = purchaseOrders.filter((po) => {
    const q = searchTerm.toLowerCase().trim();
    if (!q) return true;
    return (
      po.poNumber.toLowerCase().includes(q) ||
      po.vendorName.toLowerCase().includes(q)
    );
  });

  // ═══════════════════ RENDER ═══════════════════

  // ─── LIST VIEW ──────────────────────────
  if (view === "list") {
    return (
      <div className="w-full space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-lg shadow-indigo-600/20">
              <FileText size={22} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                Purchase Orders
              </h2>
              <p className="text-slate-500 text-xs font-medium">
                Manage your purchase orders and vendor transactions
              </p>
            </div>
          </div>

          <button
            onClick={openCreateForm}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-md shadow-indigo-600/20 hover:-translate-y-0.5"
          >
            <Plus size={18} />
            Create PO
          </button>
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
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all text-sm font-medium text-slate-700"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          {filteredPOs.length === 0 ? (
            <div className="py-20 text-center">
              <div className="inline-flex p-4 bg-slate-50 rounded-full mb-4">
                <FileText size={32} className="text-slate-300" />
              </div>
              <p className="text-slate-400 font-semibold text-sm">
                {purchaseOrders.length === 0
                  ? 'No purchase orders yet. Click "Create PO" to get started.'
                  : "No purchase orders match your search."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[800px]">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-3.5 text-[10px] font-bold text-indigo-600 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-3.5 text-[10px] font-bold text-indigo-600 uppercase tracking-wider">
                      PO Number
                    </th>
                    <th className="px-6 py-3.5 text-[10px] font-bold text-indigo-600 uppercase tracking-wider">
                      Vendor
                    </th>
                    <th className="px-6 py-3.5 text-[10px] font-bold text-indigo-600 uppercase tracking-wider text-right">
                      Total
                    </th>
                    <th className="px-6 py-3.5 text-[10px] font-bold text-indigo-600 uppercase tracking-wider text-right">
                      Status
                    </th>
                    <th className="px-6 py-3.5 text-[10px] font-bold text-indigo-600 uppercase tracking-wider text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredPOs.map((po) => (
                    <tr
                      key={po.id}
                      className="hover:bg-indigo-50/30 transition-colors"
                    >
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {new Date(po.date).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-bold text-slate-900 text-sm">
                          {po.poNumber}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-700 font-medium">
                        {po.vendorName}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-900 font-bold text-right">
                        ₹{po.total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span
                          className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full ${
                            po.status === "SENT"
                              ? "text-emerald-700 bg-emerald-50"
                              : "text-amber-700 bg-amber-50"
                          }`}
                        >
                          {po.status === "SENT" ? (
                            <CheckCircle2 size={12} />
                          ) : (
                            <Clock size={12} />
                          )}
                          {po.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => handleEditPO(po)}
                          className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                          title="Edit PO"
                        >
                          <Edit2 size={16} />
                        </button>
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
  }

  // ─── FORM VIEW ──────────────────────────
  return (
    <div className="w-full space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={cancelForm}
            className="p-2 hover:bg-slate-100 rounded-xl transition-all text-slate-500"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-lg shadow-indigo-600/20">
            <FileText size={22} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">
              {editingPOId ? "Edit Purchase Order" : "New Purchase Order"}
            </h2>
            <p className="text-slate-500 text-xs font-medium">
              Create a new purchase order for your vendor
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200">
        {/* ── Vendor Selection ── */}
        <div className="p-6 md:p-8 border-b border-slate-100">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Vendor Selector */}
            <div>
              <label className={labelClass}>
                Vendor Name <span className="text-rose-500">*</span>
              </label>
              <div className="relative" ref={vendorDropdownRef}>
                <div
                  className={`${inputClass} cursor-pointer flex items-center justify-between`}
                  onClick={() => setShowVendorDropdown(!showVendorDropdown)}
                >
                  <span
                    className={
                      selectedVendor ? "text-slate-800" : "text-slate-400"
                    }
                  >
                    {selectedVendor
                      ? selectedVendor.displayName
                      : "Select a Vendor"}
                  </span>
                  <ChevronDown
                    size={16}
                    className={`text-slate-400 transition-transform ${
                      showVendorDropdown ? "rotate-180" : ""
                    }`}
                  />
                </div>

                {showVendorDropdown && (
                  <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-64 overflow-hidden">
                    <div className="p-2 border-b border-slate-100">
                      <div className="relative">
                        <Search
                          size={14}
                          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                        />
                        <input
                          type="text"
                          placeholder="Search vendors…"
                          className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm"
                          value={vendorSearch}
                          onChange={(e) => setVendorSearch(e.target.value)}
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                    </div>
                    <div className="overflow-y-auto max-h-48">
                      {filteredVendors.length === 0 ? (
                        <div className="p-4 text-center text-sm text-slate-400">
                          No vendors found. Create one in the Vendors tab.
                        </div>
                      ) : (
                        filteredVendors.map((v) => (
                          <button
                            key={v.id}
                            type="button"
                            className={`w-full text-left px-4 py-3 text-sm hover:bg-indigo-50 transition-colors flex items-center gap-3 border-b border-slate-50 ${
                              selectedVendorId === v.id ? "bg-indigo-50" : ""
                            }`}
                            onClick={() => {
                              setSelectedVendorId(v.id);
                              setVendorSearch("");
                              setShowVendorDropdown(false);
                            }}
                          >
                            <div className="w-8 h-8 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-xs shrink-0">
                              {v.displayName.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-semibold text-slate-900">
                                {v.displayName}
                              </p>
                              {v.companyName && (
                                <p className="text-xs text-slate-400">
                                  {v.companyName}
                                </p>
                              )}
                            </div>
                            {selectedVendorId === v.id && (
                              <CheckCircle2
                                size={16}
                                className="ml-auto text-indigo-600"
                              />
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Vendor Addresses */}
              {selectedVendor && (
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Billing (Current) Address */}
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <div className="flex items-center gap-1.5 mb-2">
                      <MapPin size={12} className="text-indigo-500" />
                      <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">
                        Current Address
                      </span>
                    </div>
                    <div className="text-xs text-slate-600 space-y-0.5 leading-relaxed">
                      {selectedVendor.billingAddress.attention && (
                        <p className="font-semibold text-slate-800">
                          {selectedVendor.billingAddress.attention}
                        </p>
                      )}
                      {selectedVendor.billingAddress.address1 && (
                        <p>{selectedVendor.billingAddress.address1}</p>
                      )}
                      {selectedVendor.billingAddress.address2 && (
                        <p>{selectedVendor.billingAddress.address2}</p>
                      )}
                      <p>
                        {[
                          selectedVendor.billingAddress.city,
                          selectedVendor.billingAddress.state,
                          selectedVendor.billingAddress.pinCode,
                        ]
                          .filter(Boolean)
                          .join(", ")}
                      </p>
                      {selectedVendor.billingAddress.phone && (
                        <p className="text-slate-500">
                          📞 {selectedVendor.billingAddress.phone}
                        </p>
                      )}
                      {!selectedVendor.billingAddress.address1 &&
                        !selectedVendor.billingAddress.city && (
                          <p className="text-slate-400 italic">
                            No address on file
                          </p>
                        )}
                    </div>
                  </div>

                  {/* Shipping (Permanent) Address */}
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <div className="flex items-center gap-1.5 mb-2">
                      <MapPin size={12} className="text-emerald-500" />
                      <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">
                        Permanent Address
                      </span>
                    </div>
                    <div className="text-xs text-slate-600 space-y-0.5 leading-relaxed">
                      {selectedVendor.shippingAddress.attention && (
                        <p className="font-semibold text-slate-800">
                          {selectedVendor.shippingAddress.attention}
                        </p>
                      )}
                      {selectedVendor.shippingAddress.address1 && (
                        <p>{selectedVendor.shippingAddress.address1}</p>
                      )}
                      {selectedVendor.shippingAddress.address2 && (
                        <p>{selectedVendor.shippingAddress.address2}</p>
                      )}
                      <p>
                        {[
                          selectedVendor.shippingAddress.city,
                          selectedVendor.shippingAddress.state,
                          selectedVendor.shippingAddress.pinCode,
                        ]
                          .filter(Boolean)
                          .join(", ")}
                      </p>
                      {selectedVendor.shippingAddress.phone && (
                        <p className="text-slate-500">
                          📞 {selectedVendor.shippingAddress.phone}
                        </p>
                      )}
                      {!selectedVendor.shippingAddress.address1 &&
                        !selectedVendor.shippingAddress.city && (
                          <p className="text-slate-400 italic">
                            No address on file
                          </p>
                        )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* PO Header Fields - Right Column */}
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>
                    Purchase Order# <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    className={inputClass}
                    value={poNumber}
                    onChange={(e) => setPONumber(e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelClass}>Reference#</label>
                  <input
                    type="text"
                    className={inputClass}
                    placeholder="Optional"
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Date</label>
                  <div className="relative">
                    <Calendar
                      size={14}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      type="date"
                      className={`${inputClass} pl-9`}
                      value={poDate}
                      onChange={(e) => setPODate(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Delivery Date</label>
                  <div className="relative">
                    <Calendar
                      size={14}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      type="date"
                      className={`${inputClass} pl-9`}
                      value={deliveryDate}
                      onChange={(e) => setDeliveryDate(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Payment Terms</label>
                  <select
                    className={selectClass}
                    value={paymentTerms}
                    onChange={(e) => setPaymentTerms(e.target.value)}
                  >
                    <option>Due on Receipt</option>
                    <option>Net 15</option>
                    <option>Net 30</option>
                    <option>Net 45</option>
                    <option>Net 60</option>
                    <option>Due end of the month</option>
                    <option>Due end of next month</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Shipment Preference</label>
                  <input
                    type="text"
                    className={inputClass}
                    placeholder="e.g. Road Transport"
                    value={shipmentPreference}
                    onChange={(e) => setShipmentPreference(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Item Table ── */}
        <div className="p-6 md:p-8 border-b border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Package size={16} className="text-indigo-500" />
              Item Table
            </h3>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left min-w-[1100px]">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-3 text-[10px] font-bold text-indigo-600 uppercase tracking-wider w-[200px]">
                    Item Details
                  </th>
                  <th className="px-2 py-3 text-[10px] font-bold text-indigo-600 uppercase tracking-wider w-[50px]">
                    Image
                  </th>
                  <th className="px-2 py-3 text-[10px] font-bold text-indigo-600 uppercase tracking-wider">
                    SKU
                  </th>
                  <th className="px-2 py-3 text-[10px] font-bold text-indigo-600 uppercase tracking-wider">
                    SKU Company
                  </th>
                  <th className="px-2 py-3 text-[10px] font-bold text-indigo-600 uppercase tracking-wider">
                    Item Name
                  </th>
                  <th className="px-2 py-3 text-[10px] font-bold text-indigo-600 uppercase tracking-wider">
                    Tax Code
                  </th>
                  <th className="px-2 py-3 text-[10px] font-bold text-indigo-600 uppercase tracking-wider w-[70px]">
                    Qty
                  </th>
                  <th className="px-2 py-3 text-[10px] font-bold text-indigo-600 uppercase tracking-wider w-[70px]">
                    Tax Rate %
                  </th>
                  <th className="px-2 py-3 text-[10px] font-bold text-indigo-600 uppercase tracking-wider w-[80px]">
                    Tax Type
                  </th>
                  <th className="px-2 py-3 text-[10px] font-bold text-indigo-600 uppercase tracking-wider text-right">
                    Base Price
                  </th>
                  <th className="px-2 py-3 text-[10px] font-bold text-indigo-600 uppercase tracking-wider text-right">
                    Tax/Item
                  </th>
                  <th className="px-2 py-3 text-[10px] font-bold text-indigo-600 uppercase tracking-wider text-right">
                    Unit Total
                  </th>
                  <th className="px-2 py-3 w-[40px]" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item, idx) => (
                  <tr
                    key={item.id}
                    className="hover:bg-slate-50/50 transition-colors group"
                  >
                    {/* Item Details (Picker) */}
                    <td className="px-3 py-3 relative">
                      <div ref={activeItemPickerIdx === idx ? itemPickerRef : undefined}>
                        <button
                          type="button"
                          className={`w-full text-left px-3 py-2 border rounded-lg text-sm transition-all flex items-center justify-between ${
                            item.articleId
                              ? "border-slate-200 bg-white text-slate-800 font-medium"
                              : "border-dashed border-slate-300 bg-slate-50 text-slate-400"
                          }`}
                          onClick={(e) => toggleItemPicker(idx, e)}
                        >
                          <span className="truncate">
                            {item.itemName || "Click to select item..."}
                          </span>
                          <ChevronDown size={14} className="shrink-0 ml-1" />
                        </button>

                        {activeItemPickerIdx === idx && createPortal(
                          <div
                            ref={itemPickerRef}
                            style={{
                              position: "absolute",
                              top: pickerPos.openUp
                                ? pickerPos.top - 10
                                : pickerPos.top + 42,
                              left: pickerPos.left,
                              width: pickerPos.width * 2,
                              transform: pickerPos.openUp ? 'translateY(-100%)' : 'none',
                              zIndex: 9999,
                            }}
                            className="bg-white border border-slate-200 rounded-xl shadow-2xl max-h-80 overflow-hidden"
                          >
                            <div className="p-2 border-b border-slate-100">
                              <div className="relative">
                                <Search
                                  size={14}
                                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                                />
                                <input
                                  type="text"
                                  placeholder="Search items…"
                                  className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm"
                                  value={itemPickerSearch}
                                  onChange={(e) =>
                                    setItemPickerSearch(e.target.value)
                                  }
                                  autoFocus
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </div>
                            </div>
                            <div className="overflow-y-auto max-h-60">
                              {Object.keys(groupedItems).length === 0 ? (
                                <div className="p-4 text-center text-sm text-slate-400">
                                  No items found.
                                </div>
                              ) : (
                                Object.entries(groupedItems).map(
                                  ([masterName, variants]) => (
                                    <div key={masterName}>
                                      <div className="px-3 py-2 bg-slate-50 border-b border-slate-100">
                                        <span className="text-[10px] font-black text-indigo-600 uppercase tracking-wider">
                                          {masterName}
                                        </span>
                                      </div>
                                      {variants.map((option) => (
                                        <button
                                          key={`${option.articleId}-${option.variantId}`}
                                          type="button"
                                          className="w-full text-left px-4 py-2.5 text-sm hover:bg-indigo-50 transition-colors flex items-center gap-3 border-b border-slate-50"
                                          onClick={() =>
                                            selectItemForRow(item.id, option)
                                          }
                                        >
                                          {option.image ? (
                                            <img
                                              src={option.image}
                                              className="w-8 h-8 rounded-lg object-cover border border-slate-200 shrink-0"
                                              alt=""
                                            />
                                          ) : (
                                            <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
                                              <Package
                                                size={14}
                                                className="text-slate-400"
                                              />
                                            </div>
                                          )}
                                          <div className="min-w-0">
                                            <p className="font-semibold text-slate-800 truncate">
                                              {option.itemName}
                                            </p>
                                            <p className="text-[10px] text-slate-400 font-mono">
                                              {option.sku}
                                              {option.brand
                                                ? ` · ${option.brand}`
                                                : ""}
                                            </p>
                                          </div>
                                          <span className="ml-auto text-xs font-bold text-slate-600 shrink-0">
                                            ₹{option.basePrice}
                                          </span>
                                        </button>
                                      ))}
                                    </div>
                                  )
                                )
                              )}
                            </div>
                          </div>,
                          document.body
                        )}
                      </div>
                    </td>

                    {/* Image */}
                    <td className="px-2 py-3">
                      {item.image ? (
                        <img
                          src={item.image}
                          className="w-9 h-9 rounded-lg object-cover border border-slate-200"
                          alt=""
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center">
                          <Package size={14} className="text-slate-300" />
                        </div>
                      )}
                    </td>

                    {/* SKU */}
                    <td className="px-2 py-3">
                      <span className="text-xs font-mono text-slate-600">
                        {item.sku || "—"}
                      </span>
                    </td>

                    {/* SKU Company */}
                    <td className="px-2 py-3">
                      <span className="text-xs text-slate-600">
                        {item.skuCompany || "—"}
                      </span>
                    </td>

                    {/* Item Name */}
                    <td className="px-2 py-3">
                      <span className="text-xs font-medium text-slate-800">
                        {item.itemName || "—"}
                      </span>
                    </td>

                    {/* Tax Code (HSN) */}
                    <td className="px-2 py-3">
                      <input
                        type="text"
                        className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500/20 text-xs font-mono"
                        value={item.itemTaxCode}
                        onChange={(e) =>
                          updateItem(item.id, "itemTaxCode", e.target.value)
                        }
                        placeholder="HSN"
                      />
                    </td>

                    {/* Quantity */}
                    <td className="px-2 py-3">
                      <input
                        type="number"
                        min={1}
                        className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500/20 text-xs font-bold text-center"
                        value={item.quantity || ""}
                        onChange={(e) =>
                          updateItem(
                            item.id,
                            "quantity",
                            parseInt(e.target.value) || 0
                          )
                        }
                      />
                    </td>

                    {/* Tax Rate */}
                    <td className="px-2 py-3">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.5}
                        className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500/20 text-xs text-center"
                        value={item.taxRate || ""}
                        onChange={(e) =>
                          updateItem(
                            item.id,
                            "taxRate",
                            parseFloat(e.target.value) || 0
                          )
                        }
                      />
                    </td>

                    {/* Tax Type */}
                    <td className="px-2 py-3">
                      <div className="flex bg-slate-50 border border-slate-200 rounded-lg overflow-hidden">
                        <button
                          type="button"
                          className={`flex-1 px-1.5 py-1.5 text-[10px] font-bold transition-all ${
                            item.taxType === "GST"
                              ? "bg-indigo-600 text-white"
                              : "text-slate-500 hover:bg-slate-100"
                          }`}
                          onClick={() =>
                            updateItem(item.id, "taxType", "GST")
                          }
                        >
                          GST
                        </button>
                        <button
                          type="button"
                          className={`flex-1 px-1.5 py-1.5 text-[10px] font-bold transition-all ${
                            item.taxType === "IGST"
                              ? "bg-indigo-600 text-white"
                              : "text-slate-500 hover:bg-slate-100"
                          }`}
                          onClick={() =>
                            updateItem(item.id, "taxType", "IGST")
                          }
                        >
                          IGST
                        </button>
                      </div>
                    </td>

                    {/* Base Price */}
                    <td className="px-2 py-3 text-right">
                      <input
                        type="number"
                        min={0}
                        className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500/20 text-xs font-bold text-right"
                        value={item.basePrice || ""}
                        onChange={(e) =>
                          updateItem(
                            item.id,
                            "basePrice",
                            parseFloat(e.target.value) || 0
                          )
                        }
                      />
                    </td>

                    {/* Tax Per Item */}
                    <td className="px-2 py-3 text-right">
                      <span className="text-xs font-medium text-slate-600">
                        ₹{item.taxPerItem.toFixed(2)}
                      </span>
                    </td>

                    {/* Unit Total */}
                    <td className="px-2 py-3 text-right">
                      <span className="text-xs font-bold text-slate-900">
                        ₹{item.unitTotal.toFixed(2)}
                      </span>
                    </td>

                    {/* Delete */}
                    <td className="px-2 py-3">
                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeRow(item.id)}
                          className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            onClick={addNewRow}
            className="mt-3 flex items-center gap-2 text-sm font-bold text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 px-4 py-2 rounded-lg transition-all"
          >
            <Plus size={16} />
            Add New Row
          </button>
        </div>

        {/* ── Summary Section ── */}
        <div className="p-6 md:p-8 border-b border-slate-100">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Notes & Terms */}
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Notes</label>
                <textarea
                  className={`${inputClass} resize-none`}
                  rows={3}
                  placeholder="Will be displayed on purchase order"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass}>Terms & Conditions</label>
                <textarea
                  className={`${inputClass} resize-none`}
                  rows={3}
                  placeholder="Enter the terms and conditions for this purchase order"
                  value={termsAndConditions}
                  onChange={(e) => setTermsAndConditions(e.target.value)}
                />
              </div>
            </div>

            {/* Totals */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-3 self-start">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Sub Total</span>
                <span className="text-sm font-bold text-slate-900">
                  ₹{subTotal.toFixed(2)}
                </span>
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-slate-600">Discount</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    className="w-16 px-2 py-1.5 bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500/20 text-xs text-center font-bold"
                    value={discountPercent || ""}
                    onChange={(e) =>
                      setDiscountPercent(parseFloat(e.target.value) || 0)
                    }
                  />
                  <span className="text-xs text-slate-500">%</span>
                  <span className="text-sm font-bold text-slate-700">
                    -₹{discountAmount.toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Total Tax</span>
                <span className="text-sm font-bold text-slate-700">
                  ₹{totalTax.toFixed(2)}
                </span>
              </div>

              <div className="border-t border-slate-200 pt-3 flex items-center justify-between">
                <span className="text-base font-bold text-slate-900">
                  Total
                </span>
                <span className="text-lg font-black text-indigo-600">
                  ₹{total.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Footer Actions ── */}
        <div className="p-6 md:p-8 flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={() => savePO("DRAFT")}
            className="flex items-center justify-center gap-2 px-6 py-3 border-2 border-slate-200 rounded-xl font-bold text-sm text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all"
          >
            <Save size={16} />
            Save as Draft
          </button>
          <button
            type="button"
            onClick={() => savePO("SENT")}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-all shadow-md shadow-indigo-600/20"
          >
            <Send size={16} />
            Save and Send
          </button>
          <button
            type="button"
            onClick={cancelForm}
            className="flex items-center justify-center gap-2 px-6 py-3 text-sm font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default POPage;