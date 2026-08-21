/**
 * One-off migration — safe to re-run (idempotent).
 *
 * RFD/PreOrder is no longer a stored field — it's computed dynamically from
 * live stock (sizeMap.qty) + PO-pending (see masterCatalogService's
 * classifyVariantAvailability). This script strips the now-unused `stage`
 * and `expectedAvailableDate` fields (article-level and per-variant) from
 * every MasterCatalog document. Order documents are untouched — bookingType
 * stays as a persisted per-item field.
 *
 * Usage:
 *   node src/scripts/removeStageFields.js            # dry run
 *   node src/scripts/removeStageFields.js --apply     # actually update
 */
require("dotenv").config();
const mongoose = require("mongoose");

const APPLY = process.argv.includes("--apply");

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Mode: ${APPLY ? "APPLY (writing changes)" : "DRY RUN (report only)"}`);

  // Raw collection access — the Mongoose schema no longer defines these
  // fields, so going through the model wouldn't touch them on save.
  const col = mongoose.connection.collection("mastercatalogs");

  const articleCount = await col.countDocuments({
    $or: [{ stage: { $exists: true } }, { expectedAvailableDate: { $exists: true } }],
  });
  const variantCount = await col.countDocuments({
    $or: [
      { "variants.stage": { $exists: true } },
      { "variants.expectedAvailableDate": { $exists: true } },
    ],
  });
  console.log(`Articles with a stored article-level stage/expectedAvailableDate: ${articleCount}`);
  console.log(`Articles with at least one variant-level stage/expectedAvailableDate: ${variantCount}`);

  if (APPLY) {
    const res = await col.updateMany(
      {},
      {
        $unset: {
          stage: "",
          expectedAvailableDate: "",
          "variants.$[].stage": "",
          "variants.$[].expectedAvailableDate": "",
        },
      }
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
