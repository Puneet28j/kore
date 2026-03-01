const mongoose = require("mongoose");

// Size cell: har size ke andar qty + sku aata hai (UI me same dikh raha)
const SizeCellSchema = new mongoose.Schema(
  {
    qty: { type: Number, default: 0, min: 0 },
    sku: { type: String, trim: true, default: "" },
  },
  { _id: false }
);

const VariantSchema = new mongoose.Schema(
  {
    // UI: "runner-Red-5-7" type item name
    itemName: { type: String, required: true, trim: true },

    // UI: cost + selling + mrp + hsnCode
    costPrice: { type: Number, default: 0, min: 0 },
    sellingPrice: { type: Number, default: 0, min: 0 },
    mrp: { type: Number, default: 0, min: 0 },
    hsnCode: { type: String, trim: true, default: "" },

    // UI: variant level pe color + sizeRange
    color: { type: String, trim: true, default: "" },      // "Red", "Black"
    sizeRange: { type: String, trim: true, default: "" },  // "5-7", "7-11"

    // ✅ important: sizes ka object map (size => {qty, sku})
    // example: { "5": {qty:11, sku:"runner-Red-5"}, "6": {...} }
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
    // ---------- PART 1 (Top form) ----------
    articleName: { type: String, required: true, trim: true },
    soleColor: { type: String, trim: true, default: "" },
    mrp: { type: Number, required: true, min: 0 }, // ✅ UI me MRP top pe

    gender: {
      type: String,
      enum: ["MEN", "WOMEN", "KIDS", "UNISEX"],
      required: true,
    },

    // taxonomy
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: "Category", required: true },
    brandId: { type: mongoose.Schema.Types.ObjectId, ref: "Brand", required: true },

    // manufacturing
    manufacturerCompanyId: { type: mongoose.Schema.Types.ObjectId, ref: "Manufacturer", required: true },
    unitId: { type: mongoose.Schema.Types.ObjectId, ref: "Unit", required: true },

    // attributes
    productColors: [{ type: String, trim: true }], // ✅ UI: chips (Red, Black)
    sizeRanges: [{ type: String, trim: true }],    // ✅ UI: chips (5-7, 7-11)

    // listing status
    stage: { type: String, enum: ["AVAILABLE", "WISHLIST"], default: "AVAILABLE" },
    expectedAvailableDate: { type: Date }, // required if WISHLIST

    // media
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

    // ---------- PART 2 (variants table) ----------
    variants: { type: [VariantSchema], default: [] },

    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// ✅ Validation: wishlist me date required
MasterCatalogSchema.pre("validate", function () {
  if (this.stage === "WISHLIST" && !this.expectedAvailableDate) {
    this.invalidate(
      "expectedAvailableDate",
      "expectedAvailableDate is required when stage is WISHLIST"
    );
  }
});

module.exports = mongoose.model("MasterCatalog", MasterCatalogSchema);