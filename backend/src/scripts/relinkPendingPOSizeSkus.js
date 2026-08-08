/**
 * One-off repair script.
 *
 * PurchaseOrder items snapshot their sizeMap (qty + per-size sku) from the
 * MasterCatalog variant at the time they were added to the PO. Now that
 * regenerateSizeSkus.js has fixed the master catalog's per-size SKUs
 * (stripping the gender letter, e.g. "ECH-BLK-M-5" -> "ECH-BLK-5"), POs
 * created before that fix still carry the old-format SKUs in their frozen
 * item snapshots.
 *
 * Already-approved POs (billStatus: APPROVED) are left untouched — they're
 * a finalized historical/financial record. This only touches POs still
 * PENDING approval, refreshing each item's sizeMap[size].sku (qty
 * untouched) from the current MasterCatalog variant via articleId+variantId.
 *
 * Usage:
 *   node src/scripts/relinkPendingPOSizeSkus.js          # dry run — report only
 *   node src/scripts/relinkPendingPOSizeSkus.js --apply  # actually update
 */
require("dotenv").config();
const mongoose = require("mongoose");
const PurchaseOrder = require("../models/PurchaseOrder");
const MasterCatalog = require("../models/MasterCatalog");

const APPLY = process.argv.includes("--apply");

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Mode: ${APPLY ? "APPLY (writing changes)" : "DRY RUN (report only)"}`);

  const pos = await PurchaseOrder.find({ isDeleted: false, billStatus: "PENDING" });
  console.log(`Found ${pos.length} pending (not yet approved) PO(s).`);

  const catalogCache = new Map();
  const getCatalog = async (articleId) => {
    const key = String(articleId);
    if (!catalogCache.has(key)) {
      catalogCache.set(key, await MasterCatalog.findById(articleId).lean());
    }
    return catalogCache.get(key);
  };

  let posChanged = 0;
  let itemsChanged = 0;

  for (const po of pos) {
    let touched = false;

    for (const item of po.items) {
      if (!item.articleId || !item.variantId) continue;
      const catalog = await getCatalog(item.articleId);
      if (!catalog) continue;
      const variant = (catalog.variants || []).find(
        (v) => String(v._id) === String(item.variantId)
      );
      if (!variant) continue;

      const variantSizeSkus = variant.sizeSkus instanceof Map
        ? Object.fromEntries(variant.sizeSkus)
        : (variant.sizeSkus || {});

      const itemSizeMap = item.sizeMap instanceof Map
        ? item.sizeMap
        : new Map(Object.entries(item.sizeMap || {}));

      let itemTouched = false;
      for (const [sz, cell] of itemSizeMap.entries()) {
        const correctSku = variantSizeSkus[sz];
        if (!correctSku) continue;
        const currentSku = cell?.sku || (cell?.toObject ? cell.toObject().sku : "") || "";
        if (currentSku === correctSku) continue;

        console.log(`- PO ${po.poNumber || `(draft ${po._id})`} / ${item.itemName} size ${sz}: "${currentSku}" -> "${correctSku}"`);
        itemTouched = true;
        if (APPLY) {
          const cellObj = cell?.toObject ? cell.toObject() : { ...cell };
          cellObj.sku = correctSku;
          if (item.sizeMap instanceof Map) item.sizeMap.set(sz, cellObj);
          else item.sizeMap[sz] = cellObj;
        }
      }

      if (itemTouched) {
        touched = true;
        itemsChanged++;
      }
    }

    if (touched) {
      posChanged++;
      if (APPLY) {
        po.markModified("items");
        await po.save();
      }
    }
  }

  console.log(`\nTotal: ${itemsChanged} item(s) across ${posChanged} pending PO(s) ${APPLY ? "updated" : "would be updated (dry run — rerun with --apply to write)"}`);

  await mongoose.disconnect();
})().catch((err) => {
  console.error("ERROR:", err);
  process.exit(1);
});
