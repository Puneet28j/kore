require("dotenv").config();
const mongoose = require("mongoose");
const MasterCatalog = require("../models/MasterCatalog");
const PurchaseOrder = require("../models/PurchaseOrder");

const repairUrls = async () => {
  try {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      console.error("❌ MONGO_URI not found in .env");
      process.exit(1);
    }

    await mongoose.connect(mongoUri);
    console.log("✅ Connected to MongoDB");

    // helper to strip host
    const toRelative = (url) => {
      if (!url || !url.startsWith("http")) return url;
      try {
        const u = new URL(url);
        // remove leading slash from pathname
        return u.pathname.startsWith("/") ? u.pathname.slice(1) : u.pathname;
      } catch (e) {
        return url;
      }
    };

    // 1. Repair MasterCatalog
    const articles = await MasterCatalog.find({});
    console.log(`🔍 Checking ${articles.length} articles...`);
    let articleCount = 0;

    for (const art of articles) {
      let modified = false;

      if (art.primaryImage?.url && art.primaryImage.url.startsWith("http")) {
        art.primaryImage.url = toRelative(art.primaryImage.url);
        modified = true;
      }

      if (art.secondaryImages && art.secondaryImages.length > 0) {
        art.secondaryImages.forEach((img) => {
          if (img.url && img.url.startsWith("http")) {
            img.url = toRelative(img.url);
            modified = true;
          }
        });
      }

      if (art.colorMedia && art.colorMedia.length > 0) {
        art.colorMedia.forEach((cm) => {
          if (cm.images && cm.images.length > 0) {
            cm.images.forEach((img) => {
              if (img.url && img.url.startsWith("http")) {
                img.url = toRelative(img.url);
                modified = true;
              }
            });
          }
        });
      }

      if (modified) {
        await MasterCatalog.updateOne({ _id: art._id }, { 
          primaryImage: art.primaryImage,
          secondaryImages: art.secondaryImages,
          colorMedia: art.colorMedia
        });
        articleCount++;
      }
    }
    console.log(`✅ Repaired ${articleCount} articles.`);

    // 2. Repair PurchaseOrder
    const pos = await PurchaseOrder.find({});
    console.log(`🔍 Checking ${pos.length} Purchase Orders...`);
    let poCount = 0;

    for (const po of pos) {
      let modified = false;
      if (po.items && po.items.length > 0) {
        po.items.forEach((it) => {
          if (it.image && it.image.startsWith("http")) {
            it.image = toRelative(it.image);
            modified = true;
          }
        });
      }

      if (modified) {
        await PurchaseOrder.updateOne({ _id: po._id }, { items: po.items });
        poCount++;
      }
    }
    console.log(`✅ Repaired ${poCount} Purchase Orders.`);

    console.log("🏁 Repair completed successfully.");
    process.exit(0);
  } catch (error) {
    console.error("❌ Repair failed:", error);
    process.exit(1);
  }
};

repairUrls();
