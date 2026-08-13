const masterCatalogService = require("../services/masterCatalogService");
const activityLog = require("../services/activityLog.service");
const { emitCatalogUpdated } = require("../socket");

const sendError = (res, err) => {
  const code = err.statusCode || 500;
  return res.status(code).json({ message: err.message || "Server error" });
};

exports.createMasterCatalog = async (req, res) => {
  try {
    const doc = await masterCatalogService.create(req);

    activityLog.createLog({
      action: "CATALOG_CREATED",
      entityType: "CATALOG",
      entityId: String(doc._id),
      description: `Article "${doc.articleName}" added to catalog by ${req.user?.name || "admin"}`,
      user: req.user,
    });

    emitCatalogUpdated("created", doc._id);
    return res.status(201).json({
      message: "Master catalog created",
      data: doc,
    });
  } catch (err) {
    console.log("ERROR:", err);
    return sendError(res, err);
  }
};

exports.getMasterCatalogList = async (req, res) => {
  try {
    const result = await masterCatalogService.list(req.query);

    return res.json({
      data: result.items,
      meta: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
        hasNextPage: result.hasNextPage,
        hasPrevPage: result.hasPrevPage,
        pageSizeOptions: result.pageSizeOptions,
      },
    });
  } catch (err) {
    return sendError(res, err);
  }
};

exports.getMasterCatalogById = async (req, res) => {
  try {
    const doc = await masterCatalogService.getById(req.params.id);
    return res.json({ data: doc });
  } catch (err) {
    return sendError(res, err);
  }
};

exports.getStockTotals = async (req, res) => {
  try {
    const data = await masterCatalogService.getStockTotals(req.query.stage || null);
    return res.json({ data });
  } catch (err) {
    return sendError(res, err);
  }
};

exports.getBookedMap = async (req, res) => {
  try {
    const { totals } = await masterCatalogService.getBookedQuantityMap();
    return res.json({ data: totals });
  } catch (err) {
    return sendError(res, err);
  }
};

exports.updateMasterCatalog = async (req, res) => {
  try {
    const doc = await masterCatalogService.update(req, req.params.id);

    activityLog.createLog({
      action: "CATALOG_UPDATED",
      entityType: "CATALOG",
      entityId: String(req.params.id),
      description: `Article "${doc.articleName}" updated by ${req.user?.name || "admin"}`,
      user: req.user,
    });

    emitCatalogUpdated("updated", req.params.id);
    return res.json({
      message: "Updated",
      data: doc,
    });
  } catch (err) {
    return sendError(res, err);
  }
};

exports.toggleMasterCatalogStatus = async (req, res) => {
  try {
    const doc = await masterCatalogService.toggleActive(req.params.id);
    return res.json({
      message: `Catalog ${doc.isActive ? "activated" : "deactivated"} successfully`,
      data: doc,
    });
  } catch (err) {
    return sendError(res, err);
  }
};

exports.deleteMasterCatalog = async (req, res) => {
  try {
    await masterCatalogService.softDelete(req.params.id);

    activityLog.createLog({
      action: "CATALOG_DELETED",
      entityType: "CATALOG",
      entityId: String(req.params.id),
      description: `Catalog item (id: ${req.params.id}) deleted by ${req.user?.name || "admin"}`,
      user: req.user,
    });

    emitCatalogUpdated("deleted", req.params.id);
    return res.json({ message: "Deleted" });
  } catch (err) {
    return sendError(res, err);
  }
};

exports.getVariantStock = async (req, res) => {
  try {
    const data = await masterCatalogService.getVariantStock(req.params.variantId);
    return res.json({ data });
  } catch (err) {
    return sendError(res, err);
  }
};

exports.resetVariantStock = async (req, res) => {
  try {
    const data = await masterCatalogService.resetVariantStock(req.params.variantId);
    return res.json({ data });
  } catch (err) {
    return sendError(res, err);
  }
};

exports.updateVariantSku = async (req, res) => {
  try {
    const { sku } = req.body;
    const data = await masterCatalogService.updateVariantSku(req.params.variantId, sku || "");
    emitCatalogUpdated("updated", req.params.variantId);
    return res.json({ message: "SKU updated", data });
  } catch (err) {
    return sendError(res, err);
  }
};

exports.getAvailableCartons = async (req, res) => {
  try {
    const MasterCatalog = require("../models/MasterCatalog");
    const Order = require("../models/Order");

    const catalog = await MasterCatalog.findOne({ "variants._id": req.params.variantId });
    if (!catalog) return res.status(404).json({ message: "Variant not found" });
    const variant = catalog.variants.id(req.params.variantId);
    const allCodes = variant?.availableCartons || [];

    if (allCodes.length === 0) return res.json({ availableCartons: [] });

    // Find codes from this pool that have already been scanned in any order
    const ordersWithCodes = await Order.find(
      { "cartonTracking.code": { $in: allCodes } },
      { "cartonTracking.code": 1 }
    ).lean();
    const scannedCodes = new Set(
      ordersWithCodes.flatMap(o => (o.cartonTracking || []).map(c => c.code))
    );

    const trulyAvailable = allCodes.filter(c => !scannedCodes.has(c));

    // Clean stale codes from the DB so the pool shrinks over time
    if (trulyAvailable.length < allCodes.length) {
      variant.availableCartons = trulyAvailable;
      catalog.markModified("variants");
      catalog.save().catch(() => {}); // fire-and-forget, don't block the response
    }

    res.json({ availableCartons: trulyAvailable });
  } catch (err) {
    return sendError(res, err);
  }
};

exports.getCartonCounter = async (req, res) => {
  try {
    const Counter = require("../models/Counter");
    const counter = await Counter.findOne({ id: `carton-serial-${req.params.variantId}` });
    return res.json({ nextSerial: (counter?.seq || 0) + 1 });
  } catch (err) {
    return sendError(res, err);
  }
};

exports.stockMovement = async (req, res) => {
  try {
    const { type, cartons, reason, note } = req.body;
    if (!["INWARD", "OUTWARD"].includes(type)) {
      return res.status(400).json({ message: "type must be INWARD or OUTWARD" });
    }
    if (!cartons || cartons < 1) {
      return res.status(400).json({ message: "cartons must be at least 1" });
    }
    if (!reason) {
      return res.status(400).json({ message: "reason is required" });
    }
    const data = await masterCatalogService.stockMovement(req.params.variantId, {
      type,
      cartons: Number(cartons),
      reason,
      note: note || "",
      user: req.user,
    });
    emitCatalogUpdated("updated", data.articleId);
    return res.json({ message: `Stock ${type.toLowerCase()} recorded`, data });
  } catch (err) {
    return sendError(res, err);
  }
};