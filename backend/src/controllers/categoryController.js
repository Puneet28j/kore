const service = require("../services/categoryService");
const { ok, created, fail } = require("../utils/apiResponse");

exports.create = async (req, res) => {
  try {
    const doc = await service.create(req.body);
    return created(res, { message: "Category created", data: doc });
  } catch (e) {
    return fail(res, { status: e.statusCode || 500, message: e.message });
  }
};

exports.list = async (req, res) => {
  try {
    const result = await service.list(req.query);
    return ok(res, { data: result.items, meta: { total: result.total, page: result.page, limit: result.limit } });
  } catch (e) {
    return fail(res, { status: e.statusCode || 500, message: e.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const doc = await service.getById(req.params.id);
    return ok(res, { data: doc });
  } catch (e) {
    return fail(res, { status: e.statusCode || 500, message: e.message });
  }
};

exports.update = async (req, res) => {
  try {
    const doc = await service.update(req.params.id, req.body);
    return ok(res, { message: "Category updated", data: doc });
  } catch (e) {
    return fail(res, { status: e.statusCode || 500, message: e.message });
  }
};

exports.remove = async (req, res) => {
  try {
    await service.softDelete(req.params.id);
    return ok(res, { message: "Category deleted" });
  } catch (e) {
    return fail(res, { status: e.statusCode || 500, message: e.message });
  }
};