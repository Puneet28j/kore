const mongoose = require("mongoose");

const AddressSchema = new mongoose.Schema(
  {
    attention: { type: String, trim: true, default: "" },
    country: { type: String, trim: true, default: "" },
    address1: { type: String, trim: true, default: "" },
    address2: { type: String, trim: true, default: "" },
    city: { type: String, trim: true, default: "" },
    state: { type: String, trim: true, default: "" },
    pinCode: { type: String, trim: true, default: "" },
    phone: { type: String, trim: true, default: "" },
    fax: { type: String, trim: true, default: "" },
  },
  { _id: false }
);

const BankDetailSchema = new mongoose.Schema(
  {
    rowId: { type: String, trim: true, default: "" },

    accountHolderName: { type: String, trim: true, default: "" },
    bankName: { type: String, trim: true, default: "" },
    accountNumber: { type: String, trim: true, default: "" },
    ifsc: { type: String, trim: true, uppercase: true, default: "" },
  },
  { _id: true }
);

const VendorSchema = new mongoose.Schema(
  {
    salutation: { type: String, trim: true, default: "" },
    firstName: { type: String, trim: true, default: "" },
    lastName: { type: String, trim: true, default: "" },

    companyName: { type: String, trim: true, default: "" },
    vendorCode: { type: String, trim: true, uppercase: true, default: "" },
    displayName: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true, default: "" },

    workPhone: { type: String, trim: true, default: "" },
    mobile: { type: String, trim: true, default: "" },
    gstNumber: { type: String, trim: true, uppercase: true, default: "" },
    cinNumber: { type: String, trim: true, uppercase: true, default: "" },
    pan: { type: String, trim: true, uppercase: true, default: "" },
    brand: { type: String, trim: true, default: "" },
    msmeRegistered: { type: Boolean, default: false },

    currency: { type: String, trim: true, default: "INR- Indian Rupee" },
    paymentTerms: { type: String, trim: true, default: "Due on Receipt" },
    tds: { type: String, trim: true, default: "" },

    enablePortal: { type: Boolean, default: false },

    billingAddress: { type: AddressSchema, default: () => ({}) },
    shippingAddress: { type: AddressSchema, default: () => ({}) },

    bankDetails: { type: [BankDetailSchema], default: [] },

    // ✅ active / inactive toggle
    isActive: { type: Boolean, default: true, index: true },

    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

VendorSchema.index({ displayName: 1, isDeleted: 1 });
VendorSchema.index({ companyName: 1, isDeleted: 1 });
VendorSchema.index({ email: 1, isDeleted: 1 });
VendorSchema.index({ isDeleted: 1, isActive: 1, createdAt: -1 });

module.exports = mongoose.model("Vendor", VendorSchema);