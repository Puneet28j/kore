const mongoose = require('mongoose');
const MONGODB_URI = 'mongodb://localhost:27017/kore';

async function inspect() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to DB');

  const MasterCatalog = mongoose.model('MasterCatalog', new mongoose.Schema({}, { strict: false }), 'mastercatalogs');
  const PurchaseOrder = mongoose.model('PurchaseOrder', new mongoose.Schema({}, { strict: false }), 'purchaseorders');
  const GRNDraft = mongoose.model('GRNDraft', new mongoose.Schema({}, { strict: false }), 'grndrafts');

  // 1. Find the article
  const article = await MasterCatalog.findOne({ articleName: /Armour/i });
  if (!article) {
    console.log('--- ARTICLE NOT FOUND ---');
  } else {
    console.log('--- ARTICLE ---');
    console.log(`ID: ${article._id}`);
    console.log(`Name: ${article.articleName}`);
    console.log(`Variants:`, JSON.stringify(article.variants?.map(v => ({ id: v._id, color: v.color, skus: v.sizeMap ? Object.values(v.sizeMap).map(s => s.sku) : [] })), null, 2));
  }

  // 2. Find ALL POs
  console.log('\n--- ALL POs ---');
  const allPos = await PurchaseOrder.find({ isDeleted: false }).lean();
  allPos.forEach(po => {
    console.log(`PO: ${po.poNumber}, Status: ${po.status}, BillStatus: ${po.billStatus}`);
    po.items.forEach(item => {
      console.log(`  - Item: "${item.itemName}", articleId: ${item.articleId}, variantId: ${item.variantId}, qty: ${item.quantity}, cartonCount: ${item.cartonCount}`);
    });
  });

  // 3. Find ALL Submitted GRNs
  console.log('\n--- SUBMITTED GRNs ---');
  const allGrns = await GRNDraft.find({ status: 'SUBMITTED' }).lean();
  allGrns.forEach(grn => {
    console.log(`GRN: ${grn.grnNo}, refId: ${grn.refId}, refType: ${grn.refType}`);
    grn.cartons.forEach(c => {
      console.log(`  - Carton Barcode: ${c.cartonBarcode}, Pairs: ${c.pairBarcodes.length}`);
      console.log(`    SKUs: ${c.pairBarcodes.slice(0, 3).join(', ')} ...`);
    });
  });

  await mongoose.disconnect();
}

inspect().catch(console.error);
