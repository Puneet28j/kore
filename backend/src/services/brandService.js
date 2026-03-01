const Brand = require("../models/Brand");
const base = require("./_baseTaxonomyService");

exports.create = (body) => base.createOne(Brand, body);
exports.list = (query) => base.list(Brand, query);
exports.getById = (id) => base.getById(Brand, id);
exports.update = (id, body) => base.update(Brand, id, body);
exports.softDelete = (id) => base.softDelete(Brand, id);