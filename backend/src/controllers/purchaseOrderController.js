const service = require("../services/purchaseOrderService");

const sendError = (res, err) => {
  const code = err.statusCode || 500;
  return res.status(code).json({ message: err.message || "Server error" });
};

exports.getNextPONumber = async (req, res) => {
  try {
    const poNumber = await service.generateNextPONumber();
    return res.json({ data: { poNumber } });
  } catch (err) {
    return sendError(res, err);
  }
};

exports.createPO = async (req, res) => {
  try {
    const doc = await service.create(req.body);
    return res.status(201).json({ message: "PO created", data: doc });
  } catch (err) {
    return sendError(res, err);
  }
};

exports.listPOs = async (req, res) => {
  try {
    const result = await service.list(req.query);

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

// ✅ bill list
exports.listBills = async (req, res) => {
  try {
    const result = await service.listBills(req.query);

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

exports.getPOById = async (req, res) => {
  try {
    const doc = await service.getById(req.params.id);
    return res.json({ data: doc });
  } catch (err) {
    return sendError(res, err);
  }
};

// ✅ bill detail
exports.getBillById = async (req, res) => {
  try {
    const doc = await service.getBillById(req.params.id);
    return res.json({ data: doc });
  } catch (err) {
    return sendError(res, err);
  }
};

exports.updatePO = async (req, res) => {
  try {
    const doc = await service.update(req.params.id, req.body);
    return res.json({ message: "PO updated", data: doc });
  } catch (err) {
    return sendError(res, err);
  }
};

// ✅ approve bill
exports.approveBill = async (req, res) => {
  try {
    const doc = await service.approveBill(req.params.id, req.body);
    return res.json({ message: "Bill approved successfully", data: doc });
  } catch (err) {
    return sendError(res, err);
  }
};

// ✅ reject bill
exports.rejectBill = async (req, res) => {
  try {
    const doc = await service.rejectBill(req.params.id, req.body);
    return res.json({ message: "Bill rejected successfully", data: doc });
  } catch (err) {
    return sendError(res, err);
  }
};

exports.deletePO = async (req, res) => {
  try {
    await service.softDelete(req.params.id);
    return res.json({ message: "PO deleted" });
  } catch (err) {
    return sendError(res, err);
  }
};