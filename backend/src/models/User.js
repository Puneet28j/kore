const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    password: { type: String, required: true, select: false },
    passwordPlain: { type: String, default: "" },

    role: {
      type: String,
      default: "manager",
      index: true,
    },

    phone: { type: String, default: null, trim: true },

    // ✅ link distributor business profile
    distributorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Distributor",
      default: null,
      index: true,
    },

    isActive: { type: Boolean, default: true, index: true },
    // Increment this on password reset → invalidates all existing JWTs
    tokenVersion: { type: Number, default: 0 },
  },
  { timestamps: true }
);

userSchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform: function (doc, ret) {
    ret.id = ret._id;
    delete ret._id;
  },
});

module.exports = mongoose.model("User", userSchema);