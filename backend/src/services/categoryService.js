const Category = require("../models/Category");
const base = require("./_baseTaxonomyService");

exports.create = (body) => base.createOne(Category, body);
exports.list = (query) => base.list(Category, query);
exports.getById = (id) => base.getById(Category, id);
exports.update = (id, body) => base.update(Category, id, body);
exports.softDelete = (id) => base.softDelete(Category, id);