const service = require("../services/purchaseOrderService");
const activityLog = require("../services/activityLog.service");
const { emitPOEvent } = require("../socket");

const sendError = (res, err) => {
  const code = err.statusCode || 500;
  return res.status(code).json({ message: err.message || "Server error" });
};

exports.createPO = async (req, res) => {
  try {
    const doc = await service.create(req.body);

    activityLog.createLog({
      action: "PO_CREATED",
      entityType: "PO",
      entityId: String(doc._id),
      description: `PO (${String(doc._id).slice(-6)}) created by ${req.user?.name || "admin"}`,
      metadata: { poNumber: doc.poNumber, vendor: doc.vendorName },
      user: req.user,
    });

    emitPOEvent("poCreated", { poId: String(doc._id), poNumber: doc.poNumber, vendorName: doc.vendorName });
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

    activityLog.createLog({
      action: "PO_UPDATED",
      entityType: "PO",
      entityId: String(req.params.id),
      description: `PO (${String(req.params.id).slice(-6)}) updated by ${req.user?.name || "admin"}`,
      user: req.user,
    });

    emitPOEvent("poUpdated", { poId: String(req.params.id), poNumber: doc.poNumber });
    return res.json({ message: "PO updated", data: doc });
  } catch (err) {
    return sendError(res, err);
  }
};

exports.approveBill = async (req, res) => {
  try {
    const doc = await service.approveBill(req.params.id, req.body);

    activityLog.createLog({
      action: "PO_APPROVED",
      entityType: "PO",
      entityId: String(req.params.id),
      description: `PO/Bill #${doc.poNumber} approved by ${req.user?.name || "admin"}`,
      user: req.user,
    });

    emitPOEvent("billApproved", { poId: String(req.params.id), poNumber: doc.poNumber, vendorName: doc.vendorName });
    return res.json({ message: "Bill approved successfully", data: doc });
  } catch (err) {
    return sendError(res, err);
  }
};

exports.rejectBill = async (req, res) => {
  try {
    const doc = await service.rejectBill(req.params.id, req.body);

    activityLog.createLog({
      action: "PO_REJECTED",
      entityType: "PO",
      entityId: String(req.params.id),
      description: `PO/Bill #${doc.poNumber} rejected by ${req.user?.name || "admin"}`,
      metadata: { reason: req.body.reason },
      user: req.user,
    });

    emitPOEvent("billRejected", { poId: String(req.params.id), poNumber: doc.poNumber, reason: req.body.reason });
    return res.json({ message: "Bill rejected successfully", data: doc });
  } catch (err) {
    return sendError(res, err);
  }
};

exports.addInvoice = async (req, res) => {
  try {
    const doc = await service.addInvoice(req.params.id, req.body);
    const latest = doc.invoices[doc.invoices.length - 1];

    activityLog.createLog({
      action: "PO_INVOICE_ADDED",
      entityType: "PO",
      entityId: String(req.params.id),
      description: `Vendor invoice ${latest?.invoiceNumber ? `#${latest.invoiceNumber} ` : ""}(₹${latest?.invoiceAmount.toLocaleString()}) logged for PO #${doc.poNumber} by ${req.user?.name || "admin"} (${doc.invoices.length} invoice(s) total)`,
      user: req.user,
    });

    emitPOEvent("poUpdated", { poId: String(req.params.id), poNumber: doc.poNumber });
    return res.json({ message: "Invoice added", data: doc });
  } catch (err) {
    return sendError(res, err);
  }
};

exports.recordPayment = async (req, res) => {
  try {
    const doc = await service.recordPayment(req.params.id, {
      ...req.body,
      recordedBy: req.user?.name || "admin",
    });

    activityLog.createLog({
      action: "PO_PAYMENT_RECORDED",
      entityType: "PO",
      entityId: String(req.params.id),
      description: `₹${Number(req.body.amount).toLocaleString()} paid to vendor for PO #${doc.poNumber} by ${req.user?.name || "admin"}`,
      metadata: { amount: req.body.amount, note: req.body.note },
      user: req.user,
    });

    emitPOEvent("poUpdated", { poId: String(req.params.id), poNumber: doc.poNumber });
    return res.json({ message: "Payment recorded", data: doc });
  } catch (err) {
    return sendError(res, err);
  }
};

exports.deletePO = async (req, res) => {
  try {
    const PurchaseOrder = require("../models/PurchaseOrder");
    const po = await PurchaseOrder.findById(req.params.id).select("poNumber vendorName").lean();
    await service.softDelete(req.params.id);

    activityLog.createLog({
      action: "PO_DELETED",
      entityType: "PO",
      entityId: String(req.params.id),
      description: `PO ${po?.poNumber || req.params.id} deleted by ${req.user?.name || "admin"}`,
      user: req.user,
    });

    emitPOEvent("poDeleted", { poId: String(req.params.id), poNumber: po?.poNumber || "", vendorName: po?.vendorName || "" });
    return res.json({ message: "PO deleted" });
  } catch (err) {
    return sendError(res, err);
  }
};