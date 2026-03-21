import React, { useMemo, useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  ClipboardList,
  Search,
  CheckCircle2,
  XCircle,
  PackageCheck,
  Package,
  Loader2,
  Building2,
  CalendarDays,
  Hash,
  Truck,
  FileText,
  User,
  ChevronDown,
  ScanLine,
  Warehouse,
  Boxes,
  ChevronRight,
  RotateCcw,
  MapPin,
  ArrowLeft,
  Activity,
  Calendar,
  PackageSearch,
} from "lucide-react";
import {
  grnService,
  MockPODetail,
  MockPOItem,
  MockPORef,
} from "../../services/grnService";
import SearchableSelect from "../SearchableSelect";

/* ═══════════════════ Types ═══════════════════ */

type GRNForm = {
  grnDate: string;
  vendorInvoiceNo: string;
  vendorChallanNo: string;
  vehicleNo: string;
  eWayBillNo: string;
  receivedBy: string;
  warehouse: string;
  remarks: string;
};

type GRNHistoryItem = {
  grnId: string;
  grnNo: string;
  refId: string;
  vendorName: string;
  articleName: string;
  totalPairs: number;
  cartons: number;
  createdAt: string;
};

// Track scan state per size across all items
type CartonScan = Record<string, number>; // size -> scanned count
type ScanState = Record<string, CartonScan[]>; // itemName -> array of cartons

/* ═══════════════════ Helpers ═══════════════════ */

const todayISODate = () => new Date().toISOString().slice(0, 10);

const formatDate = (value?: string) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const formatDateTime = (value?: string) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-IN");
};

/* ═══════════════════ Component ═══════════════════ */

