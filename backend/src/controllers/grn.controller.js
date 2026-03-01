const { ok, fail } = require("../utils/apiResponse");
const grnService = require("../services/grn.service");

exports.listReferences = async (req, res) => {
  try {
    const data = await grnService.listReferences(req.query.search || "");
    return ok(res, { data });
  } catch (e) {
    return fail(res, { message: e.message });
  }
};

exports.createDraft = async (req, res) => {
  try {
    const data = await grnService.createDraft(req.body);
    return ok(res, { message: "Draft created", data, status: 201 });
  } catch (e) {
    return fail(res, { message: e.message });
  }
};

exports.getDraft = async (req, res) => {
  try {
    const data = await grnService.getDraft(req.params.draftId);
    return ok(res, { data });
  } catch (e) {
    return fail(res, { message: e.message, status: 404 });
  }
};

exports.scanPair = async (req, res) => {
  try {
    const data = await grnService.scanPair(req.params.draftId, req.body.pairBarcode);
    return ok(res, { message: "Scanned", data });
  } catch (e) {
    return fail(res, { message: e.message });
  }
};

exports.rescanCurrent = async (req, res) => {
  try {
    const data = await grnService.rescanCurrent(req.params.draftId);
    return ok(res, { message: "Current carton cleared", data });
  } catch (e) {
    return fail(res, { message: e.message });
  }
};

exports.removeCarton = async (req, res) => {
  try {
    const data = await grnService.removeCarton(req.params.draftId, req.params.cartonBarcode);
    return ok(res, { message: "Carton removed", data });
  } catch (e) {
    return fail(res, { message: e.message });
  }
};

exports.submitDraft = async (req, res) => {
  try {
    const data = await grnService.submitDraft(req.params.draftId);
    return ok(res, { message: "GRN submitted", data });
  } catch (e) {
    return fail(res, { message: e.message });
  }
};

exports.history = async (req, res) => {
  try {
    const data = await grnService.getHistory(req.query.search || "");
    return ok(res, { data });
  } catch (e) {
    return fail(res, { message: e.message });
  }
};

exports.getGRNById = async (req, res) => {
  try {
    const data = await grnService.getGRNById(req.params.grnId);
    return ok(res, { data });
  } catch (e) {
    return fail(res, { message: e.message, status: 404 });
  }
};