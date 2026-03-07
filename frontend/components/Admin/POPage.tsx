import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
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
  Loader2,
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
import { masterCatalogService } from "../../services/masterCatalogService";
import { billService } from "../../services/billService";
import { exportPOToPDF } from "../../utils/exportPO";

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
  mrp: 0,
  taxPerItem: 0,
  unitTotal: 0,
  sizeMap: {},
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

// ─── Computations ──────────────────────────────────────
const computeItem = (item: PurchaseOrderItem): PurchaseOrderItem => {
  let derivedQty = 0;

  // Handle sizeMap - convert Map to plain object if needed
  let sizeMapPlain: Record<string, { qty: number; sku: string }> = {};
  if (item.sizeMap) {
    if (item.sizeMap instanceof Map) {
      item.sizeMap.forEach((value, key) => {
        sizeMapPlain[String(key)] = {
          qty: Number(value?.qty || 0),
          sku: String(value?.sku || ""),
        };
      });
    } else if (typeof item.sizeMap === "object" && item.sizeMap !== null) {
      Object.entries(item.sizeMap).forEach(([key, value]: [string, any]) => {
        sizeMapPlain[key] = {
          qty: Number(value?.qty || 0),
          sku: String(value?.sku || ""),
        };
      });
    }
  }

  // Calculate total quantity from sizeMap
  if (Object.keys(sizeMapPlain).length > 0) {
    Object.values(sizeMapPlain).forEach((val) => {
      derivedQty += val.qty || 0;
    });
  }

  // Always use derivedQty if sizeMap exists, otherwise use item.quantity
  const qty =
    Object.keys(sizeMapPlain).length > 0 ? derivedQty : item.quantity || 0;
  const taxPerItem = (item.basePrice * item.taxRate) / 100;
  const unitTotal = (item.basePrice + taxPerItem) * qty;

  return {
    ...item,
    quantity: qty,
    // Ensure sizeMap is always a plain object (not Map) for easier handling
    sizeMap: sizeMapPlain,
    taxPerItem: Math.round(taxPerItem * 100) / 100,
    unitTotal: Math.round(unitTotal * 100) / 100,
  };
};

interface POPageProps {
  articles: Article[];
  onSyncSuccess?: () => void;
}

