/**
 * One-off migration — safe to re-run (idempotent).
 *
 * A MasterCatalog variant no longer carries its own `tag` (online/offline).
 * It was previously (incorrectly) used to gate which distributors could see
 * a variant and to decide which of onlineMrp/offlineMrp got updated — every
 * variant now always carries both prices, and the VIEWING distributor's own
 * tag (a separate, legitimate field on the Distributor/User model) decides
 * which one to display. This script strips the now-unused `variants.tag`
 * field from every MasterCatalog document.
 *
 * Usage:
 *   node src/scripts/removeVariantTagField.js            # dry run
 *   node src/scripts/removeVariantTagField.js --apply     # actually update
 */
require("dotenv").config();
const mongoose = require("mongoose");

const APPLY = process.argv.includes("--apply");

(async () => {
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
  console.log(`Mode: ${APPLY ? "APPLY (writing changes)" : "DRY RUN (report only)"}`);

  // Raw collection access — the Mongoose schema no longer defines this
  // field, so going through the model wouldn't touch it on save.
  const col = mongoose.connection.collection("mastercatalogs");

  const variantCount = await col.countDocuments({
    "variants.tag": { $exists: true },
  });
  console.log(`Articles with at least one variant-level tag: ${variantCount}`);

  if (APPLY) {
    const res = await col.updateMany(
      {},
      { $unset: { "variants.$[].tag": "" } }
    );
    console.log(`${res.modifiedCount} document(s) updated`);
  } else {
    console.log("\nDry run — rerun with --apply to write.");
  }

  await mongoose.disconnect();
})().catch((err) => {
  console.error("ERROR:", err);
  process.exit(1);
});
