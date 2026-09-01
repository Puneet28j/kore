const mongoose = require("mongoose");

const PurchaseOrderItemSchema = new mongoose.Schema(
  {
    rowId: { type: String, trim: true, default: "" },

    articleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MasterCatalog",
      required: false,
      index: true,
    },
    variantId: { type: String, trim: true, default: "" },

    itemName: { type: String, trim: true, default: "" },
    color: { type: String, trim: true, default: "" },
    gender: { type: String, trim: true, default: "" },
    assortment: { type: String, trim: true, default: "" },
    image: { type: String, trim: true, default: "" },

    sku: { type: String, trim: true, default: "" },
    skuCompany: { type: String, trim: true, default: "" },

    itemTaxCode: { type: String, trim: true, default: "" },
    quantity: { type: Number, min: 1, default: 1 },
    cartonCount: { type: Number, min: 0, default: 0 },

    taxRate: { type: Number, min: 0, max: 100, default: 0 },
    taxType: { type: String, enum: ["GST", "IGST"], default: "GST" },

    basePrice: { type: Number, min: 0, default: 0 },
    mrp: { type: Number, min: 0, default: 0 },
    onlineMrp: { type: Number, min: 0, default: 0 },
    offlineMrp: { type: Number, min: 0, default: 0 },

    taxPerItem: { type: Number, min: 0, default: 0 },
    unitTotal: { type: Number, min: 0, default: 0 },

    sizeMap: {
      type: Map,
      of: {
        qty: { type: Number, default: 0 },
        sku: { type: String, default: "" },
      },
      default: {},
    },
  },
  { _id: true }
);

const PurchaseOrderSchema = new mongoose.Schema(
  {
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
      index: true,
    },
    vendorName: { type: String, trim: true, default: "", index: true },

    // Allocated only on bill approval — absent (not "") until then.
    poNumber: { type: String, trim: true },
    referenceNumber: { type: String, trim: true, default: "" },

    date: { type: Date, required: true, index: true },
    deliveryDate: { type: Date },

    paymentTerms: { type: String, trim: true, default: "Due on Receipt" },
    shipmentPreference: { type: String, trim: true, default: "" },

    notes: { type: String, trim: true, default: "" },
    termsAndConditions: { type: String, trim: true, default: "" },

    items: { type: [PurchaseOrderItemSchema], default: [] },

    subTotal: { type: Number, min: 0, default: 0 },
    discountPercent: { type: Number, min: 0, max: 100, default: 0 },
    discountAmount: { type: Number, min: 0, default: 0 },
    totalTax: { type: Number, min: 0, default: 0 },
    total: { type: Number, min: 0, default: 0 },

    status: {
      type: String,
      enum: ["DRAFT", "SENT"],
      default: "DRAFT",
      index: true,
    },

    // ✅ bill workflow fields
    billStatus: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "PENDING",
      index: true,
    },
    billRemark: { type: String, trim: true, default: "" },
    billApprovedAt: { type: Date, default: null },
    billRejectedAt: { type: Date, default: null },

    isRevised: { type: Boolean, default: false },
    revisionCount: { type: Number, default: 0 },

    // ── Vendor payable — admin logs the vendor's actual invoice(s) once the
    // bill is approved, then records payments against the combined total as
    // they go out. A single PO can be invoiced more than once (e.g. partial
    // shipments billed separately), so this is a list, not one field — the
    // payable total is the sum of every entry's amount.
    invoices: {
      type: [
        {
          invoiceNumber: { type: String, trim: true, default: "" },
          invoiceAmount: { type: Number, min: 0, required: true },
          date: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    amountPaid: { type: Number, min: 0, default: 0 },
    paymentStatus: {
      type: String,
      enum: ["UNPAID", "PARTIAL", "PAID"],
      default: "UNPAID",
    },
    payments: {
      type: [
        {
          amount: { type: Number, required: true },
          date: { type: Date, default: Date.now },
          note: { type: String, trim: true, default: "" },
          recordedBy: { type: String, trim: true, default: "" },
        },
      ],
      default: [],
    },

    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

PurchaseOrderSchema.index(
  { poNumber: 1, isDeleted: 1 },
  { unique: true, partialFilterExpression: { poNumber: { $exists: true } } }
);
PurchaseOrderSchema.index({ isDeleted: 1, createdAt: -1 });
PurchaseOrderSchema.index({ isDeleted: 1, status: 1, createdAt: -1 });
PurchaseOrderSchema.index({ isDeleted: 1, vendorId: 1, createdAt: -1 });
PurchaseOrderSchema.index({ isDeleted: 1, billStatus: 1, createdAt: -1 });

module.exports = mongoose.model("PurchaseOrder", PurchaseOrderSchema);