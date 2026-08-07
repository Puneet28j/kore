/**
 * One-off repair script.
 *
 * Order.distributorId references the linked login User._id, not the stable
 * Distributor._id. When a distributor's login account gets recreated (e.g.
 * after the users collection was wiped on 2026-08-07), their userId changes
 * and all pre-existing Orders/Returns — still pointing at the old userId —
 * become invisible to any distributorId-based lookup (list "Total Orders",
 * the /distributors/:id/summary endpoint, and the distributor's own "My
 * Orders" once they log in with the new account).
 *
 * This script finds Orders/Returns whose distributorId no longer matches
 * their owning Distributor's current userId, using distributorName (the
 * contact person snapshot stored on each order) as the correlation key,
 * and relinks them to the current userId.
 *
 * Usage:
 *   node src/scripts/relinkOrphanedOrders.js            # dry run — report only
 *   node src/scripts/relinkOrphanedOrders.js --apply     # actually update
 */
require("dotenv").config();
const mongoose = require("mongoose");
const Distributor = require("../models/Distributor");
const Order = require("../models/Order");
const Return = require("../models/Return");

const APPLY = process.argv.includes("--apply");

const norm = (s) => String(s || "").trim().toLowerCase();

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Mode: ${APPLY ? "APPLY (writing changes)" : "DRY RUN (report only)"}`);

  const distributors = await Distributor.find({ isDeleted: false }).lean();

  // Guard against ambiguous contact-person names — skip matching by name if
  // more than one active distributor shares it, rather than guessing.
  const nameCounts = {};
  distributors.forEach((d) => {
    const key = norm(d.name);
    nameCounts[key] = (nameCounts[key] || 0) + 1;
  });

  let totalOrdersToRelink = 0;
  let totalReturnsToRelink = 0;

  for (const d of distributors) {
    if (!d.userId) {
      console.log(`- ${d.companyName}: no userId set (login not enabled) — skipping`);
      continue;
    }
    const key = norm(d.name);
    if (nameCounts[key] > 1) {
      console.log(`- ${d.companyName}: contact name "${d.name}" is ambiguous (shared by ${nameCounts[key]} distributors) — skipping, needs manual review`);
      continue;
    }

    const orphanedOrders = await Order.find({
      distributorName: { $regex: `^${d.name}$`, $options: "i" },
      distributorId: { $ne: d.userId },
    }).select("orderNumber distributorId distributorName").lean();

    const orphanedReturns = await Return.find({
      distributorName: { $regex: `^${d.name}$`, $options: "i" },
      distributorId: { $ne: d.userId },
    }).select("_id distributorId distributorName").lean();

    if (orphanedOrders.length === 0 && orphanedReturns.length === 0) {
      console.log(`- ${d.companyName}: nothing orphaned`);
      continue;
    }

    console.log(`- ${d.companyName}: ${orphanedOrders.length} order(s), ${orphanedReturns.length} return(s) to relink to userId ${d.userId}`);
    orphanedOrders.forEach((o) => console.log(`    order ${o.orderNumber}: ${o.distributorId} -> ${d.userId}`));
    orphanedReturns.forEach((r) => console.log(`    return ${r._id}: ${r.distributorId} -> ${d.userId}`));

    totalOrdersToRelink += orphanedOrders.length;
    totalReturnsToRelink += orphanedReturns.length;

    if (APPLY) {
      if (orphanedOrders.length) {
        await Order.updateMany(
          { _id: { $in: orphanedOrders.map((o) => o._id) } },
          { $set: { distributorId: d.userId } }
        );
      }
      if (orphanedReturns.length) {
        await Return.updateMany(
          { _id: { $in: orphanedReturns.map((r) => r._id) } },
          { $set: { distributorId: d.userId } }
        );
      }
    }
  }

  console.log(`\nTotal: ${totalOrdersToRelink} order(s), ${totalReturnsToRelink} return(s) ${APPLY ? "relinked" : "would be relinked (dry run — rerun with --apply to write)"}`);

  await mongoose.disconnect();
})().catch((err) => {
  console.error("ERROR:", err);
  process.exit(1);
});
