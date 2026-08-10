/**
 * One-off rename migration — safe to re-run (idempotent).
 *
 * The catalog stage value "WISHLIST" has been renamed to "PREORDER"
 * everywhere in code. This script updates the stored value in MongoDB to
 * match — both the article-level `stage` and every variant-level
 * `variants[].stage` override.
 *
 * Usage:
 *   node src/scripts/migrateWishlistToPreorder.js            # dry run
 *   node src/scripts/migrateWishlistToPreorder.js --apply     # actually update
 */
require("dotenv").config();
const mongoose = require("mongoose");

const APPLY = process.argv.includes("--apply");

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Mode: ${APPLY ? "APPLY (writing changes)" : "DRY RUN (report only)"}`);

  // Raw collection access — the Mongoose schema no longer allows "WISHLIST",
  // so going through the model would fail validation on save.
  const col = mongoose.connection.collection("mastercatalogs");

  const articleCount = await col.countDocuments({ stage: "WISHLIST" });
  const variantCount = await col.countDocuments({ "variants.stage": "WISHLIST" });
  console.log(`Articles with stage=WISHLIST: ${articleCount}`);
  console.log(`Articles containing variant-level stage=WISHLIST: ${variantCount}`);

  if (APPLY) {
    const res1 = await col.updateMany(
      { stage: "WISHLIST" },
      { $set: { stage: "PREORDER" } }
    );
    console.log(`Article-level: ${res1.modifiedCount} document(s) updated`);

    const res2 = await col.updateMany(
      { "variants.stage": "WISHLIST" },
      { $set: { "variants.$[v].stage": "PREORDER" } },
      { arrayFilters: [{ "v.stage": "WISHLIST" }] }
    );
    console.log(`Variant-level: ${res2.modifiedCount} document(s) updated`);
  } else {
    console.log("\nDry run — rerun with --apply to write.");
  }

  await mongoose.disconnect();
})().catch((err) => {
  console.error("ERROR:", err);
  process.exit(1);
});
