const mongoose = require("mongoose");

const UnitSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },   // Pairs, Cartons, Pieces
    symbol: { type: String, trim: true, default: "" },    // prs, ctn, pcs

    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

UnitSchema.index(
  { name: 1, isDeleted: 1 },
  { unique: true, collation: { locale: "en", strength: 2 } }
);

module.exports = mongoose.model("Unit", UnitSchema);