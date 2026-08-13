export enum UserRole {
  SUPERADMIN = "superadmin",
  ADMIN = "admin",
  MANAGER = "manager",
  SUPERVISOR = "supervisor",
  ACCOUNTANT = "accountant",
  INVESTOR = "investor",
  DISTRIBUTOR = "distributor",
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  location?: string;
  companyName?: string;
  phone?: string;
  gstNumber?: string;
  billingAddress?: string | DistributorAddress;
  shippingAddress?: string | DistributorAddress;
  paymentTerms?: string;
  tag?: "online" | "offline";
  discountPercentage?: number;
  creditLimit?: number;
  loginEmail?: string; // populated from linked `User` record
  loginPasswordPlain?: string; // plain text stored on distributor for admin reference
  /**
   * password is never returned from the server – only used transiently when
   * creating/updating a distributor. the UI will display a placeholder and
   * offer a reset action instead of reading this field.
   */
  loginPassword?: string;
  loginEnabled?: boolean;
  availableCredit?: number; // Augmented dynamically for distributors
  distributorId?: string;
}

export enum AssortmentType {
  WOMEN = "WOMEN",
  MEN = "MEN",
  KIDS = "KIDS",
}

export interface SizeBreakup {
  size: string;
  pairs: number;
}

export interface Variant {
  id: string;
  _id?: string;
  itemName: string;
  sku?: string;
  sizeSkus: Record<string, string>;
  color: string;
  sizeRange: string;

  // ✅ duplicate same sizeRange support
  sizeRangeId?: string;

  costPrice: number;
  sellingPrice: number;
  mrp: number;
  hsnCode?: string;
  sizeQuantities: Record<string, number>;
  sizeMap?: Record<string, { qty: number; sku: string }>;
  bookingMap?: Record<string, number>;
  poMap?: Record<string, number>;
  images?: string[];
  isActive?: boolean;
  tag?: "online" | "offline";
  onlineMrp?: number;
  offlineMrp?: number;
  // Per-variant override of the article's stage — falls back to the
  // article's own `status`/`expectedDate` when unset (see Article below).
  stage?: "AVAILABLE" | "PREORDER";
  expectedAvailableDate?: string;
  // PO-derived planned pairs for a still-PREORDER variant — computed by the
  // backend from Purchase Orders (per-size + total), never stored/entered
  // manually. preBookedPairs is what distributors have already pre-booked
  // (PRE_BOOKED/CONFIRMED); remaining bookable = plannedPairs − preBookedPairs.
  poPlannedQty?: Record<string, number>;
  plannedPairs?: number;
  preBookedPairs?: number;
  // Still-incoming pairs on POs: plannedPairs − pairs already received via
  // GRN — the "PO Pending" figure everywhere.
  poPendingPairs?: number;
}

export interface Assortment {
  id: string;
  name: string;
  type: AssortmentType;
  breakup: SizeBreakup[];
  totalPairsPerCarton: number;
}

export interface Article {
  id: string;
  sku: string;
  name: string;
  category: AssortmentType; // Gender/Type (Men, Women, Kids)
  assortmentId: string;
  pricePerPair: number;
  imageUrl: string;
  images?: string[]; // additional image urls

  // New optional fields for Product Master
  mrp?: number;
  soleColor?: string;
  productCategory?: string; // e.g. Footwear
  brand?: string;
  status?: "AVAILABLE" | "PREORDER";
  expectedDate?: string;
  expectedAvailableDate?: string;
  manufacturer?: string;
  unit?: string;
  selectedSizes?: string[];
  selectedColors?: string[];
  variants?: Variant[];
  secondaryImages?: { url: string }[];
  colorMedia?: {
    color: string;
    images: { url: string; key?: string; isCover?: boolean }[];
  }[];
  sizeRange?: string;
  isActive?: boolean;
}

export interface Inventory {
  articleId: string;
  actualStock: number; // In Cartons
  reservedStock: number; // In Cartons (Booked)
  availableStock: number; // actual - reserved - blocked (Wait, user said subtraction from live stock, so live is available)
}

