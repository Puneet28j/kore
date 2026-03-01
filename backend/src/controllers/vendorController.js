const vendorService = require("../services/vendorService");

const sendError = (res, err) => {
  const code = err.statusCode || 500;
  return res.status(code).json({ message: err.message || "Server error" });
};

exports.createVendor = async (req, res) => {
  try {
    const doc = await vendorService.create(req.body);
    return res.status(201).json({ message: "Vendor created", data: doc });
  } catch (err) {
    return sendError(res, err);
  }
};

exports.getVendorList = async (req, res) => {
  try {
    const result = await vendorService.list(req.query);
    return res.json({
      data: result.items,
      meta: { total: result.total, page: result.page, limit: result.limit },
    });
  } catch (err) {
    return sendError(res, err);
  }
};

exports.getVendorById = async (req, res) => {
  try {
    const doc = await vendorService.getById(req.params.id);
    return res.json({ data: doc });
  } catch (err) {
    return sendError(res, err);
  }
};

exports.updateVendor = async (req, res) => {
  try {
    const doc = await vendorService.update(req.params.id, req.body);
    return res.json({ message: "Vendor updated", data: doc });
  } catch (err) {
    return sendError(res, err);
  }
};

exports.deleteVendor = async (req, res) => {
  try {
    await vendorService.softDelete(req.params.id);
    return res.json({ message: "Vendor deleted" });
  } catch (err) {
    return sendError(res, err);
  }
};