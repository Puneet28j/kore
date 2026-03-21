const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const MasterCatalog = require("./models/MasterCatalog");

async function listAll() {
  await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/kore");
  
  const catalogs = await MasterCatalog.find({ isDeleted: false }).lean();
  console.log(`Found ${catalogs.length} catalogs`);
  
  catalogs.forEach(c => {
    console.log(`Catalog: ${c.articleName}`);
    (c.variants || []).forEach(v => {
      console.log(`  - Variant: ${v.itemName}, ID: ${v._id.toString()}`);
    });
  });

  await mongoose.disconnect();
}

listAll().catch(console.error);
