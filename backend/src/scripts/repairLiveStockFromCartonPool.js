/**
 * Reconciles historical GRN stock with the physical free-carton pool.
 *
 * A submitted GRN may have created every carton code while an older barcode
 * matching path added stock for only some cartons. For each variant, this
 * script compares free pool codes with whole cartons supported by sizeMap.
 * It only fills a shortage; it never deducts stock, POs, GRNs, or orders.
 *
 * Dry run: node src/scripts/repairLiveStockFromCartonPool.js
 * Apply:   node src/scripts/repairLiveStockFromCartonPool.js --apply
 */
require("dotenv").config();
const mongoose = require("mongoose");
const MasterCatalog = require("../models/MasterCatalog");

const APPLY = process.argv.includes("--apply");

const asObject = (value) =>
  value && typeof value.toJSON === "function" ? value.toJSON() : (value || {});

const getWholeCartons = (sizeMap, breakup) => {
  let cartons = Infinity;
  let hasBreakup = false;
  for (const [size, perCartonRaw] of Object.entries(breakup)) {
    const perCarton = Number(perCartonRaw || 0);
    if (perCarton <= 0) continue;
    hasBreakup = true;
    cartons = Math.min(cartons, Math.floor(Math.max(0, Number(sizeMap[size]?.qty || 0)) / perCarton));
  }
  return hasBreakup && cartons !== Infinity ? Math.max(0, cartons) : null;
};

(async () => {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not set");
  await mongoose.connect(process.env.MONGO_URI);

  const catalogs = await MasterCatalog.find({ isDeleted: false });
  let checked = 0;
  let repairedVariants = 0;
  let restoredCartons = 0;
  let restoredPairs = 0;
  let skippedWithoutBreakup = 0;

  for (const catalog of catalogs) {
    let changed = false;
    for (const variant of catalog.variants || []) {
      checked++;
      const poolCartons = (variant.availableCartons || []).length;
      if (poolCartons === 0) continue;

      const breakup = asObject(variant.sizeQuantities);
      const sizeMap = asObject(variant.sizeMap);
      const liveCartons = getWholeCartons(sizeMap, breakup);
      if (liveCartons === null) {
        skippedWithoutBreakup++;
        console.log(`[SKIP] ${catalog.articleName} / ${variant.itemName || variant.color}: pool=${poolCartons}; no carton size breakup`);
        continue;
      }

      const missingCartons = Math.max(0, poolCartons - liveCartons);
      if (missingCartons === 0) continue;

      const pairsToRestore = Object.values(breakup).reduce(
        (sum, qty) => sum + missingCartons * Math.max(0, Number(qty || 0)),
        0
      );
      console.log(
        `[${APPLY ? "APPLY" : "DRY RUN"}] ${catalog.articleName} / ${variant.itemName || variant.color}` +
        ` | pool=${poolCartons} ctn, live=${liveCartons} ctn, restoring=${missingCartons} ctn (${pairsToRestore} prs)`
      );

      if (APPLY) {
        for (const [size, perCartonRaw] of Object.entries(breakup)) {
          const perCarton = Math.max(0, Number(perCartonRaw || 0));
          if (perCarton <= 0) continue;
          const cell = variant.sizeMap.get(size) || { qty: 0, sku: "" };
          cell.qty = Math.max(0, Number(cell.qty || 0)) + missingCartons * perCarton;
          variant.sizeMap.set(size, cell);
        }
        changed = true;
      }

      repairedVariants++;
      restoredCartons += missingCartons;
      restoredPairs += pairsToRestore;
    }
    if (APPLY && changed) {
      catalog.markModified("variants");
      await catalog.save();
    }
  }

  console.log(`Mode: ${APPLY ? "APPLY" : "DRY RUN"}; checked variants: ${checked}; affected variants: ${repairedVariants}; restored: ${restoredCartons} cartons / ${restoredPairs} pairs; skipped without breakup: ${skippedWithoutBreakup}`);
  await mongoose.disconnect();
})().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