const GRN: React.FC = () => {
  /* ── Step 1: PO Selection ── */
  const [poRefs, setPoRefs] = useState<MockPORef[]>([]);
  const [selectedPOId, setSelectedPOId] = useState("");
  const [poDetail, setPoDetail] = useState<MockPODetail | null>(null);
  const [poLoading, setPoLoading] = useState(false);

  /* ── Step 2: GRN Info ── */
  const [form, setForm] = useState<GRNForm>({
    grnDate: todayISODate(),
    vendorInvoiceNo: "",
    vendorChallanNo: "",
    vehicleNo: "",
    eWayBillNo: "",
    receivedBy: "",
    warehouse: "",
    remarks: "",
  });

  /* ── Step 3: Item receiving ── */
  const [selectedItemName, setSelectedItemName] = useState("");
  const [currentCartonIdx, setCurrentCartonIdx] = useState(0);
  const [scanState, setScanState] = useState<ScanState>({});
  const [scanInput, setScanInput] = useState("");
  const scanInputRef = useRef<HTMLInputElement>(null);

  /* ── History ── */
  const [grnHistory, setGrnHistory] = useState<GRNHistoryItem[]>([]);
  const [activeTab, setActiveTab] = useState<"scan" | "history">("scan");

  const [submitting, setSubmitting] = useState(false);

  /* ── History Details View ── */
  const [viewingGRN, setViewingGRN] = useState<any | null>(null);
  const [loadingHistoryDetail, setLoadingHistoryDetail] = useState(false);

  /* ── Load PO list ── */
  useEffect(() => {
    grnService.listReferences("").then((res) => {
      // Filter out Catalogue IDs (starting with CAT-)
      const filtered = (res.data || []).filter(
        (ref) => !ref.poNo.startsWith("CAT-")
      );
      setPoRefs(filtered);
    });
  }, []);

  /* ── Load GRN History ── */
  useEffect(() => {
    grnService
      .history()
      .then((res) => {
        setGrnHistory(
          (res.data || []).map((h: any) => ({
            grnId: h.grnId,
            grnNo: h.grnNo,
            refId: h.refId,
            vendorName: h.vendorName,
            articleName: h.articleName,
            totalPairs: h.totalPairs,
            cartons: h.cartons,
            createdAt: h.createdAt,
          }))
        );
      })
      .catch(() => {});
  }, [activeTab]);

  const viewGRNDetail = async (grnId: string) => {
    setLoadingHistoryDetail(true);
    try {
      const res = await grnService.getGRNDetail(grnId);
      setViewingGRN(res.data);
    } catch (err: any) {
      toast.error(err.message || "Failed to load GRN details");
    } finally {
      setLoadingHistoryDetail(false);
    }
  };

  /* ── Load PO detail when selected ── */
  useEffect(() => {
    if (!selectedPOId) {
      setPoDetail(null);
      return;
    }
    setPoLoading(true);
    grnService
      .getReferenceDetail(selectedPOId)
      .then((res) => {
        const data = res.data as MockPODetail | null;
        setPoDetail(data);
        // Initialize scan state
        if (data) {
          const state: ScanState = {};
          data.items.forEach((item) => {
            // Create an array of cartons, each with an empty scan count map
            state[item.itemName] = Array.from({ length: item.cartonCount || 1 }, () => ({}));
          });
          setScanState(state);
          setCurrentCartonIdx(0);
        }
      })
      .catch(() => {
        toast.error("Failed to load PO details");
        setPoDetail(null);
      })
      .finally(() => setPoLoading(false));
  }, [selectedPOId]);

  /* ── Derived data ── */
  const selectedItem = useMemo(
    () => poDetail?.items.find((i) => i.itemName === selectedItemName) || null,
    [poDetail, selectedItemName]
  );

  const sizes = useMemo(() => {
    if (!selectedItem) return [];
    return Object.keys(selectedItem.sizeMap).sort(
      (a, b) => Number(a) - Number(b)
    );
  }, [selectedItem]);

  const currentCartonScan = useMemo(() => {
    if (!selectedItem || !scanState[selectedItemName]) return null;
    return scanState[selectedItemName][currentCartonIdx] || null;
  }, [selectedItem, selectedItemName, scanState, currentCartonIdx]);

  const boxes = useMemo(() => {
    if (!selectedItem || !currentCartonScan) return [];
    // Create a virtual array of 24 slots for the current carton
    // We fill them based on the scanned counts in currentCartonScan
    const slots: { size: string; isScanned: boolean; sku: string }[] = [];
    
    // Sort sizes to be consistent
    const sortedSizes = Object.keys(selectedItem.sizeMap).sort((a,b) => Number(a) - Number(b));
    
    sortedSizes.forEach(sz => {
      const scanned = currentCartonScan[sz] || 0;
      const sku = selectedItem.sizeMap[sz].sku;
      
      for(let i=0; i<scanned; i++) {
        slots.push({
          size: sz,
          isScanned: true,
          sku: sku
        });
      }
    });

    return slots;
  }, [selectedItem, currentCartonScan]);

  // Count scanned boxes for current carton
  const scannedCount = boxes.filter(b => b.isScanned).length;
  const totalBoxes = boxes.length; // Should be 24

  // Overall progress (total pairs across all cartons of all items)
  const overallProgress = useMemo(() => {
    let totalPairsAll = 0;
    let scannedAll = 0;

    poDetail?.items.forEach((item) => {
      const perCartonTotal = Object.values(item.sizeMap).reduce((s, d) => s + (d.qty || 0), 0);
      totalPairsAll += perCartonTotal * (item.cartonCount || 1);
      
      const itemScans = scanState[item.itemName] || [];
      itemScans.forEach((carton) => {
        scannedAll += Object.values(carton).reduce((s, q) => s + q, 0);
      });
    });

    return { total: totalPairsAll, scanned: scannedAll };
  }, [poDetail, scanState]);

  // Item-level progress
  const getItemProgress = (itemName: string) => {
    const item = poDetail?.items.find(i => i.itemName === itemName);
    const cartons = scanState[itemName];
    if (!item || !cartons) return { total: 0, scanned: 0 };
    
    const perCartonTotal = Object.values(item.sizeMap).reduce((s, d) => s + (d.qty || 0), 0);
    const total = perCartonTotal * (item.cartonCount || 1);
    let scanned = 0;
    cartons.forEach((c) => {
      scanned += Object.values(c).reduce((s, q) => s + q, 0);
    });
    return { total, scanned };
  };

  // Carton-level progress
  const getCartonProgress = (itemName: string, cartonIdx: number) => {
    const item = poDetail?.items.find(i => i.itemName === itemName);
    const carton = scanState[itemName]?.[cartonIdx];
    if (!item || !carton) return { total: 0, scanned: 0 };
    
    const total = Object.values(item.sizeMap).reduce((s, d) => s + (d.qty || 0), 0);
    const scanned = Object.values(carton).reduce((s, q) => s + q, 0);
    return { total: Math.max(total, 24), scanned }; // Enforce 24 total for UI consistency
  };

  /* ── Scan handler ── */
  const handleScan = () => {
    const code = scanInput.trim();
    if (!code) return;

    if (!selectedItem) {
      toast.error("Please select an item first.");
      setScanInput("");
      return;
    }

    // Find which size this SKU belongs to
    const foundSizeEntry = Object.entries(selectedItem.sizeMap).find(
      ([sz, data]) => data.sku === code
    );
    
    if (!foundSizeEntry) {
      toast.error(`Invalid SKU: ${code}. Does not match any size for this item.`);
      setScanInput("");
      return;
    }

    const [size, sizeData] = foundSizeEntry;
    
    // Check if this size is already full in the CURRENT carton
    const currentScannedForSize = currentCartonScan?.[size] || 0;
    if (currentScannedForSize >= sizeData.qty) {
      toast.error(`Size ${size} is already full (Limit: ${sizeData.qty}) for Carton ${currentCartonIdx + 1}.`);
      setScanInput("");
      return;
    }

    // Mark as scanned in state
    setScanState((prev) => {
      const updated = { ...prev };
      const itemCartons = [...(updated[selectedItemName] || [])];
      const carton = { ...itemCartons[currentCartonIdx] };
      
      carton[size] = (carton[size] || 0) + 1;
      itemCartons[currentCartonIdx] = carton;
      updated[selectedItemName] = itemCartons;
      return updated;
    });

    toast.success(`Size ${size} scanned for Carton ${currentCartonIdx + 1}`);
    setScanInput("");
    scanInputRef.current?.focus();

    // Check if carton is now full
    const newCartonTotal = Object.values({...currentCartonScan, [size]: (currentCartonScan?.[size] || 0) + 1})
      .reduce((s, q) => s + q, 0);
    
    if (newCartonTotal >= 24) {
      if (currentCartonIdx < (selectedItem.cartonCount || 1) - 1) {
        toast.info(`Carton ${currentCartonIdx + 1} complete! Moving to next carton.`);
        setCurrentCartonIdx(prev => prev + 1);
      } else {
        toast.success("All cartons for this item are complete!");
      }
    }
  };

  /* ── Reset carton scans ── */
  const resetCartonScans = () => {
    if (!selectedItemName) return;
    setScanState((prev) => {
      const updated = { ...prev };
      const itemCartons = [...(updated[selectedItemName] || [])];
      itemCartons[currentCartonIdx] = {};
      updated[selectedItemName] = itemCartons;
      return updated;
    });
    toast.success(`Carton ${currentCartonIdx + 1} scans reset`);
  };

  /* ── Form update ── */
  const updateForm = <K extends keyof GRNForm>(key: K, value: GRNForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  /* ── Reset all ── */
  const resetAll = () => {
    setSelectedPOId("");
    setPoDetail(null);
    setSelectedItemName("");
    setCurrentCartonIdx(0);
    setScanState({});
    setScanInput("");
    setForm({
      grnDate: todayISODate(),
      vendorInvoiceNo: "",
      vendorChallanNo: "",
      vehicleNo: "",
      eWayBillNo: "",
      receivedBy: "",
      warehouse: "",
      remarks: "",
    });
  };

  /* ── Submit ── */
  /* ── Submit validation ── */
  const canSubmit = useMemo(() => {
    if (!poDetail) return false;
    if (overallProgress.scanned === 0) return false;
    
    // Strict rule: Every carton MUST be fully scanned (24 pairs) if it has at least 1 pair scanned
    for(const item of poDetail.items) {
      const cartons = scanState[item.itemName];
      if(!cartons) continue;
      
      for(let i=0; i<cartons.length; i++) {
        const prog = getCartonProgress(item.itemName, i);
        if(prog.scanned > 0 && prog.scanned < 24) return false; // Partial carton
      }
    }
    
    return true;
  }, [poDetail, overallProgress, scanState]);

  const submitGRN = async () => {
    if (!canSubmit || !poDetail) return;
    setSubmitting(true);

    try {
      const res = await grnService.create({
        poId: poDetail.id,
        form,
        scanState,
        totals: overallProgress,
      });

      setGrnHistory((prev) => [
        {
          grnId: res.data._id,
          grnNo: res.data.grnNo,
          refId: poDetail.poNo,
          vendorName: poDetail.vendorName,
          articleName: poDetail.items[0]?.itemName || "",
          totalPairs: overallProgress.scanned,
          cartons: res.data.cartons?.length || 0,
          createdAt: res.data.submittedAt || new Date().toISOString(),
        },
        ...prev,
      ]);

      toast.success("GRN submitted successfully");
      resetAll();
    } catch (err: any) {
      toast.error(err.message || "Failed to submit GRN");
    } finally {
      setSubmitting(false);
    }
  };

  /* ── PO dropdown options ── */
  const poOptions = poRefs.map((po) => po.poNo);
  const selectedPOLabel = poRefs.find((p) => p.id === selectedPOId)?.poNo || "";

  /* ── Item dropdown options ── */
  const itemOptions = (poDetail?.items || []).map((i) => i.itemName);


  /* ═══════════════════ RENDER ═══════════════════ */

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-visible">
        <div className="border-b border-slate-200 px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-emerald-50 p-3">
                <ClipboardList className="text-emerald-600" size={22} />
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-900">
                  Goods Receipt Note
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Select PO, fill basic info, receive items by scanning SKUs.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <TabButton
                active={activeTab === "scan"}
                onClick={() => setActiveTab("scan")}
                label="Create GRN"
              />
              <TabButton
                active={activeTab === "history"}
                onClick={() => setActiveTab("history")}
                label="History"
              />
            </div>
          </div>
        </div>

        {activeTab === "scan" && (
          <div className="p-4 sm:p-6 space-y-6">
            {/* ═══ STEP 1: Select PO ═══ */}
            <SectionCard
              icon={<Hash size={18} className="text-indigo-600" />}
              title="1. Select Purchase Order"
              className="z-60" // For dropdown visibility
              action={
                selectedPOId ? (
                  <button
                    type="button"
                    onClick={resetAll}
                    className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                  >
                    <RotateCcw size={16} />
                    Reset
                  </button>
                ) : null
              }
            >
              <div className="max-w-lg">
                <SearchableSelect
                  label="Purchase Order"
                  options={poOptions}
                  value={selectedPOLabel}
                  onChange={(val) => {
                    const ref = poRefs.find((p) => p.poNo === val);
                    if (ref) {
                      setSelectedPOId(ref.id);
                      setSelectedItemName("");
                      setCurrentCartonIdx(0);
                    }
                  }}
                  placeholder="Search and select PO..."
                />
              </div>

              {poLoading && (
                <div className="mt-6 flex items-center justify-center gap-2 py-10 text-slate-500">
                  <Loader2 size={18} className="animate-spin" />
                  Loading PO details...
                </div>
              )}

              {poDetail && !poLoading && (
                <div className="mt-6 space-y-4">
                  <p className="text-xs font-black uppercase tracking-widest text-slate-400">
                    PO Summary
                  </p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <InfoCard
                      icon={<Hash size={16} />}
                      label="PO Number"
                      value={poDetail.poNo}
                    />
                    <InfoCard
                      icon={<Building2 size={16} />}
                      label="Vendor"
                      value={poDetail.vendorName}
                    />
                    <InfoCard
                      icon={<CalendarDays size={16} />}
                      label="PO Date"
                      value={formatDate(poDetail.poDate)}
                    />
                    <InfoCard
                      icon={<Truck size={16} />}
                      label="Delivery Date"
                      value={formatDate(poDetail.deliveryDate)}
                    />
                    <InfoCard
                      icon={<MapPin size={16} />}
                      label="Ship To"
                      value={poDetail.shipTo}
                    />
                    <InfoCard
                      icon={<Boxes size={16} />}
                      label="Total Qty"
                      value={String(poDetail.totalQty)}
                    />
                    <InfoCard
                      icon={<Package size={16} />}
                      label="Items"
                      value={`${poDetail.items.length} variants`}
                    />
                    <InfoCard
                      icon={<FileText size={16} />}
                      label="Vendor Code"
                      value={poDetail.vendorCode}
                    />
                  </div>
                </div>
              )}
            </SectionCard>

            {/* ═══ STEP 2: GRN Basic Info ═══ */}
            {poDetail && (
              <SectionCard
                icon={<User size={18} className="text-emerald-600" />}
                title="2. GRN Basic Information"
              >
                {/* PO context banner */}
                <div className="mb-5 flex items-center gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/50 p-3">
                  <Hash size={16} className="text-indigo-600" />
                  <span className="text-sm font-bold text-indigo-900">
                    {poDetail?.poNo}
                  </span>
                  <span className="text-sm text-indigo-600">
                    • {poDetail?.vendorName}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <FormInput
                    label="GRN Date"
                    type="date"
                    value={form.grnDate}
                    onChange={(v) => updateForm("grnDate", v)}
                  />
                  <FormInput
                    label="Received By"
                    value={form.receivedBy}
                    onChange={(v) => updateForm("receivedBy", v)}
                  />
                  <FormInput
                    label="Vendor Invoice No"
                    value={form.vendorInvoiceNo}
                    onChange={(v) => updateForm("vendorInvoiceNo", v)}
                  />
                  <FormInput
                    label="Vendor Challan No"
                    value={form.vendorChallanNo}
                    onChange={(v) => updateForm("vendorChallanNo", v)}
                  />
                  <FormInput
                    label="Vehicle No"
                    value={form.vehicleNo}
                    onChange={(v) => updateForm("vehicleNo", v)}
                  />
                  <FormInput
                    label="E-Way Bill No"
                    value={form.eWayBillNo}
                    onChange={(v) => updateForm("eWayBillNo", v)}
                  />
                  <div className="sm:col-span-2 lg:col-span-3">
                    <FormInput
                      label="Warehouse / Location"
                      value={form.warehouse}
                      onChange={(v) => updateForm("warehouse", v)}
                    />
                  </div>
                  <div className="sm:col-span-2 lg:col-span-3">
                    <FormTextArea
                      label="Remarks"
                      value={form.remarks}
                      onChange={(v) => updateForm("remarks", v)}
                    />
                  </div>
                </div>
              </SectionCard>
            )}

            {/* ═══ STEP 3: Item Receiving ═══ */}
            {poDetail && (
              <div className="space-y-6">
                {/* PO context banner */}
                <div className="flex items-center gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/50 p-3">
                  <Hash size={16} className="text-indigo-600" />
                  <span className="text-sm font-bold text-indigo-900">
                    {poDetail.poNo}
                  </span>
                  <span className="text-sm text-indigo-600">
                    • {poDetail.vendorName}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
                  {/* ── Left: Dropdowns & Scanner ── */}
                  <div className="xl:col-span-5 space-y-5">
                    <SectionCard
                      icon={<ScanLine size={18} className="text-slate-900" />}
                      title="3. Select Item & Scan"
                      className="z-50" // ensure stacking over below cards if dropdown opens
                    >
                      <div className="space-y-5">
                        {/* Item dropdown */}
                        <SearchableSelect
                          label="PO Item"
                          options={itemOptions}
                          value={selectedItemName}
                          onChange={(val) => {
                            setSelectedItemName(val);
                            setScanInput("");
                          }}
                          placeholder="Select item to receive..."
                        />

                        {/* Selected Item Summary Area */}
                        {selectedItem && (
                          <div className="space-y-4">
                            <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4">
                               <div className="flex items-center justify-between mb-2">
                                 <p className="text-xs font-black uppercase tracking-widest text-indigo-400">Current Item</p>
                                 <StatusPill label="ACTIVE" tone="indigo" />
                               </div>
                               <p className="font-bold text-indigo-900">{selectedItem.itemName}</p>
                               <p className="text-xs text-indigo-600">{selectedItem.color} • {Object.keys(selectedItem.sizeMap).join(", ")}</p>
                            </div>
                            
                            {/* Simple Progress text */}
                            {(() => {
                              const ip = getItemProgress(selectedItemName);
                              const cp = getCartonProgress(selectedItemName, currentCartonIdx);
                              return (
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="px-1">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Item Total</p>
                                    <p className="text-sm font-bold text-slate-700">{ip.scanned} / {ip.total}</p>
                                  </div>
                                  <div className="px-1 text-right">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Current Carton</p>
                                    <p className="text-sm font-bold text-slate-700">{cp.scanned} / {cp.total}</p>
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        )}

                        {/* Scanner input */}
                        {selectedItem && (
                          <div className="space-y-4 pt-4 border-t border-slate-100">
                            <div className="relative">
                              <ScanLine
                                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                                size={18}
                              />
                              <input
                                ref={scanInputRef}
                                type="text"
                                autoComplete="off"
                                placeholder="Scan or type SKU here..."
                                value={scanInput}
                                onChange={(e) => setScanInput(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    handleScan();
                                  }
                                }}
                                className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-4 font-mono text-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100"
                              />
                            </div>

                             <p className="text-[10px] font-medium text-slate-500 italic">
                               Tip: Press Enter after scanning each SKU.
                             </p>
                          </div>
                        )}
                      </div>
                    </SectionCard>
                  </div>

                  {/* ── Right: Box Grid & Summary ── */}
                  <div className="xl:col-span-7 space-y-5">
                    {/* Box Grid */}
                    {selectedItem && (
                      <SectionCard
                        icon={<Boxes size={18} className="text-indigo-600" />}
                        title={`Carton View — ${selectedItemName} (Carton ${currentCartonIdx + 1})`}
                        action={
                          <button
                            type="button"
                            onClick={submitGRN}
                            disabled={!canSubmit || submitting}
                            className={`inline-flex items-center gap-2 rounded-2xl px-6 py-2.5 text-sm font-black transition ${
                              canSubmit && !submitting
                                ? "bg-emerald-600 text-white shadow-lg shadow-emerald-100 hover:bg-emerald-700"
                                : "bg-slate-100 text-slate-400 cursor-not-allowed"
                            }`}
                          >
                            {submitting ? (
                              <Loader2 size={16} className="animate-spin" />
                            ) : (
                              <PackageCheck size={16} />
                            )}
                            Submit GRN
                          </button>
                        }
                      >
                        <div className="mb-4">
                          <p className="text-sm text-slate-600">
                             <span className="font-bold text-emerald-600">{scannedCount}</span> of{" "}
                             <span className="font-bold text-emerald-600">24</span> pairs scanned in this carton
                          </p>
                        </div>

                        {/* Box cards grid: Responsive and dense */}
                     <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
  {boxes.map((box, idx) => (
    <div
      key={`${box.size}-${idx}`}
      className="group relative flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50/50 p-2 transition-all hover:bg-white hover:border-emerald-200 hover:shadow-sm"
    >
      {/* Sequence Number - Small & Subtle */}
      <span className="text-[10px] font-bold text-slate-400 tabular-nums ml-1">
        {String(idx + 1).padStart(2, '0')}
      </span>

      {/* Size Badge - The Primary Data Point */}
      <div className="flex h-8 w-10 shrink-0 items-center justify-center rounded bg-white font-mono text-xs font-bold text-slate-700 shadow-sm ring-1 ring-slate-200 group-hover:ring-emerald-500/30">
        {box.size}
      </div>

      {/* SKU & Status */}
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-mono text-[11px] font-medium tracking-tight text-slate-600 group-hover:text-emerald-700">
          {box.sku}
        </span>
        <div className="flex items-center gap-1">
          <div className="h-1 w-1 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[9px] font-semibold uppercase tracking-tighter text-emerald-600/80">
            Verified
          </span>
        </div>
      </div>

      {/* Subtle "New" Indicator (only for the last scanned item) */}
      {idx === boxes.length - 1 && (
        <div className="absolute -right-1 -top-1 flex h-4 w-4">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex h-4 w-4 rounded-full bg-emerald-500"></span>
        </div>
      )}
    </div>
  ))}
</div>
                      </SectionCard>
                    )}

                    {!selectedItem && (
                      <SectionCard
                        icon={<Boxes size={18} className="text-slate-400" />}
                        title="Box Grid"
                      >
                        <div className="py-12 text-center text-sm text-slate-400">
                          Select an item to begin receiving.
                        </div>
                      </SectionCard>
                    )}

                    {/* All items progress */}
                    <SectionCard
                      icon={
                        <PackageCheck size={18} className="text-emerald-600" />
                      }
                      title="All Items Status"
                    >
                      <div className="space-y-3">
                        {poDetail.items.flatMap((item) => {
                          return Array.from({
                            length: item.cartonCount || 1,
                          }).map((_, cIdx) => {
                            const prog = getCartonProgress(
                              item.itemName,
                              cIdx
                            );
                            const isDone = prog.scanned >= 24;
                            const isActive =
                              item.itemName === selectedItemName &&
                              cIdx === currentCartonIdx;

                            return (
                              <button
                                key={`${item.itemName}-${cIdx}`}
                                type="button"
                                onClick={() => {
                                  setSelectedItemName(item.itemName);
                                  setCurrentCartonIdx(cIdx);
                                }}
                                className={`w-full rounded-xl border p-3 text-left transition-all duration-200 ${
                                  isActive
                                    ? "border-emerald-500 bg-emerald-50 shadow-sm"
                                    : isDone
                                    ? "border-slate-100 bg-slate-50/50 opacity-80"
                                    : "border-slate-100 bg-white hover:border-indigo-200 hover:shadow-md hover:shadow-indigo-50/30"
                                }`}
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <div>
                                    <p className="font-bold text-slate-900">
                                      {item.itemName} — Carton {cIdx + 1}
                                    </p>
                                    <p className="text-xs text-slate-500">
                                      {item.color} •{" "}
                                      {Object.keys(item.sizeMap).join(", ")}
                                    </p>
                                  </div>
                                  <div className="text-right">
                                    {isDone ? (
                                      <StatusPill label="DONE" tone="emerald" />
                                    ) : isActive ? (
                                      <StatusPill
                                        label="ACTIVE"
                                        tone="indigo"
                                      />
                                    ) : prog.scanned > 0 ? (
                                      <StatusPill
                                        label="PARTIAL"
                                        tone="amber"
                                      />
                                    ) : (
                                      <StatusPill label="OPEN" tone="slate" />
                                    )}
                                    <p className="mt-1 text-xs font-bold text-slate-600">
                                      {prog.scanned}/{prog.total} pairs
                                    </p>
                                  </div>
                                </div>
                              </button>
                            );
                          });
                        })}
                      </div>
                    </SectionCard>
                  </div>
                </div>

                {/* ── Overall Summary Section (No Submit Button here) ── */}
                <SectionCard
                  icon={<ClipboardList size={18} className="text-slate-900" />}
                  title="Receiving Summary"
                >
                  <div className="space-y-4">
                    {overallProgress.scanned === 0 ? (
                      <BannerMessage
                        icon={<XCircle size={16} />}
                        tone="amber"
                      >
                        Scan at least one box to enable submission.
                      </BannerMessage>
                    ) : !canSubmit ? (
                      <BannerMessage
                        icon={<XCircle size={16} />}
                        tone="rose"
                      >
                        Cannot submit: One or more cartons are partially scanned. Each carton must have exactly 24 pairs.
                      </BannerMessage>
                    ) : (
                      <BannerMessage
                        icon={<CheckCircle2 size={16} />}
                        tone="emerald"
                      >
                        Ready to submit — {overallProgress.scanned} pairs (fully packed cartons) scanned.
                      </BannerMessage>
                    )}

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <MiniStatCard
                        label="Total Boxes"
                        value={overallProgress.total}
                        tone="slate"
                      />
                      <MiniStatCard
                        label="Scanned"
                        value={overallProgress.scanned}
                        tone="emerald"
                      />
                      <MiniStatCard
                        label="Pending"
                        value={
                          overallProgress.total - overallProgress.scanned
                        }
                        tone="amber"
                      />
                      <MiniStatCard
                        label="Items"
                        value={poDetail.items.length}
                        tone="indigo"
                      />
                    </div>
                  </div>
                </SectionCard>
              </div>
            )}
          </div>
        )}

        {/* ═══ HISTORY TAB ═══ */}
        {activeTab === "history" && (
          <div className="p-4 sm:p-6 transition-all duration-300">
            {viewingGRN ? (
              /* ── History Detail View ── */
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center justify-between gap-4">
                  <button
                    onClick={() => setViewingGRN(null)}
                    className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
                  >
                    <ArrowLeft size={16} />
                    Back to History
                  </button>
                  <p className="text-sm font-black uppercase tracking-widest text-slate-400">
                    ID: {viewingGRN._id}
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                  {/* Summary Card */}
                  <SectionCard
                    icon={<Activity size={18} className="text-indigo-600" />}
                    title="GRN Summary"
                  >
                    <div className="space-y-4">
                      <div className="flex flex-col gap-1 p-3 rounded-2xl bg-indigo-50/50 border border-indigo-100">
                        <p className="text-xs font-bold text-indigo-400 uppercase tracking-tight">GRN NUMBER</p>
                        <p className="text-xl font-black text-indigo-900">{viewingGRN.grnNo}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1 p-3 rounded-2xl bg-slate-50 border border-slate-100">
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-tight">Reference</p>
                          <p className="font-black text-slate-900">{viewingGRN.refId}</p>
                        </div>
                        <div className="flex flex-col gap-1 p-3 rounded-2xl bg-slate-50 border border-slate-100">
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-tight">Status</p>
                          <StatusPill label={viewingGRN.status} tone="emerald" />
                        </div>
                      </div>
                      <div className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-100">
                        <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-white border border-slate-200">
                          <Calendar size={18} className="text-slate-400" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-tight">Received On</p>
                          <p className="font-black text-slate-900">{formatDateTime(viewingGRN.submittedAt)}</p>
                        </div>
                      </div>
                    </div>
                  </SectionCard>

                  {/* Metadata Card */}
                  <SectionCard
                    icon={<Package size={18} className="text-emerald-600" />}
                    title="Contents Content"
                  >
                    <div className="space-y-4">
                      <div className="p-3 rounded-2xl bg-emerald-50/50 border border-emerald-100">
                        <p className="text-xs font-bold text-emerald-400 uppercase tracking-tight">VENDOR</p>
                        <p className="font-black text-slate-900">{viewingGRN.vendorName || "Not Specified"}</p>
                      </div>
                      <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-tight">MAIN ARTICLE</p>
                        <p className="font-black text-slate-900">{viewingGRN.articleName || "Not Specified"}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1 p-3 rounded-2xl bg-slate-50 border border-slate-100">
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-tight">Boxes</p>
                          <p className="font-black text-slate-900">{viewingGRN.cartons?.length || 0}</p>
                        </div>
                        <div className="flex flex-col gap-1 p-3 rounded-2xl bg-slate-50 border border-slate-100">
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-tight">Total Pairs</p>
                          <p className="font-black text-slate-900">{viewingGRN.totalPairs || 0}</p>
                        </div>
                      </div>
                    </div>
                  </SectionCard>

                  {/* Carton Breakdown */}
                  <div className="lg:col-span-1">
                    <SectionCard
                      icon={<PackageSearch size={18} className="text-amber-600" />}
                      title={`Cartons (${viewingGRN.cartons?.length || 0})`}
                    >
                      <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                        {viewingGRN.cartons?.map((carton: any, idx: number) => (
                          <div key={idx} className="p-4 rounded-2xl border border-slate-200 bg-white hover:border-amber-200 transition">
                            <div className="flex justify-between items-center mb-2">
                              <p className="text-sm font-black text-slate-900">BOX #{idx + 1}</p>
                              <StatusPill label={`${carton.pairBarcodes?.length} Pairs`} tone="amber" />
                            </div>
                            <p className="text-[10px] font-mono text-slate-400 break-all bg-slate-50 p-2 rounded-lg border border-slate-100 mb-2">
                              {carton.cartonBarcode}
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {/* Show count per unique SKU in this carton */}
                              {Object.entries(
                                (carton.pairBarcodes || []).reduce((acc: any, b: string) => {
                                  acc[b] = (acc[b] || 0) + 1;
                                  return acc;
                                }, {})
                              ).map(([sku, count]: any) => (
                                <div key={sku} className="flex items-center gap-1.5 rounded-lg bg-indigo-50 px-2 py-1 border border-indigo-100">
                                  <span className="text-[10px] font-black text-indigo-600">{sku}</span>
                                  <span className="h-4 w-4 flex items-center justify-center rounded-md bg-white text-[10px] font-black text-indigo-900 border border-indigo-200">
                                    {count}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </SectionCard>
                  </div>
                </div>
              </div>
            ) : (
              /* ── History List View ── */
              <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 bg-slate-50/50">
                  <div className="flex items-center gap-2">
                    <Package className="text-indigo-600" size={18} />
                    <p className="font-black text-slate-900">GRN History</p>
                  </div>
                  <div className="text-xs font-black uppercase tracking-widest text-slate-400">
                    Logs Found: <span className="text-slate-800">{grnHistory.length}</span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[800px] text-left">
                    <thead className="border-b border-slate-200 bg-white">
                      <tr>
                        <th className="px-5 py-4 text-xs font-black uppercase tracking-wider text-slate-500">GRN Info</th>
                        <th className="px-5 py-4 text-xs font-black uppercase tracking-wider text-slate-500">Vendor & Article</th>
                        <th className="px-5 py-4 text-xs font-black uppercase tracking-wider text-slate-500 text-center">Receipt Stats</th>
                        <th className="px-5 py-4 text-xs font-black uppercase tracking-wider text-slate-500">Date Received</th>
                        <th className="px-5 py-4 text-right"></th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-100">
                      {grnHistory.map((h) => (
                        <tr key={h.grnId} className="hover:bg-indigo-50/30 transition-colors group">
                          <td className="px-5 py-5">
                            <div className="flex flex-col gap-1">
                              <p className="text-sm font-black text-slate-900 group-hover:text-indigo-600 transition-colors">
                                {h.grnNo}
                              </p>
                              <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
                                <span className="bg-slate-100 px-1.5 py-0.5 rounded uppercase">Ref</span> {h.refId}
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-5">
                            <div className="flex flex-col gap-0.5">
                              <p className="text-sm font-bold text-slate-800">{h.vendorName || "—"}</p>
                              <p className="text-xs text-slate-500">{h.articleName || "—"}</p>
                            </div>
                          </td>
                          <td className="px-5 py-5">
                            <div className="flex items-center justify-center gap-2">
                              <div className="flex flex-col items-center">
                                <span className="text-xs font-black text-slate-900">{h.cartons}</span>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Boxes</span>
                              </div>
                              <div className="h-6 w-px bg-slate-200" />
                              <div className="flex flex-col items-center">
                                <span className="text-xs font-black text-emerald-600">{h.totalPairs}</span>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Pairs</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-5 whitespace-nowrap">
                            <div className="flex items-center gap-2 text-sm text-slate-600">
                              <Calendar size={14} className="text-slate-400" />
                              {formatDateTime(h.createdAt)}
                            </div>
                          </td>
                          <td className="px-5 py-5 text-right">
                            <button
                              onClick={() => viewGRNDetail(h.grnId)}
                              disabled={loadingHistoryDetail}
                              className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white transition hover:bg-indigo-600 disabled:opacity-50"
                            >
                              {loadingHistoryDetail ? "..." : "View Details"}
                            </button>
                          </td>
                        </tr>
                      ))}

                      {grnHistory.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-6 py-12">
                            <EmptyState label="No GRN history discovered yet." />
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default GRN;

/* ═══════════════════ Sub-Components ═══════════════════ */

const SectionCard: React.FC<{
  title: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}> = ({ title, icon, action, children, className = "" }) => {
  return (
    <div className={`rounded-3xl border border-slate-200 bg-white shadow-sm relative ${className}`}>
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div className="flex items-center gap-2">
          {icon}
          <p className="font-black text-slate-900">{title}</p>
        </div>
        {action}
      </div>
      <div className="p-5 relative">{children}</div>
    </div>
  );
};

const TabButton: React.FC<{
  active: boolean;
  onClick: () => void;
  label: string;
}> = ({ active, onClick, label }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl px-4 py-2 text-sm font-black transition ${
        active
          ? "bg-emerald-600 text-white shadow-lg shadow-emerald-100"
          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
      }`}
    >
      {label}
    </button>
  );
};

const InfoCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
}> = ({ icon, label, value }) => {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-2 flex items-center gap-2 text-slate-500">
        {icon}
        <p className="text-xs font-black uppercase tracking-widest">{label}</p>
      </div>
      <div className="break-words font-bold text-slate-900">{value || "—"}</div>
    </div>
  );
};

const FormInput: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}> = ({ label, value, onChange, type = "text" }) => {
  return (
    <div>
      <label className="mb-2 block text-xs font-black uppercase tracking-widest text-slate-400">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100"
      />
    </div>
  );
};

const FormTextArea: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
}> = ({ label, value, onChange }) => {
  return (
    <div>
      <label className="mb-2 block text-xs font-black uppercase tracking-widest text-slate-400">
        {label}
      </label>
      <textarea
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 p-3 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100"
      />
    </div>
  );
};

const StatusPill: React.FC<{
  label: string;
  tone: "rose" | "amber" | "emerald" | "slate" | "indigo";
}> = ({ label, tone }) => {
  const toneClass =
    tone === "rose"
      ? "bg-rose-50 text-rose-700"
      : tone === "amber"
      ? "bg-amber-50 text-amber-700"
      : tone === "emerald"
      ? "bg-emerald-50 text-emerald-700"
      : tone === "indigo"
      ? "bg-indigo-50 text-indigo-700"
      : "bg-slate-100 text-slate-700";

  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-black ${toneClass}`}
    >
      {label}
    </span>
  );
};

const MiniStatCard: React.FC<{
  label: string;
  value: number | string;
  tone: "slate" | "emerald" | "amber" | "indigo";
}> = ({ label, value, tone }) => {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "amber"
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : tone === "indigo"
      ? "border-indigo-200 bg-indigo-50 text-indigo-700"
      : "border-slate-200 bg-slate-50 text-slate-700";

  return (
    <div className={`rounded-2xl border p-3 ${toneClass}`}>
      <p className="text-[10px] font-black uppercase tracking-widest opacity-70">
        {label}
      </p>
      <p className="mt-1 text-lg font-black">{value}</p>
    </div>
  );
};

const BannerMessage: React.FC<{
  children: React.ReactNode;
  icon: React.ReactNode;
  tone: "rose" | "amber" | "emerald" | "slate";
}> = ({ children, icon, tone }) => {
  const toneClass =
    tone === "rose"
      ? "bg-rose-50 border-rose-200 text-rose-700"
      : tone === "amber"
      ? "bg-amber-50 border-amber-200 text-amber-800"
      : tone === "emerald"
      ? "bg-emerald-50 border-emerald-200 text-emerald-700"
      : "bg-slate-100 border-slate-200 text-slate-700";

  return (
    <div
      className={`flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-bold ${toneClass}`}
    >
      {icon}
      {children}
    </div>
  );
};

const EmptyState: React.FC<{ label: string }> = ({ label }) => {
  return (
    <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-slate-400">
      {label}
    </div>
  );
};