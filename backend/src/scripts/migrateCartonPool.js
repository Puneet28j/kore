const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const mongoose = require("mongoose");
const MasterCatalog = require("../models/MasterCatalog");
const Order = require("../models/Order");
const Counter = require("../models/Counter");

const APPLY = process.argv.includes("--apply");

// Calculate how many whole cartons a variant's sizeMap represents.
// Takes the minimum across all sizes (the binding constraint for full cartons).
const freeCartonsFromSizeMap = (variant) => {
  const sizeMap = variant.sizeMap instanceof Map
    ? Object.fromEntries(variant.sizeMap)
    : (variant.sizeMap || {});
  const sizeQuantities = variant.sizeQuantities instanceof Map
    ? Object.fromEntries(variant.sizeQuantities)
    : (variant.sizeQuantities || {});

  let minCartons = Infinity;
  let hasSize = false;

  for (const [size, perCarton] of Object.entries(sizeQuantities)) {
    const qtyPerCarton = Number(perCarton || 0);
    if (qtyPerCarton <= 0) continue;
    const cell = sizeMap[size];
    const qty = Number(cell?.qty || 0);
    hasSize = true;
    minCartons = Math.min(minCartons, Math.floor(qty / qtyPerCarton));
  }

  return hasSize && minCartons !== Infinity ? Math.max(0, minCartons) : 0;
};

(async () => {
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI not set in .env");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to:", process.env.MONGO_URI.split("@")[1]);
  console.log(APPLY ? "MODE: APPLY (will write changes)" : "MODE: DRY RUN (pass --apply to write)");
  console.log("");

  // Pre-load all active orders (including in-transit) once to avoid N+1 queries
  const activeOrders = await Order.find(
    { status: { $in: ["BOOKED", "PARTIAL", "PFD", "RFD"] } },
    { items: 1 }
  ).lean();

  // Build a map: variantId (string) → unshipped booked cartons count
  const bookedCartonsMap = {};
  for (const order of activeOrders) {
    for (const item of order.items || []) {
      if (item.bookingType !== "REGULAR") continue;
      const vid = item.variantId?.toString();
      if (!vid) continue;
      const unshipped = Math.max(0, (item.cartonCount || 0) - (item.fulfilledCartonCount || 0));
      if (unshipped > 0) {
        bookedCartonsMap[vid] = (bookedCartonsMap[vid] || 0) + unshipped;
      }
    }
  }

  const catalogs = await MasterCatalog.find({});
  let variantsProcessed = 0;
  let variantsSkipped = 0;

  for (const catalog of catalogs) {
    let catalogModified = false;

    for (const variant of catalog.variants) {
      const variantId = variant._id.toString();

      // Skip variants that already have a pool — already migrated or filled by new inward
      if ((variant.availableCartons || []).length > 0) {
        variantsSkipped++;
        continue;
      }

      const cartonSku = variant.sku || variant.itemName || "CTN";

      // Part A: free (unallocated) stock
      const freeCartons = freeCartonsFromSizeMap(variant);

      // Part B: cartons physically in warehouse but already allocated to BOOKED/PARTIAL orders
      const bookedCartons = bookedCartonsMap[variantId] || 0;

      const total = freeCartons + bookedCartons;

      if (total === 0) {
        variantsSkipped++;
        continue;
      }

      const codes = Array.from({ length: total }, (_, i) =>
        `${cartonSku}-CT${String(i + 1).padStart(4, "0")}`
      );

      console.log(
        `[${APPLY ? "APPLY" : "DRY RUN"}] ${catalog.articleName} / ${variant.itemName || variant.color} (id: ${variantId})`
      );
      console.log(`  carton SKU  : ${cartonSku}`);
      console.log(`  free stock  : ${freeCartons} carton(s)`);
      console.log(`  booked+unshipped: ${bookedCartons} carton(s)`);
      console.log(`  total pool  : ${total}  →  ${codes[0]} … ${codes[codes.length - 1]}`);
      console.log("");

      if (APPLY) {
        variant.availableCartons = codes;
        catalogModified = true;

        // Set counter to total using $max so we never move it backwards
        // if a real inward already ran for this variant after the code change
        await Counter.findOneAndUpdate(
          { id: `carton-serial-${variantId}` },
          { $max: { seq: total } },
          { upsert: true }
        );
      }

      variantsProcessed++;
    }

    if (APPLY && catalogModified) {
      catalog.markModified("variants");
      await catalog.save();
    }
  }

  console.log("─────────────────────────────────────");
  console.log(`Variants processed : ${variantsProcessed}`);
  console.log(`Variants skipped   : ${variantsSkipped} (already had pool or zero stock)`);
  if (!APPLY) {
    console.log("\nThis was a dry run. Run with --apply to write changes.");
  }

  await mongoose.disconnect();
  process.exit(0);
})();
