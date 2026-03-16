const path = require("path");

// 👇 Force dotenv to load root .env file
require("dotenv").config({
  path: path.join(__dirname, "../../.env"),
});

const mongoose = require("mongoose");

(async () => {
  try {
    // ✅ Check env loaded
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI not found in .env");
    }

    await mongoose.connect(process.env.MONGO_URI);

    console.log("✅ MongoDB Connected for delete script");

    const db = mongoose.connection.db;

    const collections = await db.listCollections().toArray();

    if (!collections.length) {
      console.log("⚠️ No collections found in database");
      process.exit(0);
    }

    for (const collection of collections) {
      await db.collection(collection.name).deleteMany({});
      console.log(`🗑️ Cleared collection: ${collection.name}`);
    }

    console.log("🔥 All database data erased successfully");
    process.exit(0);
  } catch (e) {
    console.error("❌ Delete error:", e.message);
    process.exit(1);
  }
})();