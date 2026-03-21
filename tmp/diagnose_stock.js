const mongoose = require("mongoose");
const MasterCatalog = require("./backend/src/models/MasterCatalog");
const PurchaseOrder = require("./backend/src/models/PurchaseOrder");
const GRNDraft = require("./backend/src/models/grn.model");

async function diagnose() {
  await mongoose.connect("mongodb://localhost:27017/kore"); // Adjust if DB name is different
  
  const variantId = process.argv[2];
  if (!variantId) {
    console.log("Please provide a variantId");
    process.exit(1);
  }

  console.log(`Diagnosing for variantId: ${variantId}`);

  const catalog = await MasterCatalog.findOne({ "variants._id": variantId });
  if (!catalog) {
    console.log("Catalog/Variant not found");
    process.exit(1);
  }

  const variant = catalog.variants.id(variantId);
  console.log(`Variant: ${variant.itemName}, color: ${variant.color}`);
  console.log(`Sizes:`, Array.from(variant.sizeMap.keys()));
  
  const skus = Array.from(variant.sizeMap.values()).map(v => v.sku).filter(Boolean);
  console.log(`SKUs:`, skus);

  const sentPOs = await PurchaseOrder.find({
    "items.variantId": variantId.toString(),
    status: "SENT",
    isDeleted: false
  });
  console.log(`Found ${sentPOs.length} SENT POs`);
  sentPOs.forEach(po => {
    console.log(`- PO: ${po.poNumber}, items: ${po.items.length}`);
  });

  const allPOs = await PurchaseOrder.find({
    "items.variantId": variantId.toString(),
    isDeleted: false
  });
  console.log(`Found ${allPOs.length} total POs (any status)`);
  allPOs.forEach(po => {
    console.log(`- PO: ${po.poNumber}, status: ${po.status}`);
  });

  const submittedGRNs = await GRNDraft.find({
    status: "SUBMITTED",
    "cartons.pairBarcodes": { $in: skus }
  });
  console.log(`Found ${submittedGRNs.length} SUBMITTED GRNs with matching SKUs`);

  await mongoose.disconnect();
}

diagnose();
