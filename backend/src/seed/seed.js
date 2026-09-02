const path = require("path");

// 👇 Force dotenv to load root .env file
require("dotenv").config({
  path: path.join(__dirname, "../../.env"),
});

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Distributor = require("../models/Distributor");
const distributorService = require("../services/distributor.service");
const Vendor = require("../models/Vendor");

(async () => {
  try {
    // ✅ Check env loaded
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI not found in .env");
    }

    await mongoose.connect(process.env.MONGO_URI);

    console.log("✅ MongoDB Connected for seeding");

    // 1️⃣ Seed Super Admin
    const superEmail = process.env.SUPERADMIN_EMAIL;
    const superPassword = process.env.SUPERADMIN_PASSWORD;

    if (!superEmail || !superPassword) {
      throw new Error("SUPERADMIN_EMAIL or SUPERADMIN_PASSWORD missing in .env");
    }

    const superExists = await User.findOne({ email: superEmail });
    if (!superExists) {
      const hashed = await bcrypt.hash(superPassword, 10);
      await User.create({
        name: "Super Admin",
        email: superEmail,
        password: hashed,
        role: "superadmin",
      });
      console.log("🔥 Super Admin seeded successfully:", superEmail);
    } else {
      console.log("✅ Super Admin already exists:", superEmail);
    }

    // 2️⃣ Seed Admin
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (adminEmail && adminPassword) {
      const adminExists = await User.findOne({ email: adminEmail });
      if (!adminExists) {
        const hashedAdmin = await bcrypt.hash(adminPassword, 10);
        await User.create({
          name: "Admin",
          email: adminEmail,
          password: hashedAdmin,
          role: "admin",
        });
        console.log("🔥 Admin seeded successfully:", adminEmail);
      } else {
        console.log("✅ Admin already exists:", adminEmail);
      }
    }

    // Shared contact/address for the "Toucan Toes / Amit Singh" seed data —
    // company name isn't given explicitly; inferred from the toucantoes.com
    // email domain (matches the "Toucan Toes" brand already used elsewhere
    // in this app's seeded data). Override via .env if that's wrong.
    const toucanCompanyName = process.env.DISTRIBUTOR_COMPANY_NAME || "Toucan Toes";
    const toucanEmail = process.env.DISTRIBUTOR_EMAIL || "amitsingh@toucantoes.com";
    const toucanAddress = {
      attention: "",
      address1:
        "Killa No. 42//18/2, 19/3, 21/2/2, 22/1, 22/2, 23, 45//1/2, Village Gudhi, Bilaspur-Tauru Road Tehsil Tauru",
      address2: "",
      city: "Mewat",
      state: "Haryana",
      pinCode: "122105",
      country: "India",
    };

    // 3️⃣ Seed Distributor — Toucan Toes / Amit Singh
    const distLoginPassword = process.env.DISTRIBUTOR_LOGIN_PASSWORD;

    if (!distLoginPassword) {
      console.log(
        "⚠️  Skipping distributor seed — set DISTRIBUTOR_LOGIN_PASSWORD in .env to enable it (no password was visible to copy from the UI)."
      );
    } else {
      const distExists = await Distributor.findOne({ email: toucanEmail });
      if (!distExists) {
        await distributorService.createDistributor({
          name: "Amit Singh",
          companyName: toucanCompanyName,
          email: toucanEmail,
          phone: "8905577798",
          gstNumber: "06AAMCK3112C1Z1",
          billingAddress: toucanAddress,
          shippingAddress: toucanAddress,
          paymentTerms: "60 days",
          discountPercentage: 50,
          creditLimit: 100000000,
          tag: "online",
          loginEnabled: true,
          loginEmail: toucanEmail,
          loginPassword: distLoginPassword,
        });
        console.log("🔥 Distributor seeded successfully:", toucanEmail);
      } else {
        console.log("✅ Distributor already exists:", toucanEmail);
      }
    }

    // 4️⃣ Seed Vendor — Toucan Toes (same company, vendor side of the
    // business — no login/portal, discount%, credit limit, or tag on the
    // Vendor schema, so only the fields it actually has are set here).
    const vendorExists = await Vendor.findOne({ email: toucanEmail });
    if (!vendorExists) {
      await Vendor.create({
        displayName: toucanCompanyName,
        companyName: toucanCompanyName,
        firstName: "Amit",
        lastName: "Singh",
        email: toucanEmail,
        mobile: "8905577798",
        gstNumber: "06AAMCK3112C1Z1",
        paymentTerms: "60 days",
        billingAddress: toucanAddress,
        shippingAddress: toucanAddress,
      });
      console.log("🔥 Vendor seeded successfully:", toucanCompanyName);
    } else {
      console.log("✅ Vendor already exists:", toucanCompanyName);
    }

    process.exit(0);
  } catch (e) {
    console.error("❌ Seed error:", e.message);
    process.exit(1);
  }
})();