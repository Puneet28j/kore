const masterCatalogService = require("../services/masterCatalogService");

const sendError = (res, err) => {
  const code = err.statusCode || 500;
  return res.status(code).json({ message: err.message || "Server error" });
};

exports.createMasterCatalog = async (req, res) => {
  try {
    const doc = await masterCatalogService.create(req);
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

exports.updateMasterCatalog = async (req, res) => {
  try {
    const doc = await masterCatalogService.update(req, req.params.id);
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