import React, { useState, useRef, useEffect } from 'react';
import {
  ArrowLeft,
  Package,
  Truck,
  Clock,
  CheckCircle,
  MapPin,
  CreditCard,
  Calendar,
  Printer,
  Download,
  FileText,
  Upload,
  Loader2,
  ImageIcon,
  ExternalLink,
  ChevronRight,
  ShoppingCart,
  FilePlus,
  Phone,
  User as UserIcon,
  ShieldCheck,
  Mail,
  History,
  X,
  Barcode,
  RotateCcw,
  Pencil,
  Trash2,
  Ban,
  Plus,
  Minus,
  Save,
  AlertTriangle,
  AlertCircle,
} from 'lucide-react';
import DocPreviewDialog from '../ui/DocPreviewDialog';
import { Order, OrderStatus, Article, Inventory, OrderItem, FulfillmentBatch } from '../../types';
import jsPDF from 'jspdf';
import autoTable, { UserOptions } from 'jspdf-autotable';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

// Extend jsPDF with autoTable for type safety if needed, but we'll use autoTable(doc, ...)
interface jsPDFWithAutoTable extends jsPDF {
  lastAutoTable?: {
    finalY: number;
  };
}
import { getImageUrl } from '../../utils/imageUtils';
import { distributorOrderService } from '../../services/distributorOrderService';
import { toast } from 'sonner';
import { COMPANY_CONFIG } from '../../constants';

// How many whole cartons of an order item are backed by REAL stock right
// now. A REGULAR item is always fully backed — this is just its cartonCount.
// A still-PREORDER item may have received PARTIAL stock via one or more
// GRNs (preorderReservedSizeQuantities holds what's been claimed so far,
// per size) — cartons are a fixed assortment, so the number of WHOLE
// cartons the reservation can cover is the floor of reserved÷per-carton-need,
// taken as the minimum across sizes. Mirrors the backend's
// computeReservedCartons (order.service.js) so the scan baseline here always
// agrees with what the server will actually accept.
const computeReservedCartons = (item: OrderItem): number => {
  if (item.bookingType !== 'PREORDER') return item.cartonCount || 0;

  const cartonCount = item.cartonCount || 0;
  if (cartonCount <= 0) return 0;

  const sizeQuantities = item.sizeQuantities || {};
  const reserved = item.preorderReservedSizeQuantities || {};

  let minCartons = Infinity;
  let hasSize = false;
  for (const [size, totalQty] of Object.entries(sizeQuantities)) {
    const perCartonNeed = (Number(totalQty) || 0) / cartonCount;
    if (perCartonNeed <= 0) continue;
    hasSize = true;
    const reservedQty = Number(reserved[size] || 0);
    minCartons = Math.min(minCartons, Math.floor(reservedQty / perCartonNeed + 1e-9));
  }
  if (!hasSize) return 0;
  return minCartons === Infinity ? 0 : Math.max(0, minCartons);
};

const STATUS_LABELS: Record<string, string> = {
  [OrderStatus.PENDING]:   'Pending Confirmation',
  [OrderStatus.BOOKED]:    'Booked',
  [OrderStatus.PFD]:       'Dispatched',
  [OrderStatus.RFD]:       'In Transit',
  [OrderStatus.RECEIVED]:  'Delivered',
  [OrderStatus.PARTIAL]:   'Partially Delivered',
  [OrderStatus.CANCELLED]: 'Cancelled',
};

interface OrderDetailProps {
  order: Order;
  articles: Article[];
  inventory: Inventory[];
  onBack: () => void;
  isDistributor?: boolean;
}

