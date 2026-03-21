require("dotenv").config();
const mongoose = require("mongoose");
const MasterCatalog = require("./src/models/MasterCatalog");

const fs = require("fs");
const inspect = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const articles = await MasterCatalog.find({ articleName: { $exists: true } }).limit(20).lean();
  let log = "";
  articles.forEach(one => {
    log += `--- Article: ${one.articleName} ---\n`;
    log += `Primary Image URL: ${one.primaryImage?.url}\n`;
    if (one.colorMedia?.[0]) {
      log += `Color Media[0] Image URL: ${one.colorMedia[0].images?.[0]?.url}\n`;
    }
  });
  fs.writeFileSync("inspect_log.txt", log);
  console.log("✅ Log written to inspect_log.txt");
  process.exit(0);
};

inspect();
