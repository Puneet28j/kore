import React, { useMemo, useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  Barcode,
  Boxes,
  CheckCircle2,
  ClipboardList,
  Layers,
  Search,
  Trash2,
  XCircle,
  RotateCcw,
  PackageCheck,
  Package,
  Loader2,
  Building2,
  CalendarDays,
  Hash,
  Truck,
  FileText,
  User,
  MapPin,
  ChevronRight,
  ScanLine,
  Receipt,
  Warehouse,
  CircleDashed,
} from "lucide-react";
import { grnService } from "../../services/grnService";

type RefType = "PO" | "CAT";

type RefItem = {
  id: string;
  refType: RefType;
  refNo: string;
  party?: string;
  article?: string;
};

type Carton = {
  cartonBarcode: string;
  poItemKey: string;
  itemLabel: string;
  scannedQty: number;
  scans: string[];
  lockedAt: string;
};

type GRNHistoryItem = {
  grnNo: string;
  refId: string;
  cartons: number;
  createdAt: string;
};

type PODetailItem = {
  sku: string;
  itemName?: string;
  color?: string;
  size?: string;
  qty: number;
  receivedQty?: number;
  pendingQty?: number;
};

type PODetail = {
  id: string;
  poNo: string;
  vendorName?: string;
  vendorCode?: string;
  poDate?: string;
  deliveryDate?: string;
  invoiceTo?: string;
  shipTo?: string;
  totalQty: number;
  totalValue?: number;
  gstAmount?: number;
  items: PODetailItem[];
};

type POScanItem = {
  key: string;
  sku: string;
  itemName?: string;
  color?: string;
  size?: string;
  qty: number;
  receivedQty: number;
  pendingQty: number;
};

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

const PAIRS_PER_CARTON = 24;

const todayYYYYMMDD = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
};

const todayISODate = () => new Date().toISOString().slice(0, 10);

const makeCartonBarcode = (refType: RefType, refNo: string, serial: number) => {
  return `CTN-${todayYYYYMMDD()}-${refType}-${refNo}-${String(serial).padStart(
    3,
    "0"
  )}`;
};

const formatDate = (value?: string) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString();
};

const formatDateTime = (value?: string) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
};

const percent = (value: number, total: number) => {
  if (!total) return 0;
  return Math.min(100, Math.max(0, Math.round((value / total) * 100)));
};

