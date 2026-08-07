/**
 * Migration: regenerate per-pair (size) SKUs for all variants
 *
 * Strips gender letter (M/F/W/K) before the size range from the base so that
 * carton SKU "ARM-NVY-M-6-10" produces per-pair SKUs "ARM-NVY-6" … "ARM-NVY-10"
 * instead of the old "ARM-NVY-M-6" … "ARM-NVY-M-10".
 *
 * Run: node src/scripts/regenerateSizeSkus.js
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const mongoose = require("mongoose");
const MasterCatalog = require("../models/MasterCatalog");

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
    sizeKeys.forEach(sz => { result[sz] = `${base}${sz}`; });
  } else {
    sizeKeys.forEach(sz => { result[sz] = `${ctnSku}-${sz}`; });
  }
  return result;
}

(async () => {
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI not set in .env");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to:", process.env.MONGO_URI.split("@")[1]);

  const catalogs = await MasterCatalog.find({ isDeleted: false });
  console.log(`\nFound ${catalogs.length} catalog(s). Regenerating per-pair SKUs...`);

  let catalogsUpdated = 0;
  let variantsUpdated = 0;

  for (const catalog of catalogs) {
    let modified = false;

    for (const variant of catalog.variants) {
      const ctnSku = (variant.sku || "").trim();
      if (!ctnSku) continue;

      const sizeKeys = variant.sizeQuantities
        ? Array.from(variant.sizeQuantities.keys())
        : [];
      if (!sizeKeys.length) continue;

      const newSizeSkus = autoGenerateSizeSkus(ctnSku, variant.sizeRange || "", sizeKeys);

      for (const sz of sizeKeys) {
        const oldVal = variant.sizeSkus?.get ? variant.sizeSkus.get(sz) : (variant.sizeSkus?.[sz] || "");
        const newVal = newSizeSkus[sz] || "";
        if (oldVal !== newVal) {
          console.log(`  [${catalog.articleName}] variant "${variant.itemName || variant.color}" size ${sz}: "${oldVal}" → "${newVal}"`);
          if (variant.sizeSkus?.set) {
            variant.sizeSkus.set(sz, newVal);
          } else {
            if (!variant.sizeSkus) variant.sizeSkus = {};
            variant.sizeSkus[sz] = newVal;
          }
          // Also update sizeMap.sku if present
          if (variant.sizeMap?.get) {
            const cell = variant.sizeMap.get(sz);
            if (cell) { cell.sku = newVal; variant.sizeMap.set(sz, cell); }
          } else if (variant.sizeMap?.[sz]) {
            variant.sizeMap[sz].sku = newVal;
          }
          modified = true;
          variantsUpdated++;
        }
      }
    }

    if (modified) {
      catalog.markModified("variants");
      await catalog.save();
      catalogsUpdated++;
    }
  }

  console.log(`\n✅ Done. ${variantsUpdated} variant(s) updated across ${catalogsUpdated} catalog(s).`);
  process.exit(0);
})().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
