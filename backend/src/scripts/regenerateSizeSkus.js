/**
 * One-off repair script.
 *
 * Per-size SKUs used to be derived by stripping only the trailing size-range
 * from the carton SKU (e.g. "ECH-BLK-M-5-8" -> "ECH-BLK-M-5"), leaving the
 * single-letter gender code ("M"/"W"/"K") baked into every per-pair SKU.
 * The generation logic (frontend + backend) now also strips that gender
 * segment ("ECH-BLK-M-5-8" -> "ECH-BLK-5"), but existing MasterCatalog
 * variants were never regenerated, so PO/GRN/exports — which read the
 * stored sizeSkus/sizeMap directly — still show the old format.
 *
 * This script regenerates variant.sizeSkus and variant.sizeMap[size].sku
 * for every MasterCatalog variant from its current carton sku + sizeRange,
 * leaving qty/blockedQty and everything else untouched.
 *
 * Usage:
 *   node src/scripts/regenerateSizeSkus.js            # dry run — report only
 *   node src/scripts/regenerateSizeSkus.js --apply     # actually update
 */
require("dotenv").config();
const mongoose = require("mongoose");
const MasterCatalog = require("../models/MasterCatalog");

const APPLY = process.argv.includes("--apply");

// Mirrors autoGenerateSizeSkus/stripGenderFromBase in masterCatalogService.js
function stripGenderFromBase(base) {
  const withoutTrail = base.endsWith("-") ? base.slice(0, -1) : base;
  const segments = withoutTrail.split("-");
  const last = segments[segments.length - 1] || "";
  if (last.length === 1 && /^[A-Za-z]$/.test(last)) {
    return withoutTrail.slice(0, -(last.length + 1)) + "-";
  }
  return base;
}

function autoGenerateSizeSkus(ctnSku, sizeRange, sizeKeys) {
  if (!ctnSku || !sizeKeys.length) return {};
  const result = {};
  let base = null;
  if (sizeRange && ctnSku.endsWith(sizeRange)) {
    base = ctnSku.slice(0, ctnSku.length - sizeRange.length);
  }
  if (base === null) {
    const m = ctnSku.match(/^(.*)-\d+-\d+$/);
    if (m) base = m[1] + "-";
  }
  if (base !== null) {
    base = stripGenderFromBase(base);
    sizeKeys.forEach((sz) => { result[sz] = `${base}${sz}`; });
  } else {
    sizeKeys.forEach((sz) => { result[sz] = `${ctnSku}-${sz}`; });
  }
  return result;
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
      const ctnSku = (variant.sku || "").trim();
      const sizeRange = (variant.sizeRange || "").trim();
      const sizeKeys = variant.sizeQuantities instanceof Map
        ? [...variant.sizeQuantities.keys()]
        : Object.keys(variant.sizeQuantities || {});
      if (!ctnSku || !sizeKeys.length) continue;

      const regen = autoGenerateSizeSkus(ctnSku, sizeRange, sizeKeys);

      const currentSizeSkus = variant.sizeSkus instanceof Map
        ? Object.fromEntries(variant.sizeSkus)
        : { ...(variant.sizeSkus || {}) };

      const diffs = sizeKeys.filter((sz) => (currentSizeSkus[sz] || "") !== (regen[sz] || ""));
      if (!diffs.length) continue;

      touched = true;
      variantsChanged++;
      console.log(`- ${catalog.articleName} / ${variant.color} (${ctnSku}, ${sizeRange}):`);
      diffs.forEach((sz) => console.log(`    size ${sz}: "${currentSizeSkus[sz] || ""}" -> "${regen[sz]}"`));

      if (APPLY) {
        sizeKeys.forEach((sz) => {
          if (variant.sizeSkus instanceof Map) variant.sizeSkus.set(sz, regen[sz]);
          else { variant.sizeSkus = variant.sizeSkus || {}; variant.sizeSkus[sz] = regen[sz]; }

          if (variant.sizeMap instanceof Map) {
            const cell = variant.sizeMap.get(sz);
            if (cell) variant.sizeMap.set(sz, { ...(cell.toObject ? cell.toObject() : cell), sku: regen[sz] });
          } else if (variant.sizeMap && variant.sizeMap[sz]) {
            variant.sizeMap[sz].sku = regen[sz];
          }
        });
      }
    }

    if (touched) {
      articlesChanged++;
      if (APPLY) await catalog.save();
    }
  }

  console.log(`\nTotal: ${variantsChanged} variant(s) across ${articlesChanged} article(s) ${APPLY ? "updated" : "would be updated (dry run — rerun with --apply to write)"}`);

  await mongoose.disconnect();
})().catch((err) => {
  console.error("ERROR:", err);
  process.exit(1);
});