export enum OrderStatus {
  // Pre-Order flow
  PRE_BOOKED = "PRE_BOOKED",   // Distributor placed pre-order (PREORDER items)
  CONFIRMED  = "CONFIRMED",    // Admin confirmed the pre-order
  // Regular order flow
  PENDING   = "PENDING",       // Placed by distributor, awaiting admin booking
  BOOKED    = "BOOKED",        // Admin booked / confirmed
  PFD       = "PFD",           // Processing for Delivery
  RFD       = "RFD",           // Ready for Delivery
  OFD       = "OFD",           // Out for Delivery
  RECEIVED  = "RECEIVED",      // Delivered
  PARTIAL   = "PARTIAL",       // Partially Delivered
  CANCELLED = "CANCELLED",     // Cancelled
}

export type OrderType = "REGULAR" | "PREORDER";

export interface OrderItem {
  articleId: string;
  /** optional variant selected by the user (color + size range) */
  variantId?: string;
  // Resolved server-side at booking time: REGULAR items had real stock and
  // deduct/dispatch immediately; PREORDER items sit in the same order with
  // no stock touched until their GRN lands and flips this to REGULAR.
  bookingType?: "REGULAR" | "PREORDER";
  /** detailed breakdown: pairs per size (e.g. {"5":12, "6":12}) */
  sizeQuantities?: Record<string, number>;
  // Pairs, per size, already claimed out of arrived GRN stock while still
  // PREORDER — a partial GRN claims what it can and leaves the item
  // PREORDER holding the remainder (see backend promotePreOrderItems).
  preorderReservedSizeQuantities?: Record<string, number>;
  fulfilledSizeQuantities?: Record<string, number>;

  cartonCount: number;
  fulfilledCartonCount?: number;
  returnedCartonCount?: number;
  pairCount: number;
  fulfilledPairCount?: number;
  returnedPairCount?: number;
  price: number;
  allocatedCartons?: string[];
}

export interface FulfillmentBatch {
  id?: string;
  batchNumber?: number;
  date: string;
  cartonCodes?: string[];
  items: {
    variantId: string;
    articleId: string;
    cartonCount: number;
    returnedCartonCount?: number;
    pairCount: number;
    sizeQuantities: Record<string, number>;
  }[];
  totalAmount: number;
  totalCartons: number;
  totalPairs: number;
  billUrl?: string;
  invoiceUrl?: string;
  ewayBillUrl?: string;
  transportBillUrl?: string;
  receivingNoteUrl?: string;
  receiverName?: string;
  receiverMobile?: string;
}

// One entry per physical carton ever scanned for an order — flat, not
// grouped into batches. Scan/Transport/Receive tabs each read their live
// pool by filtering on `status`.
export interface CartonTrackingEntry {
  code: string;
  itemKey: string;
  status: 'DISPATCHED' | 'IN_TRANSIT' | 'RECEIVED';
  dispatchedAt?: string;
  transitShipmentId?: string;
  receiptRecordId?: string;
}

export interface TransitShipment {
  id?: string;
  cartonCodes: string[];
  vehicleNo?: string;
  lrNo?: string;
  transporterName?: string;
  eWayBillNo?: string;
  driverName?: string;
  driverMobile?: string;
  grossWeightKg?: number;
  invoiceUrl?: string;
  ewayBillUrl?: string;
  transportBillUrl?: string;
  createdAt?: string;
}

export interface Order {
  id: string;
  orderNumber?: string;
  orderType?: OrderType;
  distributorId: string | {
    id: string;
    name: string;
    email: string;
    distributorId?: {
      companyName: string;
      phone: string;
      email: string;
      shippingAddress: DistributorAddress;
      billingAddress: DistributorAddress;
    };
  };
  distributorName: string;
  date: string;
  status: OrderStatus;
  items: OrderItem[];
  fulfillmentHistory?: FulfillmentBatch[];
  totalAmount: number;
  totalCartons: number;
  totalPairs: number;
  discountPercentage?: number;
  discountAmount?: number;
  finalAmount?: number;
  // Portion of finalAmount that counted against the distributor's credit
  // limit — only the REGULAR items' slice; 0 for a pure pre-order.
  creditAmount?: number;
  gstRate?: number;
  gstAmount?: number;
  billUrl?: string;
  invoiceUrl?: string;
  ewayBillUrl?: string;
  transportBillUrl?: string;
  receivingNoteUrl?: string;
  receiverName?: string;
  receiverMobile?: string;
  // Delivery agent — filled at OFD step
  deliveryAgentName?: string;
  deliveryAgentMobile?: string;
  deliveryNote?: string;
  // Booking commitment
  expectedDispatchDate?: string;
  bookingPriority?: 'NORMAL' | 'URGENT';
  adminNote?: string;
  stockStatus?: 'DISPATCH_READY' | 'NO_STOCK';
  // Dispatch details — filled at BOOKED → PFD (CTN out-scan step)
  vehicleNo?: string;
  lrNo?: string;
  transporterName?: string;
  eWayBillNo?: string;
  driverName?: string;
  driverMobile?: string;
  grossWeightKg?: number;
  outScannedCartons?: string[];
  dispatchedAt?: string;
  deliveredAt?: string;
  // Per-carton dispatch lifecycle (Scan / Transport / Receive tabs)
  cartonTracking?: CartonTrackingEntry[];
  transitShipments?: TransitShipment[];
}

