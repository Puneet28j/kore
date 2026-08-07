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
    const distProfile = await Distributor.findById(id).select("userId").lean();
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

    orders.forEach((o) => {
      statusCounts[o.status] = (statusCounts[o.status] || 0) + 1;
      const amt = o.finalAmount || o.totalAmount || 0;
      totalAmount += amt;
      totalPairs += o.totalPairs || 0;
      if (o.paymentStatus === "PAID") paidAmount += amt;
      else pendingAmount += amt;
    });

    return ok(res, {
      data: {
        totalOrders: orders.length,
        totalAmount,
        totalPairs,
        paidAmount,
        pendingAmount,
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