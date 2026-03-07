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
    image: { type: String, trim: true, default: "" },

    sku: { type: String, trim: true, default: "" },
    skuCompany: { type: String, trim: true, default: "" },

    itemTaxCode: { type: String, trim: true, default: "" },
    quantity: { type: Number, min: 1, default: 1 },

    taxRate: { type: Number, min: 0, max: 100, default: 0 },
    taxType: { type: String, enum: ["GST", "IGST"], default: "GST" },

    basePrice: { type: Number, min: 0, default: 0 },
    mrp: { type: Number, min: 0, default: 0 },

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

    poNumber: { type: String, required: true, trim: true },
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

    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

PurchaseOrderSchema.index({ poNumber: 1, isDeleted: 1 }, { unique: true });
PurchaseOrderSchema.index({ isDeleted: 1, createdAt: -1 });
PurchaseOrderSchema.index({ isDeleted: 1, status: 1, createdAt: -1 });
PurchaseOrderSchema.index({ isDeleted: 1, vendorId: 1, createdAt: -1 });
PurchaseOrderSchema.index({ isDeleted: 1, billStatus: 1, createdAt: -1 });

module.exports = mongoose.model("PurchaseOrder", PurchaseOrderSchema);