const GRN: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRefId, setSelectedRefId] = useState<string>("");
  const [refs, setRefs] = useState<RefItem[]>([]);
  const [refsLoading, setRefsLoading] = useState(false);

  const [poDetail, setPoDetail] = useState<PODetail | null>(null);
  const [poLoading, setPoLoading] = useState(false);

  const [poScanItems, setPoScanItems] = useState<POScanItem[]>([]);
  const [activeItemKey, setActiveItemKey] = useState<string>("");

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

  const selectedRef = useMemo(
    () => refs.find((r) => r.id === selectedRefId) || null,
    [selectedRefId, refs]
  );

  const activeItem = useMemo(
    () => poScanItems.find((x) => x.key === activeItemKey) || null,
    [activeItemKey, poScanItems]
  );

  const hiddenInputRef = useRef<HTMLInputElement>(null);

  const [pairInput, setPairInput] = useState("");
  const [currentScans, setCurrentScans] = useState<string[]>([]);
  const [cartons, setCartons] = useState<Carton[]>([]);
  const [cartonSerial, setCartonSerial] = useState<number>(1);

  const [expandedCarton, setExpandedCarton] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [grnHistory, setGrnHistory] = useState<GRNHistoryItem[]>([]);
  const [activeTab, setActiveTab] = useState<"scan" | "history">("scan");

  useEffect(() => {
    if (selectedRef && activeItem && activeTab === "scan") {
      const timer = setTimeout(() => hiddenInputRef.current?.focus(), 120);
      return () => clearTimeout(timer);
    }
  }, [selectedRef, activeItem, activeTab]);

  useEffect(() => {
    let cancelled = false;

    const loadHistory = async () => {
      try {
        const res = await grnService.history();
        if (cancelled) return;

        const list: GRNHistoryItem[] = (res.data || []).map((h: any) => ({
          grnNo: h.grnNo,
          refId: h.refId,
          cartons: h.cartons,
          createdAt: h.createdAt,
        }));

        setGrnHistory(list);
      } catch (e) {
        console.error(e);
        toast.error("Failed to fetch GRN history");
      }
    };

    loadHistory();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const fetchRefs = async () => {
      setRefsLoading(true);
      setRefs([]);

      try {
        const res = await grnService.listReferences(searchTerm);
        if (cancelled) return;

        const list: RefItem[] = (res.data || [])
          .map((r: any) => {
            const extractRefNo = (id: string) => {
              const parts = String(id || "").split("-");
              return parts.length > 1 ? parts.slice(1).join("-") : id;
            };

            return {
              id: r.id,
              refType: r.refType,
              refNo: r.refNo || extractRefNo(r.id),
              party: r.party || "",
              article: r.article || "",
            };
          })
          .filter((x: RefItem) => x.refType === "PO");

        setRefs(list);
      } catch (err) {
        console.error(err);
        toast.error("Failed to load references");
      } finally {
        setRefsLoading(false);
      }
    };

    fetchRefs();
    return () => {
      cancelled = true;
    };
  }, [searchTerm]);

  useEffect(() => {
    let cancelled = false;

    const fetchPODetail = async () => {
      if (!selectedRefId) {
        setPoDetail(null);
        setPoScanItems([]);
        setActiveItemKey("");
        return;
      }

      try {
        setPoLoading(true);

        const res = await grnService.getReferenceDetail(selectedRefId);
        if (cancelled) return;

        const data = res?.data;

        const normalized: PODetail = {
          id: data?.id || selectedRefId,
          poNo: data?.poNo || selectedRefId,
          vendorName: data?.vendorName || data?.party || "",
          vendorCode: data?.vendorCode || "",
          poDate: data?.poDate || "",
          deliveryDate: data?.deliveryDate || "",
          invoiceTo: data?.invoiceTo || "",
          shipTo: data?.shipTo || "",
          totalQty:
            data?.totalQty ||
            (data?.items || []).reduce(
              (sum: number, item: any) => sum + Number(item.qty || 0),
              0
            ),
          totalValue: Number(data?.totalValue || 0),
          gstAmount: Number(data?.gstAmount || 0),
          items: (data?.items || []).map((item: any) => ({
            sku: item.sku || item.itemName || "—",
            itemName: item.itemName || "",
            color: item.color || "",
            size: item.size || "",
            qty: Number(item.qty || 0),
            receivedQty: Number(item.receivedQty || 0),
            pendingQty: Number(
              item.pendingQty ??
                Number(item.qty || 0) - Number(item.receivedQty || 0)
            ),
          })),
        };

        const scanItems: POScanItem[] = normalized.items.map(
          (item: PODetailItem, idx: number) => {
            const qty = Number(item.qty || 0);
            const receivedQty = Number(item.receivedQty || 0);
            const key = [
              item.itemName || item.sku || "ITEM",
              item.color || "NA",
              item.size || "NA",
              idx,
            ].join("::");

            return {
              key,
              sku: item.sku || "",
              itemName: item.itemName || "",
              color: item.color || "",
              size: item.size || "",
              qty,
              receivedQty,
              pendingQty: Math.max(qty - receivedQty, 0),
            };
          }
        );

        setPoDetail(normalized);
        setPoScanItems(scanItems);
        setActiveItemKey(scanItems.find((x) => x.pendingQty > 0)?.key || "");
      } catch (err) {
        console.error(err);
        setPoDetail(null);
        setPoScanItems([]);
        setActiveItemKey("");
        toast.error("Failed to load PO details");
      } finally {
        setPoLoading(false);
      }
    };

    fetchPODetail();
    return () => {
      cancelled = true;
    };
  }, [selectedRefId]);

  const currentCount = currentScans.length;

  const receivedPairs = cartons.reduce((sum, carton) => sum + carton.scannedQty, 0);
  const totalScannedPairs = receivedPairs + currentScans.length;
  const expectedQty = poDetail?.totalQty || 0;
  const pendingQty = Math.max(expectedQty - receivedPairs, 0);

  const totalItemReceived = poScanItems.reduce((sum, item) => sum + item.receivedQty, 0);
  const totalItemPending = poScanItems.reduce((sum, item) => sum + item.pendingQty, 0);

  const canSubmit =
    !!selectedRef &&
    !!poDetail &&
    cartons.length > 0 &&
    currentScans.length === 0 &&
    totalItemReceived > 0 &&
    totalItemReceived <= expectedQty &&
    totalItemPending >= 0;

  const progressOverall = percent(totalItemReceived, expectedQty);
  const progressCarton = percent(currentCount, PAIRS_PER_CARTON);

  const resetAll = () => {
    setPairInput("");
    setCurrentScans([]);
    setCartons([]);
    setCartonSerial(1);
    setExpandedCarton(null);
  };

  const resetForm = () => {
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

  const onSelectRef = (id: string) => {
    setSelectedRefId("");
    setPoDetail(null);
    setPoScanItems([]);
    setActiveItemKey("");
    resetAll();
    resetForm();
    setSelectedRefId(id);
  };

  const getItemLabel = (
    item: Pick<POScanItem, "itemName" | "sku" | "color" | "size">
  ) => {
    return [item.itemName || item.sku || "Item", item.color, item.size]
      .filter(Boolean)
      .join(" • ");
  };

  const validateScan = (codeRaw: string) => {
    const code = (codeRaw || "").trim();

    if (!selectedRef) return "Please select PO first.";
    if (!poDetail) return "PO detail not loaded yet.";
    if (!activeItem) return "Please select PO item first.";
    if (!code) return "Scan value required.";

    const liveCount = activeItem.receivedQty + currentScans.length;
    if (liveCount + 1 > activeItem.qty) {
      return `Scanned qty exceeds pending qty for ${getItemLabel(activeItem)}`;
    }

    return "";
  };

  const lockCurrentCarton = (scans: string[]) => {
    if (!selectedRef || !activeItem || scans.length === 0) return;

    const cartonBarcode = makeCartonBarcode(
      selectedRef.refType,
      selectedRef.refNo,
      cartonSerial
    );

    const newCarton: Carton = {
      cartonBarcode,
      poItemKey: activeItem.key,
      itemLabel: getItemLabel(activeItem),
      scannedQty: scans.length,
      scans,
      lockedAt: new Date().toISOString(),
    };

    setCartons((prev) => [newCarton, ...prev]);

    setPoScanItems((prev) => {
      const updated = prev.map((item) => {
        if (item.key !== activeItem.key) return item;
        const nextReceived = item.receivedQty + scans.length;
        return {
          ...item,
          receivedQty: nextReceived,
          pendingQty: Math.max(item.qty - nextReceived, 0),
        };
      });

      const currentUpdated = updated.find((item) => item.key === activeItem.key);
      if (currentUpdated && currentUpdated.pendingQty <= 0) {
        const nextOpenItem = updated.find(
          (item) => item.key !== activeItem.key && item.pendingQty > 0
        );
        setActiveItemKey(nextOpenItem?.key || "");
      }

      return updated;
    });

    setCartonSerial((s) => s + 1);
    setCurrentScans([]);
    setExpandedCarton(cartonBarcode);
  };

  const handleScan = () => {
    const code = (pairInput || "").trim();
    const err = validateScan(code);

    if (err) {
      toast.error(err);
      setPairInput("");
      return;
    }

    setCurrentScans((prev) => {
      const next = [...prev, code];

      if (next.length === PAIRS_PER_CARTON) {
        lockCurrentCarton(next);
        setPairInput("");
        toast.success("Carton locked successfully");
        return [];
      }

      setPairInput("");
      return next;
    });
  };

  const rescanCarton = () => {
    setCurrentScans([]);
    setPairInput("");
    hiddenInputRef.current?.focus();
  };

  const removeCompletedCarton = (cartonBarcode: string) => {
    const target = cartons.find((c) => c.cartonBarcode === cartonBarcode);
    if (!target) return;

    if (!window.confirm(`Remove carton ${cartonBarcode}?`)) return;

    setPoScanItems((prev) =>
      prev.map((item) => {
        if (item.key !== target.poItemKey) return item;
        const nextReceived = Math.max(item.receivedQty - target.scannedQty, 0);
        return {
          ...item,
          receivedQty: nextReceived,
          pendingQty: Math.max(item.qty - nextReceived, 0),
        };
      })
    );

    setCartons((prev) => prev.filter((c) => c.cartonBarcode !== cartonBarcode));

    const restoredItem = poScanItems.find((item) => item.key === target.poItemKey);
    if (!activeItemKey || (restoredItem && restoredItem.pendingQty <= 0)) {
      setActiveItemKey(target.poItemKey);
    }

    if (expandedCarton === cartonBarcode) setExpandedCarton(null);
  };

  const updateForm = <K extends keyof GRNForm>(key: K, value: GRNForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const submitGRN = async () => {
    if (!canSubmit || !selectedRef || !poDetail) return;

    const payload = {
      refId: selectedRef.id,
      refType: selectedRef.refType,
      poNo: poDetail.poNo,
      grnDate: form.grnDate,
      vendorInvoiceNo: form.vendorInvoiceNo,
      vendorChallanNo: form.vendorChallanNo,
      vehicleNo: form.vehicleNo,
      eWayBillNo: form.eWayBillNo,
      receivedBy: form.receivedBy,
      warehouse: form.warehouse,
      remarks: form.remarks,
      cartons: cartons.map((c) => ({
        cartonBarcode: c.cartonBarcode,
        poItemKey: c.poItemKey,
        itemLabel: c.itemLabel,
        scannedQty: c.scannedQty,
        scans: c.scans,
        lockedAt: c.lockedAt,
      })),
      items: poScanItems.map((item) => ({
        key: item.key,
        sku: item.sku,
        itemName: item.itemName,
        color: item.color,
        size: item.size,
        orderedQty: item.qty,
        receivedQty: item.receivedQty,
        pendingQty: item.pendingQty,
      })),
      totals: {
        expectedQty,
        receivedQty: totalItemReceived,
        cartons: cartons.length,
        pendingQty: totalItemPending,
      },
    };

    setLoading(true);

    const promise = (async () => {
      const res = await grnService.create(payload);
      const saved = res?.data;

      setGrnHistory((prev) => [
        {
          grnNo:
            saved?.grnNo ||
            `GRN-${todayYYYYMMDD()}-${Math.floor(Math.random() * 900 + 100)}`,
          refId: selectedRef.id,
          cartons: cartons.length,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);

      const refId = selectedRef.id;
      resetAll();
      resetForm();
      setSelectedRefId(refId);
      await Promise.resolve();
    })();

    toast.promise(promise, {
      loading: "Submitting GRN...",
      success: `GRN submitted successfully • ${selectedRef.id} • ${cartons.length} cartons`,
      error: "Failed to submit GRN",
    });

    promise.finally(() => setLoading(false));
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
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
                  PO select karo, item receive karo, 24 pair carton lock karo, fir GRN submit karo.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <TabButton
                active={activeTab === "scan"}
                onClick={() => setActiveTab("scan")}
                label="Scan & Submit"
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
          <div className="p-4 sm:p-6">
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
              <TopMetricCard
                icon={<Hash size={18} />}
                label="Selected PO"
                value={selectedRef?.id || "Not selected"}
                tone="slate"
              />
              <TopMetricCard
                icon={<Boxes size={18} />}
                label="Expected Qty"
                value={String(expectedQty || 0)}
                tone="indigo"
              />
              <TopMetricCard
                icon={<PackageCheck size={18} />}
                label="Received Qty"
                value={String(totalItemReceived || 0)}
                tone="emerald"
              />
              <TopMetricCard
                icon={<CircleDashed size={18} />}
                label="Pending Qty"
                value={String(totalItemPending || 0)}
                tone="amber"
              />
            </div>

            <div className="mt-4 rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                <ProgressStrip
                  title="Overall Receiving Progress"
                  value={`${totalItemReceived}/${expectedQty || 0}`}
                  percentValue={progressOverall}
                  colorClass="bg-emerald-600"
                  hint="PO wise total received"
                />
                <ProgressStrip
                  title="Current Carton Progress"
                  value={`${currentCount}/${PAIRS_PER_CARTON}`}
                  percentValue={progressCarton}
                  colorClass="bg-indigo-600"
                  hint="24 complete hote hi carton lock"
                />
                <ProgressStrip
                  title="Locked Cartons"
                  value={String(cartons.length)}
                  percentValue={percent(cartons.length, Math.max(cartons.length, 1))}
                  colorClass="bg-slate-900"
                  hint="Completed carton count"
                />
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-12">
              <div className="xl:col-span-4 space-y-6">
                <SectionCard
                  icon={<Layers size={18} className="text-indigo-600" />}
                  title="Step 1: Select Purchase Order"
                  action={
                    <button
                      type="button"
                      onClick={resetAll}
                      className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                    >
                      <RotateCcw size={16} />
                      Reset Scan
                    </button>
                  }
                >
                  <div className="space-y-4">
                    <div className="relative">
                      <Search
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                        size={18}
                      />
                      <input
                        type="text"
                        placeholder="Search PO number / vendor"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-4 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-xs font-black uppercase tracking-widest text-slate-400">
                        Purchase Order
                      </label>
                      <select
                        value={selectedRefId}
                        onChange={(e) => onSelectRef(e.target.value)}
                        disabled={refsLoading}
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 font-semibold outline-none focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100"
                      >
                        <option value="">-- Select PO --</option>
                        {refsLoading ? (
                          <option>Loading...</option>
                        ) : refs.length === 0 ? (
                          <option value="">No purchase orders found</option>
                        ) : (
                          refs.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.id} • {r.party || "—"} {r.article ? `• ${r.article}` : ""}
                            </option>
                          ))
                        )}
                      </select>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs font-black uppercase tracking-widest text-slate-400">
                        Selected Reference
                      </p>
                      <div className="mt-3 space-y-2 text-sm">
                        <div className="font-black text-slate-900">
                          {selectedRef?.id || "No PO selected"}
                        </div>
                        <div className="text-slate-600">
                          Vendor: <span className="font-semibold">{selectedRef?.party || "—"}</span>
                        </div>
                        <div className="text-slate-600">
                          Article: <span className="font-semibold">{selectedRef?.article || "—"}</span>
                        </div>
                      </div>
                    </div>

                    {!selectedRef && (
                      <AlertNote tone="rose" title="PO required">
                        GRN start karne ke liye pehle PO select karo.
                      </AlertNote>
                    )}
                  </div>
                </SectionCard>

                <SectionCard
                  icon={<User size={18} className="text-emerald-600" />}
                  title="Step 2: GRN Basic Info"
                >
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                    <div className="sm:col-span-2">
                      <FormInput
                        label="Warehouse / Location"
                        value={form.warehouse}
                        onChange={(v) => updateForm("warehouse", v)}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <FormTextArea
                        label="Remarks"
                        value={form.remarks}
                        onChange={(v) => updateForm("remarks", v)}
                      />
                    </div>
                  </div>
                </SectionCard>
              </div>

              <div className="xl:col-span-8 space-y-6">
                <SectionCard
                  icon={<FileText size={18} className="text-emerald-600" />}
                  title="PO Summary"
                >
                  {poLoading ? (
                    <div className="flex items-center justify-center gap-2 py-10 text-slate-500">
                      <Loader2 size={18} className="animate-spin" />
                      Loading PO details...
                    </div>
                  ) : !poDetail ? (
                    <EmptyState label="No PO selected or no PO data found." />
                  ) : (
                    <div className="space-y-5">
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <SummaryCard icon={<Hash size={16} />} label="PO Number" value={poDetail.poNo || "—"} />
                        <SummaryCard icon={<Building2 size={16} />} label="Vendor Name" value={poDetail.vendorName || "—"} />
                        <SummaryCard icon={<CalendarDays size={16} />} label="PO Date" value={formatDate(poDetail.poDate)} />
                        <SummaryCard icon={<Truck size={16} />} label="Delivery Date" value={formatDate(poDetail.deliveryDate)} />
                        <SummaryCard icon={<Receipt size={16} />} label="Vendor Code" value={poDetail.vendorCode || "—"} />
                        <SummaryCard icon={<Warehouse size={16} />} label="Ship To" value={poDetail.shipTo || "—"} />
                        <SummaryCard icon={<Boxes size={16} />} label="Total Qty" value={String(poDetail.totalQty || 0)} />
                        <SummaryCard icon={<PackageCheck size={16} />} label="Total Value" value={String(poDetail.totalValue || 0)} />
                      </div>

                      <div>
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <p className="text-sm font-black text-slate-900">Item-wise Receiving Status</p>
                          <div className="text-xs font-bold text-slate-500">
                            Active item pe click ya dropdown se select karo
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                          {poScanItems.map((item) => {
                            const isActive = activeItemKey === item.key;
                            const isDone = item.pendingQty === 0;

                            return (
                              <button
                                key={item.key}
                                type="button"
                                onClick={() => {
                                  if (item.pendingQty <= 0) return;
                                  setActiveItemKey(item.key);
                                  setCurrentScans([]);
                                  setPairInput("");
                                  setTimeout(() => hiddenInputRef.current?.focus(), 100);
                                }}
                                className={`rounded-3xl border p-4 text-left transition ${
                                  isActive
                                    ? "border-emerald-300 bg-emerald-50 shadow-sm"
                                    : isDone
                                    ? "border-slate-200 bg-slate-50"
                                    : "border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/40"
                                }`}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <div className="font-black text-slate-900">{getItemLabel(item)}</div>
                                    <div className="mt-1 text-sm text-slate-500">SKU: {item.sku || "—"}</div>
                                  </div>

                                  <div>
                                    {isActive ? (
                                      <StatusPill label="ACTIVE" tone="emerald" />
                                    ) : isDone ? (
                                      <StatusPill label="DONE" tone="slate" />
                                    ) : (
                                      <StatusPill label="OPEN" tone="indigo" />
                                    )}
                                  </div>
                                </div>

                                <div className="mt-4 grid grid-cols-3 gap-2">
                                  <MiniStat label="Ordered" value={item.qty} />
                                  <MiniStat label="Received" value={item.receivedQty} />
                                  <MiniStat label="Pending" value={item.pendingQty} />
                                </div>

                                <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200">
                                  <div
                                    className={`h-full rounded-full ${
                                      isDone ? "bg-slate-700" : isActive ? "bg-emerald-600" : "bg-indigo-600"
                                    }`}
                                    style={{ width: `${percent(item.receivedQty, item.qty)}%` }}
                                  />
                                </div>
                              </button>
                            );
                          })}

                          {poScanItems.length === 0 && (
                            <div className="lg:col-span-2">
                              <EmptyState label="No PO items found." />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </SectionCard>

                <div className="grid grid-cols-1 gap-6 2xl:grid-cols-5">
                  <div className="2xl:col-span-3">
                    <SectionCard
                      icon={<ScanLine size={18} className="text-slate-900" />}
                      title="Step 3: Direct Scanner Receiving"
                    >
                      <div
                        className="space-y-5"
                        onClick={() => {
                          if (selectedRef && poDetail && activeItem) {
                            hiddenInputRef.current?.focus();
                          }
                        }}
                      >
                        <input
                          ref={hiddenInputRef}
                          type="text"
                          autoComplete="off"
                          className="absolute opacity-0 pointer-events-none"
                          value={pairInput}
                          onChange={(e) => setPairInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleScan();
                            }
                          }}
                          disabled={!selectedRef || !poDetail || !activeItem}
                        />

                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                          <div>
                            <label className="mb-2 block text-xs font-black uppercase tracking-widest text-slate-400">
                              Active PO Item
                            </label>
                            <select
                              value={activeItemKey}
                              onChange={(e) => {
                                setActiveItemKey(e.target.value);
                                setCurrentScans([]);
                                setPairInput("");
                                setTimeout(() => hiddenInputRef.current?.focus(), 100);
                              }}
                              disabled={!selectedRef || !poDetail || poScanItems.length === 0}
                              className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 font-semibold outline-none focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100"
                            >
                              <option value="">-- Select Item --</option>
                              {poScanItems
                                .filter((item) => item.pendingQty > 0)
                                .map((item) => (
                                  <option key={item.key} value={item.key}>
                                    {getItemLabel(item)} • Pending: {item.pendingQty}
                                  </option>
                                ))}
                            </select>
                          </div>

                          <div className="flex items-end gap-2">
                            <button
                              type="button"
                              onClick={rescanCarton}
                              disabled={currentCount === 0}
                              className={`inline-flex h-[50px] items-center gap-2 rounded-2xl px-4 font-bold transition ${
                                currentCount === 0
                                  ? "cursor-not-allowed bg-slate-100 text-slate-400"
                                  : "bg-rose-50 text-rose-700 hover:bg-rose-100"
                              }`}
                            >
                              <RotateCcw size={16} />
                              Rescan Current Carton
                            </button>
                          </div>
                        </div>

                        <div
                          className={`rounded-3xl border p-5 ${
                            selectedRef && poDetail && activeItem
                              ? "border-emerald-200 bg-emerald-50"
                              : "border-slate-200 bg-slate-50"
                          }`}
                        >
                          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                            <div>
                              <p
                                className={`text-lg font-black ${
                                  selectedRef && poDetail && activeItem
                                    ? "text-emerald-900"
                                    : "text-slate-700"
                                }`}
                              >
                                {selectedRef && poDetail && activeItem
                                  ? "Scanner Ready"
                                  : "Select PO and item first"}
                              </p>
                              <p
                                className={`mt-1 text-sm ${
                                  selectedRef && poDetail && activeItem
                                    ? "text-emerald-700"
                                    : "text-slate-500"
                                }`}
                              >
                                Hardware scanner se direct scan karo. Enter par 1 qty add hogi.
                              </p>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <StatusPill label={`Carton ${currentCount}/${PAIRS_PER_CARTON}`} tone="amber" />
                              <StatusPill label={`Locked ${cartons.length}`} tone="indigo" />
                              <StatusPill label={`Scanned ${totalScannedPairs}`} tone="emerald" />
                            </div>
                          </div>

                          {activeItem && (
                            <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
                              <MiniStatSoft label="Item" value={getItemLabel(activeItem)} />
                              <MiniStatSoft label="Ordered" value={activeItem.qty} />
                              <MiniStatSoft label="Received" value={activeItem.receivedQty} />
                              <MiniStatSoft label="Pending" value={activeItem.pendingQty} />
                            </div>
                          )}
                        </div>

                        {currentCount > 0 && currentCount < PAIRS_PER_CARTON && (
                          <AlertNote tone="amber" title="Partial carton not allowed">
                            Current carton ko submit karne se pehle 24/24 complete hona chahiye.
                          </AlertNote>
                        )}

                        {poDetail && totalItemReceived >= expectedQty && (
                          <AlertNote tone="emerald" title="PO quantity completed">
                            Is PO ki expected quantity complete ho chuki hai. Aage ka scan blocked rehna chahiye.
                          </AlertNote>
                        )}

                        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <p className="text-sm font-black text-slate-900">Current Carton Slots</p>
                            <span className="text-xs font-bold text-slate-500">
                              {currentCount} / {PAIRS_PER_CARTON} scanned
                            </span>
                          </div>

                          <PairSlots24 pairs={currentScans} />

                          {currentScans.length === 0 && (
                            <div className="mt-3 text-sm italic text-slate-400">
                              Scanner ready hone ke baad har scan current carton me 1 qty add karega.
                            </div>
                          )}
                        </div>
                      </div>
                    </SectionCard>
                  </div>

                  <div className="2xl:col-span-2">
                    <SectionCard
                      icon={<Boxes size={18} className="text-indigo-600" />}
                      title="Step 4: Locked Cartons"
                    >
                      <div className="space-y-3">
                        {cartons.length === 0 ? (
                          <EmptyState label="No cartons locked yet. 24 scans complete hote hi carton yahan show hoga." />
                        ) : (
                          cartons.map((c) => {
                            const isOpen = expandedCarton === c.cartonBarcode;
                            return (
                              <div
                                key={c.cartonBarcode}
                                className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-50"
                              >
                                <div className="p-4">
                                  <div className="flex items-start justify-between gap-3">
                                    <div>
                                      <div className="font-mono text-sm font-black text-slate-900">
                                        {c.cartonBarcode}
                                      </div>
                                      <div className="mt-1 text-sm text-slate-600">{c.itemLabel}</div>
                                      <div className="mt-1 text-xs text-slate-500">
                                        Locked: {formatDateTime(c.lockedAt)}
                                      </div>
                                    </div>

                                    <div className="flex flex-wrap items-center justify-end gap-2">
                                      <StatusPill
                                        label={`${c.scannedQty}/${PAIRS_PER_CARTON}`}
                                        tone="emerald"
                                      />
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setExpandedCarton(isOpen ? null : c.cartonBarcode)
                                        }
                                        className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                                      >
                                        {isOpen ? "Hide" : "View"}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => removeCompletedCarton(c.cartonBarcode)}
                                        className="rounded-2xl p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                                        title="Remove carton"
                                      >
                                        <Trash2 size={16} />
                                      </button>
                                    </div>
                                  </div>
                                </div>

                                {isOpen && (
                                  <div className="border-t border-slate-200 bg-white p-4">
                                    <div className="mb-3 text-xs font-black uppercase tracking-widest text-slate-400">
                                      Scan Logs ({c.scans.length})
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                      {c.scans.map((p, idx) => (
                                        <span
                                          key={`${c.cartonBarcode}-${idx}-${p}`}
                                          className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-mono font-bold text-slate-700"
                                        >
                                          {p}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </SectionCard>
                  </div>
                </div>

                <SectionCard
                  icon={<PackageCheck size={18} className="text-slate-900" />}
                  title="Step 5: Submit GRN"
                >
                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                    <div className="lg:col-span-2 space-y-3">
                      {!selectedRef ? (
                        <BadgeMessage icon={<XCircle size={16} />} tone="rose">
                          Select PO to enable submit
                        </BadgeMessage>
                      ) : !poDetail ? (
                        <BadgeMessage
                          icon={<Loader2 size={16} className="animate-spin" />}
                          tone="slate"
                        >
                          Loading PO details
                        </BadgeMessage>
                      ) : !activeItem && poScanItems.some((x) => x.pendingQty > 0) ? (
                        <BadgeMessage icon={<XCircle size={16} />} tone="amber">
                          Select PO item for scanning
                        </BadgeMessage>
                      ) : currentScans.length !== 0 ? (
                        <BadgeMessage icon={<XCircle size={16} />} tone="amber">
                          Current carton incomplete ({currentCount}/{PAIRS_PER_CARTON})
                        </BadgeMessage>
                      ) : cartons.length === 0 ? (
                        <BadgeMessage icon={<XCircle size={16} />} tone="slate">
                          At least 1 locked carton required
                        </BadgeMessage>
                      ) : totalItemReceived > expectedQty ? (
                        <BadgeMessage icon={<XCircle size={16} />} tone="rose">
                          Received qty exceeds PO qty
                        </BadgeMessage>
                      ) : (
                        <BadgeMessage icon={<CheckCircle2 size={16} />} tone="emerald">
                          Ready to submit
                        </BadgeMessage>
                      )}

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <MiniSummary label="Expected Qty" value={expectedQty} />
                        <MiniSummary label="Received Qty" value={totalItemReceived} />
                        <MiniSummary label="Pending Qty" value={pendingQty} />
                        <MiniSummary label="Locked Cartons" value={cartons.length} />
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                        Submit tab se pehle ensure karo:
                        <ul className="mt-2 list-disc space-y-1 pl-5">
                          <li>Current carton empty ho</li>
                          <li>Locked cartons ready ho</li>
                          <li>PO item receiving mismatch na ho</li>
                          <li>GRN basic info fill ho</li>
                        </ul>
                      </div>
                    </div>

                    <div className="flex flex-col justify-between rounded-3xl border border-slate-200 bg-slate-50 p-5">
                      <div>
                        <p className="text-sm font-black text-slate-900">Final Action</p>
                        <p className="mt-1 text-sm text-slate-500">
                          Submit ke baad carton-wise aur item-wise GRN entry create hogi.
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={submitGRN}
                        disabled={!canSubmit || loading}
                        className={`mt-5 inline-flex items-center justify-center gap-2 rounded-2xl px-6 py-4 font-black transition ${
                          canSubmit && !loading
                            ? "bg-emerald-600 text-white shadow-lg shadow-emerald-100 hover:bg-emerald-700"
                            : "cursor-not-allowed bg-slate-200 text-slate-400"
                        }`}
                      >
                        {loading && <Loader2 size={18} className="animate-spin" />}
                        Submit GRN
                      </button>
                    </div>
                  </div>
                </SectionCard>
              </div>
            </div>
          </div>
        )}

        {activeTab === "history" && (
          <div className="p-4 sm:p-6">
            <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
                <div className="flex items-center gap-2">
                  <Package className="text-indigo-600" size={18} />
                  <p className="font-black text-slate-900">GRN History</p>
                </div>
                <div className="text-xs font-black uppercase tracking-widest text-slate-400">
                  Total <span className="text-slate-800">{grnHistory.length}</span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-left">
                  <thead className="border-b border-slate-200 bg-slate-50">
                    <tr>
                      <th className="px-5 py-4 text-xs font-black uppercase tracking-wider text-slate-500">
                        GRN No
                      </th>
                      <th className="px-5 py-4 text-xs font-black uppercase tracking-wider text-slate-500">
                        Reference
                      </th>
                      <th className="px-5 py-4 text-xs font-black uppercase tracking-wider text-slate-500">
                        Cartons
                      </th>
                      <th className="px-5 py-4 text-xs font-black uppercase tracking-wider text-slate-500">
                        Date
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {grnHistory.map((h) => (
                      <tr key={h.grnNo} className="hover:bg-slate-50/70">
                        <td className="px-5 py-4 font-black text-slate-900">{h.grnNo}</td>
                        <td className="px-5 py-4">
                          <StatusPill label={h.refId} tone="indigo" />
                        </td>
                        <td className="px-5 py-4">
                          <StatusPill label={String(h.cartons)} tone="emerald" />
                        </td>
                        <td className="px-5 py-4 text-sm text-slate-600">
                          {formatDateTime(h.createdAt)}
                        </td>
                      </tr>
                    ))}

                    {grnHistory.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-6 py-12">
                          <EmptyState label="No GRN history yet." />
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default GRN;

/* ---------------- Small Components ---------------- */

const SectionCard: React.FC<{
  title: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, icon, action, children }) => {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div className="flex items-center gap-2">
          {icon}
          <p className="font-black text-slate-900">{title}</p>
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
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

const TopMetricCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "slate" | "indigo" | "emerald" | "amber";
}> = ({ icon, label, value, tone }) => {
  const toneClass =
    tone === "slate"
      ? "bg-slate-50 border-slate-200 text-slate-700"
      : tone === "indigo"
      ? "bg-indigo-50 border-indigo-200 text-indigo-700"
      : tone === "emerald"
      ? "bg-emerald-50 border-emerald-200 text-emerald-700"
      : "bg-amber-50 border-amber-200 text-amber-700";

  return (
    <div className={`rounded-3xl border p-4 ${toneClass}`}>
      <div className="flex items-center gap-2">
        {icon}
        <p className="text-xs font-black uppercase tracking-widest">{label}</p>
      </div>
      <div className="mt-3 text-lg font-black break-words">{value}</div>
    </div>
  );
};

const ProgressStrip: React.FC<{
  title: string;
  value: string;
  percentValue: number;
  colorClass: string;
  hint?: string;
}> = ({ title, value, percentValue, colorClass, hint }) => {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-black text-slate-900">{title}</p>
          {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
        </div>
        <div className="text-right">
          <div className="text-base font-black text-slate-900">{value}</div>
          <div className="text-xs text-slate-500">{percentValue}%</div>
        </div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
        <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${percentValue}%` }} />
      </div>
    </div>
  );
};

const SummaryCard: React.FC<{
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
        rows={4}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 p-3 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100"
      />
    </div>
  );
};

const PairSlots24: React.FC<{ pairs: string[] }> = ({ pairs }) => {
  return (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8 2xl:grid-cols-6">
      {Array.from({ length: 24 }).map((_, i) => {
        const val = pairs[i] || "";
        return (
          <div
            key={i}
            title={val || `Slot ${i + 1}`}
            className={`flex h-12 items-center justify-center rounded-2xl border px-2 text-center text-[10px] font-mono font-bold ${
              val
                ? "border-emerald-200 bg-white text-slate-900"
                : "border-slate-200 bg-slate-100 text-slate-400"
            }`}
          >
            {val || i + 1}
          </div>
        );
      })}
    </div>
  );
};

const BadgeMessage: React.FC<{
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
    <div className={`flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-bold ${toneClass}`}>
      {icon}
      {children}
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
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-black ${toneClass}`}>
      {label}
    </span>
  );
};

const AlertNote: React.FC<{
  tone: "rose" | "amber" | "emerald";
  title: string;
  children: React.ReactNode;
}> = ({ tone, title, children }) => {
  const toneClass =
    tone === "rose"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : tone === "amber"
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : "border-emerald-200 bg-emerald-50 text-emerald-700";

  return (
    <div className={`rounded-2xl border p-4 ${toneClass}`}>
      <p className="font-black">{title}</p>
      <p className="mt-1 text-sm">{children}</p>
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

const MiniStat: React.FC<{ label: string; value: number | string }> = ({ label, value }) => {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <div className="text-[11px] font-black uppercase tracking-widest text-slate-400">
        {label}
      </div>
      <div className="mt-1 text-sm font-black text-slate-900">{value}</div>
    </div>
  );
};

const MiniStatSoft: React.FC<{ label: string; value: number | string }> = ({
  label,
  value,
}) => {
  return (
    <div className="rounded-2xl border border-white/60 bg-white/70 p-3 backdrop-blur">
      <div className="text-[11px] font-black uppercase tracking-widest text-slate-400">
        {label}
      </div>
      <div className="mt-1 text-sm font-black text-slate-900 break-words">{value}</div>
    </div>
  );
};

const MiniSummary: React.FC<{ label: string; value: number | string }> = ({
  label,
  value,
}) => {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="text-xs font-black uppercase tracking-widest text-slate-400">
        {label}
      </div>
      <div className="mt-2 text-lg font-black text-slate-900">{value}</div>
    </div>
  );
};