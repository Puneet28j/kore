/**
 * Dry-run by default.  Reports the stock/PO-derived availability for every
 * variant, then (only with --apply) removes obsolete catalogue stage fields
 * and maps legacy order lifecycle values to the current lifecycle.
 *
 * node src/scripts/migrateAvailabilityModel.js
 * node src/scripts/migrateAvailabilityModel.js --apply
 */
require("dotenv").config();
const mongoose = require("mongoose");
const MasterCatalog = require("../models/MasterCatalog");
const Order = require("../models/Order");
const catalogService = require("../services/masterCatalogService");

const APPLY = process.argv.includes("--apply");

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const [catalogs, planned, received] = await Promise.all([
    MasterCatalog.find({}).lean(),
    catalogService.getPoPlannedQtyMap(),
    catalogService.getGrnReceivedQtyMap(),
  ]);
  let variants = 0;
  for (const catalog of catalogs) for (const variant of catalog.variants || []) {
    variants++;
    const live = Object.values(variant.sizeMap || {}).reduce((s, c) => s + Math.max(0, Number(c?.qty || 0)), 0);
    const incoming = Math.max(0, Number(planned.totals[String(variant._id)] || 0) - Number(received.totals[String(variant._id)] || 0));
    console.log(`${catalog.articleName} / ${variant.itemName || variant.color}: ${live > 0 ? "RFD" : incoming > 0 ? "PREORDER" : "RFD (OUT OF STOCK)"} | live=${live}, incoming=${incoming}`);
  }
  console.log(`Mode: ${APPLY ? "APPLY" : "DRY RUN"}; variants: ${variants}`);
  if (APPLY) {
    await mongoose.connection.collection("mastercatalogs").updateMany({}, {
      $unset: { stage: "", expectedAvailableDate: "", "variants.$[].stage": "", "variants.$[].expectedAvailableDate": "" },
    });
    await Order.updateMany({ status: "PFD" }, { $set: { status: "DISPATCHED" } });
    await Order.updateMany({ status: { $in: ["RFD", "OFD"] } }, { $set: { status: "IN_TRANSIT" } });
    // Release stock that the old GRN workflow auto-reserved for pre-orders.
    // Only the undelivered portion is returned; dispatched pairs stay deducted.
    const activeOrders = await Order.find({ status: { $nin: ["RECEIVED", "CANCELLED"] } });
    const catalogCache = new Map();
    let releasedPairs = 0;
    for (const order of activeOrders) {
      let orderChanged = false;
      for (const item of order.items || []) {
        const reserved = item.preorderReservedSizeQuantities instanceof Map
          ? Object.fromEntries(item.preorderReservedSizeQuantities)
          : (item.preorderReservedSizeQuantities || {});
        if (!item.variantId || !Object.keys(reserved).length) continue;
        const id = String(item.variantId);
        let catalog = catalogCache.get(id);
        if (!catalog) {
          catalog = await MasterCatalog.findOne({ "variants._id": item.variantId });
          if (catalog) catalogCache.set(id, catalog);
        }
        const variant = catalog?.variants.id(item.variantId);
        if (!variant) continue;
        const fulfilled = item.fulfilledSizeQuantities instanceof Map
          ? Object.fromEntries(item.fulfilledSizeQuantities)
          : (item.fulfilledSizeQuantities || {});
        for (const [size, qty] of Object.entries(reserved)) {
          const release = Math.max(0, Number(qty || 0) - Number(fulfilled[size] || 0));
          if (!release) continue;
          const cell = variant.sizeMap.get(size) || { qty: 0, sku: "" };
          cell.qty = Number(cell.qty || 0) + release;
          variant.sizeMap.set(size, cell);
          releasedPairs += release;
        }
        // Released reservations must use the live-stock scan path from now
        // on.  Historical records stay intact; only their unscanned stock is
        // made freely available until an actual carton scan claims it.
        item.bookingType = "PREORDER";
        item.preorderReservedSizeQuantities = {};
        orderChanged = true;
        catalog.markModified("variants");
        await catalog.save();
      }
      if (orderChanged) await order.save();
    }
    console.log(`Removed stored availability fields, migrated lifecycle values, and released ${releasedPairs} old auto-reserved pair(s).`);
  }
  await mongoose.disconnect();
})().catch(async (err) => { console.error(err); await mongoose.disconnect(); process.exit(1); });