// ─── Quantity Grid Modal ──────────────────────────────
const QuantityGridModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  article: Article | undefined;
  variantId: string | null;
  rowId: string | null;
  existingItems: PurchaseOrderItem[];
  onSave: (
    aggregatedItem: Partial<PurchaseOrderItem>,
    fullGrid: Record<string, Record<string, { qty: number; sku: string }>>
  ) => void;
}> = ({
  isOpen,
  onClose,
  article,
  variantId,
  rowId,
  existingItems,
  onSave,
}) => {
  if (!isOpen || !article) return null;

  // Search for the specific variant (match id or _id, fallback to all)
  const allVariants = article.variants || [];
  const variants = useMemo(() => {
    const targetId = String(variantId || "")
      .trim()
      .toLowerCase();

    // 1. Primary Match: Normalized ID
    let matched = allVariants.filter((v: any) => {
      const vId = String(v.id || v._id || "")
        .trim()
        .toLowerCase();
      return vId === targetId && targetId !== "";
    });

    // 2. Secondary Match: Soft match by Color and Range from the row's name
    if (matched.length === 0 && rowId) {
      const currentRow = existingItems.find((it) => it.id === rowId);
      if (currentRow?.itemName) {
        //itemName fmt: "Urban-Red-4-7"
        const parts = currentRow.itemName
          .split("-")
          .map((p) => p.trim().toLowerCase());
        if (parts.length >= 3) {
          const color = parts[1];
          const range = parts.slice(2).join("-"); // handle "4-7"

          matched = allVariants.filter((v: any) => {
            const vColor = (v.color || "").trim().toLowerCase();
            const vRange = (v.sizeRange || "").trim().toLowerCase();
            return vColor === color && vRange === range;
          });
        }
      }
    }

    // Fallback to all variants ONLY if we couldn't find a specific match
    return matched.length > 0 ? matched : allVariants;
  }, [allVariants, variantId, rowId, existingItems]);

  // Parse a size range string like "5-7" into individual sizes ["5","6","7"]
  const parseSizeRange = (range: string): string[] => {
    const match = range.match(/^(\d+)-(\d+)$/);
    if (!match) return [range];
    const start = parseInt(match[1]);
    const end = parseInt(match[2]);
    const sizes: string[] = [];
    for (let i = start; i <= end; i++) sizes.push(String(i));
    return sizes;
  };

  // Sizes (from sizeQuantities, or parsed from sizeRange as fallback)
  const sizes = useMemo(() => {
    const s = new Set<string>();
    variants.forEach((v) => {
      // If a specific variant is selected, we ONLY want its range
      if (v.sizeRange) {
        parseSizeRange(v.sizeRange).forEach((sz) => s.add(sz));
      } else {
        // Only if sizeRange is missing, fallback to actual data keys
        const qtyKeys = Object.keys(v.sizeQuantities || {});
        if (qtyKeys.length > 0) {
          qtyKeys.forEach((sz) => s.add(sz));
        }
      }
    });
    // Final fallback to article's selectedSizes ONLY if s is still empty
    if (s.size === 0 && article.selectedSizes) {
      article.selectedSizes.forEach((range) => {
        parseSizeRange(range).forEach((sz) => s.add(sz));
      });
    }
    return Array.from(s).sort((a, b) => {
      const na = parseFloat(a),
        nb = parseFloat(b);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.localeCompare(b);
    });
  }, [variants, article.selectedSizes]);

  // Get the current row's sizeMap for change detection
  const currentRow = useMemo(() => {
    return existingItems.find((it) => it.id === rowId);
  }, [existingItems, rowId]);

  // Create a serialized key from the row's sizeMap to detect changes
  const sizeMapKey = useMemo(() => {
    if (!currentRow?.sizeMap) return "";
    return JSON.stringify(currentRow.sizeMap);
  }, [currentRow?.sizeMap]);

  // Initialize grid state - recalculate whenever modal opens or data changes
  const initialGrid = useMemo(() => {
    const initial: Record<
      string,
      Record<string, { qty: number; sku: string }>
    > = {};

    variants.forEach((v) => {
      const vId = v.id || v._id || "";
      initial[vId] = {};

      // 1. Check if this variant already has data in this specific PO row
      const existingRow = existingItems.find((it) => it.id === rowId);

      // CRITICAL: ALWAYS use PO row's sizeMap if it exists and has data
      // The PO row is what the user is editing, so we must show its sizeMap
      // Only fall back to master catalog if PO row has no sizeMap or it's empty
      let rawPoSizeMap = null;
      if (existingRow?.sizeMap) {
        // Check if sizeMap has any data (handle both Map and plain object)
        let hasData = false;
        if (existingRow.sizeMap instanceof Map) {
          hasData = existingRow.sizeMap.size > 0;
        } else if (
          typeof existingRow.sizeMap === "object" &&
          existingRow.sizeMap !== null
        ) {
          hasData = Object.keys(existingRow.sizeMap).length > 0;
        }

        if (hasData) {
          rawPoSizeMap = existingRow.sizeMap;
        }
      }

      // Convert PO sizeMap to plain object (handle both Map and object)
      const poSizeMapPlain: Record<string, { qty: number; sku: string }> = {};
      if (rawPoSizeMap) {
        if (rawPoSizeMap instanceof Map) {
          rawPoSizeMap.forEach((value, key) => {
            poSizeMapPlain[String(key)] = {
              qty: Number(value?.qty || 0),
              sku: String(value?.sku || ""),
            };
          });
        } else if (typeof rawPoSizeMap === "object" && rawPoSizeMap !== null) {
          Object.entries(rawPoSizeMap).forEach(
            ([key, value]: [string, any]) => {
              poSizeMapPlain[key] = {
                qty: Number(value?.qty || 0),
                sku: String(value?.sku || ""),
              };
            }
          );
        }
      }

      sizes.forEach((sz) => {
        // Priority: 1. This PO Row's sizeMap, 2. Master Catalog's sizeMap
        // CRITICAL: Check if this size exists in PO's sizeMap (even if qty is 0)
        // If it exists in PO sizeMap, use it (user may have explicitly set it to 0)
        if (sz in poSizeMapPlain) {
          initial[vId][sz] = {
            qty: Number(poSizeMapPlain[sz]?.qty || 0),
            sku: String(poSizeMapPlain[sz]?.sku || ""),
          };
        } else {
          // Only use master catalog if this size is NOT in PO's sizeMap
          initial[vId][sz] = {
            qty: v.sizeQuantities?.[sz] || 0,
            sku: v.sizeSkus?.[sz] || "",
          };
        }
      });
    });
    return initial;
  }, [variants, sizes, existingItems, rowId, sizeMapKey]);

  // Initialize grid state - will be reset by useEffect when dialog opens
  const [grid, setGrid] = useState(initialGrid);
  const prevIsOpenRef = useRef(false);

  // Helper function to build grid from current state
  const buildGridFromItems = useCallback(() => {
    const updated: Record<
      string,
      Record<string, { qty: number; sku: string }>
    > = {};

    variants.forEach((v) => {
      const vId = v.id || v._id || "";
      updated[vId] = {};

      // Always get the latest row from existingItems
      const existingRow = existingItems.find((it) => it.id === rowId);

      // CRITICAL: ALWAYS use PO row's sizeMap if it exists and has data
      // The PO row is what the user is editing, so we must show its sizeMap
      // Only fall back to master catalog if PO row has no sizeMap or it's empty
      let rawPoSizeMap = null;
      if (existingRow?.sizeMap) {
        // Check if sizeMap has any data (handle both Map and plain object)
        let hasData = false;
        if (existingRow.sizeMap instanceof Map) {
          hasData = existingRow.sizeMap.size > 0;
        } else if (
          typeof existingRow.sizeMap === "object" &&
          existingRow.sizeMap !== null
        ) {
          hasData = Object.keys(existingRow.sizeMap).length > 0;
        }

        if (hasData) {
          rawPoSizeMap = existingRow.sizeMap;
        }
      }

      // Convert PO sizeMap to plain object (handle both Map and object)
      const poSizeMapPlain: Record<string, { qty: number; sku: string }> = {};
      if (rawPoSizeMap) {
        if (rawPoSizeMap instanceof Map) {
          rawPoSizeMap.forEach((value, key) => {
            poSizeMapPlain[String(key)] = {
              qty: Number(value?.qty || 0),
              sku: String(value?.sku || ""),
            };
          });
        } else if (typeof rawPoSizeMap === "object" && rawPoSizeMap !== null) {
          Object.entries(rawPoSizeMap).forEach(
            ([key, value]: [string, any]) => {
              poSizeMapPlain[key] = {
                qty: Number(value?.qty || 0),
                sku: String(value?.sku || ""),
              };
            }
          );
        }
      }

      sizes.forEach((sz) => {
        // Priority: 1. This PO Row's sizeMap, 2. Master Catalog's sizeMap
        // CRITICAL: Check if this size exists in PO's sizeMap (even if qty is 0)
        // If it exists in PO sizeMap, use it (user may have explicitly set it to 0)
        if (sz in poSizeMapPlain) {
          updated[vId][sz] = {
            qty: Number(poSizeMapPlain[sz]?.qty || 0),
            sku: String(poSizeMapPlain[sz]?.sku || ""),
          };
        } else {
          // Only use master catalog if this size is NOT in PO's sizeMap
          updated[vId][sz] = {
            qty: v.sizeQuantities?.[sz] || 0,
            sku: v.sizeSkus?.[sz] || "",
          };
        }
      });
    });

    return updated;
  }, [variants, sizes, existingItems, rowId]);

  useEffect(() => {
    // ALWAYS sync grid when dialog opens or sizeMap changes
    // This ensures we always have the latest data from existingItems
    if (isOpen && rowId) {
      // Always rebuild grid from latest existingItems
      // This is critical to show updated quantities when dialog reopens
      const updated = buildGridFromItems();
      setGrid(updated);

      prevIsOpenRef.current = isOpen;
    } else {
      prevIsOpenRef.current = false;
    }
  }, [isOpen, rowId, buildGridFromItems, sizeMapKey, existingItems]);

  const handleUpdate = (
    variantId: string,
    size: string,
    field: "qty" | "sku",
    value: any
  ) => {
    setGrid((prev) => ({
      ...prev,
      [variantId]: {
        ...prev[variantId],
        [size]: {
          ...prev[variantId][size],
          [field]: value,
        },
      },
    }));
  };

  const handleApply = () => {
    // 1. Prepare aggregated item for PO table
    let totalQty = 0;
    let firstSku = "";

    // We only have one variant in this modal now due to filtering
    // Use the same robust matching logic as in the render section
    const variant =
      variants.find((v: any) => v.id === variantId || v._id === variantId) ||
      variants[0];
    if (!variant) return;
    const vId = variant.id || variant._id || "";

    const sizeData = grid[vId] || {};
    Object.entries(sizeData).forEach(([sz, data]) => {
      totalQty += data.qty || 0;
      if (!firstSku && data.sku) firstSku = data.sku;
    });

    if (totalQty === 0) {
      // If user cleared all quantities, we might want to remove the row?
      // For now, let's just use 0.
    }

    const aggregatedItem: Partial<PurchaseOrderItem> = {
      variantId: vId,
      articleId: article.id,
      itemName: `${article.name}-${variant.color || "Default"}-${
        variant.sizeRange || "Range"
      }`,
      sku: firstSku || variant.sku || article.sku,
      quantity: totalQty,
      basePrice:
        variant.costPrice || variant.sellingPrice || article.pricePerPair || 0,
      mrp: variant.mrp || article.mrp || 0,
      image: article.imageUrl || "",
      skuCompany: article.brand || "",
      itemTaxCode: variant.hsnCode || article.sku || "",
      sizeMap: sizeData, // Store the breakdown in the PO item
    };

    onSave(aggregatedItem, grid);
  };

  return createPortal(
    <div className="fixed inset-0 z-10000 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-indigo-50/30">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-white border border-indigo-100 flex items-center justify-center shadow-sm">
              <Package className="text-indigo-600" size={24} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900">
                {article.name}
              </h3>
              <p className="text-slate-500 text-xs font-medium uppercase tracking-wider">
                Set Quantities & SKUs
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white rounded-full text-slate-400 hover:text-slate-600 transition-all border border-transparent hover:border-slate-200"
          >
            <X size={20} />
          </button>
        </div>

        {/* Grid Content */}
        <div className="flex-1 overflow-auto p-6">
          {variants.length === 0 ? (
            <div className="py-20 text-center text-slate-400">
              No variants found for this article.
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="py-3 px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 sticky left-0 z-10">
                    Color / Variant
                  </th>
                  {sizes.map((sz) => (
                    <th
                      key={sz}
                      className="py-3 px-4 text-[10px] font-black text-indigo-600 uppercase tracking-widest text-center min-w-[120px]"
                    >
                      Size {sz}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {variants.map((v) => {
                  const vId = v.id || v._id || "";
                  return (
                    <tr
                      key={vId}
                      className="hover:bg-slate-50/50 transition-colors"
                    >
                      <td className="py-4 px-4 font-bold text-slate-700 bg-white sticky left-0 z-10 shadow-[4px_0_4px_-2px_rgba(0,0,0,0.05)]">
                        <div className="flex flex-col">
                          <span>{v.color || "Default"}</span>
                          <span className="text-[10px] font-medium text-slate-400">
                            {v.itemName || ""}
                          </span>
                        </div>
                      </td>
                      {sizes.map((sz) => (
                        <td key={sz} className="py-4 px-3">
                          <div className="space-y-2">
                            <div className="relative">
                              <input
                                type="number"
                                min="0"
                                placeholder="Qty"
                                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-center text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all"
                                value={grid[vId]?.[sz]?.qty || ""}
                                onChange={(e) =>
                                  handleUpdate(
                                    vId,
                                    sz,
                                    "qty",
                                    parseInt(e.target.value) || 0
                                  )
                                }
                              />
                            </div>
                            <input
                              type="text"
                              placeholder="SKU"
                              className="w-full min-w-[100px] p-1.5 bg-white border border-slate-100 rounded-lg text-[10px] font-mono outline-none focus:border-indigo-300 transition-all"
                              value={grid[vId]?.[sz]?.sku || ""}
                              onChange={(e) =>
                                handleUpdate(vId, sz, "sku", e.target.value)
                              }
                            />
                          </div>
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <p className="text-xs text-slate-400 font-medium whitespace-pre-wrap">
            Entering quantities will create/update rows in the PO item table.
            <br />
            Existing rows for other articles will be preserved.
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-6 py-2.5 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100 transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              className="px-8 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-600/20"
            >
              Apply Quantities
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

// ═══════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════
const POPage: React.FC<POPageProps> = ({ articles, onSyncSuccess }) => {
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
      setPurchaseOrders(
        poRes.data.map((p: any) => ({ ...p, id: p._id || p.id }))
      );
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

  // ── Draft Persistence ──
  const savedDraftStr = localStorage.getItem("kore_po_draft");
  const savedDraft = savedDraftStr ? JSON.parse(savedDraftStr) : null;

  // ── UI State ──
  const [view, setView] = useState<"list" | "form">(
    savedDraft ? "form" : "list"
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [editingPOId, setEditingPOId] = useState<string | null>(
    savedDraft?.editingPOId || null
  );

  // ── Form State ──
  const [selectedVendorId, setSelectedVendorId] = useState(
    savedDraft?.selectedVendorId || ""
  );
  const [vendorSearch, setVendorSearch] = useState("");
  const [showVendorDropdown, setShowVendorDropdown] = useState(false);
  const vendorDropdownRef = useRef<HTMLDivElement>(null);

  const [poNumber, setPONumber] = useState(savedDraft?.poNumber || "");
  const [referenceNumber, setReferenceNumber] = useState(
    savedDraft?.referenceNumber || ""
  );
  const [poDate, setPODate] = useState(savedDraft?.poDate || todayStr());
  const [deliveryDate, setDeliveryDate] = useState(
    savedDraft?.deliveryDate || ""
  );
  const [paymentTerms, setPaymentTerms] = useState(
    savedDraft?.paymentTerms || "Due on Receipt"
  );
  const [shipmentPreference, setShipmentPreference] = useState(
    savedDraft?.shipmentPreference || ""
  );
  const [notes, setNotes] = useState(savedDraft?.notes || "");
  const [termsAndConditions, setTermsAndConditions] = useState(
    savedDraft?.termsAndConditions || ""
  );
  const [items, setItems] = useState<PurchaseOrderItem[]>(() => {
    if (savedDraft?.items) {
      return savedDraft.items.map((it: any) => computeItem(it));
    }
    return [emptyItem()];
  });
  const [discountPercent, setDiscountPercent] = useState(
    savedDraft?.discountPercent || 0
  );

  // Save draft whenever it changes
  useEffect(() => {
    if (view === "form") {
      localStorage.setItem(
        "kore_po_draft",
        JSON.stringify({
          editingPOId,
          selectedVendorId,
          poNumber,
          referenceNumber,
          poDate,
          deliveryDate,
          paymentTerms,
          shipmentPreference,
          notes,
          termsAndConditions,
          items,
          discountPercent,
        })
      );
    } else {
      localStorage.removeItem("kore_po_draft");
    }
  }, [
    view,
    editingPOId,
    selectedVendorId,
    poNumber,
    referenceNumber,
    poDate,
    deliveryDate,
    paymentTerms,
    shipmentPreference,
    notes,
    termsAndConditions,
    items,
    discountPercent,
  ]);

  // ── Item picker state ──
  const [activeItemPickerIdx, setActiveItemPickerIdx] = useState<number | null>(
    null
  );
  const [pickerPos, setPickerPos] = useState({
    top: 0,
    left: 0,
    width: 0,
    openUp: false,
  });
  const [itemPickerSearch, setItemPickerSearch] = useState("");
  const itemPickerRef = useRef<HTMLDivElement>(null);

  // ── Quantity Grid Modal state ──
  const [showQtyModal, setShowQtyModal] = useState(false);
  const [qtyModalArticleId, setQtyModalArticleId] = useState<string | null>(
    null
  );
  const [qtyModalVariantId, setQtyModalVariantId] = useState<string | null>(
    null
  );
  const [qtyModalRowId, setQtyModalRowId] = useState<string | null>(null);

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

  // ── Build item list from variants (Article-Color-SizeRange) ──
  const itemOptions = useMemo(() => {
    const list: {
      articleId: string;
      variantId: string;
      masterName: string;
      name: string; // Fmt: Urban-Pink-4-7
      sku: string;
      brand: string;
      hsnCode: string;
      image: string;
      basePrice: number;
      mrp: number;
    }[] = [];

    articles.forEach((article) => {
      if (article.variants && article.variants.length > 0) {
        article.variants.forEach((variant) => {
          list.push({
            articleId: article.id,
            masterName: article.name,
            variantId: variant.id,
            name: `${article.name}-${variant.color || "Default"}-${
              variant.sizeRange || "NoRange"
            }`,
            sku: variant.sku || article.sku,
            brand: article.brand || "",
            hsnCode: variant.hsnCode || article.sku || "",
            image: article.imageUrl || "",
            basePrice:
              variant.costPrice ||
              variant.sellingPrice ||
              article.pricePerPair ||
              0,
            mrp: variant.mrp || article.mrp || 0,
          });
        });
      } else {
        // Fallback for articles without variants
        list.push({
          articleId: article.id,
          masterName: article.name,
          variantId: "",
          name: article.name,
          sku: article.sku,
          brand: article.brand || "",
          hsnCode: article.sku || "",
          image: article.imageUrl || "",
          basePrice: article.pricePerPair || 0,
          mrp: article.mrp || 0,
        });
      }
    });
    return list;
  }, [articles]);

  // ── Grouped items (Articles) for picker ──
  const groupedItems = useMemo(() => {
    const q = itemPickerSearch.toLowerCase().trim();
    const filtered = q
      ? itemOptions.filter(
          (it) =>
            it.name.toLowerCase().includes(q) ||
            it.sku.toLowerCase().includes(q)
        )
      : itemOptions;

    const groups: Record<string, typeof itemOptions> = {};
    filtered.forEach((item) => {
      const master = item.masterName || "Other Items";
      if (!groups[master]) groups[master] = [];
      groups[master].push(item);
    });
    return groups;
  }, [itemOptions, itemPickerSearch]);

  // ── Computations ──
  const subTotal = items.reduce(
    (sum, it) => sum + it.basePrice * it.quantity,
    0
  );
  const discountAmount =
    Math.round(((subTotal * discountPercent) / 100) * 100) / 100;
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
    localStorage.removeItem("kore_po_draft");
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
    setItems(
      po.items.map((it: any) =>
        computeItem({
          ...it,
          id:
            it.rowId ||
            it._id ||
            it.id ||
            `poi-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        })
      )
    );
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

  const selectItemForRow = (rowId: string, option: (typeof itemOptions)[0]) => {
    // Find matching article and variant to extract default sizing
    const targetArticle = articles.find((a) => a.id === option.articleId);
    const targetVariant = targetArticle?.variants?.find(
      (v) => v.id === option.variantId || v._id === option.variantId
    );

    // Construct default sizeMap from master catalog quantities
    const defaultSizeMap: Record<string, { qty: number; sku: string }> = {};
    if (targetVariant && targetVariant.sizeQuantities) {
      Object.entries(targetVariant.sizeQuantities).forEach(([sz, qty]) => {
        defaultSizeMap[sz] = {
          qty: Number(qty) || 0,
          sku: targetVariant.sizeSkus?.[sz] || "",
        };
      });
    }

    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== rowId) return it;
        return computeItem({
          ...it,
          articleId: option.articleId,
          variantId: option.variantId,
          itemName: option.name,
          sku: option.sku,
          skuCompany: option.brand,
          itemTaxCode: option.hsnCode,
          image: option.image,
          basePrice: option.basePrice,
          mrp: option.mrp || 0,
          sizeMap: defaultSizeMap,
        });
      })
    );
    setActiveItemPickerIdx(null);
    setItemPickerSearch("");

    // NOTE: User requested NO auto-open of dialog.
    // User will click the Qty cell manually.
  };

  const handleSaveQtyGrid = async (
    aggregatedItem: Partial<PurchaseOrderItem>,
    fullGrid: Record<string, Record<string, { qty: number; sku: string }>>
  ) => {
    // Capture previous state BEFORE updating (for master catalog sync)
    const existingPOItem = items.find((it) => it.id === qtyModalRowId);
    const previousSizeMap = existingPOItem?.sizeMap || {};

    // Convert previousSizeMap to plain object for comparison
    const previousSizeMapPlain: Record<string, { qty: number; sku: string }> =
      {};
    if (previousSizeMap instanceof Map) {
      previousSizeMap.forEach((value, key) => {
        previousSizeMapPlain[String(key)] = {
          qty: Number(value?.qty || 0),
          sku: String(value?.sku || ""),
        };
      });
    } else if (
      typeof previousSizeMap === "object" &&
      previousSizeMap !== null
    ) {
      Object.entries(previousSizeMap).forEach(([key, value]: [string, any]) => {
        previousSizeMapPlain[key] = {
          qty: Number(value?.qty || 0),
          sku: String(value?.sku || ""),
        };
      });
    }

    // 1. Update PO State (Use row ID for reliable matching)
    setItems((prev) => {
      const exists = prev.find((it) => it.id === qtyModalRowId);

      if (!exists) {
        // If somehow the row is gone, add it as a new item
        const newItem: PurchaseOrderItem = {
          ...emptyItem(),
          ...aggregatedItem,
          id: qtyModalRowId || `poi-${Date.now()}`,
          taxRate: 18,
          taxType: "GST",
          // Ensure sizeMap is set and quantity will be recalculated from it
          sizeMap: aggregatedItem.sizeMap || {},
        };
        return [...prev, computeItem(newItem)];
      }

      return prev.map((it) => {
        if (it.id !== qtyModalRowId) return it;
        // Merge the existing item with the aggregated item, ensuring sizeMap is preserved
        // CRITICAL: aggregatedItem.sizeMap contains the updated grid data - always use it
        // Even if all quantities are 0, we should preserve the sizeMap structure
        const updatedSizeMap = aggregatedItem.sizeMap || {};

        const updatedItem = {
          ...it,
          ...aggregatedItem,
          taxRate: it.taxRate || 18,
          taxType: it.taxType || "GST",
          // CRITICAL: Always use aggregatedItem.sizeMap from the grid
          // This contains the exact quantities the user entered in the dialog
          sizeMap: updatedSizeMap,
        };
        // computeItem will recalculate quantity from sizeMap
        return computeItem(updatedItem);
      });
    });

    // 2. Sync with Real Master (Article)
    if (qtyModalArticleId && qtyModalVariantId) {
      console.log(
        "🔄 Updating Master Catalog for article:",
        qtyModalArticleId,
        "variant:",
        qtyModalVariantId
      );
      console.log("Previous sizeMap:", previousSizeMapPlain);
      console.log("New grid data:", fullGrid[qtyModalVariantId]);
      try {
        const res = await masterCatalogService.getMasterItem(qtyModalArticleId);
        const article = res.data || res;

        if (article && article.variants) {
          // Find and update the specific variant's sizeMap
          // IMPORTANT: ADD quantities to master catalog, don't replace them
          // For updates: Subtract old PO quantities, then add new ones
          const updatedVariants = article.variants.map((v: any) => {
            const vId = v._id || v.id;
            if (
              vId === qtyModalVariantId ||
              v.id === qtyModalVariantId ||
              v._id === qtyModalVariantId
            ) {
              // Start with existing sizeMap from master catalog
              const existingSizeMap = v.sizeMap || {};
              const newSizeMap: Record<string, { qty: number; sku: string }> =
                {};

              // Convert Mongoose Map to plain object if needed
              const existingPlain: Record<
                string,
                { qty: number; sku: string }
              > = {};
              if (existingSizeMap instanceof Map) {
                existingSizeMap.forEach((value, key) => {
                  existingPlain[String(key)] = {
                    qty: Number(value?.qty || 0),
                    sku: String(value?.sku || ""),
                  };
                });
              } else if (typeof existingSizeMap === "object") {
                Object.entries(existingSizeMap).forEach(
                  ([key, value]: [string, any]) => {
                    existingPlain[key] = {
                      qty: Number(value?.qty || 0),
                      sku: String(value?.sku || ""),
                    };
                  }
                );
              }

              // Start with master catalog's current quantities
              Object.keys(existingPlain).forEach((sz) => {
                newSizeMap[sz] = { ...existingPlain[sz] };
              });

              // Adjust inventory: Add back old PO quantities, then subtract new PO quantities
              // This correctly handles inventory reservation changes
              Object.entries(previousSizeMapPlain).forEach(([sz, data]) => {
                const currentQty = newSizeMap[sz]?.qty || 0;
                const prevQty = Number(data.qty || 0);
                // Add back the previously reserved quantities
                newSizeMap[sz] = {
                  qty: currentQty + prevQty,
                  sku: newSizeMap[sz]?.sku || "",
                };
              });

              // Subtract new quantities from PO grid (reserve them)
              const gridData = fullGrid[qtyModalVariantId];
              if (gridData) {
                Object.entries(gridData).forEach(([sz, data]) => {
                  const currentQty = newSizeMap[sz]?.qty || 0;
                  const newQty = Number(data.qty || 0);
                  // Reserve the new PO quantities
                  newSizeMap[sz] = {
                    qty: Math.max(0, currentQty - newQty),
                    // Use SKU from PO if provided, otherwise keep existing
                    sku: data.sku || newSizeMap[sz]?.sku || "",
                  };
                });
              }

              return { ...v, sizeMap: newSizeMap };
            }
            return v;
          });

          // Prepare FormData for update - send ALL variants with updated sizeMap
          const data = new FormData();
          data.append("articleName", article.articleName || article.name);
          data.append(
            "variants",
            JSON.stringify(
              updatedVariants.map((v: any) => ({
                itemName: v.itemName,
                costPrice: v.costPrice,
                sellingPrice: v.sellingPrice,
                mrp: v.mrp,
                hsnCode: v.hsnCode,
                color: v.color,
                sizeRange: v.sizeRange,
                sizeMap: v.sizeMap,
              }))
            )
          );

          // Retain existing taxonomy if available
          if (article.categoryId?._id || article.categoryId)
            data.append(
              "categoryId",
              article.categoryId?._id || article.categoryId
            );
          if (article.brandId?._id || article.brandId)
            data.append("brandId", article.brandId?._id || article.brandId);
          if (
            article.manufacturerCompanyId?._id ||
            article.manufacturerCompanyId
          )
            data.append(
              "manufacturerCompanyId",
              article.manufacturerCompanyId?._id ||
                article.manufacturerCompanyId
            );
          if (article.unitId?._id || article.unitId)
            data.append("unitId", article.unitId?._id || article.unitId);

          await masterCatalogService.updateMasterItem(qtyModalArticleId, data);
          console.log(
            "✅ Master Catalog updated successfully for article:",
            qtyModalArticleId
          );
          toast.success("Article Master updated successfully");
          if (onSyncSuccess) onSyncSuccess();
        }
      } catch (err) {
        console.error("❌ Failed to sync with master:", err);
        toast.error("Warning: Failed to sync changes with Article Master");
      }
    }

    // 3. Auto-save PO to database if editing existing PO
    if (editingPOId) {
      try {
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
          items: items.map((it) => ({
            ...it,
            sizeMap: it.sizeMap || {},
          })),
          subTotal,
          discountPercent,
          discountAmount,
          totalTax,
          total,
          // Don't include status to preserve current status
        };

        await poService.updatePO(editingPOId, poData);
        toast.success("Purchase Order updated successfully");
      } catch (err) {
        console.error("Failed to auto-save PO", err);
        toast.error("Warning: Failed to save changes to Purchase Order");
      }
    }

    // Close dialog after state updates
    // Use setTimeout to ensure state updates complete before closing
    setTimeout(() => {
      setShowQtyModal(false);
    }, 0);
  };

  const savePO = async (status: POStatus) => {
    if (!selectedVendorId) return toast.error("Please select a vendor.");
    if (items.every((it) => !it.articleId))
      return toast.error("Please add at least one item.");

    // Ensure all items have their sizeMap properly included
    const itemsWithSizeMap = items
      .filter((it) => it.articleId)
      .map((it) => ({
        ...it,
        // Ensure sizeMap is always a plain object (not Map) for JSON serialization
        sizeMap: it.sizeMap || {},
      }));

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
      items: itemsWithSizeMap,
      subTotal,
      discountPercent,
      discountAmount,
      totalTax,
      total,
      status,
    };

    const savePromise = async () => {
      // Update Master Catalog inventory before saving PO
      if (status === "SENT") {
        // Only reserve inventory when PO is actually sent
        for (const item of itemsWithSizeMap) {
          if (item.articleId && item.variantId && item.sizeMap) {
            try {
              const res = await masterCatalogService.getMasterItem(
                item.articleId
              );
              const article = res.data || res;

              if (article && article.variants) {
                const updatedVariants = article.variants.map((v: any) => {
                  const vId = v._id || v.id;
                  if (
                    vId === item.variantId ||
                    v.id === item.variantId ||
                    v._id === item.variantId
                  ) {
                    // Get existing sizeMap
                    const existingSizeMap = v.sizeMap || {};
                    const existingPlain: Record<
                      string,
                      { qty: number; sku: string }
                    > = {};

                    if (existingSizeMap instanceof Map) {
                      existingSizeMap.forEach((value, key) => {
                        existingPlain[String(key)] = {
                          qty: Number(value?.qty || 0),
                          sku: String(value?.sku || ""),
                        };
                      });
                    } else if (typeof existingSizeMap === "object") {
                      Object.entries(existingSizeMap).forEach(
                        ([key, value]: [string, any]) => {
                          existingPlain[key] = {
                            qty: Number(value?.qty || 0),
                            sku: String(value?.sku || ""),
                          };
                        }
                      );
                    }

                    // For PO creation: just subtract the ordered quantities
                    // For PO update: this will be handled by the quantity dialog updates
                    if (!editingPOId) {
                      // New PO: subtract ordered quantities from available inventory
                      const newSizeMap: Record<
                        string,
                        { qty: number; sku: string }
                      > = { ...existingPlain };

                      Object.entries(item.sizeMap).forEach(
                        ([size, data]: [string, any]) => {
                          const orderedQty = Number(data?.qty || 0);
                          if (orderedQty > 0) {
                            const currentQty = newSizeMap[size]?.qty || 0;
                            newSizeMap[size] = {
                              qty: Math.max(0, currentQty - orderedQty),
                              sku: data?.sku || newSizeMap[size]?.sku || "",
                            };
                          }
                        }
                      );

                      return { ...v, sizeMap: newSizeMap };
                    }
                  }
                  return v;
                });

                // Update Master Catalog if this is a new PO
                if (!editingPOId) {
                  const data = new FormData();
                  data.append(
                    "articleName",
                    article.articleName || article.name
                  );
                  data.append(
                    "variants",
                    JSON.stringify(
                      updatedVariants.map((v: any) => ({
                        itemName: v.itemName,
                        costPrice: v.costPrice,
                        sellingPrice: v.sellingPrice,
                        mrp: v.mrp,
                        hsnCode: v.hsnCode,
                        color: v.color,
                        sizeRange: v.sizeRange,
                        sizeMap: v.sizeMap,
                      }))
                    )
                  );

                  // Retain existing taxonomy
                  if (article.categoryId?._id || article.categoryId)
                    data.append(
                      "categoryId",
                      article.categoryId?._id || article.categoryId
                    );
                  if (article.brandId?._id || article.brandId)
                    data.append(
                      "brandId",
                      article.brandId?._id || article.brandId
                    );
                  if (
                    article.manufacturerCompanyId?._id ||
                    article.manufacturerCompanyId
                  )
                    data.append(
                      "manufacturerCompanyId",
                      article.manufacturerCompanyId?._id ||
                        article.manufacturerCompanyId
                    );
                  if (article.unitId?._id || article.unitId)
                    data.append(
                      "unitId",
                      article.unitId?._id || article.unitId
                    );

                  await masterCatalogService.updateMasterItem(
                    item.articleId,
                    data
                  );
                }
              }
            } catch (err) {
              console.error("Failed to update master catalog inventory:", err);
              // Don't fail the PO save, but log the error
            }
          }
        }
      }

      let createdOrUpdatedPO: PurchaseOrder | null = null;

      if (editingPOId) {
        await poService.updatePO(editingPOId, poData);
        // Fetch the updated PO to get the complete data
        const res = await poService.listPOs();
        createdOrUpdatedPO = res.data.find((p: any) => p._id === editingPOId || p.id === editingPOId);
      } else {
        const res = await poService.createPO(poData);
        createdOrUpdatedPO = res.data || res;
      }

      // Convert PO to Bill and add to bills service
      if (createdOrUpdatedPO) {
        const bill = billService.convertPOToBill(createdOrUpdatedPO);
        billService.addBill(bill);
        console.log("✅ Bill created from PO:", bill.id);
      }

      await fetchData();
      setView("list");
      resetForm();
      localStorage.removeItem("kore_po_draft");
    };

    setLoading(true);
    const promise = savePromise();
    toast.promise(promise, {
      loading: editingPOId
        ? "Updating Purchase Order..."
        : "Creating Purchase Order...",
      success: editingPOId
        ? "Purchase Order Updated Successfully!"
        : "Purchase Order Created Successfully!",
      error: (err: any) => err.message || "Failed to save Purchase Order",
    });
    promise.finally(() => setLoading(false));
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
                    <th className="px-6 py-3.5 text-[10px] font-bold text-indigo-600 uppercase tracking-wider text-center">
                      Action
                    </th>
                    <th className="px-6 py-3.5 text-[10px] font-bold text-indigo-600 uppercase tracking-wider text-right">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredPOs.map((po) => (
                    <tr
                      key={po.id}
                      onClick={() => handleEditPO(po)}
                      className="hover:bg-indigo-50/50 transition-colors cursor-pointer group"
                    >
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {new Date(po.date).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-bold text-slate-900 text-sm group-hover:text-indigo-600 transition-colors">
                          {po.poNumber}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-700 font-medium">
                        {po.vendorName}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-900 font-bold text-right">
                        ₹
                        {po.total.toLocaleString("en-IN", {
                          minimumFractionDigits: 2,
                        })}
                      </td>
                      <td
                        className="px-6 py-4 text-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => {
                            const v = vendors.find(
                              (ven) => ven.id === po.vendorId
                            );
                            exportPOToPDF(po, v);
                          }}
                          className="p-2 text-indigo-600 hover:bg-indigo-100 rounded-xl transition-all inline-flex items-center gap-1 font-semibold text-xs"
                          title="Download PDF"
                        >
                          <FileText size={16} />
                          PDF
                        </button>
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

        {editingPOId ? (
          <button
            onClick={() => {
              const currentPO = purchaseOrders.find(
                (p) => p.id === editingPOId
              );
              if (currentPO)
                exportPOToPDF({ ...currentPO, items }, selectedVendor);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 text-sm font-bold rounded-xl hover:bg-indigo-100 transition-all border border-indigo-200"
          >
            <FileText size={16} />
            Download PDF
          </button>
        ) : (
          <button
            onClick={() => {
              const dummyPO: any = {
                poNumber,
                vendorName: selectedVendor?.displayName || "New Vendor",
                date: poDate,
                deliveryDate,
                items,
                subTotal,
                discountPercent,
                discountAmount,
                totalTax,
                total,
              };
              exportPOToPDF(dummyPO, selectedVendor || undefined);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-slate-50 text-slate-600 text-sm font-bold rounded-xl hover:bg-slate-100 transition-all border border-slate-200"
          >
            <FileText size={16} />
            Preview PDF
          </button>
        )}
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
                  {/* <th className="px-2 py-3 text-[10px] font-bold text-indigo-600 uppercase tracking-wider">
                    SKU
                  </th> */}
                  {/* <th className="px-2 py-3 text-[10px] font-bold text-indigo-600 uppercase tracking-wider">
                    SKU Company
                  </th> */}
                  {/* <th className="px-2 py-3 text-[10px] font-bold text-indigo-600 uppercase tracking-wider">
                    Item Name
                  </th> */}
                  <th className="px-2 py-3 text-[10px] font-bold text-indigo-600 uppercase tracking-wider">
                    Tax Code
                  </th>
                  <th className="px-2 py-3 text-[10px] font-bold text-indigo-600 uppercase tracking-wider w-[70px]">
                    Qty
                  </th>
                  <th className="px-2 py-3 text-[10px] font-bold text-indigo-600 uppercase tracking-wider w-[70px]">
                    Tax Rate %
                  </th>
                  {/* <th className="px-2 py-3 text-[10px] font-bold text-indigo-600 uppercase tracking-wider w-[80px]">
                    Tax Type
                  </th> */}
                  <th className="px-2 py-3 text-[10px] font-bold text-indigo-600 uppercase tracking-wider text-right">
                    MRP (₹)
                  </th>
                  <th className="px-2 py-3 text-[10px] font-bold text-indigo-600 uppercase tracking-wider text-right">
                    Unit Price (₹)
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
                      <div
                        ref={
                          activeItemPickerIdx === idx
                            ? itemPickerRef
                            : undefined
                        }
                      >
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

                        {activeItemPickerIdx === idx &&
                          createPortal(
                            <div
                              ref={itemPickerRef}
                              style={{
                                position: "absolute",
                                top: pickerPos.openUp
                                  ? pickerPos.top - 10
                                  : pickerPos.top + 42,
                                left: pickerPos.left,
                                width: pickerPos.width * 2,
                                transform: pickerPos.openUp
                                  ? "translateY(-100%)"
                                  : "none",
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
                                            key={`${option.articleId}-${option.sku}`}
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
                                                {option.name}
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
                    {/* <td className="px-2 py-3">
                      <span className="text-xs font-mono text-slate-600">
                        {item.sku || "—"}
                      </span>
                    </td> */}

                    {/* SKU Company */}
                    {/* <td className="px-2 py-3">
                      <span className="text-xs text-slate-600">
                        {item.skuCompany || "—"}
                      </span>
                    </td> */}

                    {/* Item Name */}
                    {/* <td className="px-2 py-3">
                      <span className="text-xs font-medium text-slate-800">
                        {item.itemName || "—"}
                      </span>
                    </td> */}

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
                      {item.articleId ? (
                        <button
                          type="button"
                          onClick={() => {
                            setQtyModalArticleId(item.articleId);
                            setQtyModalVariantId(item.variantId || null);
                            setQtyModalRowId(item.id);
                            setShowQtyModal(true);
                          }}
                          className="w-full px-2 py-1.5 bg-indigo-50 border border-indigo-200 rounded-lg text-xs font-bold text-indigo-700 hover:bg-indigo-100 transition-all flex items-center justify-center gap-1 min-h-[30px]"
                        >
                          {item.quantity}
                          <Edit2 size={10} />
                        </button>
                      ) : (
                        <input
                          type="number"
                          disabled
                          className="w-full px-2 py-1.5 bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold text-center text-slate-400"
                          placeholder="—"
                        />
                      )}
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
                    {/* <td className="px-2 py-3">
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
                    </td> */}

                    {/* MRP */}
                    <td className="px-2 py-3 text-right">
                      <input
                        type="number"
                        min={0}
                        className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500/20 text-xs font-bold text-right"
                        value={item.mrp || ""}
                        onChange={(e) =>
                          updateItem(
                            item.id,
                            "mrp",
                            parseFloat(e.target.value) || 0
                          )
                        }
                      />
                    </td>

                    {/* Base Price */}
                    <td className="px-2 py-3 text-right">
                      <input
                        type="number"
                        min={0}
                        className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500/20 text-xs font-bold text-right text-indigo-700"
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
            disabled={loading}
            className="flex items-center justify-center gap-2 px-6 py-3 border-2 border-slate-200 rounded-xl font-bold text-sm text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all disabled:opacity-50"
          >
            {loading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Save size={16} />
            )}
            Save as Draft
          </button>
          <button
            type="button"
            onClick={() => savePO("SENT")}
            disabled={loading}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-all shadow-md shadow-indigo-600/20 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Send size={16} />
            )}
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

      <QuantityGridModal
        key={`${qtyModalRowId}-${
          items.find((it) => it.id === qtyModalRowId)?.sizeMap
            ? JSON.stringify(
                items.find((it) => it.id === qtyModalRowId)?.sizeMap
              )
            : "empty"
        }`}
        isOpen={showQtyModal}
        onClose={() => setShowQtyModal(false)}
        article={articles.find((a) => a.id === qtyModalArticleId)}
        variantId={qtyModalVariantId}
        rowId={qtyModalRowId}
        existingItems={items}
        onSave={handleSaveQtyGrid}
      />
    </div>
  );
};

export default POPage;
