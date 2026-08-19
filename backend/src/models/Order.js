const mongoose = require("mongoose");

const SizeQuantitySchema = new mongoose.Schema(
  {
    // The key is the size (e.g. "5"), value is the number of pairs
  },
  { _id: false, strict: false }
);

// Immutable catalog details captured when an order is placed.  Catalog
// variants can later be renamed, deactivated, or removed, but an order must
// always retain the product details that were actually purchased.
const ProductSnapshotSchema = new mongoose.Schema(
  {
    articleName: { type: String, default: "" },
    color: { type: String, default: "" },
    sizeRange: { type: String, default: "" },
    assortment: { type: Map, of: Number, default: {} },
    imageUrl: { type: String, default: "" },
  },
  { _id: false }
);

const OrderItemSchema = new mongoose.Schema(
  {
    articleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MasterCatalog",
      required: true,
    },
    variantId: {
      type: mongoose.Schema.Types.ObjectId,
    },
    // Resolved server-side at booking time from the variant's effective
    // stage — REGULAR items deduct real stock immediately and are
    // dispatchable now; PREORDER items sit in the SAME order with no stock
    // touched until a GRN lands and promotePreOrderItems() flips this to
    // REGULAR (deducting then). A single order can freely mix both.
    bookingType: {
      type: String,
      enum: ["REGULAR", "PREORDER"],
      default: "REGULAR",
    },
    sizeQuantities: {
      type: Map,
      of: Number,
      default: {},
    },
    productSnapshot: {
      type: ProductSnapshotSchema,
      default: undefined,
    },
    // Pairs, per size, already claimed out of arrived GRN stock while this
    // item is still PREORDER — separate from fulfilledSizeQuantities, which
    // only starts counting once bookingType flips to REGULAR and dispatch
    // scanning begins. A partial GRN (less than sizeQuantities) claims what
    // it can and leaves the item PREORDER with the remainder still owed;
    // any GRN beyond sizeQuantities is never claimed here, so it naturally
    // stays in sizeMap.qty as real available stock (see promotePreOrderItems).
    preorderReservedSizeQuantities: {
      type: Map,
      of: Number,
      default: {},
    },
    fulfilledSizeQuantities: {
      type: Map,
      of: Number,
      default: {},
    },
    cartonCount: {
      type: Number,
      required: true,
      default: 0,
    },
    fulfilledCartonCount: {
      type: Number,
      default: 0,
    },
    pairCount: {
      type: Number,
      required: true,
      default: 0,
    },
    fulfilledPairCount: {
      type: Number,
      default: 0,
    },
    returnedCartonCount: {
      type: Number,
      default: 0,
    },
    returnedPairCount: {
      type: Number,
      default: 0,
    },
    price: {
      type: Number,
      required: true,
      default: 0,
    },
    allocatedCartons: { type: [String], default: [] },
  },
  { _id: false }
);

const FulfillmentHistorySchema = new mongoose.Schema({
  batchNumber: Number,
  date: { type: Date, default: Date.now },
  // Exact physical cartons this receipt confirmation covered — lets the
  // Receive tab show precise history alongside the coarser item/cartonCount
  // summary below (kept for backward compatibility with existing readers).
  cartonCodes: { type: [String], default: [] },
  items: [{
    variantId: mongoose.Schema.Types.ObjectId,
    articleId: mongoose.Schema.Types.ObjectId,
    cartonCount: Number,
    returnedCartonCount: { type: Number, default: 0 },
    pairCount: Number,
    returnedPairCount: { type: Number, default: 0 },
    sizeQuantities: { type: Map, of: Number }
  }],
  totalAmount: Number,
  totalCartons: Number,
  totalPairs: Number,
  billUrl: String,
  invoiceUrl: String,
  ewayBillUrl: String,
  transportBillUrl: String,
  receivingNoteUrl: String,
  receiverName: String,
  receiverMobile: String,
}, { _id: true, timestamps: true });

// One entry per physical carton ever scanned for this order — flat, not
// grouped into batches. The three dispatch tabs (Scan/Transport/Receive)
// each read their live pool by filtering this array on `status`.
const CartonTrackingSchema = new mongoose.Schema({
  code: { type: String, required: true },       // e.g. "SKU-CT0003"
  itemKey: { type: String, required: true },     // variantId or articleId this carton belongs to
  status: {
    type: String,
    enum: ["DISPATCHED", "IN_TRANSIT", "RECEIVED"],
    default: "DISPATCHED",
  },
  dispatchedAt: { type: Date, default: Date.now },
  transitShipmentId: { type: mongoose.Schema.Types.ObjectId, default: null },
  receiptRecordId: { type: mongoose.Schema.Types.ObjectId, default: null },
}, { _id: false });

