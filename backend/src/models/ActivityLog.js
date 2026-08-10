const mongoose = require("mongoose");

const activityLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    userName: { type: String, default: "System" },
    userRole: { type: String, default: "" },
    action: {
      type: String,
      enum: [
        "LOGIN",
        "PO_CREATED", "PO_UPDATED", "PO_APPROVED", "PO_REJECTED", "PO_DELETED",
        "ORDER_CREATED", "ORDER_STATUS_UPDATED",
        "PREORDER_RELEASED",
        "GRN_SUBMITTED",
        "DISTRIBUTOR_CREATED", "DISTRIBUTOR_UPDATED", "DISTRIBUTOR_DELETED",
        "CATALOG_CREATED", "CATALOG_UPDATED", "CATALOG_DELETED",
        "STOCK_INWARD", "STOCK_OUTWARD",
        "RETURN_PROCESSED",
        "PAYMENT_RECEIVED",
      ],
      required: true,
    },
    entityType: {
      type: String,
      enum: ["AUTH", "PO", "ORDER", "GRN", "DISTRIBUTOR", "CATALOG", "STOCK"],
      required: true,
    },
    entityId: { type: String, default: null },
    description: { type: String, required: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

activityLogSchema.index({ createdAt: -1 });
activityLogSchema.index({ userId: 1 });
activityLogSchema.index({ action: 1 });

module.exports = mongoose.model("ActivityLog", activityLogSchema);