const OrderDetail: React.FC<OrderDetailProps> = ({ order, articles, inventory, onBack, isDistributor = false }) => {
  const [uploading, setUploading] = useState(false);
  const [currentOrder, setCurrentOrder] = useState<Order>(order);
  const [activeTab, setActiveTab] = useState<'items' | 'history'>('items');

  // Per-carton dispatch pools — no fixed "batch" grouping. Each physical
  // carton independently sits in one of these three states; Scan/Transport/
  // Receive tabs each act on whichever pool is theirs, any time, in any
  // order, however many times it takes.
  const dispatchedCartons = (currentOrder.cartonTracking || []).filter(c => c.status === 'DISPATCHED');
  const inTransitCartons  = (currentOrder.cartonTracking || []).filter(c => c.status === 'IN_TRANSIT');
  const receivedCartons   = (currentOrder.cartonTracking || []).filter(c => c.status === 'RECEIVED');
  const totalExpectedCartons = currentOrder.items.reduce((s, i) => s + (i.cartonCount || 0), 0);
  // Scannable remaining = cartons backed by real stock right now, minus
  // what's already been scanned. For a still-PREORDER item that's only
  // whatever a partial GRN reservation covers (computeReservedCartons) —
  // it dispatches what's arrived without waiting for the rest.
  const totalRemainingToScan = currentOrder.items.reduce(
    (s, i) => s + Math.max(0, computeReservedCartons(i) - (i.fulfilledCartonCount || 0)),
    0
  );
  // Still owes MORE than what's currently reserved — shown in the Awaiting
  // Stock panel below with its progress, separate from what's scannable now.
  const awaitingStockItems = currentOrder.items.filter(
    (i) => i.bookingType === 'PREORDER' && computeReservedCartons(i) < (i.cartonCount || 0)
  );

  // All three tabs are usable independently and simultaneously (no locked
  // wizard) — which one is on screen is just a plain view toggle.
  const [dispatchTab, setDispatchTab] = useState<'scan' | 'transport' | 'receive'>('scan');

  // ── Edit / Cancel state ───────────────────────────────────────────────────
  const canEdit   = ['PENDING', 'PRE_BOOKED'].includes(currentOrder.status);
  const canCancel = ['PENDING', 'PRE_BOOKED', 'BOOKED'].includes(currentOrder.status);
  const [editMode, setEditMode] = useState(false);
  // editCounts: variantId → carton count override
  const [editCounts, setEditCounts] = useState<Record<string, number>>({});
  const [deletedItems, setDeletedItems] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const toggleDeleteItem = (key: string) => {
    setDeletedItems(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const startEdit = () => {
    const init: Record<string, number> = {};
    currentOrder.items.forEach(item => { init[item.variantId || item.articleId] = item.cartonCount; });
    setEditCounts(init);
    setDeletedItems(new Set());
    setEditMode(true);
  };

  const cancelEdit = () => { setEditMode(false); setDeletedItems(new Set()); };

  const handleSaveEdit = async () => {
    setSaving(true);
    try {
      const updatedItems = currentOrder.items
        .map(item => {
          const key = item.variantId || item.articleId;
          if (deletedItems.has(key)) return null;
          const newCartons = editCounts[key] ?? item.cartonCount;
          if (newCartons <= 0) return null;
          const ratio = newCartons / (item.cartonCount || 1);
          const newPairs = Math.round((item.pairCount || 0) * ratio);
          const newSizeQty: Record<string, number> = {};
          Object.entries(item.sizeQuantities || {}).forEach(([sz, qty]) => {
            newSizeQty[sz] = Math.round(Number(qty) * ratio);
          });
          return {
            ...item,
            cartonCount: newCartons,
            pairCount: newPairs,
            price: Math.round((item.price / (item.cartonCount || 1)) * newCartons * 100) / 100,
            sizeQuantities: newSizeQty,
          };
        })
        .filter(Boolean);

      if (updatedItems.length === 0) {
        toast.error('At least one item is required');
        return;
      }

      const updated = await distributorOrderService.editOrder(currentOrder.id, updatedItems as any);
      if (updated) setCurrentOrder(updated);
      setEditMode(false);
      toast.success('Order updated successfully');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || 'Failed to update order');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await distributorOrderService.updateOrderStatus(currentOrder.id, OrderStatus.CANCELLED);
      toast.success('Order cancelled');
      onBack();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || 'Failed to cancel order');
      setShowCancelConfirm(false);
    } finally {
      setCancelling(false);
    }
  };

  // Real-time order refresh via shared socket window event (no duplicate connection)
  useEffect(() => {
    const currentId = String(currentOrder.id || (currentOrder as any)._id);

    const handler = async (e: Event) => {
      const data = (e as CustomEvent).detail;
      const updatedOrderId = String(data.orderId);
      if (updatedOrderId !== currentId) return;
      try {
        const res = await distributorOrderService.getOrderById(updatedOrderId);
        if (res) setCurrentOrder(res);
      } catch (err) {
        console.error("Failed to refresh order via socket", err);
      }
    };

    window.addEventListener("orderUpdatedSocket", handler);
    return () => window.removeEventListener("orderUpdatedSocket", handler);
  }, [currentOrder.id, (currentOrder as any)._id]);

  // Sync state if order prop changes (real-time updates from parent/socket)
  useEffect(() => {
    setCurrentOrder(order);
  }, [order]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // New states for Docs
  const [shippingFiles, setShippingFiles] = useState<{ invoice?: File, ewayBill?: File, transportBill?: File }>({});
  const [receiverName, setReceiverName] = useState("");
  const [receiverMobile, setReceiverMobile] = useState("");
  const [receivingNote, setReceivingNote] = useState<File | null>(null);
  const [receivingNotePreview, setReceivingNotePreview] = useState<string | null>(null);

  const invoiceInputRef = useRef<HTMLInputElement>(null);
  const ewayInputRef = useRef<HTMLInputElement>(null);
  const transportInputRef = useRef<HTMLInputElement>(null);
  const receivingNoteInputRef = useRef<HTMLInputElement>(null);

  const [scannedItems, setScannedItems] = useState<Record<string, number>>({}); // variantId -> cartonCount verified
  const [scanInput, setScanInput] = useState("");
  const [breakdownOpen, setBreakdownOpen] = useState(true);

  // ── Dispatch state: per-carton lifecycle (no fixed batches) ─────────────
  const [dispatchForm, setDispatchForm] = useState({
    vehicleNo: '', lrNo: '', transporterName: '',
    eWayBillNo: '', driverName: '', driverMobile: '', grossWeightKg: '',
  });
  const [ctnScanInput, setCtnScanInput] = useState('');
  const [scanSyncing, setScanSyncing] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<{ url: string; title: string } | null>(null);
  // Which currently-Dispatched / currently-In-Transit cartons are checked
  // for the NEXT transit/receive submission — defaults to "everything",
  // user can uncheck some to leave them for a later shipment/confirmation.
  const [selectedTransitCodes, setSelectedTransitCodes] = useState<Set<string>>(new Set());
  const [selectedReceiveCodes, setSelectedReceiveCodes] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSelectedTransitCodes(prev => {
      const next = new Set(prev);
      dispatchedCartons.forEach(c => next.add(c.code));
      [...next].forEach(code => { if (!dispatchedCartons.some(c => c.code === code)) next.delete(code); });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrder.cartonTracking]);

  useEffect(() => {
    setSelectedReceiveCodes(prev => {
      const next = new Set(prev);
      inTransitCartons.forEach(c => next.add(c.code));
      [...next].forEach(code => { if (!inTransitCartons.some(c => c.code === code)) next.delete(code); });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrder.cartonTracking]);


  const handleScanSKU = (sku: string) => {
    if (!sku.trim()) return;
    
    // Normalize input: lower case and remove ALL whitespace
    const normalizedInput = sku.trim().toLowerCase().replace(/\s+/g, "");
    
    // Find which item this Carton SKU belongs to
    let found = false;
    currentOrder.items.forEach(item => {
      const article = articles.find(a => a.id === item.articleId);
      if (!article) return;
      const variant = article.variants?.find(v => v.id === item.variantId || v._id === item.variantId);
      
      if (!variant) return;

      // 1. Match against Dynamic Carton SKU: [Article Name]-[Color]-[Size Range]
      const cartonSKU = `${article.name}-${variant.color}-${variant.sizeRange}`
        .toLowerCase()
        .replace(/\s+/g, "");

      // 2. Match against actual Variant SKU field
      const variantSKU = (variant.sku || "").toLowerCase().replace(/\s+/g, "");

      if (normalizedInput === cartonSKU || (variantSKU && normalizedInput === variantSKU)) {
        const remaining = item.cartonCount - (item.fulfilledCartonCount || 0);
        const alreadyScanned = scannedItems[item.variantId!] || 0;

        if (alreadyScanned < remaining) {
          setScannedItems(prev => ({
            ...prev,
            [item.variantId!]: (prev[item.variantId!] || 0) + 1
          }));
          toast.success(`Verified: ${article.name} (${variant.color}) - Carton ${alreadyScanned + 1}`);
          found = true;
        } else {
          toast.warning(`All allocated cartons for this item are already verified.`);
          found = true;
        }
      }
    });

    if (!found) {
      toast.error("SKU does not match any current allocation batch.");
    }
    setScanInput("");
  };

  const isScanningFinished = () => {
    return currentOrder.items.every(item => {
      const remaining = item.cartonCount - (item.fulfilledCartonCount || 0);
      const scanned = scannedItems[item.variantId!] || 0;
      return scanned >= remaining;
    });
  };

  // ── CTN Out-Scan helpers ──────────────────────────────────────────────────
  const makeOrderShort = () =>
    (currentOrder.orderNumber || currentOrder.id.slice(-6).toUpperCase()).replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 8);

  const getItemCode = (item: Order['items'][0]) => {
    const article = articles.find(a => a.id === item.articleId);
    const variant = article?.variants?.find(v => v.id === item.variantId || (v as any)._id === item.variantId);
    // Use the actual variant SKU from the catalog (same as in master CSV)
    const sku = variant?.sku || article?.sku || '';
    if (sku) return sku.replace(/[^A-Z0-9\-_]/gi, '').toUpperCase();
    // Fallback: derive from article name if SKU not set
    return (article?.name || item.articleId || 'ITEM').replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 8);
  };

  const getItemLabel = (itemKey: string) => {
    const item = currentOrder.items.find(i => (i.variantId || i.articleId) === itemKey);
    const article = item ? articles.find(a => a.id === item.articleId) : undefined;
    const variant = article?.variants?.find(v => v.id === item?.variantId || (v as any)._id === item?.variantId);
    if (article && variant) return `${article.name} — ${variant.color} (${variant.sizeRange})`;
    return article?.name || itemKey;
  };

  // Frozen per-item "remaining" snapshot, captured once for the lifetime of
  // this view. Every scan now syncs to the backend immediately — if the
  // expected-code numbering (CT0001, CT0002, ... derived from
  // reserved cartons − fulfilledCartonCount) were recomputed live off the
  // post-sync order, the same label would shift to mean a different
  // physical carton between scans. Freezing it keeps a barcode's meaning
  // stable for as long as this order stays open on screen.
  const scanBaselineRef = useRef<{ remaining: Record<string, number>; itemCodes: Record<string, string> } | null>(null);
  const getScanBaseline = () => {
    if (!scanBaselineRef.current) {
      const remaining: Record<string, number> = {};
      const itemCodes: Record<string, string> = {};
      currentOrder.items.forEach(item => {
        // Scannable = whatever's currently backed by real stock (full
        // cartonCount for REGULAR, only the GRN-reserved portion for a
        // still-PREORDER item) minus what's already been scanned.
        const rem = Math.max(0, computeReservedCartons(item) - (item.fulfilledCartonCount || 0));
        if (rem <= 0) return;
        const key = item.variantId || item.articleId;
        remaining[key] = rem;
        itemCodes[key] = getItemCode(item);
      });
      scanBaselineRef.current = { remaining, itemCodes };
    }
    return scanBaselineRef.current;
  };

  // Scan → syncs to the backend the instant it's recognized. No batch, no
  // button — the carton appears in the Dispatched pool immediately.
  const handleCTNScan = async (raw: string) => {
    const barcode = raw.trim().toUpperCase();
    if (!barcode || scanSyncing) return;
    if ((currentOrder.cartonTracking || []).some(c => c.code === barcode)) {
      toast.info(`${barcode} already scanned`); setCtnScanInput(''); return;
    }
    // Primary: check this order's pre-allocated carton codes
    let matchedItemKey: string | null = null;
    for (const item of currentOrder.items) {
      if ((item.allocatedCartons || []).includes(barcode)) {
        matchedItemKey = item.variantId || item.articleId || null;
        break;
      }
    }
    // Fallback: old sequential CT0001..N logic (GRN cartons / legacy orders with empty allocatedCartons)
    if (!matchedItemKey) {
      const baseline = getScanBaseline();
      for (const [itemKey, code] of Object.entries(baseline.itemCodes)) {
        const remaining = baseline.remaining[itemKey] || 0;
        for (let n = 1; n <= remaining; n++) {
          if (`${code}-CT${String(n).padStart(4, '0')}` === barcode) { matchedItemKey = itemKey; break; }
        }
        if (matchedItemKey) break;
      }
    }
    if (!matchedItemKey) { toast.error(`Unknown CTN: ${barcode}`); setCtnScanInput(''); return; }

    setCtnScanInput('');
    setScanSyncing(true);
    try {
      const updated = await distributorOrderService.scanCarton(currentOrder.id, barcode, matchedItemKey);
      if (updated) {
        setCurrentOrder(updated);
        toast.success(`CTN ${barcode} scanned ✓`);
      }
    } catch (err: any) {
      const msg: string = err?.response?.data?.message || err?.message || '';
      if (msg.includes('is not allocated to this order')) {
        toast.info(msg);
      } else {
        toast.error(msg || 'Failed to scan carton');
      }
    } finally {
      setScanSyncing(false);
    }
  };

  // Transport → submits the vehicle/transporter form for exactly the
  // checked subset of the Dispatched pool.
  const handleSubmitTransit = async () => {
    const codes = [...selectedTransitCodes];
    if (codes.length === 0) { toast.error('Select at least one carton'); return; }
    if (!dispatchForm.vehicleNo.trim()) { toast.error('Vehicle No required'); return; }
    if (!dispatchForm.transporterName.trim()) { toast.error('Transporter Name required'); return; }
    try {
      setUploading(true);
      const files: { invoice?: File; ewayBill?: File; transportBill?: File } = {};
      if (shippingFiles.invoice)       files.invoice       = shippingFiles.invoice;
      if (shippingFiles.ewayBill)      files.ewayBill      = shippingFiles.ewayBill;
      if (shippingFiles.transportBill) files.transportBill = shippingFiles.transportBill;

      const updated = await distributorOrderService.submitTransit(currentOrder.id, codes, {
        vehicleNo: dispatchForm.vehicleNo.trim(),
        transporterName: dispatchForm.transporterName.trim(),
        lrNo: dispatchForm.lrNo.trim() || undefined,
        eWayBillNo: dispatchForm.eWayBillNo.trim() || undefined,
        driverName: dispatchForm.driverName.trim() || undefined,
        driverMobile: dispatchForm.driverMobile.trim() || undefined,
        grossWeightKg: dispatchForm.grossWeightKg ? Number(dispatchForm.grossWeightKg) : undefined,
        files: Object.keys(files).length ? files : undefined,
      });
      if (updated) {
        setCurrentOrder(updated);
        setDispatchForm({ vehicleNo: '', lrNo: '', transporterName: '', eWayBillNo: '', driverName: '', driverMobile: '', grossWeightKg: '' });
        setShippingFiles({});
        toast.success(`${codes.length} carton(s) marked In Transit`);
        setDispatchTab('receive');
      }
    } catch (err: any) {
      console.error('Failed to submit transit details', err);
      toast.error(err?.response?.data?.message || 'Failed to submit transit details');
    } finally {
      setUploading(false);
    }
  };

  // Receive → confirms receipt for exactly the checked subset of the
  // In Transit pool.
  const handleSubmitReceive = async () => {
    const codes = [...selectedReceiveCodes];
    if (codes.length === 0) { toast.error('Select at least one carton'); return; }
    if (!receiverName || !receiverMobile) {
      toast.error("Please provide Receiver Name and Mobile Number");
      return;
    }
    try {
      setUploading(true);
      const updated = await distributorOrderService.receiveCartons(currentOrder.id, codes, {
        receiverName, receiverMobile, receivingNote: receivingNote || undefined,
      });
      if (updated) {
        setCurrentOrder(updated);
        setReceivingNote(null);
        setReceivingNotePreview(null);
        setReceiverName("");
        setReceiverMobile("");
        toast.success(`${codes.length} carton(s) marked Received`);
      }
    } catch (err: any) {
      console.error("Failed to receive cartons", err);
      toast.error(err?.response?.data?.message || "Failed to receive cartons");
    } finally {
      setUploading(false);
    }
  };


  const onShippingFileSelected = (key: 'invoice' | 'ewayBill' | 'transportBill', e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setShippingFiles(prev => ({ ...prev, [key]: file }));
      toast.info(`${key.charAt(0).toUpperCase() + key.slice(1)} added`);
    }
  };

  // Vehicle/transporter details form, shown in the Transport tab for
  // whichever cartons are currently selected (see handleSubmitTransit).
  const renderTransportForm = () => (
    <>
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 border-b border-slate-100">
          <Truck size={14} className="text-amber-500" />
          <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Transport Details</p>
        </div>
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { key: 'vehicleNo',       label: 'Vehicle No',         placeholder: 'e.g. MH 04 AB 1234',  required: true },
            { key: 'transporterName', label: 'Transporter Name',   placeholder: 'e.g. Gati / BlueDart',required: true },
            { key: 'lrNo',            label: 'LR / Consignment No',placeholder: 'e.g. LR-20240601-001',required: false },
            { key: 'eWayBillNo',      label: 'E-Way Bill No',      placeholder: 'e.g. 1234 5678 9012', required: false },
            { key: 'driverName',      label: 'Driver Name',        placeholder: 'e.g. Ramesh Kumar',   required: false },
            { key: 'driverMobile',    label: 'Driver Mobile',      placeholder: 'e.g. 9876543210',     required: false },
          ].map(f => (
            <div key={f.key}>
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                {f.label} {f.required && <span className="text-rose-400">*</span>}
              </label>
              <input
                type="text"
                value={(dispatchForm as any)[f.key]}
                onChange={e => setDispatchForm(p => ({ ...p, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                className={`w-full px-3 py-2 bg-white border rounded-xl outline-none focus:ring-2 focus:ring-indigo-400/20 focus:border-indigo-400 text-xs font-medium ${f.required && !(dispatchForm as any)[f.key].trim() ? 'border-rose-200' : 'border-slate-200'}`}
              />
            </div>
          ))}
          <div>
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Gross Weight (KG)</label>
            <input type="number" value={dispatchForm.grossWeightKg} onChange={e => setDispatchForm(p => ({ ...p, grossWeightKg: e.target.value }))} placeholder="e.g. 120" min="0" className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-400/20 focus:border-indigo-400 text-xs font-medium" />
          </div>
        </div>
      </div>

      {/* Supporting Docs */}
      <div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
          <FileText size={11} /> Supporting Documents <span className="font-normal normal-case text-slate-300">(optional)</span>
        </p>
        <div className="grid grid-cols-3 gap-2">
          {([
            { ref: invoiceInputRef,   key: 'invoice',       label: 'Tax Invoice' },
            { ref: ewayInputRef,      key: 'ewayBill',      label: 'E-Way Bill PDF' },
            { ref: transportInputRef, key: 'transportBill', label: 'Transport Bill' },
          ] as const).map(d => (
            <div key={d.key}>
              <input type="file" ref={d.ref} className="hidden" onChange={(e) => onShippingFileSelected(d.key, e)} />
              <button onClick={() => d.ref.current?.click()} className={`w-full flex items-center gap-2 p-2.5 rounded-xl border-2 transition-all text-left ${(shippingFiles as any)[d.key] ? 'border-emerald-400 bg-emerald-50' : 'border-dashed border-slate-200 bg-slate-50 hover:bg-slate-100'}`}>
                {(shippingFiles as any)[d.key] ? <CheckCircle size={13} className="text-emerald-500 shrink-0" /> : <Upload size={13} className="text-slate-400 shrink-0" />}
                <div className="min-w-0">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-wider">{d.label}</p>
                  {(shippingFiles as any)[d.key] && <p className="text-[8px] text-emerald-600 truncate font-bold">{(shippingFiles as any)[d.key].name}</p>}
                </div>
              </button>
            </div>
          ))}
        </div>
      </div>
    </>
  );

  const onReceivingNoteSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setReceivingNote(file);
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (ev) => setReceivingNotePreview(ev.target?.result as string);
        reader.readAsDataURL(file);
      } else {
        setReceivingNotePreview(null);
      }
    }
  };

  const handlePrintOrderPDF = async () => {
    // ── Pre-fetch all item images as base64 ────────────────────────────────
    const imageMap: Record<string, string> = {};
    await Promise.all(
      currentOrder.items.map(async (item) => {
        const article = articles.find(a => a.id === item.articleId);
        const variant = article?.variants?.find(v => v.id === item.variantId);
        const colorMedia = article?.colorMedia || [];
        const matched = colorMedia.find((cm: any) => cm.color.toLowerCase() === variant?.color?.toLowerCase());
        const rawUrl = (matched?.images?.length > 0)
          ? matched.images[0].url
          : (variant?.images?.length > 0 ? variant.images[0] : article?.imageUrl);
        if (!rawUrl) return;
        try {
          const fullUrl = getImageUrl(rawUrl);
          const resp = await fetch(fullUrl);
          const blob = await resp.blob();
          const b64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
          imageMap[item.variantId || item.articleId] = b64;
        } catch {
          // skip if image load fails
        }
      })
    );

    const doc = new jsPDF("portrait", "pt", "a4") as jsPDFWithAutoTable;
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 40;
    const IMG_SIZE = 36; // px in PDF pts
    const ROW_HEIGHT = IMG_SIZE + 8;

    const dist = typeof currentOrder.distributorId === 'object' ? currentOrder.distributorId : null;
    const profile = dist?.distributorId;
    const addr = profile?.shippingAddress;
    const phone = profile?.phone || 'N/A';
    const email = profile?.email || dist?.email || 'N/A';

    // ── Title bar ──────────────────────────────────────────────────────────
    autoTable(doc, {
      startY: 20,
      margin: { left: margin, right: margin },
      theme: "plain",
      styles: { cellPadding: 5, fontSize: 10, lineColor: [0,0,0], lineWidth: 0.5 },
      body: [[
        { content: COMPANY_CONFIG.name || 'Kore', styles: { fontStyle: "bold", fontSize: 12, halign: "left" } },
        { content: "ORDER DETAIL", styles: { halign: "center", fontSize: 14, fontStyle: "bold", fillColor: [240, 245, 255] } },
        { content: "", styles: { halign: "right" } },
      ]],
      columnStyles: { 0: { cellWidth: 200 }, 1: { cellWidth: 200 }, 2: { cellWidth: "auto" } },
    });

    // ── Order info grid ────────────────────────────────────────────────────
    const statusLabel = STATUS_LABELS[currentOrder.status] || currentOrder.status;
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY,
      margin: { left: margin, right: margin },
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 4, lineColor: [0,0,0], lineWidth: 0.5, valign: "middle" },
      columnStyles: {
        0: { cellWidth: 70, fontStyle: "bold" },
        1: { cellWidth: 160 },
        2: { cellWidth: 60, fontStyle: "bold" },
        3: { cellWidth: 110 },
        4: { cellWidth: 60, fontStyle: "bold" },
        5: { cellWidth: "auto" },
      },
      body: [
        ["Order No.", `#${currentOrder.orderNumber || currentOrder.id.slice(-6).toUpperCase()}`, "Date", currentOrder.date || '-', "Status", statusLabel],
        ["Distributor", currentOrder.distributorName || '-', "Company", profile?.companyName || '-', "Phone", phone],
        ["Ship To", addr ? [addr.address1, addr.address2, addr.city, addr.state, addr.pinCode].filter(Boolean).join(', ') : '-', "Email", email, "Total Ctns", currentOrder.totalCartons],
      ],
    });

    // ── Items table (col 0 = image placeholder, drawn via didDrawCell) ─────
    const itemRows = currentOrder.items.map((item, idx) => {
      const article = articles.find(a => a.id === item.articleId);
      const variant = article?.variants?.find(v => v.id === item.variantId);
      const assortment = (() => {
        const sq = variant?.sizeQuantities;
        if (!sq || Object.keys(sq).length === 0) return 'N/A';
        return Object.keys(sq).sort((a, b) => parseInt(a) - parseInt(b)).map(s => `${s}:${sq[s]}`).join(', ');
      })();
      const remaining = Math.max(0, item.cartonCount - (item.fulfilledCartonCount || 0));
      return [
        "",                           // col 0: image (drawn below)
        idx + 1,
        article?.name || '-',
        variant?.color || 'N/A',
        variant?.sizeRange || '-',
        assortment,
        item.cartonCount,
        item.fulfilledCartonCount || 0,
        item.returnedCartonCount || 0,
        remaining,
      ];
    });

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 12,
      margin: { left: margin, right: margin },
      theme: "grid",
      headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: "bold", fontSize: 7, halign: "center" },
      styles: { fontSize: 7, cellPadding: 3, lineColor: [0,0,0], lineWidth: 0.5, halign: "center", valign: "middle", minCellHeight: ROW_HEIGHT },
      columnStyles: {
        0: { cellWidth: ROW_HEIGHT + 4 },   // image column
        2: { halign: "left" },              // Article
        5: { halign: "left", cellWidth: 100 }, // Size Assortment
      },
      head: [["", "#", "Article", "Color", "Size Range", "Size Assortment", "Ordered\n(Ctn)", "Dispatched\n(Ctn)", "Returned\n(Ctn)", "Remaining\n(Ctn)"]],
      body: itemRows,
      didDrawCell: (data: any) => {
        if (data.section === 'body' && data.column.index === 0) {
          const item = currentOrder.items[data.row.index];
          if (!item) return;
          const key = item.variantId || item.articleId;
          const b64 = imageMap[key];
          if (!b64) return;
          const pad = 3;
          const cellX = data.cell.x + pad;
          const cellY = data.cell.y + pad;
          const size = Math.min(data.cell.width - pad * 2, data.cell.height - pad * 2);
          try {
            const fmt = b64.startsWith('data:image/png') ? 'PNG' : 'JPEG';
            doc.addImage(b64, fmt, cellX, cellY, size, size);
          } catch {
            // skip if image can't be embedded
          }
        }
      },
    });

    // ── Payment summary ────────────────────────────────────────────────────
    const subtotal = currentOrder.totalAmount || 0;
    const discAmt = currentOrder.discountAmount || 0;
    const taxable = currentOrder.finalAmount ?? (subtotal - discAmt);
    const gstRate = currentOrder.gstRate ?? 5;
    const gstAmt = currentOrder.gstAmount ?? Math.round(taxable * gstRate / 100 * 100) / 100;
    const finalPayable = Math.round(taxable + gstAmt);

    const finalY = (doc as any).lastAutoTable.finalY + 12;
    const summaryRows: any[] = [
      ["Order Subtotal", `Rs. ${subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`],
    ];
    if (discAmt > 0) {
      summaryRows.push(["Discount", `- Rs. ${discAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`]);
      summaryRows.push(["Taxable Amount", `Rs. ${taxable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`]);
    }
    summaryRows.push([`GST @ ${gstRate}%`, `Rs. ${gstAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`]);
    summaryRows.push(["FINAL PAYABLE", `Rs. ${finalPayable.toLocaleString('en-IN')}`]);

    autoTable(doc, {
      startY: finalY,
      margin: { left: pageWidth - margin - 220, right: margin },
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 4, lineColor: [0,0,0], lineWidth: 0.5 },
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 110 }, 1: { halign: "right", cellWidth: 110 } },
      body: summaryRows,
      didParseCell: (data: any) => {
        if (data.row.index === summaryRows.length - 1) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fontSize = 10;
          data.cell.styles.textColor = [79, 70, 229];
        }
      },
    });

    // ── Footer ─────────────────────────────────────────────────────────────
    doc.setFontSize(7);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(180, 180, 180);
    doc.text('This is a system-generated order summary.', pageWidth / 2, doc.internal.pageSize.getHeight() - 20, { align: 'center' });

    doc.save(`Order-${currentOrder.orderNumber || currentOrder.id.slice(-6).toUpperCase()}.pdf`);
    toast.success("Order PDF downloaded!");
  };

  const handleDownloadPI = () => {
    const doc = new jsPDF("portrait", "pt", "a4") as jsPDFWithAutoTable;
    
    const dist = typeof currentOrder.distributorId === 'object' ? currentOrder.distributorId : null;
    const distDetails = dist?.distributorId;
    
    const formatAddr = (addr: any) => {
      if (!addr) return '-';
      const parts = [addr.attention, addr.address1, addr.address2, addr.city, addr.state, addr.pinCode].filter(Boolean);
      return parts.join(', ') || '-';
    };

    // Header Section - adapted from exportPO.ts for professional look
    const topTableData: any[] = [];
    
    // Row 1: Company Info vs Distributor Details
    topTableData.push([
      { content: "Company Name", styles: { fontStyle: "bold", fillColor: [240, 245, 240] } },
      distDetails?.companyName || '-',
      { content: "Party Name", styles: { fontStyle: "bold" } },
      currentOrder.distributorName || '-',
      { content: "PI Date", styles: { fontStyle: "bold" } },
      currentOrder.date || '-',
    ]);

    // Row 2
    topTableData.push([
      { content: "CIN No.", styles: { fontStyle: "bold", fillColor: [240, 245, 240] } },
      '-',
      { content: "Order ID", styles: { fontStyle: "bold" } },
      currentOrder.orderNumber || currentOrder.id.toUpperCase(),
      { content: "Status", styles: { fontStyle: "bold" } },
      STATUS_LABELS[currentOrder.status] || '-',
    ]);

    // Row 3
    const orderBrand = articles.find(a => currentOrder.items.some(i => i.articleId === a.id))?.brand;
    topTableData.push([
      { content: "GST No.", styles: { fontStyle: "bold", fillColor: [240, 245, 240] } },
      (dist as any)?.gstNumber || (distDetails as any)?.gstNumber || '-',
      { content: "Brand", styles: { fontStyle: "bold" } },
      orderBrand || '-',
      { content: "Payment Terms", styles: { fontStyle: "bold" } },
      (distDetails as any)?.paymentTerms || '-',
    ]);

    // Dynamic batch values for PI
    const getBatchCartons = (item: any) => item.cartonCount - (item.fulfilledCartonCount || 0) || item.cartonCount;
    const getBatchPairs = (item: any) => item.pairCount - (item.fulfilledPairCount || 0) || item.pairCount;

    const totalBatchPairs = currentOrder.items.reduce((sum, item) => sum + getBatchPairs(item), 0);
    const totalBatchCartons = currentOrder.items.reduce((sum, item) => sum + getBatchCartons(item), 0);

    // Row 4
    topTableData.push([
      { content: "PAN No.", styles: { fontStyle: "bold", fillColor: [240, 245, 240] } },
      '-',
      { content: "Total Pairs", styles: { fontStyle: "bold" } },
      totalBatchPairs,
      { content: "Total Cartons", styles: { fontStyle: "bold" } },
      totalBatchCartons,
    ]);

    // Row 5: Addresses
    topTableData.push([
      { content: "Invoice To", styles: { fontStyle: "bold", fillColor: [240, 245, 240] } },
      formatAddr(distDetails?.billingAddress),
      { content: "Ship To", styles: { fontStyle: "bold" } },
      formatAddr(distDetails?.shippingAddress),
      { content: "Contact", styles: { fontStyle: "bold" } },
      distDetails?.phone || COMPANY_CONFIG.phone || '-',
    ]);

    // Draw Main Title Bar
    autoTable(doc, {
      startY: 20,
      margin: { left: 40, right: 40 },
      theme: "plain",
      styles: { cellPadding: 5, fontSize: 10, textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.5 },
      body: [
        [
          { content: COMPANY_CONFIG.name, styles: { halign: "left", fontStyle: "bold", fontSize: 11 } },
          { content: "PROFORMA INVOICE", styles: { halign: "center", fontSize: 14, fontStyle: "bold", fillColor: [240, 245, 240] } },
          { content: "", styles: { halign: "right" } },
        ],
      ],
      columnStyles: { 0: { cellWidth: 200 }, 1: { cellWidth: 200 }, 2: { cellWidth: "auto" } }
    });

    // Draw Header Info Grid
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY,
      margin: { left: 40, right: 40 },
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 4, textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.5, valign: "middle" },
      columnStyles: {
        0: { cellWidth: 70, fontStyle: "bold" },
        1: { cellWidth: 150 },
        2: { cellWidth: 70, fontStyle: "bold" },
        3: { cellWidth: 110 },
        4: { cellWidth: 60, fontStyle: "bold" },
        5: { cellWidth: "auto" },
      },
      body: topTableData,
    });

    // Item Table Data
    const itemRows = currentOrder.items
      .filter(item => {
        const qty = getBatchPairs(item);
        return qty > 0;
      })
      .map((item, idx) => {
      const article = articles.find(a => a.id === item.articleId);
      const variant = article?.variants?.find(v => v.id === item.variantId);
      const price = variant?.costPrice || 0;
      const batchPairs = getBatchPairs(item);
      const totalValue = batchPairs * price;
      const hsn = article?.sku || '6404'; // Default hsn for footwear if not available
      const gender = article?.category?.toString().charAt(0) || 'M';

      return [
        idx + 1,
        hsn, // HSN
        variant ? `${article?.name}-${variant.color}-${variant.sizeRange}` : (article?.name || 'Item'),
        article?.name || 'Style', // Style No
        variant?.color || 'N/A',
        gender,
        article?.mrp || item.price / (item.pairCount || 1), // MRP
        batchPairs,
        price.toFixed(2), // Unit Cost
        totalValue.toFixed(2), // Total Value
      ];
    });

    // Draw Items Table
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 15,
      margin: { left: 40, right: 40 },
      theme: "grid",
      headStyles: { 
        fillColor: [240, 245, 240], 
        textColor: [0, 0, 0], 
        fontStyle: "bold", 
        fontSize: 7, 
        lineColor: [0, 0, 0], 
        lineWidth: 0.5, 
        halign: "center" 
      },
      styles: { 
        fontSize: 7, 
        cellPadding: 3, 
        textColor: [0, 0, 0], 
        lineColor: [0, 0, 0], 
        lineWidth: 0.5, 
        halign: "center", 
        valign: "middle" 
      },
      head: [["#", "HSN", "STYLE NAME", "STYLE NO", "COLOR", "GDR", "MRP", "QTY", "RATE", "TOTAL"]],
      body: itemRows,
    });

    const finalY = (doc as any).lastAutoTable.finalY + 15;

    // Totals Section
    const subTotal = currentOrder.items.reduce((sum, item) => {
      const art = articles.find(a => a.id === item.articleId);
      const vari = art?.variants?.find(v => v.id === item.variantId);
      return sum + (getBatchPairs(item) * (vari?.costPrice || 0));
    }, 0);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(`Sub Total: Rs. ${subTotal.toLocaleString()}`, 420, finalY);
    doc.text(`Total Qty: ${totalBatchPairs} Pairs`, 420, finalY + 12);
    
    doc.setFontSize(11);
    doc.setTextColor(79, 70, 229);
    doc.text(`FINAL AMOUNT: Rs. ${subTotal.toLocaleString()}`, 420, finalY + 28);

    // Footer
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(150, 150, 150);
    doc.text('This is a computer-generated Proforma Invoice. No signature required.', 105, 280, { align: 'center' });

    doc.save(`PI-${currentOrder.orderNumber || currentOrder.id}.pdf`);
    toast.success("Professional Proforma Invoice downloaded!");
  };

  const handleDownloadExcelPI = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Proforma Invoice');

    const dist = typeof currentOrder.distributorId === 'object' ? currentOrder.distributorId : null;
    const distDetails = dist?.distributorId;
    
    const formatAddr = (addr: any) => {
      if (!addr) return '-';
      const parts = [addr.attention, addr.address1, addr.address2, addr.city, addr.state, addr.pinCode].filter(Boolean);
      return parts.join(', ') || '-';
    };

    // Header Title
    worksheet.mergeCells('A1:J1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = 'PROFORMA INVOICE';
    titleCell.font = { bold: true, size: 16 };
    titleCell.alignment = { horizontal: 'center' };

    // Company Title
    worksheet.mergeCells('A2:J2');
    const companyCell = worksheet.getCell('A2');
    companyCell.value = COMPANY_CONFIG.name || '-';
    companyCell.font = { bold: true, size: 14 };
    companyCell.alignment = { horizontal: 'center' };

    worksheet.addRow([]); // Gap

    // Info Grid
    const getBatchPairs = (item: any) => item.pairCount - (item.fulfilledPairCount || 0) || item.pairCount;
    const getBatchCartons = (item: any) => item.cartonCount - (item.fulfilledCartonCount || 0) || item.cartonCount;
    const totalBatchPairs = currentOrder.items.reduce((sum, item) => sum + getBatchPairs(item), 0);
    const totalBatchCartons = currentOrder.items.reduce((sum, item) => sum + getBatchCartons(item), 0);

    const orderBrand = articles.find(a => currentOrder.items.some(i => i.articleId === a.id))?.brand;

    const addInfoRow = (l1: string, v1: any, l2: string, v2: any, l3: string, v3: any) => {
      const row = worksheet.addRow([l1, v1, '', '', l2, v2, '', l3, v3, '']);
      const rNum = row.number;
      worksheet.mergeCells(rNum, 2, rNum, 4);
      worksheet.mergeCells(rNum, 6, rNum, 7);
      worksheet.mergeCells(rNum, 9, rNum, 10);
      row.height = 25;
      
      [1, 5, 8].forEach(c => {
        const cell = row.getCell(c);
        cell.font = { bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F0F5F0' } };
      });

      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        cell.alignment = { wrapText: true, vertical: 'middle', horizontal: 'left' };
      });
    };

    addInfoRow('Company Name', distDetails?.companyName || '-', 'Party Name', currentOrder.distributorName || '-', 'PI Date', currentOrder.date || '-');
    addInfoRow('CIN No.', '-', 'Order ID', currentOrder.orderNumber || currentOrder.id.toUpperCase(), 'Status', STATUS_LABELS[currentOrder.status] || '-');
    addInfoRow('GST No.', (dist as any)?.gstNumber || (distDetails as any)?.gstNumber || '-', 'Brand', orderBrand || '-', 'Payment Terms', (distDetails as any)?.paymentTerms || '-');
    addInfoRow('PAN No.', '-', 'Total Pairs', totalBatchPairs, 'Total Cartons', totalBatchCartons);

    // Dedicated taller rows for Addresses
    const addrRow = worksheet.addRow(['Invoice To', formatAddr(distDetails?.billingAddress), '', '', '', 'Ship To', formatAddr(distDetails?.shippingAddress), '', '', '']);
    const arNum = addrRow.number;
    worksheet.mergeCells(arNum, 2, arNum, 5);
    worksheet.mergeCells(arNum, 7, arNum, 10);
    addrRow.height = 60; // Tall enough for 3-4 lines of address
    
    [1, 6].forEach(c => {
      const cell = addrRow.getCell(c);
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F0F5F0' } };
    });
    addrRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      cell.alignment = { wrapText: true, vertical: 'top', horizontal: 'left' };
    });

    const contactRow = worksheet.addRow(['Contact', distDetails?.phone || '-', '', '', '', '', '', '', '', '']);
    const crNum = contactRow.number;
    worksheet.mergeCells(crNum, 2, crNum, 10);
    contactRow.height = 25;
    contactRow.getCell(1).font = { bold: true };
    contactRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F0F5F0' } };
    contactRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      cell.alignment = { wrapText: true, vertical: 'middle', horizontal: 'left' };
    });

    worksheet.addRow([]); // Gap

    // Items Table Header
    const tableHeader = ["#", "HSN", "STYLE NAME", "STYLE NO", "COLOR", "GDR", "MRP", "QTY", "RATE", "TOTAL"];
    const headerRow = worksheet.addRow(tableHeader);
    headerRow.eachCell(cell => {
      cell.font = { bold: true, color: { argb: '000000' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F0F5F0' } };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      cell.alignment = { horizontal: 'center' };
    });

    // Items Table Body
    let subTotal = 0;
    currentOrder.items
      .filter(item => getBatchPairs(item) > 0)
      .forEach((item, idx) => {
        const article = articles.find(a => a.id === item.articleId);
        const variant = article?.variants?.find(v => v.id === item.variantId);
        const price = variant?.costPrice || 0;
        const batchPairs = getBatchPairs(item);
        const totalValue = batchPairs * price;
        subTotal += totalValue;
        
        const hsn = article?.sku || '6404';
        const gender = article?.category?.toString().charAt(0) || 'M';

        const row = [
          idx + 1,
          hsn,
          variant ? `${article?.name}-${variant.color}-${variant.sizeRange}` : (article?.name || 'Item'),
          article?.name || 'Style',
          variant?.color || 'N/A',
          gender,
          article?.mrp || item.price / (item.pairCount || 1),
          batchPairs,
          price.toFixed(2),
          totalValue.toFixed(2)
        ];
        const r = worksheet.addRow(row);
        r.eachCell(cell => {
          cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
          cell.alignment = { horizontal: 'center' };
        });
      });

    worksheet.addRow([]); // Gap

    // Totals - Aligned to the table columns (Total column is J / 10)
    const stRow = worksheet.addRow(['', '', '', '', '', '', '', '', 'Sub Total:', subTotal]);
    stRow.getCell(9).font = { bold: true };
    stRow.getCell(10).font = { bold: true };
    
    const qtyRow = worksheet.addRow(['', '', '', '', '', '', '', '', 'Total Qty:', `${totalBatchPairs} Pairs`]);
    qtyRow.getCell(9).font = { bold: true };
    qtyRow.getCell(10).font = { bold: true };

    const finalRow = worksheet.addRow(['', '', '', '', '', '', '', '', 'FINAL AMOUNT:', subTotal]);
    finalRow.getCell(9).font = { bold: true, size: 12, color: { argb: '4F46E5' } };
    finalRow.getCell(10).font = { bold: true, size: 12, color: { argb: '4F46E5' } };

    // Set Column Widths
    worksheet.columns = [
      { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 },
      { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 20 }, { width: 15 }
    ];

    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `PI-${currentOrder.orderNumber || currentOrder.id}.xlsx`);
    toast.success("Excel Proforma Invoice downloaded!");
  };

  // With per-carton tracking, different cartons can be at different stages
  // at once — this progress bar shows the FURTHEST any carton has gotten,
  // derived straight from the pools rather than a single order-wide status.
  const isPartiallyReceived = receivedCartons.length > 0 && receivedCartons.length < totalExpectedCartons;
  const statusSteps = [
    { label: 'Pending',     icon: <Package size={16} />,     activeColor: 'bg-indigo-600' },
    { label: 'Dispatched',  icon: <Truck size={16} />,       activeColor: 'bg-indigo-600' },
    { label: 'In Transit',  icon: <Truck size={16} />,       activeColor: 'bg-indigo-600' },
    { label: isPartiallyReceived ? 'Partial Delivered' : 'Delivered', icon: <CheckCircle size={16} />, activeColor: isPartiallyReceived ? 'bg-amber-500' : 'bg-emerald-600' },
  ];

  const currentStatusIndex = (() => {
    if (currentOrder.status === OrderStatus.CANCELLED) return -1;
    if (currentOrder.status === OrderStatus.PENDING) return 0;
    if (totalExpectedCartons > 0 && receivedCartons.length >= totalExpectedCartons) return 3;
    if (receivedCartons.length > 0) return 3; // partially received — furthest point reached
    if (inTransitCartons.length > 0) return 2;
    if (dispatchedCartons.length > 0) return 1;
    return 0;
  })();

  const getFullUrl = (path: string | undefined) => {
    if (!path) return null;
    return `${(import.meta.env.VITE_API_BASE_URL || 'http://localhost:5005/api').replace('/api', '')}${path}`;
  };

  const latestBatch = currentOrder.fulfillmentHistory && currentOrder.fulfillmentHistory.length > 0 
    ? currentOrder.fulfillmentHistory[currentOrder.fulfillmentHistory.length - 1] 
    : null;

  const docLinks = {
    invoice: getFullUrl(currentOrder.invoiceUrl || latestBatch?.invoiceUrl),
    eway: getFullUrl(currentOrder.ewayBillUrl || latestBatch?.ewayBillUrl),
    transport: getFullUrl(currentOrder.transportBillUrl || latestBatch?.transportBillUrl || ""),
    receiving: getFullUrl(currentOrder.receivingNoteUrl || latestBatch?.receivingNoteUrl),
  };

  const getAssortment = (variant: any) => {
    const quantities = variant?.sizeQuantities;
    if (!quantities || Object.keys(quantities).length === 0) return 'N/A';
    
    // Sort sizes for consistent display
    const sortedSizes = Object.keys(quantities).sort((a, b) => {
      const numA = parseInt(a);
      const numB = parseInt(b);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return a.localeCompare(b);
    });

    return sortedSizes.map(size => `${size}:${quantities[size]}`).join(', ');
  };



  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
      {/* Header - Compact */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white px-5 py-4 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-50 text-slate-500 hover:bg-slate-900 hover:text-white transition-all active:scale-95"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">Order #{currentOrder.orderNumber || currentOrder.id.slice(-6).toUpperCase()}</h2>
              <StatusBadge status={currentOrder.status} />
            </div>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5">
              <Calendar size={12} /> {currentOrder.date}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {!editMode && (
            <>
              {canEdit && (
                <button
                  onClick={startEdit}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 font-bold text-xs hover:bg-indigo-100 transition-all"
                >
                  <Pencil size={13} /> Edit Order
                </button>
              )}
              {canCancel && (
                <button
                  onClick={() => setShowCancelConfirm(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-600 font-bold text-xs hover:bg-rose-100 transition-all"
                >
                  <Ban size={13} /> Cancel Order
                </button>
              )}
            </>
          )}
          {editMode && (
            <>
              <button
                onClick={handleSaveEdit}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 text-white font-bold text-xs hover:bg-indigo-700 disabled:opacity-60 transition-all"
              >
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                Save
              </button>
              <button
                onClick={cancelEdit}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50 transition-all"
              >
                <X size={13} /> Cancel
              </button>
            </>
          )}
          <button
            onClick={() => {
              toast.loading("Generating PDF...", { id: "print-pdf" });
              handlePrintOrderPDF().finally(() => toast.dismiss("print-pdf"));
            }}
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-1.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50 transition-all"
          >
            <Printer size={14} /> Print
          </button>
        </div>
      </div>

      {/* Cancel Order Confirmation Dialog */}
      {showCancelConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-80 max-w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-rose-50 flex items-center justify-center">
                <Ban size={20} className="text-rose-500" />
              </div>
              <div>
                <p className="font-black text-slate-900 text-sm">Cancel Order?</p>
                <p className="text-xs text-slate-500">Order cancel ho jaega aur list mein dikhega</p>
              </div>
            </div>
            <p className="text-xs text-slate-600 mb-5">
              Order <span className="font-bold">#{currentOrder.orderNumber || currentOrder.id.slice(-6).toUpperCase()}</span> cancel kar diya jaega. Yeh action undo nahi hogi.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowCancelConfirm(false)}
                disabled={cancelling}
                className="flex-1 px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50"
              >
                Back
              </button>
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="flex-1 px-4 py-2 rounded-xl bg-rose-500 text-white font-bold text-xs hover:bg-rose-600 disabled:opacity-60 flex items-center justify-center gap-1.5"
              >
                {cancelling ? <Loader2 size={12} className="animate-spin" /> : <Ban size={12} />}
                Cancel Order
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {/* Status Timeline - Compact */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="relative flex justify-between">
              {/* Progress Line */}
              <div className="absolute top-4 left-0 w-full h-0.5 bg-slate-100 z-0">
                <div 
                  className="h-full bg-indigo-500 transition-all duration-1000" 
                  style={{ width: `${(currentStatusIndex / (statusSteps.length - 1)) * 100}%` }}
                ></div>
              </div>

              {statusSteps.map((step, index) => {
                const isActive = index <= currentStatusIndex;
                const isCurrent = index === currentStatusIndex;

                return (
                  <div key={index} className="relative z-10 flex flex-col items-center">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-500 border-2 border-white shadow-sm ${
                      isActive ? `${step.activeColor} text-white` : 'bg-slate-200 text-slate-400'
                    } ${isCurrent ? 'ring-2 ring-indigo-100 scale-110' : ''}`}>
                      {isActive && index < currentStatusIndex ? <CheckCircle size={14} /> : step.icon}
                    </div>
                    <span className={`mt-2 text-[8px] font-bold uppercase tracking-wider ${
                      isActive ? (index === 3 && isPartiallyReceived ? 'text-amber-500' : 'text-indigo-600') : 'text-slate-400'
                    }`}>
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* ── BOOKED: expected dispatch date (distributor only) ── */}
            {isDistributor && currentOrder.status === OrderStatus.BOOKED && currentOrder.expectedDispatchDate && (
              <div className="mt-5 flex items-start gap-3 p-3.5 bg-indigo-50 border border-indigo-100 rounded-xl animate-in fade-in duration-300">
                <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
                  <Calendar size={15} className="text-indigo-600" />
                </div>
                <div>
                  <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">Expected Dispatch</p>
                  <p className="text-sm font-bold text-indigo-900 mt-0.5">
                    {new Date(currentOrder.expectedDispatchDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                  <p className="text-[10px] text-indigo-400 font-medium mt-0.5">Approximate date — we'll notify you when dispatched</p>
                </div>
              </div>
            )}

          </div>

          {/* New Documentation Links Section — Moved Up & Restyled */}
          {(docLinks.invoice || docLinks.eway || docLinks.transport || docLinks.receiving) && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4 animate-in fade-in zoom-in-95 duration-700 sticky top-4 z-20">
              {docLinks.invoice && (
                <button 
                  onClick={() => setPreviewDoc({ url: docLinks.invoice!, title: "Tax Invoice" })}
                  className="group bg-white p-4 rounded-2xl border-2 border-slate-100 hover:border-indigo-500 hover:shadow-xl hover:shadow-indigo-500/10 transition-all flex items-center gap-3 text-left"
                >
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center group-hover:bg-indigo-500 transition-colors">
                    <FileText size={20} className="text-indigo-600 group-hover:text-white" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Shipping</p>
                    <p className="text-sm font-bold text-slate-900 group-hover:text-indigo-600">Tax Invoice</p>
                  </div>
                </button>
              )}
              {docLinks.eway && (
                <button 
                  onClick={() => setPreviewDoc({ url: docLinks.eway!, title: "E-Way Bill" })}
                  className="group bg-white p-4 rounded-2xl border-2 border-slate-100 hover:border-emerald-500 hover:shadow-xl hover:shadow-emerald-500/10 transition-all flex items-center gap-3 text-left"
                >
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center group-hover:bg-emerald-500 transition-colors">
                    <Truck size={20} className="text-emerald-600 group-hover:text-white" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Transport</p>
                    <p className="text-sm font-bold text-slate-900 group-hover:text-emerald-600">E-Way Bill</p>
                  </div>
                </button>
              )}
              {docLinks.transport && (
                <button 
                  onClick={() => setPreviewDoc({ url: docLinks.transport!, title: "Transport Bill" })}
                  className="group bg-white p-4 rounded-2xl border-2 border-slate-100 hover:border-blue-500 hover:shadow-xl hover:shadow-blue-500/10 transition-all flex items-center gap-3 text-left"
                >
                  <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center group-hover:bg-blue-500 transition-colors">
                    <Truck size={20} className="text-blue-600 group-hover:text-white" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Logistics</p>
                    <p className="text-sm font-bold text-slate-900 group-hover:text-blue-600">Transport Bill</p>
                  </div>
                </button>
              )}
              {docLinks.receiving && (
                <button 
                  onClick={() => setPreviewDoc({ url: docLinks.receiving!, title: "Receiving Note" })}
                  className="group bg-slate-900 p-4 rounded-2xl border-2 border-slate-800 hover:border-emerald-400 hover:shadow-xl hover:shadow-emerald-400/10 transition-all flex items-center gap-3 text-left"
                >
                  <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center group-hover:bg-emerald-400 transition-colors">
                    <ShieldCheck size={20} className="text-emerald-400 group-hover:text-slate-900" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">Confirmation</p>
                    <p className="text-sm font-bold text-white">Receiving Note</p>
                  </div>
                </button>
              )}

              {/* Receiver Details — Dedicated Card in the same row */}
              {(currentOrder.receiverName || currentOrder.receiverMobile) && (
                <div className="bg-white p-4 rounded-2xl border-2 border-slate-100 hover:border-indigo-500 transition-all flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                    <UserIcon size={20} className="text-indigo-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Receiver Info</p>
                    <p className="text-sm font-bold text-slate-900 truncate leading-tight mb-0.5">{currentOrder.receiverName || 'Unknown'}</p>
                    {currentOrder.receiverMobile && (
                      <div className="flex items-center gap-1">
                        <Phone size={10} className="text-slate-400" />
                        <span className="text-[10px] font-bold text-slate-500">{currentOrder.receiverMobile}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Shipping Details — compact horizontal card above table */}
          {(() => {
            const d = typeof currentOrder.distributorId === 'object' ? currentOrder.distributorId : null;
            const profile = d?.distributorId;
            const addr = profile?.shippingAddress;
            const email = profile?.email || d?.email || 'N/A';
            const phone = profile?.phone || 'N/A';
            return (
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center gap-4">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                  <MapPin size={18} className="text-indigo-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] leading-none mb-0.5">Destination · Shipping Details</p>
                  <p className="font-black text-sm text-slate-900 leading-tight truncate">{profile?.companyName || currentOrder.distributorName}</p>
                  {addr?.address1 ? (
                    <p className="text-[10px] text-slate-500 font-medium mt-0.5 truncate">
                      {addr.address1}{addr.address2 ? `, ${addr.address2}` : ''}, {addr.city}, {addr.state} — {addr.pinCode}
                    </p>
                  ) : (
                    <p className="text-[10px] text-slate-400 italic mt-0.5">Address not available</p>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 rounded-xl border border-slate-100">
                    <Phone size={11} className="text-indigo-500" />
                    <p className="text-[11px] font-bold text-slate-700">{phone}</p>
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 rounded-xl border border-slate-100 max-w-[180px]">
                    <Mail size={11} className="text-blue-500 shrink-0" />
                    <p className="text-[11px] font-bold text-slate-700 truncate">{email}</p>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Main Content — full width */}
          <div className="space-y-6">
              {/* Tabs Navigation */}
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-2xl w-fit">
                <button
                  onClick={() => setActiveTab('items')}
                  className={`px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 ${
                    activeTab === 'items' 
                      ? 'bg-white text-indigo-600 shadow-sm' 
                      : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  <Package size={14} />
                  Order Items
                  <span className={`px-1.5 py-0.5 rounded-md text-[8px] ${
                     activeTab === 'items' ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-200 text-slate-500'
                  }`}>
                    {currentOrder.items.length}
                  </span>
                </button>
                <button
                  onClick={() => setActiveTab('history')}
                  className={`px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 ${
                    activeTab === 'history' 
                      ? 'bg-white text-indigo-600 shadow-sm' 
                      : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  <History size={14} />
                  Delivery History
                  <span className={`px-1.5 py-0.5 rounded-md text-[8px] ${
                     activeTab === 'history' ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-200 text-slate-500'
                  }`}>
                    {currentOrder.fulfillmentHistory?.length || 0}
                  </span>
                </button>
              </div>

              <div className="transition-all duration-500 min-h-[400px]">
{activeTab === 'items' ? (
              <div className="animate-in fade-in slide-in-from-left-4 duration-500 space-y-6">
                


                {/* Items Detail - Sleek Rows */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <button
                    onClick={() => setBreakdownOpen(p => !p)}
                    className="w-full px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between gap-4 text-left hover:bg-slate-50 transition-colors"
                  >
                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-widest flex items-center gap-2">
                      <Package size={14} className="text-indigo-600" />
                      Order Breakdown
                    </h3>
                    <ChevronRight size={14} className={`text-slate-400 transition-transform duration-200 ${breakdownOpen ? 'rotate-90' : ''}`} />
                  </button>

                  {breakdownOpen && <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        {isDistributor ? (
                          <tr className="border-b border-slate-100 bg-slate-50/30">
                            <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Image</th>
                            <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Article / Variant · MRP/Ctn</th>
                            <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Ordered (Ctn)</th>
                            <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Dispatched (Ctn)</th>
                            <th className="px-6 py-3 text-[10px] font-black text-rose-500 uppercase tracking-widest text-center">Returned (Ctn)</th>
                            <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Remaining (Ctn)</th>
                          </tr>
                        ) : (
                          <tr className="border-b border-slate-100 bg-slate-50/30">
                            <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Image</th>
                            <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Article / Variant · MRP/Ctn</th>
                            <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Ordered (Ctn)</th>
                            <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Dispatched (Ctn)</th>
                            <th className="px-4 py-3 text-[10px] font-black text-rose-500 uppercase tracking-widest text-center">Returned (Ctn)</th>
                            <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Remaining (Ctn)</th>
                          </tr>
                        )}
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {currentOrder.items.map((item, idx) => {
                          const article = articles.find(a => a.id === item.articleId);
                          const variant = article?.variants?.find(v => v.id === item.variantId);
                          
                          if (isDistributor) {
                            const itemKey = item.variantId || item.articleId;
                            const isItemDeleted = deletedItems.has(itemKey);
                            return (
                              <tr key={idx} className={`group hover:bg-slate-50/50 transition-all ${isItemDeleted && editMode ? 'opacity-40 bg-rose-50/50' : ''}`}>
                                <td className="px-6 py-4">
                                  <div className="w-12 h-12 rounded-lg overflow-hidden border border-slate-100 bg-slate-50 flex items-center justify-center">
                                    {(() => {
                                      const colorMedia = article?.colorMedia || [];
                                      const matched = colorMedia.find(cm => cm.color.toLowerCase() === variant?.color?.toLowerCase());
                                      const vImg = (matched && matched.images && matched.images.length > 0)
                                        ? matched.images[0].url
                                        : (variant?.images && variant?.images.length > 0 ? variant?.images[0] : article?.imageUrl);

                                      return vImg ? (
                                        <img src={getImageUrl(vImg)} alt={variant?.color || article?.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                                      ) : (
                                        <ImageIcon size={20} className="text-slate-200" />
                                      );
                                    })()}
                                  </div>
                                </td>
                                <td className="px-6 py-4">
                                  <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <p className={`font-bold text-sm leading-tight ${isItemDeleted && editMode ? 'line-through text-slate-400' : 'text-slate-900'}`}>{article?.name}</p>
                                      <span className="px-1.5 py-0.5 rounded bg-slate-100 text-[8px] font-black text-slate-500 uppercase tracking-tighter">{variant?.color || 'N/A'}</span>
                                      <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-tighter border ${
                                        item.bookingType === 'PREORDER'
                                          ? 'bg-amber-50 text-amber-600 border-amber-200'
                                          : 'bg-emerald-50 text-emerald-600 border-emerald-200'
                                      }`}>
                                        {item.bookingType === 'PREORDER' ? 'Pre-Order' : 'RFD'}
                                      </span>
                                      {editMode && (
                                        <button
                                          onClick={() => toggleDeleteItem(itemKey)}
                                          title={isItemDeleted ? 'Undo delete' : 'Delete this item'}
                                          className={`w-5 h-5 rounded flex items-center justify-center transition-all ${isItemDeleted ? 'bg-rose-500 text-white' : 'text-rose-400 hover:bg-rose-50'}`}
                                        ><Trash2 size={9} /></button>
                                      )}
                                    </div>
                                    <p className="text-[10px] text-indigo-500 font-black uppercase tracking-wider">{getAssortment(variant)}</p>
                                    {article?.mrp ? (
                                      <p className="text-[10px] font-black text-amber-600">
                                        MRP ₹{(article.mrp * (item.pairCount / (item.cartonCount || 1))).toLocaleString()}/ctn
                                      </p>
                                    ) : null}
                                  </div>
                                </td>
                                <td className="px-6 py-4 text-center">
                                  {editMode ? (
                                    isItemDeleted ? (
                                      <span className="text-[10px] font-black text-rose-400 uppercase tracking-widest">Removed</span>
                                    ) : (
                                      <div className="flex items-center justify-center gap-1.5">
                                        <button
                                          onClick={() => {
                                            setEditCounts(p => ({ ...p, [itemKey]: Math.max(0, (p[itemKey] ?? item.cartonCount) - 1) }));
                                          }}
                                          className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-rose-100 text-slate-500 hover:text-rose-600 flex items-center justify-center transition-all"
                                        ><Minus size={10} /></button>
                                        <span className="text-sm font-black text-slate-900 w-6 text-center">
                                          {editCounts[itemKey] ?? item.cartonCount}
                                        </span>
                                        <button
                                          onClick={() => {
                                            setEditCounts(p => ({ ...p, [itemKey]: (p[itemKey] ?? item.cartonCount) + 1 }));
                                          }}
                                          className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-indigo-100 text-slate-500 hover:text-indigo-600 flex items-center justify-center transition-all"
                                        ><Plus size={10} /></button>
                                      </div>
                                    )
                                  ) : (
                                    <>
                                      <p className="text-sm font-black text-slate-900 leading-none">{item.cartonCount}</p>
                                      <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-1">{item.pairCount} Pairs</p>
                                    </>
                                  )}
                                </td>
                                <td className="px-6 py-4 text-center">
                                  <p className="text-sm font-black text-emerald-600 leading-none">{item.fulfilledCartonCount || 0}</p>
                                </td>
                                <td className="px-6 py-4 text-center">
                                  <p className="text-sm font-black text-rose-600 leading-none">{item.returnedCartonCount || 0}</p>
                                </td>
                                <td className="px-6 py-4 text-center">
                                  <p className="text-sm font-black text-slate-400 leading-none">{Math.max(0, item.cartonCount - (item.fulfilledCartonCount || 0))}</p>
                                </td>
                              </tr>
                            );
                          }

                          // Admin view (Refined)
                          const adminItemKey = item.variantId || item.articleId;
                          const isAdminItemDeleted = deletedItems.has(adminItemKey);
                          return (
                            <tr key={idx} className={`group hover:bg-slate-50/50 transition-all ${isAdminItemDeleted && editMode ? 'opacity-40 bg-rose-50/50' : ''}`}>
                              <td className="px-6 py-4">
                                <div className="w-12 h-12 rounded-lg overflow-hidden border border-slate-100 bg-slate-50 flex items-center justify-center">
                                  {(() => {
                                    const colorMedia = article?.colorMedia || [];
                                    const matched = colorMedia.find(cm => cm.color.toLowerCase() === variant?.color?.toLowerCase());
                                    const vImg = (matched && matched.images && matched.images.length > 0)
                                      ? matched.images[0].url
                                      : (variant?.images && variant?.images.length > 0 ? variant?.images[0] : article?.imageUrl);

                                    return vImg ? (
                                      <img src={getImageUrl(vImg)} alt={variant?.color || article?.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                                    ) : (
                                      <ImageIcon size={20} className="text-slate-200" />
                                    );
                                  })()}
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex flex-col gap-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className={`font-bold text-sm leading-tight ${isAdminItemDeleted && editMode ? 'line-through text-slate-400' : 'text-slate-900'}`}>{article?.name}</p>
                                    <span className="px-1.5 py-0.5 rounded bg-slate-100 text-[8px] font-black text-slate-500 uppercase tracking-tighter">{variant?.color || 'N/A'}</span>
                                    <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-tighter border ${
                                      item.bookingType === 'PREORDER'
                                        ? 'bg-amber-50 text-amber-600 border-amber-200'
                                        : 'bg-emerald-50 text-emerald-600 border-emerald-200'
                                    }`}>
                                      {item.bookingType === 'PREORDER' ? 'Pre-Order' : 'RFD'}
                                    </span>
                                    {editMode && (
                                      <button
                                        onClick={() => toggleDeleteItem(adminItemKey)}
                                        title={isAdminItemDeleted ? 'Undo delete' : 'Delete this item'}
                                        className={`w-5 h-5 rounded flex items-center justify-center transition-all ${isAdminItemDeleted ? 'bg-rose-500 text-white' : 'text-rose-400 hover:bg-rose-50'}`}
                                      ><Trash2 size={9} /></button>
                                    )}
                                  </div>
                                  <p className="text-[10px] text-indigo-500 font-black uppercase tracking-wider">{getAssortment(variant)}</p>
                                  {article?.mrp ? (
                                    <p className="text-[10px] font-black text-amber-600">
                                      MRP ₹{(article.mrp * (item.pairCount / (item.cartonCount || 1))).toLocaleString()}/ctn
                                    </p>
                                  ) : null}
                                </div>
                              </td>
                              <td className="px-4 py-4 text-center">
                                {editMode ? (
                                  isAdminItemDeleted ? (
                                    <span className="text-[10px] font-black text-rose-400 uppercase tracking-widest">Removed</span>
                                  ) : (
                                    <div className="flex items-center justify-center gap-1.5">
                                      <button
                                        onClick={() => {
                                          setEditCounts(p => ({ ...p, [adminItemKey]: Math.max(0, (p[adminItemKey] ?? item.cartonCount) - 1) }));
                                        }}
                                        className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-rose-100 text-slate-500 hover:text-rose-600 flex items-center justify-center transition-all"
                                      ><Minus size={10} /></button>
                                      <span className="text-sm font-black text-slate-900 w-6 text-center">
                                        {editCounts[adminItemKey] ?? item.cartonCount}
                                      </span>
                                      <button
                                        onClick={() => {
                                          setEditCounts(p => ({ ...p, [adminItemKey]: (p[adminItemKey] ?? item.cartonCount) + 1 }));
                                        }}
                                        className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-indigo-100 text-slate-500 hover:text-indigo-600 flex items-center justify-center transition-all"
                                      ><Plus size={10} /></button>
                                    </div>
                                  )
                                ) : (
                                  <p className="text-sm font-black text-slate-900 leading-none">{item.cartonCount}</p>
                                )}
                              </td>
                              <td className="px-4 py-4 text-center">
                                <p className="text-sm font-black text-emerald-600 leading-none">{item.fulfilledCartonCount || 0}</p>
                              </td>
                              <td className="px-4 py-4 text-center">
                                <p className="text-sm font-black text-rose-600 leading-none">{item.returnedCartonCount || 0}</p>
                              </td>
                              <td className="px-4 py-4 text-center">
                                <p className="text-sm font-black text-slate-400 leading-none">{Math.max(0, item.cartonCount - (item.fulfilledCartonCount || 0))}</p>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>}

                  {(() => {
                    if (isDistributor || !['BOOKED', 'PARTIAL', 'PFD', 'RFD'].includes(currentOrder.status)) return null;

                    const tabs: { key: 'scan' | 'transport' | 'receive'; label: string; count: number }[] = [
                      { key: 'scan',      label: 'Scan Cartons',      count: totalRemainingToScan },
                      { key: 'transport', label: 'Transport Details', count: dispatchedCartons.length },
                      { key: 'receive',   label: 'Confirm Receipt',   count: inTransitCartons.length },
                    ];

                    const dispatchedByItem = new Map<string, typeof dispatchedCartons>();
                    dispatchedCartons.forEach(c => {
                      if (!dispatchedByItem.has(c.itemKey)) dispatchedByItem.set(c.itemKey, []);
                      dispatchedByItem.get(c.itemKey)!.push(c);
                    });
                    const inTransitByItem = new Map<string, typeof inTransitCartons>();
                    inTransitCartons.forEach(c => {
                      if (!inTransitByItem.has(c.itemKey)) inTransitByItem.set(c.itemKey, []);
                      inTransitByItem.get(c.itemKey)!.push(c);
                    });

                    return (
                      <div className="p-6 bg-slate-50/50 border-t border-slate-100 space-y-5">

                        {/* Dispatch tabs — all three usable any time, independently.
                            No batch grouping: every scanned carton sits in one of
                            three live pools, and Transport/Receive act on
                            whatever subset the user checks off each time. */}
                        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-4">
                          {tabs.map(t => (
                            <button
                              key={t.key}
                              onClick={() => setDispatchTab(t.key)}
                              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                                dispatchTab === t.key
                                  ? 'bg-indigo-600 text-white shadow-sm'
                                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                              }`}
                            >
                              {t.label}
                              {t.count > 0 && (
                                <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-black ${
                                  dispatchTab === t.key ? 'bg-white/20' : 'bg-indigo-100 text-indigo-700'
                                }`}>
                                  {t.count}
                                </span>
                              )}
                            </button>
                          ))}
                        </div>

                        {/* ── Scan tab ── */}
                        {dispatchTab === 'scan' && (
                          <div className="space-y-5">
                            {totalRemainingToScan > 0 ? (
                              <>
                                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                                  <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-100">
                                    <div className="flex items-center gap-2">
                                      <Barcode size={14} className="text-indigo-500" />
                                      <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest">CTN Out-Scan</p>
                                    </div>
                                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                                      {totalRemainingToScan} remaining
                                    </span>
                                  </div>
                                  <div className="p-4 space-y-3">
                                    <div className="flex gap-2">
                                      <div className="relative flex-1">
                                        <Barcode size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                        <input
                                          type="text"
                                          value={ctnScanInput}
                                          onChange={e => setCtnScanInput(e.target.value.toUpperCase())}
                                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCTNScan(ctnScanInput); }}}
                                          placeholder="Scan carton barcode → Enter"
                                          disabled={scanSyncing}
                                          className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-500 text-xs font-mono font-bold disabled:opacity-50"
                                          autoComplete="off"
                                        />
                                      </div>
                                      <button onClick={() => handleCTNScan(ctnScanInput)} disabled={scanSyncing} className="px-3 py-2 bg-indigo-600 text-white rounded-xl text-[10px] font-black hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center gap-1.5">
                                        {scanSyncing && <Loader2 size={11} className="animate-spin" />} Scan
                                      </button>
                                    </div>
                                    <p className="text-[10px] text-slate-400">Scanned cartons appear below immediately and are ready for Transport right away.</p>
                                  </div>
                                </div>

                                {/* Pre-allocated carton codes for this order */}
                                {currentOrder.items.some(item => (item.allocatedCartons || []).length > 0) && (
                                  <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4">
                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Stock Cartons — Scan These</p>
                                    <div className="space-y-2">
                                      {currentOrder.items.map(item => {
                                        const scanned = new Set((currentOrder.cartonTracking || []).map((c: any) => c.code));
                                        const codes = (item.allocatedCartons || []).filter((c: string) => !scanned.has(c));
                                        if (codes.length === 0) return null;
                                        return (
                                          <div key={item.variantId || item.articleId}>
                                            <p className="text-[10px] font-bold text-slate-400 mb-1">{getItemLabel(item.variantId || item.articleId || '')}</p>
                                            <div className="flex flex-wrap gap-1">
                                              {codes.map(code => (
                                                <span
                                                  key={code}
                                                  className="text-[10px] font-mono font-bold bg-white border border-indigo-200 text-indigo-700 rounded-lg px-2 py-1"
                                                >
                                                  {code}
                                                </span>
                                              ))}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}

                                <div className="flex gap-2">
                                  <button onClick={handleDownloadPI} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg font-bold text-[10px] uppercase hover:bg-slate-50 transition-all shadow-sm"><FileText size={12} className="text-indigo-600" /> PI PDF</button>
                                  <button onClick={handleDownloadExcelPI} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg font-bold text-[10px] uppercase hover:bg-slate-50 transition-all shadow-sm"><Download size={12} className="text-green-600" /> PI Excel</button>
                                </div>
                              </>
                            ) : (
                              <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-100 rounded-xl">
                                <CheckCircle size={16} className="text-emerald-500 shrink-0" />
                                <p className="text-sm font-bold text-emerald-700">All cartons scanned.</p>
                              </div>
                            )}

                            {/* Pre-order items on this same order that still owe MORE than
                                what's currently reserved — fully-arrived cartons for these
                                items are already scannable above; this shows what's still
                                pending on a future GRN. RFD items above are unaffected. */}
                            {awaitingStockItems.length > 0 && (
                              <div className="bg-amber-50/60 rounded-2xl border border-amber-200 border-dashed p-4">
                                <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                                  <Clock size={12} /> Awaiting Stock — Pre-Order ({awaitingStockItems.length})
                                </p>
                                <div className="space-y-1.5">
                                  {awaitingStockItems.map((item, idx) => {
                                    const key = item.variantId || item.articleId;
                                    // Reservation progress: pairs already claimed out of
                                    // arrived GRN stock vs. total pairs this item needs —
                                    // a partial GRN shows partial progress here instead of
                                    // silently disappearing until fully covered.
                                    const needed = Object.values(item.sizeQuantities || {}).reduce(
                                      (s, q) => s + (Number(q) || 0), 0
                                    );
                                    const reserved = Object.values(item.preorderReservedSizeQuantities || {}).reduce(
                                      (s, q) => s + (Number(q) || 0), 0
                                    );
                                    const scannableNow = Math.max(
                                      0,
                                      computeReservedCartons(item) - (item.fulfilledCartonCount || 0)
                                    );
                                    return (
                                      <div key={idx} className="flex items-center justify-between text-[11px]">
                                        <span className="font-bold text-amber-800">{getItemLabel(key)}</span>
                                        <span className="text-amber-600 font-mono">
                                          {reserved > 0 ? `${reserved}/${needed} prs` : `${item.cartonCount} ctn owed`}
                                          {scannableNow > 0 && (
                                            <span className="text-emerald-600"> · {scannableNow} ctn ready</span>
                                          )}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                                <p className="text-[10px] text-amber-600/80 mt-2 italic">
                                  Whatever's arrived is scannable now (above) — the rest becomes scannable as its next GRN lands.
                                </p>
                              </div>
                            )}

                            {dispatchedCartons.length > 0 && (
                              <div className="bg-white rounded-2xl border border-slate-200 p-4">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                                  Dispatched — awaiting transport ({dispatchedCartons.length})
                                </p>
                                {[...dispatchedByItem.entries()].map(([itemKey, cartons]) => (
                                  <div key={itemKey} className="mb-2 last:mb-0">
                                    <p className="text-[10px] font-bold text-slate-500 mb-1">{getItemLabel(itemKey)}</p>
                                    <div className="flex flex-wrap gap-1.5">
                                      {cartons.map(c => (
                                        <span key={c.code} className="px-2 py-1 rounded-lg text-[9px] font-black font-mono border bg-amber-50 text-amber-700 border-amber-200">{c.code}</span>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* ── Transport tab ── */}
                        {dispatchTab === 'transport' && (
                          <div className="space-y-5">
                            {dispatchedCartons.length === 0 ? (
                              <div className="text-center py-8 text-slate-400 text-xs font-medium bg-white rounded-2xl border border-dashed border-slate-200">
                                Nothing dispatched yet — scan cartons in the Scan tab first.
                              </div>
                            ) : (
                              <>
                                <div className="bg-white rounded-2xl border border-slate-200 p-4">
                                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                                    Select cartons to send ({selectedTransitCodes.size}/{dispatchedCartons.length})
                                  </p>
                                  {[...dispatchedByItem.entries()].map(([itemKey, cartons]) => (
                                    <div key={itemKey} className="mb-3 last:mb-0">
                                      <p className="text-[10px] font-bold text-slate-500 mb-1">{getItemLabel(itemKey)}</p>
                                      <div className="flex flex-wrap gap-1.5">
                                        {cartons.map(c => {
                                          const checked = selectedTransitCodes.has(c.code);
                                          return (
                                            <button
                                              key={c.code}
                                              onClick={() => setSelectedTransitCodes(prev => {
                                                const next = new Set(prev);
                                                if (next.has(c.code)) next.delete(c.code); else next.add(c.code);
                                                return next;
                                              })}
                                              className={`px-2 py-1 rounded-lg text-[9px] font-black font-mono border transition-all ${
                                                checked ? 'bg-teal-500 text-white border-teal-500' : 'bg-slate-50 text-slate-500 border-slate-200'
                                              }`}
                                            >
                                              {checked ? '✓ ' : ''}{c.code}
                                            </button>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  ))}
                                </div>

                                {renderTransportForm()}

                                <div className="flex flex-wrap items-center justify-between gap-3">
                                  <div className="flex gap-2 items-center flex-wrap">
                                    <button onClick={handleDownloadPI} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg font-bold text-[10px] uppercase hover:bg-slate-50 transition-all shadow-sm"><FileText size={12} className="text-indigo-600" /> PI PDF</button>
                                    <button onClick={handleDownloadExcelPI} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg font-bold text-[10px] uppercase hover:bg-slate-50 transition-all shadow-sm"><Download size={12} className="text-green-600" /> PI Excel</button>
                                  </div>
                                  <button
                                    disabled={uploading || selectedTransitCodes.size === 0 || !dispatchForm.vehicleNo.trim() || !dispatchForm.transporterName.trim()}
                                    onClick={handleSubmitTransit}
                                    className="flex items-center gap-2 px-5 py-2.5 bg-teal-600 text-white rounded-xl font-bold text-xs hover:bg-teal-700 transition-all shadow-md active:scale-95 disabled:opacity-50"
                                  >
                                    {uploading ? <Loader2 size={14} className="animate-spin" /> : <Truck size={14} />}
                                    Send {selectedTransitCodes.size} Carton{selectedTransitCodes.size !== 1 ? 's' : ''} to Transit
                                  </button>
                                </div>
                              </>
                            )}

                            {currentOrder.transitShipments && currentOrder.transitShipments.length > 0 && (
                              <div className="bg-white rounded-2xl border border-slate-200 p-4">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Shipment History</p>
                                <div className="space-y-2">
                                  {currentOrder.transitShipments.map((s, i) => (
                                    <div key={s.id || i} className="flex items-center justify-between text-[10px] bg-slate-50 rounded-lg px-3 py-2">
                                      <span className="font-bold text-slate-700">{s.cartonCodes.length} CTN via {s.vehicleNo || '—'} ({s.transporterName || '—'})</span>
                                      <span className="text-slate-400">{s.createdAt ? new Date(s.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* ── Receive tab ── */}
                        {dispatchTab === 'receive' && (
                          <div className="space-y-5">
                            {inTransitCartons.length === 0 ? (
                              <div className="text-center py-8 text-slate-400 text-xs font-medium bg-white rounded-2xl border border-dashed border-slate-200">
                                Nothing In Transit yet.
                              </div>
                            ) : (
                              <>
                                <div className="bg-white rounded-2xl border border-slate-200 p-4">
                                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                                    Select cartons received ({selectedReceiveCodes.size}/{inTransitCartons.length})
                                  </p>
                                  {[...inTransitByItem.entries()].map(([itemKey, cartons]) => (
                                    <div key={itemKey} className="mb-3 last:mb-0">
                                      <p className="text-[10px] font-bold text-slate-500 mb-1">{getItemLabel(itemKey)}</p>
                                      <div className="flex flex-wrap gap-1.5">
                                        {cartons.map(c => {
                                          const checked = selectedReceiveCodes.has(c.code);
                                          return (
                                            <button
                                              key={c.code}
                                              onClick={() => setSelectedReceiveCodes(prev => {
                                                const next = new Set(prev);
                                                if (next.has(c.code)) next.delete(c.code); else next.add(c.code);
                                                return next;
                                              })}
                                              className={`px-2 py-1 rounded-lg text-[9px] font-black font-mono border transition-all ${
                                                checked ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-slate-50 text-slate-500 border-slate-200'
                                              }`}
                                            >
                                              {checked ? '✓ ' : ''}{c.code}
                                            </button>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  ))}
                                </div>

                                <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
                                  <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest flex items-center gap-1.5"><UserIcon size={12} /> Receiver Details</p>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Receiver Name <span className="text-rose-400">*</span></label>
                                      <input type="text" value={receiverName} onChange={e => setReceiverName(e.target.value)} placeholder="e.g. Ramesh Kumar" className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-400/20 focus:border-indigo-400 text-xs font-medium" />
                                    </div>
                                    <div>
                                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Receiver Mobile <span className="text-rose-400">*</span></label>
                                      <input type="tel" value={receiverMobile} onChange={e => setReceiverMobile(e.target.value)} placeholder="e.g. 9876543210" className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-400/20 focus:border-indigo-400 text-xs font-medium" />
                                    </div>
                                  </div>
                                  <div>
                                    <input type="file" ref={receivingNoteInputRef} className="hidden" onChange={onReceivingNoteSelected} />
                                    <button onClick={() => receivingNoteInputRef.current?.click()} className={`w-full flex items-center gap-2 p-2.5 rounded-xl border-2 transition-all text-left ${receivingNote ? 'border-emerald-400 bg-emerald-50' : 'border-dashed border-slate-200 bg-slate-50 hover:bg-slate-100'}`}>
                                      {receivingNote ? <CheckCircle size={13} className="text-emerald-500 shrink-0" /> : <Upload size={13} className="text-slate-400 shrink-0" />}
                                      <div className="min-w-0">
                                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-wider">Receiving Note <span className="font-normal normal-case text-slate-300">(optional)</span></p>
                                        {receivingNote && <p className="text-[8px] text-emerald-600 truncate font-bold">{receivingNote.name}</p>}
                                      </div>
                                    </button>
                                  </div>
                                </div>

                                <div className="flex justify-end">
                                  <button
                                    disabled={uploading || selectedReceiveCodes.size === 0 || !receiverName.trim() || !receiverMobile.trim()}
                                    onClick={handleSubmitReceive}
                                    className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-xs hover:bg-emerald-700 transition-all shadow-md active:scale-95 disabled:opacity-50"
                                  >
                                    {uploading ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                                    Confirm Receipt for {selectedReceiveCodes.size} Carton{selectedReceiveCodes.size !== 1 ? 's' : ''}
                                  </button>
                                </div>
                              </>
                            )}

                            {currentOrder.fulfillmentHistory && currentOrder.fulfillmentHistory.length > 0 && (
                              <div className="bg-white rounded-2xl border border-slate-200 p-4">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Receipt History</p>
                                <div className="space-y-2">
                                  {currentOrder.fulfillmentHistory.map((b, i) => (
                                    <div key={b.id || i} className="flex items-center justify-between text-[10px] bg-slate-50 rounded-lg px-3 py-2">
                                      <span className="font-bold text-slate-700">{b.totalCartons} CTN received by {b.receiverName || '—'}</span>
                                      <span className="text-slate-400">{b.date ? new Date(b.date).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                      </div>
                    );
                  })()}
                </div>
              </div>
            ) : (
              <div className="animate-in fade-in slide-in-from-right-4 duration-500 space-y-6">
                {/* Fulfillment History Section */}
                {currentOrder.fulfillmentHistory && currentOrder.fulfillmentHistory.length > 0 ? (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                      <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                        <History size={14} className="text-indigo-600" />
                        Detailed Fulfillment Timeline
                      </h3>
                    </div>

                    <div className="p-6 space-y-8">
                      {currentOrder.fulfillmentHistory.slice().reverse().map((batch, bidx) => (
                        <div key={batch.id || bidx} className="relative pl-8 before:absolute before:left-[11px] before:top-2 before:bottom-[-32px] before:w-0.5 before:bg-slate-100 last:before:hidden">
                          {/* Timeline Node */}
                          <div className="absolute left-0 top-1.5 w-6 h-6 rounded-full bg-white border-2 border-indigo-500 flex items-center justify-center z-10 shadow-sm">
                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                          </div>

                          <div className="bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden hover:border-indigo-200 transition-all group">
                            {/* Batch Header */}
                            <div className="px-5 py-3 border-b border-slate-200 bg-white flex flex-col sm:flex-row justify-between gap-3">
                              <div className="flex items-center gap-4">
                                <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center font-black text-xs">
                                  #{batch.batchNumber || currentOrder.fulfillmentHistory!.length - bidx}
                                </div>
                                <div>
                                  <p className="text-xs font-bold text-slate-900">Delivery Batch Confirmation</p>
                                  <p className="text-[10px] font-medium text-slate-400 flex items-center gap-1 mt-0.5">
                                    <Calendar size={10} /> {new Date(batch.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })} at {new Date(batch.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                {batch.invoiceUrl && (
                                  <button onClick={() => setPreviewDoc({ url: getFullUrl(batch.invoiceUrl)!, title: "Tax Invoice" })} className="p-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-600 hover:text-white transition-all shadow-sm" title="View Invoice">
                                    <FileText size={14} />
                                  </button>
                                )}
                                {batch.ewayBillUrl && (
                                  <button onClick={() => setPreviewDoc({ url: getFullUrl(batch.ewayBillUrl)!, title: "E-Way Bill" })} className="p-2 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-600 hover:text-white transition-all shadow-sm" title="View E-Way Bill">
                                    <Truck size={14} />
                                  </button>
                                )}
                                {batch.transportBillUrl && (
                                  <button onClick={() => setPreviewDoc({ url: getFullUrl(batch.transportBillUrl)!, title: "Transport Bill" })} className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-600 hover:text-white transition-all shadow-sm" title="View Transport Bill">
                                    <Truck size={14} />
                                  </button>
                                )}
                                {batch.receivingNoteUrl && (
                                  <button onClick={() => setPreviewDoc({ url: getFullUrl(batch.receivingNoteUrl)!, title: "Receiving Note" })} className="p-2 bg-slate-900 text-emerald-400 rounded-lg hover:bg-emerald-400 hover:text-slate-900 transition-all shadow-sm" title="View Receiving Note">
                                    <ShieldCheck size={14} />
                                  </button>
                                )}
                                {batch.items.some(i => Number((i as any).returnedCartonCount || 0) > 0) && (
                                  <div className="px-3 py-1 bg-rose-50 text-rose-600 rounded-lg border border-rose-100 flex items-center gap-1.5 shadow-sm">
                                    <RotateCcw size={12} className="animate-spin-slow" />
                                    <span className="text-[10px] font-black uppercase tracking-tight">Return Linked to this Batch</span>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Batch Items Table */}
                            <div className="p-4">
                              <table className="w-full text-left">
                                <thead>
                                  <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200">
                                    <th className="pb-2">Article / Assortment</th>
                                    <th className="pb-2 text-center text-indigo-600">Batch Dispatch</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {batch.items.map((bItem, iIdx) => {
                                    let artName = "Unknown Article";
                                    let varColor = "N/A";
                                    let variant: any = null;

                                    articles.forEach(art => {
                                      const v = art.variants?.find(v => v.id === bItem.variantId.toString());
                                      if (v) {
                                        variant = v;
                                        artName = art.name;
                                        varColor = v.color;
                                      }
                                    });

                                    const hasReturn = Number(bItem.returnedCartonCount || 0) > 0;
                                    return (
                                      <tr key={iIdx} className={hasReturn ? 'bg-rose-50/30' : ''}>
                                        <td className="py-2.5">
                                          <div className="flex items-center gap-1.5 mb-0.5">
                                            <p className="text-[11px] font-bold text-slate-800">{artName}</p>
                                            <span className="px-1 py-0.5 rounded bg-slate-100 text-[7px] font-black text-slate-500 uppercase">{varColor}</span>
                                          </div>
                                          <p className="text-[9px] font-bold text-indigo-500 uppercase tracking-tight">
                                            {variant ? getAssortment(variant) : 'Assortment N/A'}
                                          </p>
                                        </td>
                                        <td className="py-2.5 text-center flex flex-col items-center gap-1">
                                          <span className="inline-flex px-2 py-0.5 rounded bg-indigo-50 text-indigo-600 text-[10px] font-black">{bItem.cartonCount} CTN</span>
                                          {bItem.returnedCartonCount && bItem.returnedCartonCount > 0 && (
                                            <span className="inline-flex px-2 py-1 rounded bg-rose-600 text-white text-[9px] font-black uppercase tracking-widest shadow-sm shadow-rose-200 mt-1">
                                              {bItem.returnedCartonCount} Returned
                                            </span>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                                <tfoot>
                                  <tr className="border-t-2 border-slate-200 border-dashed">
                                    <td className="pt-3 text-[10px] font-black text-slate-400 uppercase">Batch Total</td>
                                    <td className="pt-3 text-center">
                                      <p className="text-xs font-black text-slate-900">{batch.totalCartons} CTN</p>
                                      <p className="text-[8px] font-bold text-slate-400 uppercase">{batch.totalPairs} Pairs</p>
                                    </td>
                                    <td className="pt-3 text-right">
                                      <p className="text-xs font-black text-indigo-600">₹{batch.totalAmount.toLocaleString()}</p>
                                      {batch.items.some(i => (i as any).returnedCartonCount > 0) && (
                                        <p className="text-[9px] font-black text-rose-500 uppercase mt-1">
                                          {batch.items.reduce((sum, i) => sum + ((i as any).returnedCartonCount || 0), 0)} Returned
                                        </p>
                                      )}
                                    </td>
                                  </tr>
                                </tfoot>
                              </table>
                            </div>

                            {/* Receiver Footer */}
                            {batch.receiverName && (
                              <div className="px-5 py-2.5 bg-slate-100/50 border-t border-slate-200 flex justify-between items-center">
                                <div className="flex items-center gap-2">
                                  <div className="w-6 h-6 rounded-lg bg-white flex items-center justify-center border border-slate-200">
                                    <UserIcon size={12} className="text-indigo-500" />
                                  </div>
                                  <p className="text-[10px] font-bold text-slate-600 uppercase tracking-tight">Received By: <span className="text-slate-900">{batch.receiverName}</span></p>
                                </div>
                                {batch.receiverMobile && (
                                  <div className="flex items-center gap-1.5 text-slate-400">
                                    <Phone size={10} />
                                    <span className="text-[10px] font-bold">{batch.receiverMobile}</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="bg-white rounded-2xl border border-slate-200 p-12 flex flex-col items-center justify-center text-center">
                    <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4 text-slate-300">
                      <History size={32} />
                    </div>
                    <h3 className="text-lg font-bold text-slate-900">No Delivery History</h3>
                    <p className="text-sm text-slate-500 max-w-xs mt-2">Fulfillment batches will appear here as soon as orders are delivered and confirmed.</p>
                  </div>
                )}
              </div>
            )}
              </div>
            </div>

          {/* Payment Breakdown — bottom full-width */}
          {(() => {
            const subtotal   = currentOrder.totalAmount || 0;
            const discAmt    = currentOrder.discountAmount || 0;
            const taxable    = currentOrder.finalAmount ?? (subtotal - discAmt);
            const gstRate    = currentOrder.gstRate ?? 5;
            const gstAmt     = currentOrder.gstAmount ?? Math.round(taxable * gstRate / 100 * 100) / 100;
            const preRound   = taxable + gstAmt;
            // Round-off: nearest rupee; always within ±₹0.50 (GST rule)
            const roundOff   = Math.round(preRound) - preRound;
            const finalPayable = Math.round(preRound);

            const fulfilled = (currentOrder.status === OrderStatus.RECEIVED || currentOrder.status === OrderStatus.PARTIAL)
              ? currentOrder.items.reduce((acc, i) => acc + (i.fulfilledCartonCount || 0), 0)
              : 0;
            const pendingCtns = currentOrder.totalCartons - fulfilled;

            return (
              <div className="bg-slate-900 text-white rounded-3xl shadow-xl shadow-slate-200/20 overflow-hidden">
                <div className="px-7 py-4 border-b border-white/10 flex items-center gap-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Payment Breakdown</p>
                  <div className="flex items-center gap-1.5 ml-auto bg-white/5 px-3 py-1 rounded-xl">
                    <Package size={12} className="text-amber-400" />
                    <span className="text-xs font-black text-white">{currentOrder.totalCartons}</span>
                    <span className="text-[9px] text-slate-500 font-bold uppercase">Total Ctns</span>
                    {pendingCtns > 0 && (
                      <span className="ml-2 text-[9px] font-black text-amber-400 uppercase">{pendingCtns} Pending</span>
                    )}
                  </div>
                </div>

                <div className="px-7 py-5 flex flex-wrap items-end gap-6 lg:gap-10">
                  {/* Subtotal */}
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Order Subtotal</span>
                    <span className="text-lg font-bold text-slate-300">₹{subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>

                  {/* Discount */}
                  {discAmt > 0 && (
                    <>
                      <div className="text-slate-600 text-lg font-light">−</div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">
                          Discount{!isDistributor && currentOrder.discountPercentage ? ` (${currentOrder.discountPercentage}%)` : ''}
                        </span>
                        <span className="text-lg font-bold text-emerald-400">₹{discAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="text-slate-600 text-lg font-light">=</div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Taxable Amount</span>
                        <span className="text-lg font-bold text-slate-300">₹{taxable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      </div>
                    </>
                  )}

                  {/* GST */}
                  <div className="text-slate-600 text-lg font-light">+</div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest">GST @ {gstRate}%</span>
                    <span className="text-lg font-bold text-blue-400">₹{gstAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>

                  {/* Round Off — only show if non-zero */}
                  {Math.abs(roundOff) >= 0.01 && (
                    <>
                      <div className="text-slate-600 text-lg font-light">{roundOff > 0 ? '+' : '−'}</div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                          Round Off
                          <span className="ml-1 text-slate-600 normal-case font-medium">(±₹0.50 max)</span>
                        </span>
                        <span className="text-lg font-bold text-slate-400">
                          ₹{Math.abs(roundOff).toFixed(2)}
                        </span>
                      </div>
                    </>
                  )}

                  {/* Divider */}
                  <div className="hidden lg:block w-px h-12 bg-white/10 mx-2" />

                  {/* Final Payable */}
                  <div className="flex flex-col gap-0.5 ml-auto">
                    <span className="text-[9px] font-black text-indigo-300 uppercase tracking-widest">Final Payable</span>
                    <span className="text-4xl font-black text-indigo-400 tracking-tighter">
                      ₹{finalPayable.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>

                {!isDistributor && (
                  <div className="px-7 pb-4 flex items-center gap-2 opacity-50">
                    <Clock size={11} className="text-slate-500" />
                    <p className="text-[9px] text-slate-400 font-black uppercase tracking-[0.2em]">Order actions available at bottom of table</p>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      {/* Document Preview Dialog */}
      {previewDoc && (
        <DocPreviewDialog 
          open={!!previewDoc}
          url={previewDoc.url}
          title={previewDoc.title}
          onClose={() => setPreviewDoc(null)}
        />
      )}
    </div>
  );
};

const StatusBadge: React.FC<{ status: OrderStatus }> = ({ status }) => {
  const config = {
    [OrderStatus.BOOKED]: { color: 'bg-indigo-50 text-indigo-500 border-indigo-100' },
    [OrderStatus.PFD]: { color: 'bg-amber-50 text-amber-500 border-amber-100' },
    [OrderStatus.RFD]: { color: 'bg-blue-50 text-blue-500 border-blue-100' },
    [OrderStatus.RECEIVED]: { color: 'bg-emerald-50 text-emerald-600 border-emerald-100' },
    [OrderStatus.PARTIAL]: { color: 'bg-amber-50 text-amber-600 border-amber-100' },
    [OrderStatus.PENDING]: { color: 'bg-slate-50 text-slate-400 border-slate-100' },
  };

  const { color } = config[status] || { color: 'bg-gray-50 text-gray-500 border-gray-100' };
  return (
    <span className={`inline-flex px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider border ${color}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
};

export default OrderDetail;
