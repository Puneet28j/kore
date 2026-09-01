const distributorService = require("../services/distributor.service");
const { created, ok, fail } = require("../utils/apiResponse");
const { emitDistributorUpdate } = require("../socket");
const activityLog = require("../services/activityLog.service");
const Order = require("../models/Order");
const Return = require("../models/Return");
const Distributor = require("../models/Distributor");

exports.createDistributor = async (req, res, next) => {
  try {
    const distributor = await distributorService.createDistributor(req.body);

    activityLog.createLog({
      action: "DISTRIBUTOR_CREATED",
      entityType: "DISTRIBUTOR",
      entityId: String(distributor._id),
      description: `Distributor "${distributor.name}" created by ${req.user?.name || "admin"}`,
      user: req.user,
    });

    return created(res, {
      message: "Distributor created successfully",
      data: distributor,
    });
  } catch (err) {
    next(err);
  }
};

exports.listDistributors = async (req, res, next) => {
  try {
    const data = await distributorService.listDistributors({
      page: req.query.page,
      limit: req.query.limit,
      search: req.query.search || req.query.q,
      isActive: req.query.isActive,
    });

    return ok(res, {
      message: "Distributors fetched successfully",
      data: data.items,
      meta: data.meta,
    });
  } catch (err) {
    next(err);
  }
};

exports.getDistributorById = async (req, res, next) => {
  try {
    const distributor = await distributorService.getDistributorById(req.params.id);
    return ok(res, {
      message: "Distributor fetched successfully",
      data: distributor,
    });
  } catch (err) {
    next(err);
  }
};

exports.updateDistributor = async (req, res, next) => {
  try {
    const distributor = await distributorService.updateDistributor(req.params.id, req.body);

    emitDistributorUpdate(req.params.id);

    activityLog.createLog({
      action: "DISTRIBUTOR_UPDATED",
      entityType: "DISTRIBUTOR",
      entityId: String(req.params.id),
      description: `Distributor "${distributor.name}" updated by ${req.user?.name || "admin"}`,
      user: req.user,
    });

    return ok(res, {
      message: "Distributor updated successfully",
      data: distributor,
    });
  } catch (err) {
    console.error("[updateDistributor] ERROR:", err.status || 500, err.message, err.stack);
    next(err);
  }
};

exports.toggleDistributorStatus = async (req, res, next) => {
  try {
    const distributor = await distributorService.toggleDistributorStatus(req.params.id);

    // Real-time: notify distributor dashboard of status change
    emitDistributorUpdate(req.params.id);

    return ok(res, {
      message: `Distributor ${distributor.isActive ? "activated" : "deactivated"} successfully`,
      data: distributor,
    });
  } catch (err) {
    next(err);
  }
};

