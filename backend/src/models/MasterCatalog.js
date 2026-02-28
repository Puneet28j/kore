const mongoose = require("mongoose");

const VariantSchema = new mongoose.Schema(
  {
    itemName: { type: String, required: true, trim: true },   // "Item-Red-5-7"
    sku: { type: String, default: "Auto", trim: true },       // if you want auto later
    costPrice: { type: Number, default: 0, min: 0 },

    // ✅ sizes qty map (dynamic). Example: { "5": 0, "6": 0, "7": 0 }
    // We store only what UI sends. Order preserved by variants array.
    sizeQty: {
      type: Map,
      of: Number,
      default: {},
    },

    sellingPrice: { type: Number, default: 0, min: 0 },
    mrp: { type: Number, default: 0, min: 0 },
  },
  { _id: true }
);

const MasterCatalogSchema = new mongoose.Schema(
  {
    // -------- PART 1 ----------
    articleName: { type: String, required: true, trim: true },
    soleColor: { type: String, trim: true },
    gender: { type: String, enum: ["MEN", "WOMEN", "KIDS", "UNISEX"], required: true },

    // Common reusable refs (aapne already APIs bana di)
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: "Category", required: true },
    brandId: { type: mongoose.Schema.Types.ObjectId, ref: "Brand", required: true },
    manufacturerCompanyId: { type: mongoose.Schema.Types.ObjectId, ref: "Manufacturer", required: true },
    unitId: { type: mongoose.Schema.Types.ObjectId, ref: "Unit", required: true },

    stage: { type: String, enum: ["AVAILABLE", "WISHLIST"], default: "AVAILABLE" },
    expectedAvailableDate: { type: Date }, // required if WISHLIST

    primaryImage: {
      url: { type: String, required: true }, // stored file url or direct url
      key: { type: String }, // optional: filename/path
    },
    secondaryImages: [
      {
        url: { type: String },
        key: { type: String },
      },
    ],

    // -------- PART 2 ----------
    // exact UI order preserved
    variants: { type: [VariantSchema], default: [] },

    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// ✅ Conditional validation: wishlist => expectedAvailableDate required
MasterCatalogSchema.pre("validate", function (next) {
  if (this.stage === "WISHLIST" && !this.expectedAvailableDate) {
    this.invalidate("expectedAvailableDate", "expectedAvailableDate is required when stage is WISHLIST");
  }
  next();
});

module.exports = mongoose.model("MasterCatalog", MasterCatalogSchema);