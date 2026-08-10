/**
 * One-off repair script — run ONCE, not idempotent.
 *
 * Order booking now deducts MasterCatalog.variants[].sizeMap[size].qty
 * immediately (see adjustVariantStock in order.service.js). Orders placed
 * BEFORE that fix never had this deduction applied, so their stock is still
 * sitting in "live" even though it's already committed/dispatched.
 *
 * This script finds all orders that are booked-or-further-along but not yet
 * RECEIVED or CANCELLED (BOOKED, PARTIAL, PFD, RFD, OFD), and deducts their
 * ordered sizeQuantities from sizeMap.qty once.
 *
 * Usage:
 *   node src/scripts/retroactiveStockDeduction.js            # dry run
 *   node src/scripts/retroactiveStockDeduction.js --apply     # actually update
 */
require("dotenv").config();
const mongoose = require("mongoose");
const Order = require("../models/Order");
const MasterCatalog = require("../models/MasterCatalog");

const APPLY = process.argv.includes("--apply");
const ACTIVE_STATUSES = ["BOOKED", "PARTIAL", "PFD", "RFD", "OFD"];

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Mode: ${APPLY ? "APPLY (writing changes)" : "DRY RUN (report only)"}`);

  const orders = await Order.find({ status: { $in: ACTIVE_STATUSES } }).lean();
  console.log(`Found ${orders.length} active order(s) to check.`);

  // Aggregate total ordered qty per variant+size across all these orders.
  const perVariant = new Map(); // variantId -> { size: qty }
  for (const order of orders) {
    for (const item of order.items || []) {
      if (!item.variantId) continue;
      const key = String(item.variantId);
      const sizeQuantities = item.sizeQuantities instanceof Map
        ? Object.fromEntries(item.sizeQuantities)
        : (item.sizeQuantities || {});
      if (!perVariant.has(key)) perVariant.set(key, {});
      const bucket = perVariant.get(key);
      Object.entries(sizeQuantities).forEach(([size, qty]) => {
        bucket[size] = (bucket[size] || 0) + Number(qty || 0);
      });
    }
  }

  console.log(`Affects ${perVariant.size} distinct variant(s).`);

  let variantsUpdated = 0;
  for (const [variantId, sizeDeductions] of perVariant.entries()) {
    const catalog = await MasterCatalog.findOne({ "variants._id": variantId });
    if (!catalog) {
      console.log(`- variant ${variantId}: not found in catalog, skipping`);
      continue;
    }
    const variant = catalog.variants.id(variantId);
    if (!variant || !variant.sizeMap) continue;

    console.log(`- ${catalog.articleName} / ${variant.color} (${variant.sizeRange}):`);
    Object.entries(sizeDeductions).forEach(([size, qty]) => {
      const cell = variant.sizeMap.get(size);
      if (!cell) {
        console.log(`    size ${size}: not in sizeMap, skipping ${qty} pairs`);
        return;
      }
      const before = cell.qty || 0;
      const after = Math.max(0, before - qty);
      console.log(`    size ${size}: ${before} -> ${after} (-${qty})`);
      if (APPLY) {
        cell.qty = after;
        variant.sizeMap.set(size, cell);
      }
    });

    if (APPLY) {
      catalog.markModified("variants");
      await catalog.save();
    }
    variantsUpdated++;
  }

  console.log(`\nTotal: ${variantsUpdated} variant(s) ${APPLY ? "updated" : "would be updated (dry run — rerun with --apply to write)"}`);

  await mongoose.disconnect();
})().catch((err) => {
  console.error("ERROR:", err);
  process.exit(1);
});
