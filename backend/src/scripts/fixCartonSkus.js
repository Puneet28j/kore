const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const mongoose = require("mongoose");
const MasterCatalog = require("../models/MasterCatalog");
const GRNDraft = require("../models/grn.model");
const Order = require("../models/Order");

// Strips an article-code prefix like "SM00004-" from a SKU string.
// Pattern: 2+ uppercase letters followed by 4+ digits at the start, e.g. "SM00004-".
const stripArticlePrefix = (sku) => {
  if (!sku) return sku;
  return sku.replace(/^[A-Z]{2,}\d{4,}-/, "");
};

// Converts any old carton barcode variant to the new format: <SKU>-CT<4-digit>.
// Handles:
//   "SM00004-ZRO-BLK-M-7-11-C03"    → "ZRO-BLK-M-7-11-CT0003"
//   "ZRO-BLK-M-7-11-CT003"           → "ZRO-BLK-M-7-11-CT0003"
//   "ZRO-BLK-M-7-11-C0003"           → "ZRO-BLK-M-7-11-CT0003"
//   "ORDERNUM-ZRO-BLK-M-7-11-C01"   → "ZRO-BLK-M-7-11-CT0001"
const fixCartonBarcode = (barcode) => {
  if (!barcode) return barcode;
  // Match optional article/order prefix, then SKU, then -C or -CT, then digits
  const match = barcode.match(/^(?:[A-Z0-9]{2,}\d*-)?(.+?)-C(?:T)?(\d+)$/i);
  if (!match) return barcode;
  const skuPart = stripArticlePrefix(match[1]);
  const counter = parseInt(match[2], 10);
  return `${skuPart}-CT${String(counter).padStart(4, "0")}`;
};

(async () => {
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI not set in .env");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to:", process.env.MONGO_URI.split("@")[1]);

  // ── 1. Fix MasterCatalog variant SKUs ──────────────────────────────────────
  console.log("\n── MasterCatalog variant SKUs ──");
  const catalogs = await MasterCatalog.find({ isDeleted: false });
  let catalogsUpdated = 0;

  for (const catalog of catalogs) {
    let modified = false;

    for (const variant of catalog.variants) {
      const oldSku = variant.sku || "";
      const newSku = stripArticlePrefix(oldSku);

      if (newSku !== oldSku) {
        console.log(`  SKU: "${oldSku}" → "${newSku}"`);
        variant.sku = newSku;

        // Fix sizeSkus that also carry the prefix
        const entries = variant.sizeSkus instanceof Map
          ? [...variant.sizeSkus.entries()]
          : Object.entries(variant.sizeSkus || {});

        const fixed = {};
        for (const [size, sizeSku] of entries) {
          fixed[size] = stripArticlePrefix(sizeSku);
        }
        variant.sizeSkus = fixed;

        modified = true;
      }
    }

    if (modified) {
      catalog.markModified("variants");
      await catalog.save();
      catalogsUpdated++;
    }
  }
  console.log(`MasterCatalog: ${catalogsUpdated} catalog(s) updated.`);

  // ── 2. Fix GRN carton barcodes ─────────────────────────────────────────────
  console.log("\n── GRN carton barcodes ──");
  const grns = await GRNDraft.find({});
  let grnsUpdated = 0;

  for (const grn of grns) {
    let modified = false;

    for (const carton of grn.cartons) {
      const oldBarcode = carton.cartonBarcode || "";
      const newBarcode = fixCartonBarcode(oldBarcode);

      if (newBarcode !== oldBarcode) {
        console.log(`  GRN: "${oldBarcode}" → "${newBarcode}"`);
        carton.cartonBarcode = newBarcode;
        modified = true;
      }
    }

    if (modified) {
      grn.markModified("cartons");
      await grn.save();
      grnsUpdated++;
    }
  }
  console.log(`GRN records: ${grnsUpdated} GRN(s) updated.`);

  // ── 3. Fix Order outScannedCartons ─────────────────────────────────────────
  console.log("\n── Order outScannedCartons ──");
  const orders = await Order.find({ outScannedCartons: { $exists: true, $ne: [] } });
  let ordersUpdated = 0;

  for (const order of orders) {
    if (!order.outScannedCartons || order.outScannedCartons.length === 0) continue;

    const updated = order.outScannedCartons.map(fixCartonBarcode);
    const changed = updated.some((b, i) => b !== order.outScannedCartons[i]);

    if (changed) {
      updated.forEach((b, i) => {
        if (b !== order.outScannedCartons[i]) {
          console.log(`  Order ${order.orderNumber || order._id}: "${order.outScannedCartons[i]}" → "${b}"`);
        }
      });
      order.outScannedCartons = updated;
      await order.save();
      ordersUpdated++;
    }
  }
  console.log(`Orders: ${ordersUpdated} order(s) updated.`);

  console.log("\n✅ Migration complete.");
  process.exit(0);
})().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
