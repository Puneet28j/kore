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
  Download,
  Filter,
  ArrowUpDown,
  SortAsc,
  SortDesc,
  X,
  Plus,
  Link2,
  Copy,
} from "lucide-react";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import {
  grnService,
  MockPODetail,
  MockPOItem,
  MockPORef,
} from "../../services/grnService";
import SearchableSelect from "../SearchableSelect";
import { formatAssortment } from "../../utils/assortmentUtils";

/* ═══════════════════ Types ═══════════════════ */

type POItemExtended = MockPOItem & {
  _poId: string;
  _poNo: string;
  _scanKey: string; // unique key for scanState — itemName for primary PO, `${poId}::${itemName}` for linked
};

type GRNForm = {
  grnDate: string;
  vendorInvoiceNos: string[];  // one PO can have multiple invoices
  vendorChallanNos: string[];  // one invoice can cover multiple challans
  vehicleNo: string;
  eWayBillNo: string;
  receivedBy: string;
  receivedByMobile: string;
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

  /* ── Linked POs (many-to-many PO ↔ Invoice relationship) ── */
  const [linkedPOIds, setLinkedPOIds] = useState<string[]>([]);
  const [linkedPODetails, setLinkedPODetails] = useState<MockPODetail[]>([]);
  const [linkedPOAdding, setLinkedPOAdding] = useState(false);

  /* ── Step 2: GRN Info ── */
  const [form, setForm] = useState<GRNForm>({
    grnDate: todayISODate(),
    vendorInvoiceNos: [],
    vendorChallanNos: [],
    vehicleNo: "",
    eWayBillNo: "",
    receivedBy: "",
    receivedByMobile: "",
    warehouse: "",
    remarks: "",
  });

  /* ── Step 3: Item receiving ── */
  const [selectedItemName, setSelectedItemName] = useState("");
  const [currentCartonIdx, setCurrentCartonIdx] = useState(0);
  const [scanState, setScanState] = useState<ScanState>({});
  const [scanInput, setScanInput] = useState("");
  const scanInputRef = useRef<HTMLInputElement>(null);

  // Track which cartons are already GRN'd (from previous submissions) - stores array of 0-based indices
  const [doneCartons, setDoneCartons] = useState<Record<string, number[]>>({}); // itemName -> array of done carton indices

  // Cartons that hit 24 pairs AND have had their printed label re-scanned to confirm.
  // Only confirmed cartons count toward being submittable.
  const [confirmedCartons, setConfirmedCartons] = useState<Record<string, number[]>>({});
  const [cartonConfirmPopup, setCartonConfirmPopup] = useState<{
    scanKey: string;
    itemLabel: string;
    cartonIdx: number;
    barcode: string;
    inputValue: string;
    error: string;
  } | null>(null);
  const confirmInputRef = useRef<HTMLInputElement>(null);

  // Collapsible state for items in All Items Status
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});

  /* ── Scan UX state ── */
  const [lastScannedSize, setLastScannedSize] = useState<string>("");

  /* ── History ── */
  const [grnHistory, setGrnHistory] = useState<GRNHistoryItem[]>([]);
  const [activeTab, setActiveTab] = useState<"scan" | "history">("scan");

  const [submitting, setSubmitting] = useState(false);

  /* ── History Details View ── */
  const [viewingGRN, setViewingGRN] = useState<any | null>(null);
  const [loadingHistoryDetail, setLoadingHistoryDetail] = useState(false);

  /* ── History Filters ── */
  const [historySearch, setHistorySearch] = useState("");
  const [historyDateFrom, setHistoryDateFrom] = useState("");
  const [historyDateTo, setHistoryDateTo] = useState("");
  const [historyPORef, setHistoryPORef] = useState("");
  const [historySortBy, setHistorySortBy] = useState("submittedAt");
  const [historySortOrder, setHistorySortOrder] = useState<"asc" | "desc">("desc");
  const [exportingExcel, setExportingExcel] = useState(false);

  const historyFilterParams = useMemo(() => {
    const p: Record<string, string> = {};
    if (historySearch) p.search = historySearch;
    if (historyDateFrom) p.dateFrom = historyDateFrom;
    if (historyDateTo) p.dateTo = historyDateTo;
    if (historyPORef) p.refId = historyPORef;
    if (historySortBy) p.sortBy = historySortBy;
    if (historySortOrder) p.sortOrder = historySortOrder;
    return p;
  }, [historySearch, historyDateFrom, historyDateTo, historyPORef, historySortBy, historySortOrder]);

  /* ── Load PO list ── */
  useEffect(() => {
    grnService.listReferences("").then((res) => {
      const filtered = (res.data || []).filter(
        (ref) => !ref.poNo.startsWith("CAT-")
      );
      setPoRefs(filtered);
    });
  }, []);

  /* ── Reload history on socket event ── */
  useEffect(() => {
    const handler = () => {
      grnService.history(historyFilterParams).then((res) => {
        setGrnHistory((res.data || []).map((h: any) => ({
          grnId: h.grnId, grnNo: h.grnNo, refId: h.refId,
          vendorName: h.vendorName, articleName: h.articleName,
          totalPairs: h.totalPairs, cartons: h.cartons, createdAt: h.createdAt,
        })));
      }).catch(() => {});
    };
    window.addEventListener("grnRefetch", handler);
    return () => window.removeEventListener("grnRefetch", handler);
  }, [historyFilterParams]);

  /* ── Load GRN History ── */
  useEffect(() => {
    grnService
      .history(historyFilterParams)
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
  }, [activeTab, historyFilterParams]);

  const clearHistoryFilters = () => {
    setHistorySearch("");
    setHistoryDateFrom("");
    setHistoryDateTo("");
    setHistoryPORef("");
    setHistorySortBy("submittedAt");
    setHistorySortOrder("desc");
  };

  const exportGRNExcel = async () => {
    setExportingExcel(true);
    try {
      const res = await grnService.exportHistory(historyFilterParams);
      const grns = res.data || [];
      if (grns.length === 0) {
        toast.error("No GRN data to export");
        return;
      }

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("GRN History");

      // Set columns with initial widths
      worksheet.columns = [
        { header: "S.No", key: "sno", width: 10 },
        { header: "GRN Number", key: "grnNo", width: 20 },
        { header: "PO Reference", key: "refId", width: 20 },
        { header: "Vendor", key: "vendorName", width: 30 },
        { header: "Article", key: "articleName", width: 30 },
        { header: "Status", key: "status", width: 15 },
        { header: "Total Cartons", key: "totalCartons", width: 15 },
        { header: "Total Pairs", key: "totalPairs", width: 15 },
        { header: "Received Date", key: "submittedAt", width: 25 },
        { header: "Carton #", key: "cartonIdx", width: 10 },
        { header: "Carton Barcode", key: "barcode", width: 25 },
        { header: "Item Name", key: "itemName", width: 30 },
        { header: "Pairs In Carton", key: "pairsCount", width: 15 },
        { header: "SKU Breakdown", key: "skuBreakdown", width: 50 },
      ];

      // Add Title Row
      const titleRow = worksheet.insertRow(1, ["GOODS RECEIPT NOTE (GRN) HISTORY REPORT"]);
      titleRow.font = { size: 18, bold: true, color: { argb: "FF000000" } };
      worksheet.mergeCells(1, 1, 1, 16);
      titleRow.alignment = { horizontal: "center", vertical: "middle" };
      titleRow.height = 35;

      // Add Metadata Row
      const metaRow = worksheet.insertRow(2, [
        `Generated On: ${new Date().toLocaleString("en-IN")}`,
        "", "", "", "", "", "", "",
        `Total Records: ${grns.length} GRNs`
      ]);
      metaRow.font = { bold: true, size: 11 };
      worksheet.mergeCells(2, 1, 2, 8);
      worksheet.mergeCells(2, 9, 2, 16);
      metaRow.height = 25;

      worksheet.addRow([]); // Spacer

      // Header Row Styling
      const headerRow = worksheet.getRow(4);
      headerRow.values = [
        "S.No", "GRN Number", "PO Ref", "Vendor Name", "Article Name", "Status",
        "Total CTNs", "Total Pairs", "Receipt Date", "CTN #", "Carton Barcode", 
        "Item Detail", "CTN Pairs", "SKU Breakdown"
      ];
      headerRow.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12 };
      headerRow.height = 30;
      headerRow.eachCell((cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF1E293B" }, // slate-800 (Dark Professional)
        };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.border = {
          top: { style: "thin", color: { argb: "FF000000" } },
          left: { style: "thin", color: { argb: "FF000000" } },
          bottom: { style: "medium", color: { argb: "FF000000" } },
          right: { style: "thin", color: { argb: "FF000000" } },
        };
      });

      let sno = 0;
      grns.forEach((grn: any) => {
        sno++;
        const cartons = grn.cartons || [];
        
        if (cartons.length === 0) {
          worksheet.addRow({
            sno,
            grnNo: grn.grnNo,
            refId: grn.refId,
            vendorName: grn.vendorName,
            articleName: grn.articleName,
            status: grn.status,
            totalCartons: 0,
            totalPairs: grn.totalPairs || 0,
            submittedAt: grn.submittedAt ? new Date(grn.submittedAt).toLocaleString("en-IN") : "",
          });
        } else {
          cartons.forEach((c: any, cIdx: number) => {
            const skuStr = Object.entries(c.skuBreakdown || {})
              .map(([sku, cnt]) => `${sku}(x${cnt})`)
              .join(", ");

            worksheet.addRow({
              sno: cIdx === 0 ? sno : "",
              grnNo: cIdx === 0 ? grn.grnNo : "",
              refId: cIdx === 0 ? grn.refId : "",
              vendorName: cIdx === 0 ? grn.vendorName : "",
              articleName: cIdx === 0 ? grn.articleName : "",
              status: cIdx === 0 ? grn.status : "",
              totalCartons: cIdx === 0 ? cartons.length : "",
              totalPairs: cIdx === 0 ? grn.totalPairs : "",
              submittedAt: cIdx === 0 ? (grn.submittedAt ? new Date(grn.submittedAt).toLocaleString("en-IN") : "") : "",
              cartonIdx: c.index,
              barcode: c.cartonBarcode,
              itemName: c.itemName,
              pairsCount: c.pairsCount,
              skuBreakdown: skuStr,
            });
          });
        }
      });

      // ─── Post-Processing Styles ───
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber <= 4) return;

        // Zebra Striping (based on S.No to group GRNs visually)
        // We track the actual GRN index to alternate colors
        const snoVal = row.getCell(1).value;
        const isNewGroup = snoVal !== "" && snoVal !== null;
        
        row.eachCell((cell) => {
          cell.alignment = { vertical: "middle", horizontal: "left", wrapText: false }; // Single row
          cell.border = {
            top: { style: "thin", color: { argb: "FF000000" } }, // Solid Black Borders
            left: { style: "thin", color: { argb: "FF000000" } },
            bottom: { style: "thin", color: { argb: "FF000000" } },
            right: { style: "thin", color: { argb: "FF000000" } },
          };
          
          // Center align numeric columns
          if ([1, 6, 7, 8, 10, 13].includes(Number(cell.col))) {
            cell.alignment = { horizontal: "center", vertical: "middle" };
          }
        });

        row.height = 22;
      });

      // ─── Auto-Adjust Column Widths based on content ───
      worksheet.columns.forEach((column) => {
        let maxColumnLength = 0;
        column.eachCell?.({ includeEmpty: true }, (cell) => {
          const columnLength = cell.value ? String(cell.value).length : 0;
          if (columnLength > maxColumnLength) {
            maxColumnLength = columnLength;
          }
        });
        column.width = Math.min(Math.max(maxColumnLength + 5, 10), 100); // Max width 100 to avoid crazy long rows
      });

      // Add Auto-Filter to the header row
      worksheet.autoFilter = {
        from: { row: 4, column: 1 },
        to: { row: 4, column: 14 }
      };

      // Generate and save
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      saveAs(blob, `GRN_History_${new Date().toISOString().split("T")[0]}.xlsx`);
      toast.success(`Exported ${grns.length} GRNs with professional formatting`);
    } catch (err: any) {
      console.error("Excel Export Error:", err);
      toast.error(err.message || "Failed to export");
    } finally {
      setExportingExcel(false);
    }
  };

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
      .then(async (res) => {
        const data = res.data as MockPODetail | null;
        setPoDetail(data);
        // Initialize scan state
        if (data) {
          try {
            const receivedRes = await grnService.getReceivedCartons(selectedPOId);
            const doneMap = receivedRes.data || {};
            setDoneCartons(doneMap);

            const state: ScanState = {};
            data.items.forEach((item) => {
              state[item.itemName] = Array.from(
                { length: item.cartonCount || 1 },
                () => ({})
              );
            });
            setScanState(state);
            
            // Auto-select first item if not selected and find its first pending carton
            if (data.items.length > 0) {
              const firstItem = data.items[0];
              setSelectedItemName(firstItem.itemName);
              
              const itemDoneIndices = doneMap[firstItem.variantId || firstItem.itemName] || [];
              let firstPending = 0;
              while (itemDoneIndices.includes(firstPending) && firstPending < (firstItem.cartonCount || 1)) {
                firstPending++;
              }
              setCurrentCartonIdx(firstPending >= (firstItem.cartonCount || 1) ? 0 : firstPending);
            } else {
              setCurrentCartonIdx(0);
            }
            
            setExpandedItems({});
          } catch (err: any) {
            console.error("Failed to load received cartons:", err);
            toast.error("Failed to check already received cartons");
          }
        }
      })
      .catch(() => {
        toast.error("Failed to load PO details");
        setPoDetail(null);
      })
      .finally(() => setPoLoading(false));
  }, [selectedPOId]);

  /* ── Derived data ── */

  // Merge primary PO items + all linked PO items into one array with unique _scanKey per item
  const allPOItems = useMemo<POItemExtended[]>(() => {
    const primary: POItemExtended[] = (poDetail?.items || []).map((item) => ({
      ...item,
      _poId: selectedPOId,
      _poNo: poDetail?.poNo || "",
      _scanKey: item.itemName,
    }));
    const linked: POItemExtended[] = linkedPODetails.flatMap((pd) =>
      pd.items.map((item) => ({
        ...item,
        _poId: pd.id,
        _poNo: pd.poNo,
        _scanKey: `${pd.id}::${item.itemName}`,
      }))
    );
    return [...primary, ...linked];
  }, [poDetail, selectedPOId, linkedPODetails]);

  // Returns the key used in doneCartons for a given item
  // Primary PO items use variantId/itemName directly; linked PO items use prefixed key
  const getDoneKey = (item: POItemExtended) =>
    item._poId === selectedPOId
      ? (item.variantId || item.itemName)
      : `${item._poId}::${item.variantId || item.itemName}`;

  const selectedItem = useMemo(
    () => allPOItems.find((i) => i._scanKey === selectedItemName) || null,
    [allPOItems, selectedItemName]
  );

  /* ── Auto-focus scanner when item/carton changes ── */
  useEffect(() => {
    if (selectedItem) {
      const t = setTimeout(() => scanInputRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [selectedItem, currentCartonIdx]);

  /* ── Auto-focus the label-confirm input when the popup opens ── */
  useEffect(() => {
    if (cartonConfirmPopup) {
      const t = setTimeout(() => confirmInputRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [cartonConfirmPopup]);

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
    let totalCartonsAll = 0;
    let doneCartonsAll = 0; // previously GRN'd
    let completedCartonsThisSession = 0;

    allPOItems.forEach((item) => {
      const perCartonTotal = Object.values(item.sizeMap).reduce((s, d) => s + (d.qty || 0), 0);
      const cartonCount = item.cartonCount || 1;
      const doneKey = item._poId === selectedPOId
        ? (item.variantId || item.itemName)
        : `${item._poId}::${item.variantId || item.itemName}`;
      const prevDoneIndices = doneCartons[doneKey] || [];
      doneCartonsAll += prevDoneIndices.length;

      const remainingCartons = Math.max(0, cartonCount - prevDoneIndices.length);
      totalPairsAll += perCartonTotal * remainingCartons;
      totalCartonsAll += cartonCount;

      const itemScans = scanState[item._scanKey] || [];
      itemScans.forEach((carton, idx) => {
        if (!prevDoneIndices.includes(idx)) {
          const cartonScanned = Object.values(carton).reduce((s, q) => s + q, 0);
          scannedAll += cartonScanned;
          if (cartonScanned >= 24) {
            completedCartonsThisSession++;
          }
        }
      });
    });

    return {
      total: totalPairsAll,
      scanned: scannedAll,
      totalCartons: totalCartonsAll,
      previouslyDone: doneCartonsAll,
      completedThisSession: completedCartonsThisSession,
      remainingCartons: totalCartonsAll - doneCartonsAll - completedCartonsThisSession,
    };
  }, [allPOItems, scanState, doneCartons, selectedPOId]);

  // Item-level progress — takes _scanKey as identifier
  const getItemProgress = (scanKey: string) => {
    const item = allPOItems.find((i) => i._scanKey === scanKey);
    const cartons = scanState[scanKey];
    if (!item || !cartons) return { total: 0, scanned: 0 };

    const perCartonTotal = Object.values(item.sizeMap).reduce((s, d) => s + (d.qty || 0), 0);
    const doneIndices = doneCartons[getDoneKey(item)] || [];
    const remainingCartons = Math.max(0, (item.cartonCount || 1) - doneIndices.length);

    const total = perCartonTotal * remainingCartons;
    let scanned = 0;
    cartons.forEach((c, idx) => {
      if (!doneIndices.includes(idx)) {
        scanned += Object.values(c).reduce((s, q) => s + q, 0);
      }
    });
    return { total, scanned };
  };

  // Carton-level progress — takes _scanKey as identifier
  const getCartonProgress = (scanKey: string, cartonIdx: number) => {
    const item = allPOItems.find((i) => i._scanKey === scanKey);
    const carton = scanState[scanKey]?.[cartonIdx];
    if (!item || !carton) return { total: 0, scanned: 0 };

    const total = Object.values(item.sizeMap).reduce((s, d) => s + (d.qty || 0), 0);
    const scanned = Object.values(carton).reduce((s, q) => s + q, 0);
    return { total: Math.max(total, 24), scanned };
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

    // Check if current carton was already received in a past session
    const itemKey = getDoneKey(selectedItem);
    if (doneCartons[itemKey]?.includes(currentCartonIdx)) {
      toast.error(`Carton ${currentCartonIdx + 1} has already been received. Please select a pending carton.`);
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

    // Flash the scanned size row
    setLastScannedSize(size);
    setTimeout(() => setLastScannedSize(""), 900);

    toast.success(`Size ${size} scanned for Carton ${currentCartonIdx + 1}`);
    setScanInput("");
    scanInputRef.current?.focus();

    // Check if carton is now full — pause and require a label-confirm scan
    // before it counts toward submission (see confirmCartonLabel below).
    const newCartonTotal = Object.values({...currentCartonScan, [size]: (currentCartonScan?.[size] || 0) + 1})
      .reduce((s, q) => s + q, 0);

    if (newCartonTotal >= 24) {
      const cartonSku = selectedItem.sku || selectedItem.itemName;
      const barcode = `${cartonSku}-CT${String(currentCartonIdx + 1).padStart(3, "0")}`;
      setCartonConfirmPopup({
        scanKey: selectedItemName,
        itemLabel: selectedItem.itemName,
        cartonIdx: currentCartonIdx,
        barcode,
        inputValue: "",
        error: "",
      });
    }
  };

  /* ── Confirm a completed carton's printed label ── */
  const confirmCartonLabel = () => {
    if (!cartonConfirmPopup) return;
    const typed = cartonConfirmPopup.inputValue.trim();
    if (!typed) return;

    if (typed !== cartonConfirmPopup.barcode) {
      setCartonConfirmPopup({ ...cartonConfirmPopup, error: "Barcode doesn't match — check the printed label and rescan.", inputValue: "" });
      return;
    }

    const { scanKey, cartonIdx } = cartonConfirmPopup;
    setConfirmedCartons((prev) => {
      const existing = prev[scanKey] || [];
      if (existing.includes(cartonIdx)) return prev;
      return { ...prev, [scanKey]: [...existing, cartonIdx] };
    });

    toast.success(`✅ Carton ${cartonIdx + 1} confirmed via label scan!`);
    setCartonConfirmPopup(null);

    const item = allPOItems.find((i) => i._scanKey === scanKey);
    if (item && cartonIdx < (item.cartonCount || 1) - 1) {
      setCurrentCartonIdx(cartonIdx + 1);
    } else {
      toast.success("All cartons for this item are complete!");
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
    setLinkedPOIds([]);
    setLinkedPODetails([]);
    setSelectedItemName("");
    setCurrentCartonIdx(0);
    setScanState({});
    setDoneCartons({});
    setScanInput("");
    setForm({
      grnDate: todayISODate(),
      vendorInvoiceNos: [],
      vendorChallanNos: [],
      vehicleNo: "",
      eWayBillNo: "",
      receivedBy: "",
      receivedByMobile: "",
      warehouse: "",
      remarks: "",
    });
  };

  /* ── Add a linked PO (many-to-many: one invoice → many POs) ── */
  const addLinkedPO = async (poId: string) => {
    if (poId === selectedPOId || linkedPOIds.includes(poId)) {
      toast.error("This PO is already added");
      return;
    }
    setLinkedPOAdding(true);
    try {
      const res = await grnService.getReferenceDetail(poId);
      const data = res.data as MockPODetail | null;
      if (!data) return;

      // Initialise scanState for linked PO's items (prefixed keys)
      const linkedState: ScanState = {};
      data.items.forEach((item) => {
        linkedState[`${poId}::${item.itemName}`] = Array.from(
          { length: item.cartonCount || 1 },
          () => ({})
        );
      });

      // Load already-received cartons for this linked PO and prefix their keys
      const doneRes = await grnService.getReceivedCartons(poId);
      const rawDone = doneRes.data || {};
      const prefixedDone: Record<string, number[]> = {};
      Object.keys(rawDone).forEach((k) => {
        prefixedDone[`${poId}::${k}`] = rawDone[k];
      });

      setLinkedPOIds((prev) => [...prev, poId]);
      setLinkedPODetails((prev) => [...prev, data]);
      setScanState((prev) => ({ ...prev, ...linkedState }));
      setDoneCartons((prev) => ({ ...prev, ...prefixedDone }));
      toast.success(`PO ${data.poNo} linked`);
    } catch {
      toast.error("Failed to load PO details");
    } finally {
      setLinkedPOAdding(false);
    }
  };

  /* ── Remove a linked PO ── */
  const removeLinkedPO = (poId: string) => {
    const detail = linkedPODetails.find((d) => d.id === poId);
    if (!detail) return;

    setScanState((prev) => {
      const updated = { ...prev };
      detail.items.forEach((item) => { delete updated[`${poId}::${item.itemName}`]; });
      return updated;
    });
    setDoneCartons((prev) => {
      const updated = { ...prev };
      Object.keys(updated).forEach((k) => { if (k.startsWith(`${poId}::`)) delete updated[k]; });
      return updated;
    });
    setLinkedPOIds((prev) => prev.filter((id) => id !== poId));
    setLinkedPODetails((prev) => prev.filter((d) => d.id !== poId));
    if (selectedItemName.startsWith(`${poId}::`)) setSelectedItemName("");
  };

  /* ── GRN form completion tracking ── */
  const grnFormRequired = useMemo(() => ({
    grnDate: !!form.grnDate,
    receivedBy: !!form.receivedBy.trim(),
    receivedByMobile: !!form.receivedByMobile.trim(),
    warehouse: !!form.warehouse.trim(),
  }), [form]);
  const grnRequiredCount = Object.values(grnFormRequired).filter(Boolean).length;
  const grnRequiredTotal = Object.keys(grnFormRequired).length;
  const grnFormComplete = grnRequiredCount === grnRequiredTotal;

  /* ── Submit ── */
  /* ── Submit validation ── */
  const canSubmit = useMemo(() => {
    if (!poDetail) return false;
    if (overallProgress.scanned === 0) return false;
    if (!grnFormComplete) return false;

    // Every started carton MUST be fully scanned (24 pairs) AND have its
    // printed label confirmed via rescan before the GRN can be submitted.
    for (const item of allPOItems) {
      const cartons = scanState[item._scanKey];
      if (!cartons) continue;
      const confirmed = confirmedCartons[item._scanKey] || [];
      for (let i = 0; i < cartons.length; i++) {
        const prog = getCartonProgress(item._scanKey, i);
        if (prog.scanned > 0 && prog.scanned < 24) return false;
        if (prog.scanned >= 24 && !confirmed.includes(i)) return false;
      }
    }

    return true;
  }, [poDetail, overallProgress, scanState, grnFormComplete, allPOItems, confirmedCartons]);

  const submitGRN = async () => {
    if (!canSubmit || !poDetail) return;
    setSubmitting(true);

    try {
      const allPONos = [poDetail.poNo, ...linkedPODetails.map((d) => d.poNo)].join(" + ");

      const res = await grnService.create({
        poId: poDetail.id,
        // Pass MongoDB _ids so service can build scanKey-matching allPOItems map
        linkedPoIds: linkedPODetails.map((d) => d.id),
        // PO numbers for backend storage reference
        poNos: [poDetail.poNo, ...linkedPODetails.map((d) => d.poNo)],
        form,
        scanState,
        totals: overallProgress,
      });

      const articleName = res.data._scannedItemNames?.length
        ? res.data._scannedItemNames.join(", ")
        : (allPOItems[0]?.itemName || "");

      setGrnHistory((prev) => [
        {
          grnId: res.data._id,
          grnNo: res.data.grnNo,
          refId: allPONos,
          vendorName: poDetail.vendorName,
          articleName,
          totalPairs: overallProgress.scanned,
          cartons: res.data.cartons?.length || 0,
          createdAt: res.data.submittedAt || new Date().toISOString(),
        },
        ...prev,
      ]);

      toast.success("GRN submitted successfully");

      // Update doneCartons with newly submitted indices
      const newDone = { ...doneCartons };
      Object.keys(scanState).forEach((scanKey) => {
        const item = allPOItems.find((i) => i._scanKey === scanKey);
        if (!item) return;
        const doneKey = getDoneKey(item);
        const cartons = scanState[scanKey];
        if (!newDone[doneKey]) newDone[doneKey] = [];
        cartons.forEach((carton, idx) => {
          const pairsCount = Object.values(carton).reduce((s, q) => s + q, 0);
          if (pairsCount >= 24 && !newDone[doneKey].includes(idx)) {
            newDone[doneKey].push(idx);
          }
        });
      });
      setDoneCartons(newDone);

      // Reset scanState for all PO items
      const freshScanState: ScanState = {};
      allPOItems.forEach((item) => {
        freshScanState[item._scanKey] = Array.from(
          { length: item.cartonCount || 1 },
          () => ({})
        );
      });
      setScanState(freshScanState);

      setScanInput("");
      setForm({
        grnDate: new Date().toISOString().split("T")[0],
        vendorInvoiceNos: [],
        vendorChallanNos: [],
        vehicleNo: "",
        eWayBillNo: "",
        receivedBy: "",
        receivedByMobile: "",
        warehouse: "",
        remarks: "",
      });

      setCurrentCartonIdx(0);
    } catch (err: any) {
      toast.error(err.message || "Failed to submit GRN");
    } finally {
      setSubmitting(false);
    }
  };

  /* ── PO dropdown options ── */
  const poOptions = poRefs.map((po) => po.poNo);
  const selectedPOLabel = poRefs.find((p) => p.id === selectedPOId)?.poNo || "";



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
                <div className="mt-6 space-y-5">
                  {/* Primary PO + Linked POs pills row */}
                  <div>
                    <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">
                      Purchase Orders in this GRN
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Primary PO chip */}
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-100 px-3 py-1.5 text-xs font-bold text-indigo-800">
                        <Hash size={11} />
                        {poDetail.poNo}
                        <span className="ml-1 rounded-full bg-indigo-200 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-indigo-600">
                          Primary
                        </span>
                      </span>
                      {/* Linked PO chips */}
                      {linkedPODetails.map((lp) => (
                        <span key={lp.id} className="inline-flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-100 px-3 py-1.5 text-xs font-bold text-teal-800">
                          <Link2 size={11} />
                          {lp.poNo}
                          <button
                            type="button"
                            onClick={() => removeLinkedPO(lp.id)}
                            className="ml-1 rounded-full p-0.5 text-teal-500 hover:bg-teal-200 hover:text-teal-800 transition"
                            title={`Remove ${lp.poNo}`}
                          >
                            <X size={10} />
                          </button>
                        </span>
                      ))}
                      {/* Add another PO dropdown */}
                      <div className="relative inline-flex items-center gap-1">
                        {linkedPOAdding ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-400">
                            <Loader2 size={11} className="animate-spin" /> Loading...
                          </span>
                        ) : (
                          <select
                            className="appearance-none cursor-pointer inline-flex items-center gap-1.5 rounded-full border border-dashed border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-500 hover:border-teal-400 hover:text-teal-600 transition focus:outline-none"
                            defaultValue=""
                            onChange={(e) => {
                              const ref = poRefs.find((p) => p.poNo === e.target.value);
                              if (ref) { addLinkedPO(ref.id); e.currentTarget.value = ""; }
                            }}
                          >
                            <option value="" disabled>+ Link another PO</option>
                            {poRefs
                              .filter((p) => p.id !== selectedPOId && !linkedPOIds.includes(p.id))
                              .map((p) => (
                                <option key={p.id} value={p.poNo}>{p.poNo}</option>
                              ))}
                          </select>
                        )}
                      </div>
                    </div>
                    {linkedPODetails.length > 0 && (
                      <p className="mt-1.5 text-[10px] text-teal-600 italic">
                        This GRN will cover {1 + linkedPODetails.length} POs — one invoice / shipment for multiple orders.
                      </p>
                    )}
                  </div>

                  {/* PO Summary cards — shows merged totals */}
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
                      value={String(allPOItems.reduce((s, i) => s + (i.cartonCount || 1) * Object.values(i.sizeMap).reduce((ss, d) => ss + (d.qty || 0), 0), 0))}
                    />
                    <InfoCard
                      icon={<Package size={16} />}
                      label="Items"
                      value={`${allPOItems.length} variants`}
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

            {/* ═══ STEP 2: GRN Basic Info — prominent card ═══ */}
            {poDetail && (
              <div className="rounded-3xl border-2 border-emerald-200 bg-white shadow-sm overflow-hidden">
                {/* Top accent gradient strip */}
                <div className="h-1 bg-gradient-to-r from-emerald-400 via-teal-400 to-emerald-500" />

                {/* Card header */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-5 py-4 border-b border-emerald-100 bg-emerald-50/50">
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-emerald-100 p-2.5">
                      <User size={20} className="text-emerald-600" />
                    </div>
                    <div>
                      <p className="font-black text-slate-900 text-base">2. GRN Basic Information</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {poDetail.poNo} &nbsp;·&nbsp; {poDetail.vendorName}
                      </p>
                    </div>
                  </div>
                  {/* Required field completion badge */}
                  <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-2xl text-xs font-bold shrink-0 ${
                    grnFormComplete
                      ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                      : "bg-amber-50 text-amber-700 border border-amber-200"
                  }`}>
                    {grnFormComplete
                      ? <CheckCircle2 size={13} />
                      : <XCircle size={13} />}
                    {grnRequiredCount}/{grnRequiredTotal} Required filled
                  </div>
                </div>

                <div className="p-5">
                  <div className="grid grid-cols-1 gap-x-6 gap-y-0 md:grid-cols-3">

                    {/* Column 1: Receipt Details (required) */}
                    <div className="space-y-4">
                      <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 flex items-center gap-1.5">
                        <span className="h-3 w-3 rounded-full bg-emerald-400 inline-block" />
                        Receipt Details <span className="text-rose-400">*</span>
                      </p>
                      <FormInputHighlight
                        label="GRN Date"
                        type="date"
                        value={form.grnDate}
                        onChange={(v) => updateForm("grnDate", v)}
                        required
                        filled={!!form.grnDate}
                      />
                      <FormInputHighlight
                        label="Received By"
                        value={form.receivedBy}
                        onChange={(v) => updateForm("receivedBy", v)}
                        required
                        filled={!!form.receivedBy.trim()}
                        placeholder="Name of person receiving"
                      />
                      <FormInputHighlight
                        label="Mobile No"
                        type="tel"
                        value={form.receivedByMobile}
                        onChange={(v) => updateForm("receivedByMobile", v)}
                        required
                        filled={!!form.receivedByMobile.trim()}
                        placeholder="10-digit mobile number"
                      />
                      <FormInputHighlight
                        label="Warehouse / Location"
                        value={form.warehouse}
                        onChange={(v) => updateForm("warehouse", v)}
                        required
                        filled={!!form.warehouse.trim()}
                        placeholder="e.g. Warehouse A, Delhi"
                      />
                    </div>

                    {/* Column 2: Document References */}
                    <div className="space-y-4 mt-6 md:mt-0">
                      <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500 flex items-center gap-1.5">
                        <span className="h-3 w-3 rounded-full bg-indigo-400 inline-block" />
                        Document References
                      </p>
                      <TagInput
                        label="Invoice No(s)"
                        values={form.vendorInvoiceNos}
                        onChange={(v) => updateForm("vendorInvoiceNos", v)}
                        placeholder="Type invoice no, press Enter"
                        hint="One invoice per tag — add multiple if needed"
                      />
                      <TagInput
                        label="Challan No(s)"
                        values={form.vendorChallanNos}
                        onChange={(v) => updateForm("vendorChallanNos", v)}
                        placeholder="Type challan no, press Enter"
                        hint="Add multiple challans if shipment is split"
                      />
                      <FormInput
                        label="E-Way Bill No"
                        value={form.eWayBillNo}
                        onChange={(v) => updateForm("eWayBillNo", v)}
                      />
                    </div>

                    {/* Column 3: Logistics + Notes */}
                    <div className="space-y-4 mt-6 md:mt-0">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                        <span className="h-3 w-3 rounded-full bg-slate-300 inline-block" />
                        Logistics &amp; Notes
                      </p>
                      <FormInput
                        label="Vehicle No"
                        value={form.vehicleNo}
                        onChange={(v) => updateForm("vehicleNo", v)}
                      />
                      <FormTextArea
                        label="Remarks"
                        value={form.remarks}
                        onChange={(v) => updateForm("remarks", v)}
                      />
                    </div>

                  </div>
                </div>
              </div>
            )}

            {/* ═══ STEP 3: Item Receiving — 3-column layout ═══ */}
            {poDetail && (
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">

                {/* ── LEFT RAIL: PO Items list ── */}
                <div className="xl:col-span-3">
                  <SectionCard
                    icon={<Package size={18} className="text-indigo-600" />}
                    title={`3. Items (${allPOItems.length})`}
                  >
                    <div className="space-y-2">
                      {allPOItems.map((item) => {
                        const totalCartons = item.cartonCount || 1;
                        const doneIndices = doneCartons[getDoneKey(item)] || [];
                        const doneCnt = doneIndices.length;
                        const isSelected = selectedItemName === item._scanKey;
                        const ip = getItemProgress(item._scanKey);
                        const sessionDone = (scanState[item._scanKey] || []).filter((c, idx) =>
                          Object.values(c).reduce((s, q) => s + q, 0) >= 24 && !doneIndices.includes(idx)
                        ).length;
                        const totalDone = doneCnt + sessionDone;
                        const allDone = totalDone >= totalCartons;
                        const ratio = formatAssortment(Object.fromEntries(
                          Object.entries(item.sizeMap).map(([sz, d]) => [sz, d.qty])
                        ));
                        const isLinked = item._poId !== selectedPOId;

                        return (
                          <button
                            key={item._scanKey}
                            type="button"
                            onClick={() => {
                              setSelectedItemName(item._scanKey);
                              setScanInput("");
                              const dI = doneCartons[getDoneKey(item)] || [];
                              let fp = 0;
                              while (dI.includes(fp) && fp < totalCartons) fp++;
                              setCurrentCartonIdx(fp >= totalCartons ? 0 : fp);
                            }}
                            className={`w-full text-left rounded-2xl border p-3 transition-all ${
                              isSelected
                                ? "border-indigo-300 bg-indigo-50 ring-2 ring-indigo-100"
                                : "border-slate-200 bg-white hover:border-indigo-200 hover:bg-slate-50"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <p className={`text-xs font-bold leading-tight break-all ${isSelected ? "text-indigo-900" : "text-slate-800"}`}>
                                    {item.itemName}
                                  </p>
                                  {isLinked && (
                                    <span className="shrink-0 inline-flex items-center gap-0.5 rounded-full bg-teal-100 px-1.5 py-0.5 text-[9px] font-bold text-teal-700 border border-teal-200">
                                      <Link2 size={8} /> {item._poNo}
                                    </span>
                                  )}
                                </div>
                                <p className="text-[10px] text-slate-500 mt-0.5">{item.color}{ratio ? ` · ${ratio}` : ""}</p>
                              </div>
                              {allDone ? (
                                <CheckCircle2 size={15} className="text-emerald-500 shrink-0 mt-0.5" />
                              ) : totalDone > 0 ? (
                                <span className="shrink-0 text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full border border-amber-200">
                                  {totalDone}/{totalCartons}
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-2">
                              <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${allDone ? "bg-emerald-500" : isLinked ? "bg-teal-400" : "bg-indigo-400"}`}
                                  style={{ width: `${Math.min(100, (totalDone / totalCartons) * 100)}%` }}
                                />
                              </div>
                              <div className="flex justify-between mt-0.5">
                                <span className="text-[9px] text-slate-400">{totalDone}/{totalCartons} ctns</span>
                                <span className="text-[9px] text-slate-400">{ip.scanned} prs</span>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </SectionCard>
                </div>

                {/* ── CENTER: Active Item Scanner + Size Table ── */}
                <div className="xl:col-span-6">
                  {selectedItem ? (
                    <SectionCard
                      icon={<ScanLine size={18} className="text-slate-900" />}
                      title={`Receiving: ${selectedItem.itemName}`}
                    >
                      <div className="space-y-5">

                        {/* Carton Chip Strip + Progress Ring row */}
                        <div className="flex items-start gap-4">
                          {/* Progress Ring */}
                          <CartonProgressRing scanned={scannedCount} total={24} />

                          {/* Chip strip + legend */}
                          <div className="min-w-0 flex-1">
                            <div className="mb-2 flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
                              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                Carton {currentCartonIdx + 1} / {selectedItem.cartonCount || 1}
                              </p>
                              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[9px] font-bold uppercase tracking-wider text-slate-400">
                                <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 shrink-0 rounded bg-emerald-500" /> Confirmed</span>
                                <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 shrink-0 rounded bg-orange-500" /> Label pending</span>
                                <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 shrink-0 rounded bg-indigo-500 ring-1 ring-indigo-300" /> Active</span>
                                <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 shrink-0 rounded bg-amber-400" /> Partial</span>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {Array.from({ length: selectedItem.cartonCount || 1 }).map((_, cIdx) => {
                                const doneIndices = doneCartons[getDoneKey(selectedItem)] || [];
                                const isPreviouslyDone = doneIndices.includes(cIdx);
                                const prog = getCartonProgress(selectedItemName, cIdx);
                                const isComplete = prog.scanned >= 24;
                                const isConfirmed = (confirmedCartons[selectedItemName] || []).includes(cIdx);
                                const isAwaitingLabel = !isPreviouslyDone && isComplete && !isConfirmed;
                                const isDone = isPreviouslyDone || (isComplete && isConfirmed);
                                const isActive = cIdx === currentCartonIdx;
                                const isPartial = !isDone && !isAwaitingLabel && !isActive && prog.scanned > 0;

                                let chipClass = "bg-slate-100 text-slate-500 hover:bg-slate-200";
                                if (isPreviouslyDone) chipClass = "bg-emerald-500 text-white cursor-not-allowed opacity-70";
                                else if (isDone) chipClass = "bg-emerald-500 text-white";
                                else if (isAwaitingLabel) chipClass = "bg-orange-500 text-white animate-pulse";
                                else if (isActive) chipClass = "bg-indigo-500 text-white ring-2 ring-indigo-300 ring-offset-1";
                                else if (isPartial) chipClass = "bg-amber-400 text-white";

                                return (
                                  <button
                                    key={cIdx}
                                    type="button"
                                    disabled={isPreviouslyDone}
                                    onClick={() => {
                                      if (isPreviouslyDone) return;
                                      setCurrentCartonIdx(cIdx);
                                      if (isAwaitingLabel) {
                                        const cartonSku = selectedItem.sku || selectedItem.itemName;
                                        setCartonConfirmPopup({
                                          scanKey: selectedItemName,
                                          itemLabel: selectedItem.itemName,
                                          cartonIdx: cIdx,
                                          barcode: `${cartonSku}-CT${String(cIdx + 1).padStart(3, "0")}`,
                                          inputValue: "",
                                          error: "",
                                        });
                                      }
                                    }}
                                    title={`Carton ${cIdx + 1} — ${isPreviouslyDone ? "Already GRN'd" : isAwaitingLabel ? "Scanned — awaiting label confirm" : `${prog.scanned}/24 scanned`}`}
                                    className={`h-8 w-8 rounded-lg text-[11px] font-bold tabular-nums transition-all ${chipClass}`}
                                  >
                                    {cIdx + 1}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>

                        {/* Scanner input */}
                        <div className="border-t border-slate-100 pt-4">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                              Scan — Carton {currentCartonIdx + 1}
                            </p>
                            <button
                              type="button"
                              onClick={resetCartonScans}
                              className="flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-rose-500 transition"
                            >
                              <RotateCcw size={10} /> Reset carton
                            </button>
                          </div>
                          <div className="relative">
                            <ScanLine className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-emerald-500" size={20} />
                            <input
                              ref={scanInputRef}
                              type="text"
                              autoComplete="off"
                              placeholder="Scan or type SKU, then press Enter..."
                              value={scanInput}
                              onChange={(e) => setScanInput(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleScan(); } }}
                              className="w-full rounded-2xl border-2 border-emerald-200 bg-emerald-50/30 py-3.5 pl-11 pr-4 font-mono text-sm outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                            />
                            {scanInput && (
                              <button
                                type="button"
                                onClick={() => setScanInput("")}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                              >
                                <XCircle size={16} />
                              </button>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-400 italic pl-1 mt-1.5">
                            Each scan adds 1 pair. Press <kbd className="px-1 py-0.5 bg-slate-100 rounded text-[9px] font-mono">Enter</kbd> or use barcode scanner.
                          </p>
                        </div>

                        {/* Size Table */}
                        <div className="rounded-2xl overflow-hidden border border-slate-200">
                          <table className="w-full text-sm">
                            <thead className="bg-slate-50 border-b border-slate-200">
                              <tr>
                                <th className="px-4 py-2.5 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">Size</th>
                                <th className="px-4 py-2.5 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">Expected</th>
                                <th className="px-4 py-2.5 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">Scanned</th>
                                <th className="px-4 py-2.5 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">SKU</th>
                                <th className="px-4 py-2.5 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {sizes.map((sz) => {
                                const expected = selectedItem.sizeMap[sz]?.qty || 0;
                                const scanned = currentCartonScan?.[sz] || 0;
                                const done = scanned >= expected;
                                const partial = scanned > 0 && !done;
                                const isFlashing = lastScannedSize === sz;
                                return (
                                  <tr
                                    key={sz}
                                    className={`transition-colors duration-300 ${
                                      isFlashing
                                        ? "bg-emerald-100"
                                        : done
                                        ? "bg-emerald-50/60"
                                        : partial
                                        ? "bg-amber-50/50"
                                        : ""
                                    }`}
                                  >
                                    <td className="px-4 py-3 font-black text-slate-900 text-lg leading-none">{sz}</td>
                                    <td className="px-4 py-3 text-center font-bold text-slate-500">{expected}</td>
                                    <td className="px-4 py-3 text-center">
                                      <span className={`font-black text-lg tabular-nums ${done ? "text-emerald-600" : partial ? "text-amber-600" : "text-slate-300"}`}>
                                        {scanned}
                                      </span>
                                    </td>
                                    <td className="px-4 py-3 font-mono text-[10px] text-slate-400">
                                      {selectedItem.sizeMap[sz]?.sku || "—"}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                      {done ? (
                                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                                          <CheckCircle2 size={10} /> Done
                                        </span>
                                      ) : partial ? (
                                        <span className="text-[10px] font-bold text-amber-600">{expected - scanned} left</span>
                                      ) : (
                                        <span className="text-[10px] text-slate-300">—</span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </SectionCard>
                  ) : (
                    <SectionCard icon={<ScanLine size={18} className="text-slate-300" />} title="3. Select an Item to Begin">
                      <div className="py-20 text-center">
                        <PackageSearch size={44} className="text-slate-200 mx-auto mb-3" />
                        <p className="text-sm font-bold text-slate-400">Click on a PO item from the left panel</p>
                        <p className="text-xs text-slate-300 mt-1">to start scanning cartons</p>
                      </div>
                    </SectionCard>
                  )}
                </div>

                {/* ── RIGHT RAIL: Summary + Submit ── */}
                <div className="xl:col-span-3 space-y-4">
                  <SectionCard icon={<ClipboardList size={18} className="text-slate-900" />} title="Summary">
                    <div className="space-y-3">
                      {/* Status banner */}
                      {!grnFormComplete ? (
                        <BannerMessage icon={<XCircle size={14} />} tone="amber">
                          Fill required GRN info above first.
                        </BannerMessage>
                      ) : overallProgress.scanned === 0 ? (
                        <BannerMessage icon={<XCircle size={14} />} tone="amber">
                          No pairs scanned yet.
                        </BannerMessage>
                      ) : !canSubmit ? (
                        <BannerMessage icon={<XCircle size={14} />} tone="rose">
                          Partial carton — each carton needs 24 pairs.
                        </BannerMessage>
                      ) : (
                        <BannerMessage icon={<CheckCircle2 size={14} />} tone="emerald">
                          Ready to submit!
                        </BannerMessage>
                      )}

                      {/* Stat grid */}
                      <div className="grid grid-cols-2 gap-2">
                        <MiniStatCard label="Total Ctns" value={overallProgress.totalCartons} tone="slate" />
                        <MiniStatCard label="Prev GRN'd" value={overallProgress.previouslyDone} tone="indigo" />
                        <MiniStatCard label="This Session" value={overallProgress.completedThisSession} tone="emerald" />
                        <MiniStatCard label="Remaining" value={overallProgress.remainingCartons} tone="amber" />
                      </div>

                      {/* Pairs highlight */}
                      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
                        <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500">Pairs Scanned</p>
                        <p className="text-3xl font-black text-emerald-700 mt-0.5 tabular-nums">{overallProgress.scanned}</p>
                        <p className="text-[10px] text-emerald-500 mt-0.5">{overallProgress.completedThisSession} cartons complete</p>
                      </div>

                      {/* Submit */}
                      <button
                        type="button"
                        onClick={submitGRN}
                        disabled={!canSubmit || submitting}
                        className={`w-full flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-black transition ${
                          canSubmit && !submitting
                            ? "bg-emerald-600 text-white shadow-lg shadow-emerald-100 hover:bg-emerald-700"
                            : "bg-slate-100 text-slate-400 cursor-not-allowed"
                        }`}
                      >
                        {submitting ? <Loader2 size={16} className="animate-spin" /> : <PackageCheck size={16} />}
                        Submit GRN
                      </button>
                    </div>
                  </SectionCard>
                </div>

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
                        {viewingGRN.cartons?.map((carton: any, idx: number) => {
                          // Extract the carton sequence number from the barcode (e.g. "Riv-blk-04-08-CT007" -> 7)
                          const ctMatch = (carton.cartonBarcode || "").match(/CT(\d+)$/);
                          const cartonNum = ctMatch ? Number(ctMatch[1]) : idx + 1;
                          
                          return (
                            <div key={idx} className="p-4 rounded-2xl border border-slate-200 bg-white hover:border-amber-200 transition">
                              <div className="flex justify-between items-center mb-2">
                                <p className="text-sm font-black text-slate-900">BOX #{cartonNum}</p>
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
                          );
                        })}
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
                  <div className="flex items-center gap-3">
                    <div className="text-xs font-black uppercase tracking-widest text-slate-400">
                      Logs Found: <span className="text-slate-800">{grnHistory.length}</span>
                    </div>
                    <button
                      onClick={exportGRNExcel}
                      disabled={exportingExcel || grnHistory.length === 0}
                      className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {exportingExcel ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Download size={14} />
                      )}
                      Export Detailed Excel
                    </button>
                  </div>
                </div>

                {/* ── Filter Bar ── */}
                <div className="border-b border-slate-200 bg-white p-5">
                  <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2 lg:grid-cols-6">
                    <div className="sm:col-span-2 lg:col-span-2">
                      <FormInput
                        label="Search"
                        placeholder="GRN, article, vendor or carton no…"
                        value={historySearch}
                        onChange={setHistorySearch}
                      />
                    </div>
                    <SearchableSelect
                      label="PO Reference"
                      options={poOptions}
                      value={historyPORef}
                      onChange={setHistoryPORef}
                      placeholder="All POs"
                    />
                    <FormInput
                      label="From Date"
                      type="date"
                      value={historyDateFrom}
                      onChange={setHistoryDateFrom}
                    />
                    <FormInput
                      label="To Date"
                      type="date"
                      value={historyDateTo}
                      onChange={setHistoryDateTo}
                    />
                    <div className="min-w-0">
                      <label className="mb-2 block truncate text-xs font-black uppercase tracking-widest text-slate-400">
                        Sort By
                      </label>
                      <select
                        value={historySortBy}
                        onChange={(e) => setHistorySortBy(e.target.value)}
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100"
                      >
                        <option value="submittedAt">Date Received</option>
                        <option value="grnNo">GRN Number</option>
                        <option value="vendorName">Vendor</option>
                        <option value="totalPairs">Total Pairs</option>
                        <option value="articleName">Article</option>
                        <option value="refId">PO Ref</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-6 lg:justify-end">
                      <button
                        onClick={() =>
                          setHistorySortOrder(
                            historySortOrder === "asc" ? "desc" : "asc"
                          )
                        }
                        className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-600 transition hover:bg-slate-100"
                        title={
                          historySortOrder === "asc" ? "Ascending" : "Descending"
                        }
                      >
                        {historySortOrder === "asc" ? (
                          <SortAsc size={20} />
                        ) : (
                          <SortDesc size={20} />
                        )}
                      </button>
                      <button
                        onClick={clearHistoryFilters}
                        className="flex h-[46px] flex-1 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-6 text-sm font-black text-slate-500 transition hover:bg-slate-50 hover:text-rose-600 sm:flex-none"
                      >
                        <RotateCcw size={16} />
                        Reset
                      </button>
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[800px] text-left">
                    <thead className="border-b border-slate-200 bg-white">
                      <tr>
                        <th className="px-5 py-4">
                          <button
                            onClick={() => {
                              if (historySortBy === "grnNo") {
                                setHistorySortOrder(
                                  historySortOrder === "asc" ? "desc" : "asc"
                                );
                              } else {
                                setHistorySortBy("grnNo");
                                setHistorySortOrder("asc");
                              }
                            }}
                            className="flex items-center gap-1 text-xs font-black uppercase tracking-wider text-slate-500 hover:text-indigo-600"
                          >
                            GRN Info
                            {historySortBy === "grnNo" &&
                              (historySortOrder === "asc" ? (
                                <SortAsc size={12} />
                              ) : (
                                <SortDesc size={12} />
                              ))}
                          </button>
                        </th>
                        <th className="px-5 py-4">
                          <button
                            onClick={() => {
                              if (historySortBy === "vendorName") {
                                setHistorySortOrder(
                                  historySortOrder === "asc" ? "desc" : "asc"
                                );
                              } else {
                                setHistorySortBy("vendorName");
                                setHistorySortOrder("asc");
                              }
                            }}
                            className="flex items-center gap-1 text-xs font-black uppercase tracking-wider text-slate-500 hover:text-indigo-600"
                          >
                            Vendor & Article
                            {historySortBy === "vendorName" &&
                              (historySortOrder === "asc" ? (
                                <SortAsc size={12} />
                              ) : (
                                <SortDesc size={12} />
                              ))}
                          </button>
                        </th>
                        <th className="px-5 py-4">
                          <button
                            onClick={() => {
                              if (historySortBy === "totalPairs") {
                                setHistorySortOrder(
                                  historySortOrder === "asc" ? "desc" : "asc"
                                );
                              } else {
                                setHistorySortBy("totalPairs");
                                setHistorySortOrder("desc");
                              }
                            }}
                            className="mx-auto flex items-center gap-1 text-xs font-black uppercase tracking-wider text-slate-500 hover:text-indigo-600"
                          >
                            Receipt Stats
                            {historySortBy === "totalPairs" &&
                              (historySortOrder === "asc" ? (
                                <SortAsc size={12} />
                              ) : (
                                <SortDesc size={12} />
                              ))}
                          </button>
                        </th>
                        <th className="px-5 py-4">
                          <button
                            onClick={() => {
                              if (historySortBy === "submittedAt") {
                                setHistorySortOrder(
                                  historySortOrder === "asc" ? "desc" : "asc"
                                );
                              } else {
                                setHistorySortBy("submittedAt");
                                setHistorySortOrder("desc");
                              }
                            }}
                            className="flex items-center gap-1 text-xs font-black uppercase tracking-wider text-slate-500 hover:text-indigo-600"
                          >
                            Date Received
                            {historySortBy === "submittedAt" &&
                              (historySortOrder === "asc" ? (
                                <SortAsc size={12} />
                              ) : (
                                <SortDesc size={12} />
                              ))}
                          </button>
                        </th>
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
                            <div className="flex flex-col gap-0.5 min-w-0">
                              <p className="text-sm font-bold text-slate-800 break-all leading-tight">{h.vendorName || "—"}</p>
                              <p className="text-xs text-slate-500 break-all leading-tight">{h.articleName || "—"}</p>
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

      {/* ── Carton label confirmation popup ── */}
      {cartonConfirmPopup && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl overflow-hidden">
            <div className="bg-orange-500 px-6 py-5 text-white">
              <div className="flex items-center gap-2">
                <PackageCheck size={22} />
                <h3 className="text-lg font-black">Carton {cartonConfirmPopup.cartonIdx + 1} Complete</h3>
              </div>
              <p className="mt-1 text-xs text-orange-50">{cartonConfirmPopup.itemLabel}</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                  Carton Barcode — print &amp; paste this label on the box
                </p>
                <div className="flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-orange-300 bg-orange-50 px-4 py-3">
                  <span className="text-lg font-black tracking-wider text-orange-700 font-mono">
                    {cartonConfirmPopup.barcode}
                  </span>
                  <button
                    type="button"
                    onClick={() => { navigator.clipboard.writeText(cartonConfirmPopup.barcode); toast.success('Copied'); }}
                    title="Copy barcode"
                    className="shrink-0 rounded-lg p-1.5 text-orange-500 hover:bg-orange-100 hover:text-orange-700 transition-colors"
                  >
                    <Copy size={16} />
                  </button>
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Scan / type the barcode from the label to confirm
                </label>
                <input
                  ref={confirmInputRef}
                  type="text"
                  autoComplete="off"
                  value={cartonConfirmPopup.inputValue}
                  onChange={(e) => setCartonConfirmPopup({ ...cartonConfirmPopup, inputValue: e.target.value, error: "" })}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); confirmCartonLabel(); } }}
                  placeholder="Rescan label here…"
                  className={`w-full rounded-2xl border-2 p-3 text-sm outline-none transition font-mono ${
                    cartonConfirmPopup.error
                      ? "border-rose-300 bg-rose-50 focus:border-rose-400 focus:ring-4 focus:ring-rose-100"
                      : "border-slate-200 bg-slate-50 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100"
                  }`}
                />
                {cartonConfirmPopup.error && (
                  <p className="mt-1.5 text-[11px] font-bold text-rose-500">{cartonConfirmPopup.error}</p>
                )}
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-6 py-4">
              {/* <button
                type="button"
                onClick={() => setCartonConfirmPopup(null)}
                className="rounded-xl px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 transition"
              >
                Do this later
              </button> */}
              <button
                type="button"
                onClick={confirmCartonLabel}
                disabled={!cartonConfirmPopup.inputValue.trim()}
                className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
              >
                <CheckCircle2 size={14} /> Confirm
              </button>
            </div>
          </div>
        </div>
      )}
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
        <div className="flex items-center gap-2 min-w-0">
          {icon}
          <p className="font-black text-slate-900 break-all leading-tight">{title}</p>
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
      <div className="wrap-break-word font-bold text-slate-900">{value || "—"}</div>
    </div>
  );
};

const FormInput: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}> = ({ label, value, onChange, type = "text", placeholder }) => {
  return (
    <div className="min-w-0">
      <label
        title={label}
        className="mb-2 block truncate text-xs font-black uppercase tracking-widest text-slate-400"
      >
        {label}
      </label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100"
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

/* SVG circular progress ring for active carton */
const CartonProgressRing: React.FC<{ scanned: number; total: number }> = ({ scanned, total }) => {
  const r = 26;
  const circ = 2 * Math.PI * r;
  const pct = total > 0 ? Math.min(1, scanned / total) : 0;
  const dash = pct * circ;
  const done = scanned >= total && total > 0;
  const color = done ? "#10b981" : pct > 0 ? "#6366f1" : "#e2e8f0";
  return (
    <div className="shrink-0 flex flex-col items-center gap-1">
      <svg width="68" height="68" viewBox="0 0 68 68">
        <circle cx="34" cy="34" r={r} fill="none" stroke="#f1f5f9" strokeWidth="7" />
        <circle
          cx="34" cy="34" r={r}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          transform="rotate(-90 34 34)"
          style={{ transition: "stroke-dasharray 0.3s ease" }}
        />
        <text x="34" y="38" textAnchor="middle" fontSize="15" fontWeight="900" fill={done ? "#059669" : "#1e293b"}>
          {scanned}
        </text>
      </svg>
      <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">/{total} pairs</span>
    </div>
  );
};

/* Tag / chip input for multi-value fields like invoice numbers, challan numbers */
const TagInput: React.FC<{
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  hint?: string;
}> = ({ label, values, onChange, placeholder, hint }) => {
  const [inputVal, setInputVal] = React.useState("");

  const addTag = () => {
    const v = inputVal.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setInputVal("");
  };

  return (
    <div>
      <label className="mb-1.5 block text-xs font-black uppercase tracking-widest text-slate-500">
        {label}
      </label>
      {values.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1">
          {values.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-100 px-2.5 py-0.5 text-[11px] font-bold text-indigo-800"
            >
              {v}
              <button
                type="button"
                onClick={() => onChange(values.filter((x) => x !== v))}
                className="text-indigo-400 hover:text-indigo-700 transition"
              >
                <X size={9} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-1.5">
        <input
          type="text"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              addTag();
            }
          }}
          placeholder={placeholder || "Type and press Enter"}
          className="flex-1 rounded-2xl border-2 border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100"
        />
        <button
          type="button"
          onClick={addTag}
          disabled={!inputVal.trim()}
          className="flex h-9 w-9 items-center justify-center rounded-2xl border border-indigo-200 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 disabled:opacity-40 transition"
        >
          <Plus size={14} />
        </button>
      </div>
      {hint && <p className="mt-1 text-[10px] text-slate-400 italic">{hint}</p>}
    </div>
  );
};

/* Form input with filled/required visual indicator */
const FormInputHighlight: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  filled?: boolean;
  placeholder?: string;
}> = ({ label, value, onChange, type = "text", required, filled, placeholder }) => {
  return (
    <div>
      <label className="mb-1.5 flex items-center gap-1 text-xs font-black uppercase tracking-widest text-slate-500">
        {label}
        {required && <span className="text-rose-400">*</span>}
        {filled && <CheckCircle2 size={11} className="text-emerald-500 ml-auto" />}
      </label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-2xl border-2 p-3 text-sm outline-none transition ${
          filled
            ? "border-emerald-200 bg-emerald-50/30 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
            : required
            ? "border-amber-200 bg-amber-50/30 focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
            : "border-slate-200 bg-slate-50 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100"
        }`}
      />
    </div>
  );
};