export interface MovementRecord {
  id: string;
  articleId: string;
  type:
    | "INWARD"
    | "PRODUCTION"
    | "PURCHASE"
    | "RETURN"
    | "OUTWARD"
    | "SAMPLE"
    | "ECOMMERCE";
  cartonCount: number;
  date: string;
  note: string;
}

export interface ReturnItem {
  variantId: string;
  articleId: string;
  cartonCount: number;
  pairCount: number;
  sizeQuantities: Record<string, number>;
}

export interface Return {
  id: string;
  returnNumber: string;
  orderId: string;
  orderNumber: string;
  distributorId: string;
  distributorName: string;
  items: ReturnItem[];
  totalCartons: number;
  totalPairs: number;
  date: string;
  createdAt: string;
  reason?: string;
  batchNumber?: number;
}

// Vendor-related types
export interface VendorAddress {
  attention: string;
  country: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  pinCode: string;
  phone: string;
  fax: string;
}

export interface DistributorAddress {
  attention: string;
  country: string;
  address1: string;
  address2?: string;
  city: string;
  state: string;
  pinCode: string;
}

export interface VendorContact {
  id: string;
  salutation: string;
  firstName: string;
  lastName: string;
  email: string;
  workPhone: string;
  mobile: string;
}

export interface VendorBankDetail {
  id: string;
  accountHolderName: string;
  bankName: string;
  accountNumber: string;
  ifsc: string;
}

export interface Vendor {
  id: string;
  salutation: string;
  firstName: string;
  lastName: string;
  companyName: string;
  vendorCode: string;
  displayName: string;
  email: string;
  workPhone: string;
  mobile: string;
  // Other Details
  gstNumber: string;
  cinNumber: string;
  pan: string;
  brand: string;
  msmeRegistered: boolean;
  currency: string;
  paymentTerms: string;
  tds: string;
  enablePortal: boolean;
  isActive: boolean;
  // Addresses
  billingAddress: VendorAddress;
  shippingAddress: VendorAddress;
  // Contact Persons
  contactPersons: VendorContact[];

  // Bank Details
  bankDetails: VendorBankDetail[];
}

// Purchase Order types
export interface PurchaseOrderItem {
  id: string;
  articleId: string;
  variantId: string;
  itemName: string;
  color?: string;
  image: string;
  sku: string;
  skuCompany: string; // brand
  itemTaxCode: string; // HSN code
  quantity: number;
  taxRate: number;
  taxType: "GST" | "IGST";
  basePrice: number;
  mrp: number;
  taxPerItem: number;
  unitTotal: number;
  sizeMap?: Record<string, { qty: number; sku: string }>;
  cartonCount?: number;
  assortment?: string;
  gender?: string;
}

export type POStatus = "DRAFT" | "SENT";

export interface PurchaseOrder {
  id: string;
  vendorId: string;
  vendorName: string;
  // Allocated only on bill approval — absent until then.
  poNumber?: string;
  referenceNumber: string;
  date: string;
  deliveryDate: string;
  paymentTerms: string;
  shipmentPreference: string;
  notes: string;
  termsAndConditions: string;
  items: PurchaseOrderItem[];
  subTotal: number;
  discountPercent: number;
  discountAmount: number;
  totalTax: number;
  total: number;
  status: POStatus;
  createdAt: string;
  // Bill-related fields
  billStatus?: "PENDING" | "APPROVED" | "REJECTED";
  billRemark?: string;
  billApprovedAt?: string;
  billRejectedAt?: string;
  isRevised?: boolean;
  revisionCount?: number;
}