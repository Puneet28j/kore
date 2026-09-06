/**
 * One-off repair script.
 *
 * Every size is meant to be keyed as a plain unpadded number ("1", "2", not
 * "01", "02") across variant.sizeQuantities / sizeSkus / sizeMap. A bug in
 * the CSV bulk-import path (CatalogueManager.tsx's extractSizeQty, fixed
 * alongside this script) used a raw regex-captured size string straight
 * from a "size_02"-style column header as the object key, without
 * re-stringifying it as a number first — so some existing variants have
 * zero-padded keys ("02", "03") sitting next to normal ones ("4", "5") for
 * the very same size range, which then don't line up with the unpadded
 * columns the product-edit UI renders (that size just showed blank/empty).
 *
 * This script scans every MasterCatalog variant's sizeQuantities/sizeSkus/
 * sizeMap and renames any zero-padded numeric key to its canonical
 * unpadded form. If the canonical key already exists as well, the existing
 * (canonical) entry wins and the padded one is dropped — logged as a
 * conflict for manual review rather than silently overwritten.
 *
 * Usage:
 *   node src/scripts/fixZeroPaddedSizeKeys.js            # dry run — report only
 *   node src/scripts/fixZeroPaddedSizeKeys.js --apply    # actually update
 */
require("dotenv").config();
const mongoose = require("mongoose");
const MasterCatalog = require("../models/MasterCatalog");

const APPLY = process.argv.includes("--apply");

// A zero-padded numeric key: "02", "03", "011", but not "0" or "2" or "8.5".
const isZeroPadded = (key) => /^0\d/.test(key);
const canonicalize = (key) => String(Number(key));

function fixMap(mapLike, label, context) {
  if (!mapLike) return { changed: false, entries: null };
  const entries =
    mapLike instanceof Map ? Object.fromEntries(mapLike) : { ...mapLike };

  let changed = false;
  const next = { ...entries };

  Object.keys(entries).forEach((key) => {
    if (!isZeroPadded(key)) return;
    const canonical = canonicalize(key);
    if (Object.prototype.hasOwnProperty.call(entries, canonical)) {
      console.log(
        `  CONFLICT ${label} ${context}: both "${key}"=${JSON.stringify(
          entries[key]
        )} and "${canonical}"=${JSON.stringify(
          entries[canonical]
        )} exist — keeping "${canonical}", dropping "${key}"`
      );
      delete next[key];
      changed = true;
      return;
    }
    console.log(`  ${label} ${context}: "${key}" -> "${canonical}"`);
    next[canonical] = next[key];
    delete next[key];
    changed = true;
  });

  return { changed, entries: next };
}

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Mode: ${APPLY ? "APPLY (writing changes)" : "DRY RUN (report only)"}`);

  const catalogs = await MasterCatalog.find({ isDeleted: false });
  let variantsChanged = 0;
  let articlesChanged = 0;

  for (const catalog of catalogs) {
    let touched = false;

    for (const variant of catalog.variants) {
      const context = `${catalog.articleName} / ${variant.color} (${variant.sizeRange})`;

      const q = fixMap(variant.sizeQuantities, "sizeQuantities", context);
      const s = fixMap(variant.sizeSkus, "sizeSkus", context);
      const m = fixMap(variant.sizeMap, "sizeMap", context);

      if (!q.changed && !s.changed && !m.changed) continue;

      touched = true;
      variantsChanged++;

      if (APPLY) {
        if (q.changed) variant.sizeQuantities = q.entries;
        if (s.changed) variant.sizeSkus = s.entries;
        if (m.changed) variant.sizeMap = m.entries;
      }
    }

    if (touched) {
      articlesChanged++;
      if (APPLY) {
        catalog.markModified("variants");
        await catalog.save();
      }
    }
  }

  console.log(
    `\nTotal: ${variantsChanged} variant(s) across ${articlesChanged} article(s) ${
      APPLY ? "updated" : "would be updated (dry run — rerun with --apply to write)"
    }`
  );

  await mongoose.disconnect();
})().catch((err) => {
  console.error("ERROR:", err);
  process.exit(1);
});
