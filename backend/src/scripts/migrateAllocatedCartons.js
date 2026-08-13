const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const mongoose = require("mongoose");
const MasterCatalog = require("../models/MasterCatalog");
const Order = require("../models/Order");

const APPLY = process.argv.includes("--apply");

(async () => {
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI not set in .env");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to:", process.env.MONGO_URI.split("@")[1]);
  console.log(APPLY ? "MODE: APPLY (will write changes)" : "MODE: DRY RUN (pass --apply to write)");
  console.log("");

  // Include all active orders that still have cartons left to scan
  const activeOrders = await Order.find({
    status: { $in: ["BOOKED", "PARTIAL", "PFD", "RFD"] },
  }).sort({ createdAt: 1 }); // oldest first — they get priority on the pool

  let itemsAllocated = 0;
  let itemsSkipped = 0;
  let itemsNoPool = 0;

  for (const order of activeOrders) {
    let orderModified = false;

    for (const item of order.items) {
      if (item.bookingType === "PREORDER") { itemsSkipped++; continue; }
      if (!item.variantId) { itemsSkipped++; continue; }
      if ((item.allocatedCartons || []).length > 0) { itemsSkipped++; continue; }

      const remaining = (item.cartonCount || 0) - (item.fulfilledCartonCount || 0);
      if (remaining <= 0) { itemsSkipped++; continue; }

      // Find the pool for this variant
      const variantCatalog = await MasterCatalog.findOne({ "variants._id": item.variantId });
      const variantDoc = variantCatalog?.variants.id(item.variantId);
      const pool = variantDoc?.availableCartons || [];

      if (pool.length === 0) {
        console.log(`  [NO POOL] Order ${order.orderNumber || order._id} / variant ${item.variantId} — pool empty, skipping`);
        itemsNoPool++;
        continue;
      }

      const toAllocate = pool.slice(0, remaining);
      console.log(
        `[${APPLY ? "APPLY" : "DRY RUN"}] Order ${order.orderNumber || order._id} (${order.distributorName})`
      );
      console.log(`  variant     : ${item.variantId}`);
      console.log(`  remaining   : ${remaining} carton(s)`);
      console.log(`  pool size   : ${pool.length}`);
      console.log(`  allocating  : ${toAllocate[0]} … ${toAllocate[toAllocate.length - 1]}`);
      console.log("");

      if (APPLY) {
        item.allocatedCartons = toAllocate;
        variantDoc.availableCartons = pool.slice(toAllocate.length);
        variantCatalog.markModified("variants");
        await variantCatalog.save();
        orderModified = true;
      }

      itemsAllocated++;
    }

    if (APPLY && orderModified) {
      order.markModified("items");
      await order.save();
    }
  }

  console.log("─────────────────────────────────────");
  console.log(`Items allocated  : ${itemsAllocated}`);
  console.log(`Items skipped    : ${itemsSkipped} (already allocated, preorder, or fulfilled)`);
  console.log(`Items no pool    : ${itemsNoPool} (variant had no carton pool — GRN/legacy)`);
  if (!APPLY) {
    console.log("\nThis was a dry run. Run with --apply to write changes.");
  }

  await mongoose.disconnect();
  process.exit(0);
})();
