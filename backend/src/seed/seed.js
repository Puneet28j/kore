const path = require("path");

// 👇 Force dotenv to load root .env file
require("dotenv").config({
  path: path.join(__dirname, "../../.env"),
});

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../models/User");

(async () => {
  try {
    // ✅ Check env loaded
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI not found in .env");
    }

    await mongoose.connect(process.env.MONGO_URI);

    console.log("✅ MongoDB Connected for seeding");

    const email = process.env.SUPERADMIN_EMAIL;
    const password = process.env.SUPERADMIN_PASSWORD;

    if (!email || !password) {
      throw new Error("SUPERADMIN_EMAIL or SUPERADMIN_PASSWORD missing in .env");
    }

    const exists = await User.findOne({ email });
    if (exists) {
      console.log("✅ Super Admin already exists:", email);
      process.exit(0);
    }

    const hashed = await bcrypt.hash(password, 10);

    await User.create({
      name: "Super Admin",
      email,
      password: hashed,
      role: "superadmin",
    });

    console.log("🔥 Super Admin seeded successfully:", email);
    process.exit(0);
  } catch (e) {
    console.error("❌ Seed error:", e.message);
    process.exit(1);
  }
})();