// One entry per Transport-tab submission — the specific set of cartons sent
// out together on one vehicle/shipment.
const TransitShipmentSchema = new mongoose.Schema({
  cartonCodes: { type: [String], default: [] },
  vehicleNo: String,
  lrNo: String,
  transporterName: String,
  eWayBillNo: String,
  driverName: String,
  driverMobile: String,
  grossWeightKg: Number,
  invoiceUrl: String,
  ewayBillUrl: String,
  transportBillUrl: String,
  createdAt: { type: Date, default: Date.now },
}, { _id: true });

const OrderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      sparse: true,
    },
    distributorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // Assuming Distributors are Users
      required: true,
    },
    distributorName: {
      type: String,
      required: true,
    },
    date: {
      type: String, // Storing as formatted string (e.g. "YYYY-MM-DD") for display based on frontend types
      required: true,
    },
    orderType: {
      type: String,
      enum: ["REGULAR", "PREORDER"],
      default: "REGULAR",
    },
    status: {
      type: String,
      enum: ["PRE_BOOKED", "CONFIRMED", "PENDING", "BOOKED", "PFD", "RFD", "OFD", "RECEIVED", "PARTIAL", "CANCELLED"],
      default: "PENDING",
    },
    billUrl: {
      type: String,
      default: null,
    },
    invoiceUrl: {
      type: String,
      default: null,
    },
    ewayBillUrl: {
      type: String,
      default: null,
    },
    transportBillUrl: {
      type: String,
      default: null,
    },
    receivingNoteUrl: {
      type: String,
      default: null,
    },
    receiverName: {
      type: String,
      default: null,
    },
    receiverMobile: {
      type: String,
      default: null,
    },
    // Delivery agent info — filled when marking Out for Delivery
    deliveryAgentName: { type: String, default: null },
    deliveryAgentMobile: { type: String, default: null },
    deliveryNote: { type: String, default: null },

    // Dispatch details — filled when BOOKED → PFD (CTN out-scan + dispatch form)
    vehicleNo: { type: String, default: null },
    lrNo: { type: String, default: null },           // Lorry Receipt / Consignment No
    transporterName: { type: String, default: null },
    eWayBillNo: { type: String, default: null },     // E-Way Bill number (text)
    driverName: { type: String, default: null },
    driverMobile: { type: String, default: null },
    grossWeightKg: { type: Number, default: null },
    outScannedCartons: { type: [String], default: [] }, // Carton barcodes scanned on dispatch
    dispatchedAt: { type: Date, default: null },
    items: [OrderItemSchema],
    fulfillmentHistory: [FulfillmentHistorySchema],
    cartonTracking: [CartonTrackingSchema],
    transitShipments: [TransitShipmentSchema],
    totalAmount: {
      type: Number,
      required: true,
      default: 0,
    },
    totalCartons: {
      type: Number,
      required: true,
      default: 0,
    },
    totalPairs: {
      type: Number,
      required: true,
      default: 0,
    },
    discountPercentage: {
      type: Number,
      default: 0,
    },
    discountAmount: {
      type: Number,
      default: 0,
    },
    finalAmount: {
      type: Number,
      default: 0,
    },
    // Portion of finalAmount that counts against the distributor's credit
    // limit — only REGULAR (real-stock) items contribute; PREORDER items
    // never do, whether the order is pure-preorder (0) or mixed (partial).
    // Read via $ifNull with a finalAmount/totalAmount fallback so historical
    // orders created before this field existed still work.
    creditAmount: {
      type: Number,
      default: 0,
    },
    gstRate: {
      type: Number,
      default: 0,
    },
    gstAmount: {
      type: Number,
      default: 0,
    },
    paymentStatus: {
      type: String,
      enum: ["PENDING", "PAID"],
      default: "PENDING",
    },
    paidAt: { type: Date, default: null },
    paidBy: { type: String, default: null },
    paymentNote: { type: String, default: null },
    deliveredAt: { type: Date, default: null },
    // Booking commitment fields — filled when admin confirms order
    expectedDispatchDate: { type: Date, default: null },
    bookingPriority: { type: String, enum: ['NORMAL', 'URGENT'], default: 'NORMAL' },
    adminNote: { type: String, default: null },
    stockStatus: { type: String, enum: ['DISPATCH_READY', 'NO_STOCK'], default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

const Order = mongoose.model("Order", OrderSchema);

module.exports = Order;
