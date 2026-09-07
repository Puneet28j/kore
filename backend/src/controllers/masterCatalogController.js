const masterCatalogService = require("../services/masterCatalogService");
const activityLog = require("../services/activityLog.service");
const { emitCatalogUpdated } = require("../socket");

const sendError = (res, err) => {
  const code = err.statusCode || 500;
  return res.status(code).json({
    message: err.message || "Server error",
    ...(err.details ? { details: err.details } : {}),
  });
};

const shortVariantList = (labels) => {
  const unique = [...new Set(labels.filter(Boolean))];
  if (!unique.length) return "catalog details";
  const visible = unique.slice(0, 3).join(", ");
  return unique.length > 3 ? `${visible} +${unique.length - 3} more` : visible;
};

const describeVariantChanges = (doc, changes) => {
  const labelsById = new Map(
    (doc.variants || []).map((variant) => [
      String(variant._id),
      `${variant.color || "Variant"} (${variant.sizeRange || "no size range"})`,
    ])
  );
  const labels = [
    ...(changes.updated || []).map((id) => labelsById.get(String(id))),
    ...(changes.created || []).map((id) => labelsById.get(String(id))),
    ...(changes.removed || []).map((id) => changes.removedLabels?.[String(id)]),
  ];
  const parts = [];
  if (labels.length) parts.push(`Variants: ${shortVariantList(labels)}`);
  const deactivated = (changes.autoDeactivated || []).map((variant) => variant.label);
  if (deactivated.length) parts.push(`Deactivated: ${shortVariantList(deactivated)}`);
  return parts.length ? parts.join(" · ") : "Catalog details updated";
};

exports.createMasterCatalog = async (req, res) => {
  try {
    const doc = await masterCatalogService.create(req);

    // Bulk CSV import sends `silent=true` on every one of its N per-master
    // requests — without this, each one fires its own realtime toast +
    // full article/order refetch on every connected client, turning a
    // 20-master import into 20 stacked toasts and 20 heavy refetches
    // competing with the import itself for bandwidth. The importer does
    // one manual refresh after the whole batch finishes instead.
    const silent = req.body?.silent === "true" || req.body?.silent === true;

    activityLog.createLog({
      action: "CATALOG_CREATED",
      entityType: "CATALOG",
      entityId: String(doc._id),
      description: `Article "${doc.articleName}" added to catalog by ${req.user?.name || "admin"}`,
      user: req.user,
      emitRealtime: !silent,
    });

    if (!silent) emitCatalogUpdated("created", doc._id);
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
    const data = await masterCatalogService.getStockTotals(req.query.filter || null);
    return res.json({ data });
  } catch (err) {
    return sendError(res, err);
  }
};

exports.getBookedMap = async (req, res) => {
  try {
    const { totals, byBookingType } = await masterCatalogService.getBookedQuantityMap();
    return res.json({ data: totals, byBookingType });
  } catch (err) {
    return sendError(res, err);
  }
};

exports.updateMasterCatalog = async (req, res) => {
  try {
    const { doc, variantChanges } = await masterCatalogService.update(req, req.params.id);

    // See createMasterCatalog — bulk CSV import passes silent=true to avoid
    // a stacked toast + refetch storm across its N per-master requests.
    const silent = req.body?.silent === "true" || req.body?.silent === true;

    activityLog.createLog({
      action: "CATALOG_UPDATED",
      entityType: "CATALOG",
      entityId: String(req.params.id),
      description: `Article "${doc.articleName}" updated — ${describeVariantChanges(doc, variantChanges)}`,
      metadata: { variantChanges },
      user: req.user,
      emitRealtime: !silent,
    });

    if (!silent) emitCatalogUpdated("updated", req.params.id);
    return res.json({
      message: "Updated",
      data: doc,
      variantChanges,
    });
  } catch (err) {
    if (err.statusCode === 409 && err.details?.blockedVariants) {
      activityLog.createLog({
        action: "CATALOG_UPDATED",
        entityType: "CATALOG",
        entityId: String(req.params.id),
        description: `Article "${err.details.articleName || req.params.id}": variant removal blocked — ${shortVariantList(err.details.blockedVariants.map((variant) => variant.label))}`,
        metadata: { blockedVariants: err.details.blockedVariants },
        user: req.user,
        emitRealtime: false,
      });
    }
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

exports.bulkStockMovementBySku = async (req, res) => {
  try {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!rows.length) {
      return res.status(400).json({ message: "rows is required and must be non-empty" });
    }
    const results = await masterCatalogService.bulkStockMovementBySku(rows, req.user);
    const touchedArticleIds = [...new Set(results.map((r) => r.articleId))];
    touchedArticleIds.forEach((id) => emitCatalogUpdated("updated", id));
    const totalCartons = results.reduce((s, r) => s + r.cartons, 0);
    const cartonBarcodes = results.flatMap((r) => r.cartonBarcodes || []);
    return res.json({
      message: `${results.length} row(s) updated — ${totalCartons} carton(s)`,
      data: { results, totalCartons, cartonBarcodes },
    });
  } catch (err) {
    return sendError(res, err);
  }
};

exports.bulkImageUpdateBySku = async (req, res) => {
  try {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!rows.length) {
      return res.status(400).json({ message: "rows is required and must be non-empty" });
    }
    const { updated, unmatched } = await masterCatalogService.bulkImageUpdateBySku(rows);
    const touchedArticleIds = [...new Set(updated.map((r) => r.articleId))];
    touchedArticleIds.forEach((id) => emitCatalogUpdated("updated", id));
    return res.json({
      message: `${updated.length} row(s) updated${unmatched.length ? `, ${unmatched.length} SKU(s) not found` : ""}`,
      data: { updated, unmatched },
    });
  } catch (err) {
    return sendError(res, err);
  }
};

