/**
 * Backfill product snapshots for legacy orders.
 *
 * Usage (from backend/):
 *   node src/scripts/backfillLegacyOrderSnapshots.js
 *   node src/scripts/backfillLegacyOrderSnapshots.js --apply
 *
 * Default mode is read-only. --apply only snapshots items whose current
 * catalog still contains the exact original articleId + variantId.
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const mongoose = require("mongoose");
const { backfillLegacyProductSnapshots } = require("../services/order.service");

const APPLY = process.argv.includes("--apply");

const main = async () => {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is not set in backend/.env");
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log(APPLY ? "MODE: APPLY (writing eligible snapshots)" : "MODE: DRY RUN (no data will be changed)");

  const report = await backfillLegacyProductSnapshots({ apply: APPLY });
  console.log("\nLegacy order snapshot report");
  console.table([{
    ordersScanned: report.ordersScanned,
    legacyItems: report.legacyItems,
    eligibleItems: report.eligibleItems,
    unresolvedItems: report.unresolvedItems,
    savedOrders: report.savedOrders,
  }]);

  if (report.unresolvedItemSamples.length) {
    console.log("Unresolved samples (left unchanged):");
    console.table(report.unresolvedItemSamples);
  }
};

main()
  .catch((error) => {
    console.error("Legacy snapshot backfill failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
