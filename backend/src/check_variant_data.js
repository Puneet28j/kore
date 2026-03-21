const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const PurchaseOrder = require("./models/PurchaseOrder");
const GRNDraft = require("./models/grn.model");
const MasterCatalog = require("./models/MasterCatalog");

async function check(variantId) {
  await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/kore");
  
  const catalog = await MasterCatalog.findOne({ "variants._id": variantId }).lean();
  if(!catalog) {
    console.log("Variant not found in Catalog");
    process.exit(0);
  }
  const variant = catalog.variants.find(v => v._id.toString() === variantId);
  console.log(`Variant: ${variant.itemName}, color: ${variant.color}`);
  
  const skus = Object.values(variant.sizeMap || {}).map(v => v.sku).filter(Boolean);
  console.log(`SKUs for this variant:`, skus);

  const pos = await PurchaseOrder.find({
    "items.variantId": variantId,
    isDeleted: false
  }).lean();
  console.log(`Found ${pos.length} POs for this variant`);
  pos.forEach(p => console.log(`  - PO ${p.poNumber}, status: ${p.status}, billStatus: ${p.billStatus}`));

  const grns = await GRNDraft.find({
    status: "SUBMITTED"
  }).lean();
  
  let foundGrns = 0;
  grns.forEach(g => {
    let match = false;
    (g.cartons || []).forEach(c => {
      (c.pairBarcodes || []).forEach(b => {
        if(skus.includes(b)) match = true;
      });
    });
    if(match) {
        foundGrns++;
        console.log(`  - Found matching GRN: ${g.grnNo || g._id}`);
    }
  });
  console.log(`Total matching SUBMITTED GRNs: ${foundGrns}`);

  await mongoose.disconnect();
}

check("67dda6e8d640cddb39a2c3b1");
