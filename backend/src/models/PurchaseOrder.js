const mongoose = require("mongoose");

const PurchaseOrderItemSchema = new mongoose.Schema(
  {
    // frontend row id (poi-...)
    rowId: { type: String, trim: true, default: "" },

    articleId: { type: mongoose.Schema.Types.ObjectId, ref: "MasterCatalog", required: false },
    variantId: { type: mongoose.Schema.Types.ObjectId, required: false },

    itemName: { type: String, trim: true, default: "" },
    image: { type: String, trim: true, default: "" },

    sku: { type: String, trim: true, default: "" },
    skuCompany: { type: String, trim: true, default: "" }, // UI me brand/company

    itemTaxCode: { type: String, trim: true, default: "" }, // HSN
    quantity: { type: Number, min: 1, default: 1 },

    taxRate: { type: Number, min: 0, max: 100, default: 0 },
    taxType: { type: String, enum: ["GST", "IGST"], default: "GST" },

    basePrice: { type: Number, min: 0, default: 0 },

    // server computed (store snapshot)
    taxPerItem: { type: Number, min: 0, default: 0 },
    unitTotal: { type: Number, min: 0, default: 0 },
  },
  { _id: true }
);

const PurchaseOrderSchema = new mongoose.Schema(
  {
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", required: true },
    vendorName: { type: String, trim: true, default: "" }, // snapshot

    poNumber: { type: String, required: true, trim: true }, // "PO-00001"
    referenceNumber: { type: String, trim: true, default: "" },

    date: { type: Date, required: true },
    deliveryDate: { type: Date },

    paymentTerms: { type: String, trim: true, default: "Due on Receipt" },
    shipmentPreference: { type: String, trim: true, default: "" },

    notes: { type: String, trim: true, default: "" },
    termsAndConditions: { type: String, trim: true, default: "" },

    items: { type: [PurchaseOrderItemSchema], default: [] },

    // totals
    subTotal: { type: Number, min: 0, default: 0 },
    discountPercent: { type: Number, min: 0, max: 100, default: 0 },
    discountAmount: { type: Number, min: 0, default: 0 },
    totalTax: { type: Number, min: 0, default: 0 },
    total: { type: Number, min: 0, default: 0 },

    status: { type: String, enum: ["DRAFT", "SENT"], default: "DRAFT" },

    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

PurchaseOrderSchema.index({ poNumber: 1, isDeleted: 1 }, { unique: true });

module.exports = mongoose.model("PurchaseOrder", PurchaseOrderSchema);