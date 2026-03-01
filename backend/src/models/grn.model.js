const mongoose = require("mongoose");

const CartonSchema = new mongoose.Schema(
  {
    cartonBarcode: { type: String, required: true },
    pairBarcodes: { type: [String], default: [] },
    lockedAt: { type: Date, required: true },
  },
  { _id: false }
);

const GRNDraftSchema = new mongoose.Schema(
  {
    refType: { type: String, enum: ["PO", "CAT"], required: true },
    refId: { type: String, required: true }, // "PO-1023" or "CAT-2045"

    // scanning state
    currentPairs: { type: [String], default: [] },
    cartons: { type: [CartonSchema], default: [] },

    // fast duplicate block
    scannedSet: { type: [String], default: [] }, // store as array (set-like)

    cartonSerial: { type: Number, default: 1 },

    status: { type: String, enum: ["DRAFT", "SUBMITTED"], default: "DRAFT" },

    submittedAt: { type: Date, default: null },
    grnNo: { type: String, default: null },
  },
  { timestamps: true }
);

GRNDraftSchema.index({ refId: 1, status: 1 });
GRNDraftSchema.index({ grnNo: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("GRNDraft", GRNDraftSchema);