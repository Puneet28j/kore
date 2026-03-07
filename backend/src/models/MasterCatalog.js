const mongoose = require("mongoose");

// Size cell: har size ke andar qty + sku aata hai
const SizeCellSchema = new mongoose.Schema(
  {
    qty: { type: Number, default: 0, min: 0 },
    sku: { type: String, trim: true, default: "" },
  },
  { _id: false }
);

const VariantSchema = new mongoose.Schema(
  {
    itemName: { type: String, required: true, trim: true },

    costPrice: { type: Number, default: 0, min: 0 },
    sellingPrice: { type: Number, default: 0, min: 0 },
    mrp: { type: Number, default: 0, min: 0 },
    hsnCode: { type: String, trim: true, default: "" },

    color: { type: String, trim: true, default: "" },
    sizeRange: { type: String, trim: true, default: "" },

    sizeMap: {
      type: Map,
      of: SizeCellSchema,
      default: {},
    },
  },
  { _id: true }
);

const MasterCatalogSchema = new mongoose.Schema(
  {
    // ---------- PART 1 ----------
    articleName: { type: String, required: true, trim: true },
    soleColor: { type: String, trim: true, default: "" },
    mrp: { type: Number, required: true, min: 0 },

    gender: {
      type: String,
      enum: ["MEN", "WOMEN", "KIDS", "UNISEX"],
      required: true,
    },

    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    brandId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Brand",
      required: true,
    },

    manufacturerCompanyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Manufacturer",
      required: true,
    },
    unitId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Unit",
      required: true,
    },

    productColors: [{ type: String, trim: true }],
    sizeRanges: [{ type: String, trim: true }],

    stage: {
      type: String,
      enum: ["AVAILABLE", "WISHLIST"],
      default: "AVAILABLE",
    },
    expectedAvailableDate: { type: Date },

    // ✅ new active/inactive toggle field
    isActive: { type: Boolean, default: true, index: true },

    primaryImage: {
      url: { type: String, required: true },
      key: { type: String },
    },
    secondaryImages: [
      {
        url: { type: String },
        key: { type: String },
      },
    ],

    // ---------- PART 2 ----------
    variants: { type: [VariantSchema], default: [] },

    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

MasterCatalogSchema.pre("validate", function () {
  if (this.stage === "WISHLIST" && !this.expectedAvailableDate) {
    this.invalidate(
      "expectedAvailableDate",
      "expectedAvailableDate is required when stage is WISHLIST"
    );
  }
});

module.exports = mongoose.model("MasterCatalog", MasterCatalogSchema);
