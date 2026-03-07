const mongoose = require("mongoose");

const DistributorSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, required: true },
    email: { type: String, trim: true, lowercase: true, default: "" },
    phone: { type: String, trim: true, default: "" },

    companyName: { type: String, trim: true, required: true },
    gstNumber: { type: String, trim: true, uppercase: true, default: "" },

    billingAddress: { type: String, trim: true, default: "" },
    shippingAddress: { type: String, trim: true, default: "" },

    paymentTerms: { type: String, trim: true, default: "30 days" },
    discountPercentage: { type: Number, min: 0, max: 100, default: 0 },
    creditLimit: { type: Number, min: 0, default: 0 },

    location: { type: String, trim: true, default: "" },

    // login mapping
    loginEnabled: { type: Boolean, default: false },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    isActive: { type: Boolean, default: true, index: true },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

DistributorSchema.index({ companyName: 1, isDeleted: 1 });
DistributorSchema.index({ name: 1, isDeleted: 1 });
DistributorSchema.index({ email: 1, isDeleted: 1 });
DistributorSchema.index({ phone: 1, isDeleted: 1 });
DistributorSchema.index({ isDeleted: 1, isActive: 1, createdAt: -1 });

module.exports = mongoose.model("Distributor", DistributorSchema);