/**
 * Read-only audit of the PO Pending calculation.
 *
 * PO Pending = approved PO planned pairs - scanned pairs in submitted GRNs.
 * No records are changed. Use this before correcting historical PO/GRN data.
 *
 * node src/scripts/auditPoPending.js
 * node src/scripts/auditPoPending.js --variant=<variantObjectId>
 */
require("dotenv").config();
const mongoose = require("mongoose");
const PurchaseOrder = require("../models/PurchaseOrder");
const GRNDraft = require("../models/grn.model");
const MasterCatalog = require("../models/MasterCatalog");

const requestedVariant = process.argv.find((arg) => arg.startsWith("--variant="))?.split("=")[1];

const itemPairs = (item) => {
  const cartons = Math.max(0, Number(item.cartonCount || 0)) || 1;
  const sizeMap = item.sizeMap && typeof item.sizeMap.toJSON === "function"
    ? item.sizeMap.toJSON() : (item.sizeMap || {});
  const breakupPairs = Object.values(sizeMap).reduce(
    (sum, cell) => sum + Math.max(0, Number(cell?.qty || 0)), 0
  );
  return breakupPairs > 0 ? cartons * breakupPairs : Math.max(0, Number(item.quantity || 0));
};

(async () => {
  await mongoose.connect(process.env.MONGO_URI);

  const [approvedPOs, submittedGRNs, catalogs] = await Promise.all([
    PurchaseOrder.find({ isDeleted: false, billStatus: "APPROVED" }).lean(),
    GRNDraft.find({ status: "SUBMITTED" }).lean(),
    MasterCatalog.find({ isDeleted: false }).select("articleName variants._id variants.itemName variants.color variants.sizeRange variants.sizeMap").lean(),
  ]);

  const approvedPoNumbers = new Set(approvedPOs.map((po) => String(po.poNumber || "")).filter(Boolean));
  const planned = {};
  const poRefs = {};
  const poLinePlanned = {};
  approvedPOs.forEach((po) => (po.items || []).forEach((item) => {
    if (!item.variantId) return;
    const id = String(item.variantId);
    const pairs = itemPairs(item);
    planned[id] = (planned[id] || 0) + pairs;
    poLinePlanned[`${po.poNumber}|${id}`] = (poLinePlanned[`${po.poNumber}|${id}`] || 0) + pairs;
    (poRefs[id] ||= new Set()).add(po.poNumber);
  }));

  const received = {};
  const poLineReceived = {};
  const unapprovedOrUnmatchedGrns = [];
  submittedGRNs.forEach((grn) => {
    const poBacked = grn.refType === "PO" && approvedPoNumbers.has(String(grn.refId || ""));
    (grn.cartons || []).forEach((carton) => {
      const pairs = (carton.pairBarcodes || []).length;
      if (!carton.variantId) return;
      const id = String(carton.variantId);
      if (!poBacked) {
        unapprovedOrUnmatchedGrns.push({ grnNo: grn.grnNo, refId: grn.refId, variantId: id, pairs });
        return;
      }
      received[id] = (received[id] || 0) + pairs;
      const lineKey = `${grn.refId}|${id}`;
      poLineReceived[lineKey] = (poLineReceived[lineKey] || 0) + pairs;
    });
  });

  const variants = [];
  catalogs.forEach((catalog) => (catalog.variants || []).forEach((variant) => {
    const id = String(variant._id);
    if (requestedVariant && requestedVariant !== id) return;
    const live = Object.values(variant.sizeMap || {}).reduce((sum, cell) => sum + Math.max(0, Number(cell?.qty || 0)), 0);
    const plannedPairs = planned[id] || 0;
    const receivedPairs = received[id] || 0;
    const pendingPairs = Math.max(0, plannedPairs - receivedPairs);
    variants.push({
      id, article: catalog.articleName, variant: `${variant.itemName || variant.color} ${variant.sizeRange || ""}`.trim(),
      plannedPairs, receivedPairs, pendingPairs, livePairs: live,
      status: receivedPairs > plannedPairs ? "OVER-RECEIVED" : plannedPairs === 0 && receivedPairs > 0 ? "RECEIPT-WITHOUT-APPROVED-PO" : "OK",
      poNumbers: Array.from(poRefs[id] || []).join(", "),
    });
  }));

  variants.sort((a, b) => a.article.localeCompare(b.article) || a.variant.localeCompare(b.variant));
  console.table(variants);
  const poLines = Object.entries(poLinePlanned).map(([key, plannedPairs]) => {
    const [poNumber, variantId] = key.split("|");
    const receivedPairs = poLineReceived[key] || 0;
    return {
      poNumber,
      variantId,
      originalPoPairs: plannedPairs,
      grnScannedPairs: receivedPairs,
      pendingPairs: Math.max(0, plannedPairs - receivedPairs),
      status: receivedPairs > plannedPairs ? "OVER-RECEIVED" : "OK",
    };
  });
  console.log("Per approved PO line — pending quantity must reduce as submitted GRNs are scanned:");
  console.table(poLines);
  console.log(`Approved POs: ${approvedPOs.length}; submitted GRNs: ${submittedGRNs.length}; audited variants: ${variants.length}`);
  console.log(`Flagged variants: ${variants.filter((row) => row.status !== "OK").length}`);
  if (unapprovedOrUnmatchedGrns.length) {
    console.log("Submitted GRN cartons excluded because their PO is not currently approved or could not be matched:");
    console.table(unapprovedOrUnmatchedGrns);
  }
  await mongoose.disconnect();
})().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
