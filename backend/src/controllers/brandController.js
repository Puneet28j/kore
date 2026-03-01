const service = require("../services/brandService");
const { ok, created, fail } = require("../utils/apiResponse");

exports.create = async (req, res) => {
  try { return created(res, { message: "Brand created", data: await service.create(req.body) }); }
  catch (e) { return fail(res, { status: e.statusCode || 500, message: e.message }); }
};

exports.list = async (req, res) => {
  try {
    const r = await service.list(req.query);
    return ok(res, { data: r.items, meta: { total: r.total, page: r.page, limit: r.limit } });
  } catch (e) {
    return fail(res, { status: e.statusCode || 500, message: e.message });
  }
};

exports.getById = async (req, res) => {
  try { return ok(res, { data: await service.getById(req.params.id) }); }
  catch (e) { return fail(res, { status: e.statusCode || 500, message: e.message }); }
};

exports.update = async (req, res) => {
  try { return ok(res, { message: "Brand updated", data: await service.update(req.params.id, req.body) }); }
  catch (e) { return fail(res, { status: e.statusCode || 500, message: e.message }); }
};

exports.remove = async (req, res) => {
  try { await service.softDelete(req.params.id); return ok(res, { message: "Brand deleted" }); }
  catch (e) { return fail(res, { status: e.statusCode || 500, message: e.message }); }
};