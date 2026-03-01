export enum UserRole {
  SUPERADMIN = "superadmin",
  ADMIN = "admin",
  DISTRIBUTOR = "staff",
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  location?: string;
  companyName?: string;
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
  itemName: string;
  sku?: string;
  sizeSkus: Record<string, string>;
  color: string;
  sizeRange: string;
  costPrice: number;
  sellingPrice: number;
  mrp: number;
  hsnCode?: string;
  sizeQuantities: Record<string, number>;
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
  status?: "AVAILABLE" | "WISHLIST";
  expectedDate?: string;
  manufacturer?: string;
  unit?: string;
  selectedSizes?: string[];
  selectedColors?: string[];
  variants?: Variant[];
}

export interface Inventory {
  articleId: string;
  actualStock: number; // In Cartons
  reservedStock: number; // In Cartons
  availableStock: number; // actual - reserved
}

export enum OrderStatus {
  BOOKED = "BOOKED",
  PENDING = "PENDING",
  READY_FOR_DISPATCH = "READY_FOR_DISPATCH",
  DISPATCHED = "DISPATCHED",
  DELIVERED = "DELIVERED",
}

export interface OrderItem {
  articleId: string;
  cartonCount: number;
  pairCount: number;
  price: number;
}

export interface Order {
  id: string;
  distributorId: string;
  distributorName: string;
  date: string;
  status: OrderStatus;
  items: OrderItem[];
  totalAmount: number;
  totalCartons: number;
  totalPairs: number;
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
  displayName: string;
  email: string;
  workPhone: string;
  mobile: string;
  // Other Details
  pan: string;
  msmeRegistered: boolean;
  currency: string;
  paymentTerms: string;
  tds: string;
  enablePortal: boolean;
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
  image: string;
  sku: string;
  skuCompany: string; // brand
  itemTaxCode: string; // HSN code
  quantity: number;
  taxRate: number;
  taxType: "GST" | "IGST";
  basePrice: number;
  taxPerItem: number;
  unitTotal: number;
}

export type POStatus = "DRAFT" | "SENT";

export interface PurchaseOrder {
  id: string;
  vendorId: string;
  vendorName: string;
  poNumber: string;
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
}