exports.getDistributorSummary = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Orders store distributorId as User._id, but `id` here is Distributor._id.
    // Resolve the linked userId so the query matches actual orders.
    const distProfile = await Distributor.findById(id).select("userId creditLimit").lean();
    const orderUserId = distProfile?.userId || id;

    const [orders, returns] = await Promise.all([
      Order.find({ distributorId: orderUserId }).sort({ createdAt: -1 }).lean(),
      Return.find({ distributorId: orderUserId }).sort({ createdAt: -1 }).lean(),
    ]);

    const statusCounts = {};
    let totalAmount = 0;
    let totalPairs = 0;
    let paidAmount = 0;
    let pendingAmount = 0;
    let totalPendingCartons = 0;
    const pendingCartonBreakdown = [];
    // Credit used — mirrors the exact eligibility rule auth.controller.js
    // applies at login (excludes CANCELLED/PRE_BOOKED/CONFIRMED, uses the
    // REGULAR-only creditAmount slice of mixed orders, nets off amountPaid)
    // so "Used Limit" shown here always matches what actually gates checkout.
    let creditUsed = 0;

    orders.forEach((o) => {
      statusCounts[o.status] = (statusCounts[o.status] || 0) + 1;

      // A cancelled order was never fulfilled and nothing is owed on it —
      // it stays visible in statusCounts/recentOrders for history, but
      // must not inflate "business done" (value, pairs) or "money owed"
      // (paid/pending) totals.
      if (o.status !== "CANCELLED") {
        const amt = o.finalAmount || o.totalAmount || 0;
        totalAmount += amt;
        totalPairs += o.totalPairs || 0;
        // Use the actual payment ledger (amountPaid), not a binary PAID/else
        // split — a PARTIAL payment must count its paid portion as paid and
        // only the remainder as pending, so this stays in sync with whatever
        // was last recorded via record-payment (e.g. from Distributor Invoice).
        const paid = Math.min(amt, o.amountPaid || 0);
        paidAmount += paid;
        pendingAmount += Math.max(0, amt - paid);
      }

      // Credit used — PRE_BOOKED/CONFIRMED orders aren't locked in yet and
      // don't count against the limit; creditAmount (falling back to
      // finalAmount/totalAmount) is the REGULAR-only slice for mixed orders.
      if (!["CANCELLED", "PRE_BOOKED", "CONFIRMED"].includes(o.status)) {
        const creditAmt = o.creditAmount ?? (o.finalAmount || o.totalAmount || 0);
        creditUsed += Math.max(0, creditAmt - (o.amountPaid || 0));
      }

      // Pending = ordered cartons not yet scanned out (CTN Out-Scan / GRN
      // dispatch step). A carton gets a cartonTracking entry the moment it's
      // scanned, regardless of what stage (Dispatched/In Transit/Received)
      // it's since moved to — so "pending" only counts ones with no entry
      // yet, not ones already out the door but still in transit.
      if (o.status !== "CANCELLED") {
        const scannedOutCount = (o.cartonTracking || []).length;
        const pending = Math.max(0, (o.totalCartons || 0) - scannedOutCount);
        if (pending > 0) {
          totalPendingCartons += pending;

          // Same "not yet scanned out" logic, per item — fulfilledCartonCount
          // is this item's own scanned-so-far count, mirroring cartonTracking
          // at the order level.
          const items = (o.items || [])
            .map((it) => {
              const itemPending = Math.max(
                0,
                (it.cartonCount || 0) - (it.fulfilledCartonCount || 0)
              );
              if (itemPending <= 0) return null;
              const snap = it.productSnapshot || {};
              return {
                articleName: snap.articleName || "Item",
                color: snap.color || "",
                sizeRange: snap.sizeRange || "",
                bookingType: it.bookingType || "REGULAR",
                pendingCartons: itemPending,
                totalCartons: it.cartonCount || 0,
              };
            })
            .filter(Boolean);

          pendingCartonBreakdown.push({
            orderId: o._id,
            orderNumber: o.orderNumber,
            status: o.status,
            date: o.date,
            pendingCartons: pending,
            totalCartons: o.totalCartons || 0,
            items,
          });
        }
      }
    });

    return ok(res, {
      data: {
        totalOrders: orders.filter((o) => o.status !== "CANCELLED").length,
        totalAmount,
        totalPairs,
        paidAmount,
        pendingAmount,
        creditLimit: distProfile?.creditLimit || 0,
        creditUsed,
        availableCredit: Math.max(0, (distProfile?.creditLimit || 0) - creditUsed),
        totalPendingCartons,
        pendingCartonBreakdown,
        statusCounts,
        recentOrders: orders.slice(0, 10),
        totalReturns: returns.length,
        returnPairs: returns.reduce((s, r) => s + (r.totalPairs || 0), 0),
        recentReturns: returns.slice(0, 5),
      },
    });
  } catch (err) {
    next(err);
  }
};

exports.deleteDistributor = async (req, res, next) => {
  try {
    await distributorService.deleteDistributor(req.params.id);

    activityLog.createLog({
      action: "DISTRIBUTOR_DELETED",
      entityType: "DISTRIBUTOR",
      entityId: String(req.params.id),
      description: `Distributor (id: ${req.params.id}) deleted by ${req.user?.name || "admin"}`,
      user: req.user,
    });

    return ok(res, {
      message: "Distributor deleted successfully",
      data: null,
    });
  } catch (err) {
    next(err);
  }
};