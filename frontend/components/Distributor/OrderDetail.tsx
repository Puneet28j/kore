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

const STATUS_LABELS: Record<string, string> = {
  [OrderStatus.PENDING]:   'Pending Confirmation',
  [OrderStatus.BOOKED]:    'Booked',
  [OrderStatus.PFD]:       'Dispatched',
  [OrderStatus.RFD]:       'In Transit',
  [OrderStatus.OFD]:       'Out for Delivery',
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

  // Allocation state for Admins — re-derive whenever currentOrder changes
  const [allocations, setAllocations] = useState<Record<string, any>>({});
  const [blockingState, setBlockingState] = useState<Record<string, any>>({});
  const [scannedItems, setScannedItems] = useState<Record<string, number>>({}); // variantId -> cartonCount verified
  const [scanInput, setScanInput] = useState("");

  // ── Dispatch state (BOOKED → PFD) ────────────────────────────────────────
  const [dispatchForm, setDispatchForm] = useState({
    vehicleNo: '', lrNo: '', transporterName: '',
    eWayBillNo: '', driverName: '', driverMobile: '', grossWeightKg: '',
  });
  const [ctnScanInput, setCtnScanInput] = useState('');
  const [scannedCTNs, setScannedCTNs] = useState<Set<string>>(new Set());
  const [previewDoc, setPreviewDoc] = useState<{ url: string; title: string } | null>(null);
  
  // Real-time stock state to align with VariantDetailsPage
  const [variantStockData, setVariantStockData] = useState<Record<string, { 
    liveStockMap: Record<string, number>, 
    blockedStockMap: Record<string, number> 
  }>>({});
  const [isLoadingStock, setIsLoadingStock] = useState(false);

  // Re-sync allocation state from order data (runs on mount + after save)
  React.useEffect(() => {
    const initialAlloc: Record<string, any> = {};
    const initialBlock: Record<string, any> = {};
    currentOrder.items.forEach(item => {
      if (item.variantId) {
        const remaining = item.cartonCount - (item.fulfilledCartonCount || 0);
        const defaultCartons = item.allocatedCartonCount || remaining;
        const ratio = item.cartonCount > 0 ? defaultCartons / item.cartonCount : 0;
        const defaultPairs = item.allocatedPairCount || Math.round(item.pairCount * ratio);
        const defaultSizeQtys = Object.keys(item.allocatedSizeQuantities || {}).length > 0
          ? { ...(item.allocatedSizeQuantities ?? {}) }
          : Object.fromEntries(Object.entries(item.sizeQuantities || {}).map(([s, q]) => [s, Math.round((q as number) * ratio)]));
        initialAlloc[item.variantId] = {
          variantId: item.variantId,
          allocatedCartonCount: defaultCartons,
          allocatedPairCount: defaultPairs,
          allocatedSizeQuantities: defaultSizeQtys,
        };
        initialBlock[item.variantId] = {
          variantId: item.variantId,
          blockedCartonCount: item.blockedCartonCount ?? 0,
          blockedPairCount: item.blockedPairCount ?? 0,
          blockedSizeQuantities: { ...(item.blockedSizeQuantities ?? {}) }
        };
      }
    });
    setAllocations(initialAlloc);
    setBlockingState(initialBlock);
  }, [currentOrder]);

  const fetchAllVariantStock = async () => {
    const variantIds = Array.from(new Set(currentOrder.items.map(item => item.variantId).filter(Boolean)));
    if (variantIds.length === 0) return;

    setIsLoadingStock(true);
    const stockMap: typeof variantStockData = {};
    
    try {
      await Promise.all(variantIds.map(async (vid) => {
        try {
          const url = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5005/api') + `/master-catalog/variants/${vid}/stock`;
          const res = await fetch(url);
          const json = await res.json();
          if (json.data) {
            stockMap[vid!] = {
              liveStockMap: json.data.liveStockMap || {},
              blockedStockMap: json.data.blockedStockMap || {}
            };
          }
        } catch (err) {
          console.error(`Failed to fetch stock for variant ${vid}`, err);
        }
      }));
      setVariantStockData(stockMap);
    } finally {
      setIsLoadingStock(false);
    }
  };

  React.useEffect(() => {
    fetchAllVariantStock();
  }, [currentOrder.id]);

  const handleCartonAllocationChange = (variantId: string, newCartonCount: number, item: OrderItem) => {
    const article = articles.find(a => a.id === item.articleId);
    const variant = article?.variants?.find(v => v.id === item.variantId);

    setAllocations(prev => {
      // Block is now optional — allocate up to remaining unfulfilled quantity
      const remaining = item.cartonCount - (item.fulfilledCartonCount || 0);
      const cartonCount = Math.max(0, Math.min(newCartonCount, remaining));
      
      const originalCartonCount = item.cartonCount;
      const originalPairCount = item.pairCount;
      const originalSizeQuantities = item.sizeQuantities || variant?.sizeQuantities || {};

      const ratio = originalCartonCount > 0 ? cartonCount / originalCartonCount : 0;
      
      const newPairCount = Math.round(originalPairCount * ratio);
      const newSizeQuantities: Record<string, number> = {};
      
      Object.entries(originalSizeQuantities).forEach(([size, qty]) => {
        newSizeQuantities[size] = Math.round(qty * ratio);
      });

      return {
        ...prev,
        [variantId]: {
          variantId,
          allocatedCartonCount: cartonCount,
          allocatedPairCount: newPairCount,
          allocatedSizeQuantities: newSizeQuantities
        }
      };
    });
  };

  const handleCartonBlockingChange = (variantId: string, newCartonCount: number, item: OrderItem) => {
    const article = articles.find(a => a.id === item.articleId);
    const variant = article?.variants?.find(v => v.id === item.variantId);

    // Calculate live limit
    const stockData = variantStockData[variantId];
    let maxLive = Infinity;
    if (stockData?.liveStockMap && variant?.sizeQuantities) {
      const possibleCartons = Object.entries(variant.sizeQuantities).map(([sz, count]) => {
        const reqPerCarton = Number(count) || 0;
        if (reqPerCarton <= 0) return Infinity;
        const cleanSz = sz.trim();
        const physical = Number(stockData.liveStockMap[cleanSz] ?? stockData.liveStockMap[sz]) || 0;
        const currentBlocked = Number(stockData.blockedStockMap[cleanSz] ?? stockData.blockedStockMap[sz]) || 0;
        const available = Math.max(0, physical - currentBlocked);
        // We can block what's already blocked in THIS order + what's available unblocked
        // But simpler: Physical - (TotalBlocked - ItemBlocked)
        return Math.floor(available / reqPerCarton);
      });
      const unblockedCartons = Math.min(...possibleCartons);
      maxLive = (item.blockedCartonCount || 0) + (unblockedCartons === Infinity ? 0 : unblockedCartons);
    }

    setBlockingState(prev => {
      // Blocking is limited by (ordered total - fulfilled) AND live available
      const remainingOrdered = item.cartonCount - (item.fulfilledCartonCount || 0);
      const limit = Math.min(remainingOrdered, maxLive);
      const cartonCount = Math.max(0, Math.min(newCartonCount, limit));
      
      const originalCartonCount = item.cartonCount;
      const originalPairCount = item.pairCount;
      const originalSizeQuantities = item.sizeQuantities || variant?.sizeQuantities || {};

      const ratio = originalCartonCount > 0 ? cartonCount / originalCartonCount : 0;
      
      const newPairCount = Math.round(originalPairCount * ratio);
      const newSizeQuantities: Record<string, number> = {};
      
      Object.entries(originalSizeQuantities).forEach(([size, qty]) => {
        newSizeQuantities[size] = Math.round(qty * ratio);
      });

      return {
        ...prev,
        [variantId]: {
          variantId,
          blockedCartonCount: cartonCount,
          blockedPairCount: newPairCount,
          blockedSizeQuantities: newSizeQuantities
        }
      };
    });
  };

  const handleUpdateBlockedStock = async () => {
    try {
      setUploading(true);
      const blockedItems = Object.values(blockingState);
      
      const updated = await distributorOrderService.updateOrderStatus(
        currentOrder.id, 
        currentOrder.status, 
        { blockedItems }
      );
      if (updated) {
        setCurrentOrder(updated);
        fetchAllVariantStock(); // Refresh live counts after blocking update
        toast.success("Blocked stock updated successfully!");
      }
    } catch (err: any) {
      console.error("Failed to update blocked stock", err);
      toast.error(err?.response?.data?.message || "Failed to update blocked stock");
    } finally {
      setUploading(false);
    }
  };

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
        // Use live allocations state for limit check to allow immediate verification after adjustments
        const allocated = allocations[item.variantId!]?.allocatedCartonCount ?? item.allocatedCartonCount ?? 0;
        const alreadyScanned = scannedItems[item.variantId!] || 0;
        
        if (alreadyScanned < allocated) {
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
      const allocated = allocations[item.variantId!]?.allocatedCartonCount ?? item.allocatedCartonCount ?? 0;
      const scanned = scannedItems[item.variantId!] || 0;
      return scanned >= allocated;
    });
  };

  const handleAllocateAndProceed = async () => {
    try {
      setUploading(true);
      const allocatedItems = Object.values(allocations);
      const targetStatus = [OrderStatus.BOOKED, OrderStatus.PARTIAL].includes(currentOrder.status)
        ? OrderStatus.PFD
        : currentOrder.status;

      const options: any = { allocatedItems };

      if (targetStatus === OrderStatus.PFD) {
        // Validate required dispatch fields
        if (!dispatchForm.vehicleNo.trim()) { toast.error('Vehicle No required'); setUploading(false); return; }
        if (!dispatchForm.transporterName.trim()) { toast.error('Transporter Name required'); setUploading(false); return; }
        if (!dispatchForm.lrNo.trim()) { toast.error('LR / Consignment No required'); setUploading(false); return; }

        // Validate CTN out-scan completion
        const expectedCTNs = generateExpectedCTNs();
        if (expectedCTNs.length > 0 && scannedCTNs.size < expectedCTNs.length) {
          toast.error(`CTN out-scan incomplete — ${scannedCTNs.size}/${expectedCTNs.length} cartons scanned`);
          setUploading(false);
          return;
        }

        options.vehicleNo       = dispatchForm.vehicleNo.trim();
        options.lrNo            = dispatchForm.lrNo.trim();
        options.transporterName = dispatchForm.transporterName.trim();
        if (dispatchForm.eWayBillNo.trim())   options.eWayBillNo   = dispatchForm.eWayBillNo.trim();
        if (dispatchForm.driverName.trim())   options.driverName   = dispatchForm.driverName.trim();
        if (dispatchForm.driverMobile.trim()) options.driverMobile = dispatchForm.driverMobile.trim();
        if (dispatchForm.grossWeightKg)       options.grossWeightKg = Number(dispatchForm.grossWeightKg);
        options.outScannedCartons = [...scannedCTNs];

        // Optional document uploads
        const files: Record<string, File> = {};
        if (shippingFiles.invoice)       files.invoice      = shippingFiles.invoice;
        if (shippingFiles.ewayBill)      files.ewayBill     = shippingFiles.ewayBill;
        if (shippingFiles.transportBill) files.transportBill = shippingFiles.transportBill;
        if (Object.keys(files).length)   options.files = files;
      }

      const updated = await distributorOrderService.updateOrderStatus(currentOrder.id, targetStatus, options);
      if (updated) {
        setCurrentOrder(updated);
        fetchAllVariantStock();
        toast.success('Order dispatched successfully!');
      }
    } catch (err: any) {
      console.error('Failed to dispatch order', err);
      toast.error(err?.response?.data?.message || 'Failed to update order');
    } finally {
      setUploading(false);
    }
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

  const generateExpectedCTNs = (): string[] => {
    const shortOrder = makeOrderShort();
    const all: string[] = [];
    Object.values(allocations).forEach((alloc: any) => {
      const ctn = alloc.allocatedCartonCount || alloc.cartonCount || 0;
      // Match allocation to order item by variantId for correct SKU lookup
      const item = currentOrder.items.find(i => i.variantId === alloc.variantId) || currentOrder.items[0];
      const code = getItemCode(item);
      for (let n = 1; n <= ctn; n++) all.push(`${shortOrder}-${code}-C${String(n).padStart(2, '0')}`);
    });
    return all;
  };

  const handleCTNScan = (raw: string) => {
    const barcode = raw.trim().toUpperCase();
    if (!barcode) return;
    const expected = generateExpectedCTNs();
    if (!expected.includes(barcode)) { toast.error(`Unknown CTN: ${barcode}`); setCtnScanInput(''); return; }
    if (scannedCTNs.has(barcode)) { toast.info(`${barcode} already scanned`); setCtnScanInput(''); return; }
    setScannedCTNs(prev => new Set([...prev, barcode]));
    setCtnScanInput('');
    toast.success(`CTN ${barcode} scanned ✓`);
  };

  // Delivery agent state for OFD step
  const [deliveryAgentName, setDeliveryAgentName]     = React.useState("");
  const [deliveryAgentMobile, setDeliveryAgentMobile] = React.useState("");
  const [deliveryNote, setDeliveryNote]               = React.useState("");

  const handleUpdateStatus = async (newStatus: OrderStatus) => {
    try {
      setUploading(true);

      let options: any = {};

      // DISPATCHED (PFD): must upload all 3 docs
      if (newStatus === OrderStatus.PFD) {
        if (!shippingFiles.invoice || !shippingFiles.ewayBill || !shippingFiles.transportBill) {
          toast.error("Please upload all 3 shipping documents before marking as Dispatched");
          setUploading(false);
          return;
        }
        options.files = {
          invoice: shippingFiles.invoice,
          ewayBill: shippingFiles.ewayBill,
          transportBill: shippingFiles.transportBill,
        };
      }

      // OUT FOR DELIVERY (OFD): optional delivery agent details
      if (newStatus === OrderStatus.OFD) {
        if (deliveryAgentName)   options.deliveryAgentName   = deliveryAgentName;
        if (deliveryAgentMobile) options.deliveryAgentMobile = deliveryAgentMobile;
        if (deliveryNote)        options.deliveryNote        = deliveryNote;
      }

      const updated = await distributorOrderService.updateOrderStatus(currentOrder.id, newStatus, options);
      if (updated) {
        setCurrentOrder(updated);
        toast.success(`Order marked as ${STATUS_LABELS[newStatus]}!`);
      }
    } catch (err: any) {
      console.error("Failed to update status", err);
      toast.error(err?.response?.data?.message || "Failed to update status");
    } finally {
      setUploading(false);
    }
  };

  const handleMarkAsReceived = async () => {
    if (!receivingNote || !receiverName || !receiverMobile) {
      toast.error("Please provide Receiving Note, Receiver Name, and Mobile Number");
      return;
    }
    try {
      setUploading(true);
      const updated = await distributorOrderService.markAsReceived(currentOrder.id, {
        receivingNote,
        receiverName,
        receiverMobile
      });
      if (updated) {
        setCurrentOrder(updated);
        setReceivingNote(null);
        setReceivingNotePreview(null);
        setReceiverName("");
        setReceiverMobile("");
        toast.success("Order marked as Received!");
      }
    } catch (err: any) {
      console.error("Failed to mark as received", err);
      toast.error(err?.response?.data?.message || "Failed to mark as received");
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
    const getBatchCartons = (item: any) => ['PFD', 'RFD', 'OFD'].includes(currentOrder.status) ? (item.allocatedCartonCount || 0) : item.cartonCount;
    const getBatchPairs = (item: any) => ['PFD', 'RFD', 'OFD'].includes(currentOrder.status) ? (item.allocatedPairCount || 0) : item.pairCount;

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
    const getBatchPairs = (item: any) => ['PFD', 'RFD', 'OFD'].includes(currentOrder.status) ? (item.allocatedPairCount || 0) : item.pairCount;
    const getBatchCartons = (item: any) => ['PFD', 'RFD', 'OFD'].includes(currentOrder.status) ? (item.allocatedCartonCount || 0) : item.cartonCount;
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

  const statusSteps = [
    { status: OrderStatus.PENDING,  label: 'Pending',          icon: <Clock size={16} /> },
    { status: OrderStatus.BOOKED,   label: 'Booked',           icon: <Package size={16} /> },
    { status: OrderStatus.PFD,      label: 'Dispatched',       icon: <Truck size={16} /> },
    { status: OrderStatus.RFD,      label: 'In Transit',       icon: <Truck size={16} /> },
    { status: OrderStatus.OFD,      label: 'Out for Delivery', icon: <Truck size={16} /> },
    { status: OrderStatus.RECEIVED, label: 'Delivered',        icon: <CheckCircle size={16} /> },
  ];

  const currentStatusIndex = statusSteps.findIndex(s => s.status === currentOrder.status);

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
          <button className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-1.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50 transition-all">
            <Printer size={14} /> Print
          </button>
          <button className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-1.5 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-slate-800 transition-all shadow-sm">
            <Download size={14} /> Invoice
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
                  <div key={step.status} className="relative z-10 flex flex-col items-center">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-500 border-2 border-white shadow-sm ${
                      isActive ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-400'
                    } ${isCurrent ? 'ring-2 ring-indigo-100 scale-110' : ''}`}>
                      {isActive && index < currentStatusIndex ? <CheckCircle size={14} /> : step.icon}
                    </div>
                    <span className={`mt-2 text-[8px] font-bold uppercase tracking-wider ${
                      isActive ? 'text-indigo-600' : 'text-slate-400'
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

            {/* ── OFD: delivery agent info (distributor only) ── */}
            {isDistributor && currentOrder.status === OrderStatus.OFD && (currentOrder.deliveryAgentName || currentOrder.deliveryNote) && (
              <div className="mt-5 flex items-start gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl animate-in fade-in duration-300">
                <div className="w-9 h-9 rounded-xl bg-emerald-500 flex items-center justify-center shrink-0">
                  <Truck size={16} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Your Order is Out for Delivery!</p>
                  {currentOrder.deliveryAgentName && (
                    <div className="mt-1.5 flex flex-wrap gap-3">
                      <div>
                        <p className="text-[9px] font-black text-emerald-500 uppercase tracking-wider">Delivery Agent</p>
                        <p className="text-sm font-bold text-slate-900">{currentOrder.deliveryAgentName}</p>
                      </div>
                      {currentOrder.deliveryAgentMobile && (
                        <div>
                          <p className="text-[9px] font-black text-emerald-500 uppercase tracking-wider">Mobile</p>
                          <a href={`tel:${currentOrder.deliveryAgentMobile}`}
                            className="text-sm font-bold text-emerald-700 hover:underline"
                            onClick={e => e.stopPropagation()}>
                            {currentOrder.deliveryAgentMobile}
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                  {currentOrder.deliveryNote && (
                    <p className="text-xs text-slate-600 font-medium mt-1.5 bg-white/60 px-2.5 py-1.5 rounded-lg border border-emerald-100">
                      {currentOrder.deliveryNote}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Mark as Received — only for distributors when status is OFD */}
            {isDistributor && currentOrder.status === OrderStatus.OFD && (
              <div className="mt-6 pt-4 border-t border-slate-100 space-y-4">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest text-center mb-1">Receipt Confirmation</p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <div className="relative group">
                      <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={16} />
                      <input 
                        type="text" 
                        placeholder="Receiver Full Name" 
                        value={receiverName}
                        onChange={(e) => setReceiverName(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 transition-all"
                      />
                    </div>
                    <div className="relative group">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={16} />
                      <input 
                        type="text" 
                        placeholder="Mobile Number" 
                        value={receiverMobile}
                        onChange={(e) => setReceiverMobile(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 transition-all"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <input type="file" ref={receivingNoteInputRef} className="hidden" onChange={onReceivingNoteSelected} />
                    <button 
                      onClick={() => receivingNoteInputRef.current?.click()}
                      className={`flex-1 flex flex-col items-center justify-center p-4 rounded-xl border-dashed border-2 transition-all gap-1 ${
                        receivingNote ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                      }`}
                    >
                      {receivingNote ? <ImageIcon size={24} className="text-indigo-500" /> : <Upload size={24} className="text-slate-400" />}
                      <span className="text-[10px] font-bold text-slate-600 uppercase">Receiving Note</span>
                    </button>
                    {receivingNote && <p className="text-[8px] text-indigo-600 font-bold truncate text-center px-2">{receivingNote.name}</p>}
                  </div>
                </div>

                <button
                  onClick={handleMarkAsReceived}
                  disabled={uploading || !receivingNote || !receiverName || !receiverMobile}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-slate-900 text-white rounded-xl font-bold text-sm hover:bg-slate-800 transition-all shadow-md disabled:opacity-50"
                >
                  {uploading ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                  Confirm Receipt
                </button>
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
                  <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-widest flex items-center gap-2">
                      <Package size={14} className="text-indigo-600" />
                      Order Breakdown
                    </h3>
                  </div>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        {isDistributor ? (
                          <tr className="border-b border-slate-100 bg-slate-50/30">
                            <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Image</th>
                            <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Article / Variant · MRP/Ctn</th>
                            <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Ordered (Ctn)</th>
                            <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Dispatched (Ctn)</th>
                            <th className="px-6 py-3 text-[10px] font-black text-rose-500 uppercase tracking-widest text-center">Returned (Ctn)</th>
                            <th className="px-6 py-3 text-[10px] font-black text-rose-500 uppercase tracking-widest text-center">Remaining (Ctn)</th>
                            <th className="px-6 py-3 text-[10px] font-black text-indigo-600 uppercase tracking-widest text-center">Allocation (Batch)</th>
                          </tr>
                        ) : (
                          <tr className="border-b border-slate-100 bg-slate-50/30">
                            <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Image</th>
                            <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Article / Variant · MRP/Ctn</th>
                            <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Ordered (Ctn)</th>
                            <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Dispatched (Ctn)</th>
                            <th className="px-4 py-3 text-[10px] font-black text-rose-500 uppercase tracking-widest text-center">Returned (Ctn)</th>
                            <th className="px-4 py-3 text-[10px] font-black text-rose-500 uppercase tracking-widest text-center">Remaining (Ctn)</th>
                            <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center bg-indigo-50/30">Live Stock (Ctn)</th>
                            <th className="px-4 py-3 text-[10px] font-black text-amber-600 uppercase tracking-widest text-center bg-amber-50/30">Block Stock <span className="normal-case font-medium text-amber-400">(opt)</span></th>
                            <th className="px-4 py-3 text-[10px] font-black text-indigo-600 uppercase tracking-widest text-center bg-indigo-50/30">Allocation (Ctn)</th>
                            {[OrderStatus.RFD, OrderStatus.OFD, OrderStatus.RECEIVED].includes(currentOrder.status) && (
                              <th className="px-4 py-3 text-[10px] font-black text-emerald-600 uppercase tracking-widest text-center">Scanned (Ctn)</th>
                            )}
                          </tr>
                        )}
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {currentOrder.items.map((item, idx) => {
                          const article = articles.find(a => a.id === item.articleId);
                          const variant = article?.variants?.find(v => v.id === item.variantId);
                          
                          // Robust Assortment-aware Live Stock (Min cartons possible by size ratio) using real-time fetched data
                          const getAssortmentLiveCartons = (delta: number = 0) => {
                            const stockData = variantStockData[item.variantId!];
                            if (!stockData?.liveStockMap || !variant?.sizeQuantities) return 0;
                            
                            const possibleCartons = Object.entries(variant.sizeQuantities).map(([sz, count]) => {
                              const reqPerCarton = Number(count) || 0;
                              if (reqPerCarton <= 0) return Infinity;

                              // Robust lookup: check for trimmed keys and prioritize fetched liveStockMap
                              const cleanSz = sz.trim();
                              
                              // Calculate available stock as (Physical/Live - Blocked)
                              // We use the real-time stock map instead of variant.sizeMap which might be stale
                              const physicalSizeStock = Number(stockData.liveStockMap[cleanSz] ?? stockData.liveStockMap[sz]) || 0;
                              const blockedSizeStock = Number(stockData.blockedStockMap[cleanSz] ?? stockData.blockedStockMap[sz]) || 0;
                              
                              const availableSizeStock = Math.max(0, physicalSizeStock - blockedSizeStock);

                              // Factor in pending blocking delta (delta is in cartons)
                              const previewSizeStock = Math.max(0, availableSizeStock - (delta * reqPerCarton));
                              return Math.floor(previewSizeStock / reqPerCarton);
                            });
                            const result = Math.min(...possibleCartons);
                            return (result === Infinity || isNaN(result)) ? 0 : result;
                          };

                          // Pending blocking delta (local state change vs saved state)
                          const currentBlockedSaved = item.blockedCartonCount || 0;
                          const pendingBlocked = blockingState[item.variantId!]?.blockedCartonCount ?? currentBlockedSaved;
                          const blockDelta = pendingBlocked - currentBlockedSaved;

                          const previewLiveStockCartons = getAssortmentLiveCartons(blockDelta);

                          const scanned = scannedItems[item.variantId!] || 0;
                          const allocatedCount = allocations[item.variantId!]?.allocatedCartonCount ?? item.allocatedCartonCount ?? 0;
                          const isVerified = scanned >= allocatedCount && allocatedCount > 0;

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
                                  <p className="text-sm font-black text-emerald-600 leading-none">
                                    {[OrderStatus.PFD, OrderStatus.RFD, OrderStatus.OFD].includes(currentOrder.status)
                                      ? (item.allocatedCartonCount || 0)
                                      : (item.fulfilledCartonCount || 0)}
                                  </p>
                                </td>
                                <td className="px-6 py-4 text-center">
                                  <p className="text-sm font-black text-rose-600 leading-none">{item.returnedCartonCount || 0}</p>
                                </td>
                                <td className="px-6 py-4 text-center">
                                  <p className="text-sm font-black text-rose-500 leading-none">{Math.max(0, item.cartonCount - (item.fulfilledCartonCount || 0) - ([OrderStatus.PFD, OrderStatus.RFD, OrderStatus.OFD].includes(currentOrder.status) ? (item.allocatedCartonCount || 0) : 0))}</p>
                                </td>
                                <td className="px-6 py-4 text-center">
                                  <p className="text-sm font-black text-indigo-500 leading-none">{item.allocatedCartonCount || 0}</p>
                                  <p className="text-[8px] font-bold text-indigo-500 uppercase tracking-widest mt-1">Next Delivery</p>
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
                                <p className="text-sm font-black text-emerald-600 leading-none">
                                  {[OrderStatus.PFD, OrderStatus.RFD, OrderStatus.OFD].includes(currentOrder.status)
                                    ? (item.allocatedCartonCount || 0)
                                    : (item.fulfilledCartonCount || 0)}
                                </p>
                              </td>
                              <td className="px-4 py-4 text-center">
                                <p className="text-sm font-black text-rose-600 leading-none">{item.returnedCartonCount || 0}</p>
                              </td>
                              <td className="px-4 py-4 text-center">
                                <p className="text-sm font-black text-rose-500 leading-none">{item.cartonCount - (item.fulfilledCartonCount || 0) - ([OrderStatus.PFD, OrderStatus.RFD, OrderStatus.OFD].includes(currentOrder.status) ? (item.allocatedCartonCount || 0) : 0)}</p>
                              </td>
                              <td className="px-4 py-4 text-center bg-indigo-50/20">
                                <div className="flex flex-col items-center">
                                  <p className={`text-sm font-black leading-none ${previewLiveStockCartons > 0 ? 'text-indigo-600' : 'text-rose-500'}`}>{previewLiveStockCartons}</p>
                                  {blockDelta !== 0 && (
                                    <span className="text-[7px] font-bold text-amber-500 bg-amber-50 px-1 rounded mt-0.5">{blockDelta > 0 ? `-${blockDelta}` : `+${Math.abs(blockDelta)}`}</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-4 text-center bg-amber-50/20">
                                <input
                                  type="number"
                                  value={(() => { const v = blockingState[item.variantId!]?.blockedCartonCount ?? item.blockedCartonCount ?? 0; return v === 0 ? "" : v; })()}
                                  placeholder="0"
                                  min={0}
                                  max={Math.min(
                                    item.cartonCount - (item.fulfilledCartonCount || 0),
                                    (item.blockedCartonCount || 0) + getAssortmentLiveCartons(0)
                                  )}
                                  onChange={(e) => handleCartonBlockingChange(item.variantId!, parseInt(e.target.value) || 0, item)}
                                  className="w-14 h-7 text-center bg-white border border-amber-200 rounded text-xs font-black text-amber-600 outline-none focus:ring-1 focus:ring-amber-500 placeholder:text-amber-200"
                                />
                              </td>
                              <td className="px-4 py-4 text-center bg-indigo-50/20">
                                {[OrderStatus.BOOKED, OrderStatus.PARTIAL, OrderStatus.PFD, OrderStatus.RFD].includes(currentOrder.status) ? (
                                  <input
                                    type="number"
                                    value={allocations[item.variantId!]?.allocatedCartonCount ?? (item.cartonCount - (item.fulfilledCartonCount || 0))}
                                    placeholder="0"
                                    min={0}
                                    max={item.cartonCount - (item.fulfilledCartonCount || 0)}
                                    onChange={(e) => handleCartonAllocationChange(item.variantId!, parseInt(e.target.value) || 0, item)}
                                    className="w-14 h-7 text-center bg-white border border-indigo-200 rounded text-xs font-black text-indigo-600 outline-none focus:ring-1 focus:ring-indigo-500 placeholder:text-indigo-200"
                                  />
                                ) : (
                                  <p className="text-sm font-black text-indigo-500 leading-none">{item.allocatedCartonCount || 0}</p>
                                )}
                              </td>
                              {[OrderStatus.RFD, OrderStatus.OFD, OrderStatus.RECEIVED].includes(currentOrder.status) && (
                                <td className="px-4 py-4 text-center">
                                  <div className="flex flex-col items-center">
                                    <span className={`text-sm font-black ${isVerified ? 'text-emerald-600' : (scanned > 0 ? 'text-indigo-600' : 'text-slate-400')}`}>{scanned}</span>
                                    {isVerified && <CheckCircle size={10} className="text-emerald-500 mt-0.5" />}
                                  </div>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {(() => {
                    const totalAllocated = Object.values(allocations).reduce((sum, a) => sum + (a.allocatedCartonCount || 0), 0) ||
                                         currentOrder.items.reduce((sum, i) => sum + (i.allocatedCartonCount || 0), 0);

                    const itemsInBatch = currentOrder.items.filter(item => {
                      const alloc = allocations[item.variantId!]?.allocatedCartonCount ?? item.allocatedCartonCount ?? 0;
                      return alloc > 0;
                    }).length;
                    const itemsPending = currentOrder.items.filter(item => {
                      const remaining = item.cartonCount - (item.fulfilledCartonCount || 0);
                      const alloc = allocations[item.variantId!]?.allocatedCartonCount ?? item.allocatedCartonCount ?? 0;
                      return remaining > 0 && alloc === 0;
                    }).length;
                    const hasAnyAllocation = itemsInBatch > 0;
                    const isPartialBatch = itemsPending > 0;

                    const hasUnsavedBlocking = currentOrder.items.some(item => {
                      const saved = item.blockedCartonCount ?? 0;
                      const current = blockingState[item.variantId!]?.blockedCartonCount ?? saved;
                      return current !== saved;
                    });

                    const _expectedCTNsForBtn = generateExpectedCTNs();
                    const ctnReady = _expectedCTNsForBtn.length === 0 || scannedCTNs.size >= _expectedCTNsForBtn.length;
                    const dispatchFieldsReady = !!(dispatchForm.vehicleNo.trim() && dispatchForm.transporterName.trim() && dispatchForm.lrNo.trim());
                    const allDocsUploaded = ctnReady && dispatchFieldsReady;

                    if (isDistributor || ![OrderStatus.BOOKED, OrderStatus.PARTIAL, OrderStatus.PFD, OrderStatus.RFD].includes(currentOrder.status)) return null;

                    const stepConfig = {
                      [OrderStatus.BOOKED]:  { num: 1, color: 'bg-indigo-600', title: 'Allocate & Dispatch',    hint: isPartialBatch ? `Partial dispatch — ${itemsInBatch} item(s) now, ${itemsPending} item(s) later.` : 'Set carton quantities, scan all CTNs, fill dispatch details, then confirm.' },
                      [OrderStatus.PARTIAL]: { num: 1, color: 'bg-indigo-600', title: 'Dispatch Next Batch',    hint: isPartialBatch ? `${itemsInBatch} item(s) in this batch, ${itemsPending} item(s) pending.` : 'Allocate next delivery batch.' },
                      [OrderStatus.PFD]:     { num: 2, color: 'bg-teal-500',   title: 'Mark as In Transit',    hint: 'Goods are dispatched — click to mark as In Transit when shipment is picked up by carrier.' },
                      [OrderStatus.RFD]:     { num: 3, color: 'bg-orange-500', title: 'Out for Delivery',      hint: 'Optionally enter delivery agent details, then mark as Out for Delivery.' },
                    } as const;
                    const step = stepConfig[currentOrder.status as keyof typeof stepConfig];

                    return (
                      <div className="p-6 bg-slate-50/50 border-t border-slate-100 space-y-5">
                        {/* Step Header */}
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full ${step.color} text-white flex items-center justify-center text-sm font-black shrink-0`}>
                              {step.num}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-bold text-slate-900">{step.title}</p>
                                {isPartialBatch && currentOrder.status !== OrderStatus.RFD && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-[9px] font-black uppercase tracking-wider">
                                    Partial · {itemsInBatch}/{itemsInBatch + itemsPending} items
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] font-medium text-slate-400">{step.hint}</p>
                            </div>
                          </div>
                          {[OrderStatus.PFD, OrderStatus.RFD].includes(currentOrder.status) && (
                            <div className="flex gap-2 shrink-0">
                              <button onClick={handleDownloadPI} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg font-bold text-[10px] uppercase hover:bg-slate-50 transition-all shadow-sm">
                                <FileText size={12} className="text-indigo-600" /> PI PDF
                              </button>
                              <button onClick={handleDownloadExcelPI} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg font-bold text-[10px] uppercase hover:bg-slate-50 transition-all shadow-sm">
                                <Download size={12} className="text-green-600" /> PI Excel
                              </button>
                            </div>
                          )}
                        </div>

                        {/* ── CTN Out-Scan + Dispatch Details (BOOKED / PARTIAL) ── */}
                        {[OrderStatus.BOOKED, OrderStatus.PARTIAL].includes(currentOrder.status) && (() => {
                          const expectedCTNs = generateExpectedCTNs();
                          const totalExpected = expectedCTNs.length;
                          const totalScanned  = scannedCTNs.size;
                          const allScanned    = totalExpected === 0 || totalScanned >= totalExpected;
                          const dispatchReady = allScanned
                            && dispatchForm.vehicleNo.trim()
                            && dispatchForm.transporterName.trim()
                            && dispatchForm.lrNo.trim();

                          return (
                            <div className="animate-in fade-in slide-in-from-top-2 duration-300 space-y-5">

                              {/* ── A. CTN Out-Scan ── */}
                              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                                <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-100">
                                  <div className="flex items-center gap-2">
                                    <Barcode size={14} className="text-indigo-500" />
                                    <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest">CTN Out-Scan</p>
                                    <span className="text-rose-400 text-[10px] font-bold">* Required</span>
                                  </div>
                                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${allScanned ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                    {totalScanned}/{totalExpected} scanned
                                  </span>
                                </div>
                                <div className="p-4 space-y-3">
                                  {/* Scan input */}
                                  <div className="flex gap-2">
                                    <div className="relative flex-1">
                                      <Barcode size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                      <input
                                        type="text"
                                        value={ctnScanInput}
                                        onChange={e => setCtnScanInput(e.target.value.toUpperCase())}
                                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCTNScan(ctnScanInput); }}}
                                        placeholder="Scan carton barcode → Enter"
                                        className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-500 text-xs font-mono font-bold"
                                        autoComplete="off"
                                      />
                                    </div>
                                    <button
                                      onClick={() => handleCTNScan(ctnScanInput)}
                                      className="px-3 py-2 bg-indigo-600 text-white rounded-xl text-[10px] font-black hover:bg-indigo-700 transition-all"
                                    >Scan</button>
                                  </div>
                                  {/* Expected CTN chips per item */}
                                  {Object.values(allocations).map((alloc: any, idx) => {
                                    const item = currentOrder.items[idx] || currentOrder.items[0];
                                    if (!item) return null;
                                    const code = getItemCode(item);
                                    const short = makeOrderShort();
                                    const ctns = Array.from({ length: alloc.allocatedCartonCount || alloc.cartonCount || 0 }, (_, n) =>
                                      `${short}-${code}-C${String(n + 1).padStart(2, '0')}`
                                    );
                                    if (!ctns.length) return null;
                                    const article = articles.find(a => a.id === item.articleId);
                                    return (
                                      <div key={idx}>
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                                          {article?.name || 'Item'} — {ctns.length} CTN
                                        </p>
                                        <div className="flex flex-wrap gap-1.5">
                                          {ctns.map(ctnId => (
                                            <button
                                              key={ctnId}
                                              onClick={() => {
                                                if (scannedCTNs.has(ctnId)) {
                                                  setScannedCTNs(prev => { const n = new Set(prev); n.delete(ctnId); return n; });
                                                } else {
                                                  setScannedCTNs(prev => new Set([...prev, ctnId]));
                                                  toast.success(`${ctnId} ✓`);
                                                }
                                              }}
                                              title={scannedCTNs.has(ctnId) ? 'Click to unscan' : 'Click to mark scanned'}
                                              className={`px-2 py-1 rounded-lg text-[9px] font-black font-mono transition-all border ${
                                                scannedCTNs.has(ctnId)
                                                  ? 'bg-emerald-500 text-white border-emerald-500'
                                                  : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-400'
                                              }`}
                                            >
                                              {scannedCTNs.has(ctnId) ? '✓ ' : ''}{ctnId}
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                    );
                                  })}
                                  {totalExpected === 0 && (
                                    <p className="text-[10px] text-slate-400 text-center py-2">Set carton allocation above to see CTN list</p>
                                  )}
                                </div>
                              </div>

                              {/* ── B. Dispatch Details ── */}
                              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                                <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 border-b border-slate-100">
                                  <Truck size={14} className="text-amber-500" />
                                  <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Dispatch Details</p>
                                </div>
                                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  {[
                                    { key: 'vehicleNo',       label: 'Vehicle No',            placeholder: 'e.g. MH 04 AB 1234',  required: true },
                                    { key: 'transporterName', label: 'Transporter Name',       placeholder: 'e.g. Gati / BlueDart',required: true },
                                    { key: 'lrNo',            label: 'LR / Consignment No',    placeholder: 'e.g. LR-20240601-001',required: true },
                                    { key: 'eWayBillNo',      label: 'E-Way Bill No',          placeholder: 'e.g. 1234 5678 9012', required: false },
                                    { key: 'driverName',      label: 'Driver Name',            placeholder: 'e.g. Ramesh Kumar',   required: false },
                                    { key: 'driverMobile',    label: 'Driver Mobile',          placeholder: 'e.g. 9876543210',     required: false },
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
                                        className={`w-full px-3 py-2 bg-white border rounded-xl outline-none focus:ring-2 focus:ring-indigo-400/20 focus:border-indigo-400 text-xs font-medium ${
                                          f.required && !(dispatchForm as any)[f.key].trim() ? 'border-rose-200' : 'border-slate-200'
                                        }`}
                                      />
                                    </div>
                                  ))}
                                  <div>
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 block">
                                      Gross Weight (KG)
                                    </label>
                                    <input
                                      type="number"
                                      value={dispatchForm.grossWeightKg}
                                      onChange={e => setDispatchForm(p => ({ ...p, grossWeightKg: e.target.value }))}
                                      placeholder="e.g. 120"
                                      min="0"
                                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-400/20 focus:border-indigo-400 text-xs font-medium"
                                    />
                                  </div>
                                </div>
                              </div>

                              {/* ── C. Documents (optional) ── */}
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
                                      <button
                                        onClick={() => d.ref.current?.click()}
                                        className={`w-full flex items-center gap-2 p-2.5 rounded-xl border-2 transition-all text-left ${
                                          (shippingFiles as any)[d.key] ? 'border-emerald-400 bg-emerald-50' : 'border-dashed border-slate-200 bg-slate-50 hover:bg-slate-100'
                                        }`}
                                      >
                                        {(shippingFiles as any)[d.key]
                                          ? <CheckCircle size={13} className="text-emerald-500 shrink-0" />
                                          : <Upload size={13} className="text-slate-400 shrink-0" />}
                                        <div className="min-w-0">
                                          <p className="text-[9px] font-black text-slate-500 uppercase tracking-wider">{d.label}</p>
                                          {(shippingFiles as any)[d.key] && <p className="text-[8px] text-emerald-600 truncate font-bold">{(shippingFiles as any)[d.key].name}</p>}
                                        </div>
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* ── D. PI Download (accessible from BOOKED stage) ── */}
                              <div className="flex gap-2">
                                <button onClick={handleDownloadPI} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg font-bold text-[10px] uppercase hover:bg-slate-50 transition-all shadow-sm">
                                  <FileText size={12} className="text-indigo-600" /> PI PDF
                                </button>
                                <button onClick={handleDownloadExcelPI} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg font-bold text-[10px] uppercase hover:bg-slate-50 transition-all shadow-sm">
                                  <Download size={12} className="text-green-600" /> PI Excel
                                </button>
                                {!dispatchReady && (
                                  <span className="flex items-center gap-1 text-[9px] font-bold text-amber-600 ml-2">
                                    <AlertCircle size={10} />
                                    {!allScanned ? `${totalExpected - totalScanned} CTN(s) pending scan` : 'Fill required dispatch fields'}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })()}

                        {/* Action Row */}
                        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                          {/* Optional: Save Blocking Changes (only when user has made blocking edits) */}
                          {hasUnsavedBlocking && [OrderStatus.BOOKED, OrderStatus.PARTIAL].includes(currentOrder.status) && (
                            <button
                              disabled={uploading}
                              onClick={handleUpdateBlockedStock}
                              className="flex items-center gap-1.5 px-4 py-2 bg-amber-50 border border-amber-200 text-amber-700 rounded-xl font-bold text-[10px] uppercase hover:bg-amber-100 transition-all"
                            >
                              {uploading ? <Loader2 size={12} className="animate-spin" /> : <ShieldCheck size={12} />}
                              Save Reservations <span className="font-normal normal-case text-amber-500">(optional)</span>
                            </button>
                          )}

                          {/* Main actions */}
                          <div className="ml-auto flex items-center gap-3 flex-wrap w-full sm:w-auto">

                            {/* BOOKED / PARTIAL: Allocate + Dispatch (includes doc upload) */}
                            {[OrderStatus.BOOKED, OrderStatus.PARTIAL].includes(currentOrder.status) && (
                              <button
                                disabled={uploading || !hasAnyAllocation || !allDocsUploaded}
                                title={!ctnReady ? `Scan all cartons (${scannedCTNs.size}/${_expectedCTNsForBtn.length})` : !dispatchFieldsReady ? "Fill Vehicle No, Transporter, and LR No" : !hasAnyAllocation ? "Set allocation for at least one item" : undefined}
                                onClick={handleAllocateAndProceed}
                                className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-xs hover:bg-indigo-700 transition-all shadow-md active:scale-95 disabled:opacity-50 w-full sm:w-auto justify-center"
                              >
                                {uploading ? <Loader2 size={14} className="animate-spin" /> : <Truck size={14} />}
                                {isPartialBatch ? `Dispatch ${itemsInBatch} Item(s)` : 'Confirm Dispatch'}
                              </button>
                            )}

                            {/* PFD (Dispatched): dispatch info summary + In Transit button */}
                            {currentOrder.status === OrderStatus.PFD && (
                              <div className="w-full space-y-3">
                                {/* Dispatch info card */}
                                {(currentOrder.vehicleNo || currentOrder.lrNo || currentOrder.transporterName) && (
                                  <div className="bg-teal-50 border border-teal-100 rounded-xl p-3">
                                    <p className="text-[9px] font-black text-teal-600 uppercase tracking-widest mb-2 flex items-center gap-1">
                                      <Truck size={11} /> Dispatch Info
                                    </p>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[10px]">
                                      {currentOrder.vehicleNo && (
                                        <div><span className="text-slate-400 font-bold uppercase text-[9px]">Vehicle</span><p className="font-black text-slate-700 font-mono">{currentOrder.vehicleNo}</p></div>
                                      )}
                                      {currentOrder.transporterName && (
                                        <div><span className="text-slate-400 font-bold uppercase text-[9px]">Transporter</span><p className="font-black text-slate-700">{currentOrder.transporterName}</p></div>
                                      )}
                                      {currentOrder.lrNo && (
                                        <div><span className="text-slate-400 font-bold uppercase text-[9px]">LR / Consignment</span><p className="font-black text-slate-700 font-mono">{currentOrder.lrNo}</p></div>
                                      )}
                                      {currentOrder.eWayBillNo && (
                                        <div><span className="text-slate-400 font-bold uppercase text-[9px]">E-Way Bill</span><p className="font-black text-slate-700 font-mono">{currentOrder.eWayBillNo}</p></div>
                                      )}
                                      {currentOrder.driverName && (
                                        <div><span className="text-slate-400 font-bold uppercase text-[9px]">Driver</span><p className="font-black text-slate-700">{currentOrder.driverName}{currentOrder.driverMobile ? ` · ${currentOrder.driverMobile}` : ''}</p></div>
                                      )}
                                      {currentOrder.dispatchedAt && (
                                        <div><span className="text-slate-400 font-bold uppercase text-[9px]">Dispatched At</span><p className="font-black text-slate-700">{new Date(currentOrder.dispatchedAt).toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}</p></div>
                                      )}
                                      {currentOrder.outScannedCartons && currentOrder.outScannedCartons.length > 0 && (
                                        <div className="col-span-2 sm:col-span-3"><span className="text-slate-400 font-bold uppercase text-[9px]">Out-Scanned Cartons ({currentOrder.outScannedCartons.length})</span>
                                          <div className="flex flex-wrap gap-1 mt-1">{currentOrder.outScannedCartons.map(c => <span key={c} className="px-1.5 py-0.5 bg-teal-100 text-teal-700 rounded-md font-mono text-[9px] font-bold">{c}</span>)}</div>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}
                                <button
                                  disabled={uploading}
                                  onClick={() => handleUpdateStatus(OrderStatus.RFD)}
                                  className="flex items-center gap-2 px-5 py-2.5 bg-teal-600 text-white rounded-xl font-bold text-xs hover:bg-teal-700 transition-all shadow-md active:scale-95 w-full sm:w-auto justify-center"
                                >
                                  {uploading ? <Loader2 size={14} className="animate-spin" /> : <Truck size={14} />}
                                  Mark as In Transit
                                </button>
                              </div>
                            )}

                            {/* RFD (In Transit): delivery agent form + Out for Delivery button */}
                            {currentOrder.status === OrderStatus.RFD && (
                              <div className="w-full space-y-3">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  <div>
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider block mb-1">
                                      Delivery Agent Name <span className="font-normal normal-case text-slate-300">(optional)</span>
                                    </label>
                                    <input
                                      type="text"
                                      placeholder="e.g. Ramesh Kumar"
                                      value={deliveryAgentName}
                                      onChange={e => setDeliveryAgentName(e.target.value)}
                                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-orange-400/20 focus:border-orange-400 text-xs font-medium"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider block mb-1">
                                      Mobile Number <span className="font-normal normal-case text-slate-300">(optional)</span>
                                    </label>
                                    <input
                                      type="tel"
                                      placeholder="e.g. 9876543210"
                                      value={deliveryAgentMobile}
                                      onChange={e => setDeliveryAgentMobile(e.target.value)}
                                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-orange-400/20 focus:border-orange-400 text-xs font-medium"
                                    />
                                  </div>
                                </div>
                                <div>
                                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider block mb-1">
                                    Delivery Note <span className="font-normal normal-case text-slate-300">(optional)</span>
                                  </label>
                                  <input
                                    type="text"
                                    placeholder="e.g. Delivery expected by 5 PM"
                                    value={deliveryNote}
                                    onChange={e => setDeliveryNote(e.target.value)}
                                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-orange-400/20 focus:border-orange-400 text-xs font-medium"
                                  />
                                </div>
                                <button
                                  onClick={() => handleUpdateStatus(OrderStatus.OFD)}
                                  disabled={uploading}
                                  className="flex items-center justify-center gap-2 px-6 py-2.5 bg-orange-500 text-white rounded-xl font-bold text-xs hover:bg-orange-600 transition-all shadow-lg active:scale-95 w-full sm:w-auto"
                                >
                                  {uploading ? <Loader2 size={14} className="animate-spin" /> : <Truck size={14} />}
                                  Mark as Out for Delivery
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
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
    [OrderStatus.OFD]: { color: 'bg-emerald-50 text-emerald-500 border-emerald-100' },
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
