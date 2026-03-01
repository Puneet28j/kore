const Unit = require("../models/Unit");
const base = require("./_baseTaxonomyService");

exports.create = (body) => base.createOne(Unit, body);
exports.list = (query) => base.list(Unit, query);
exports.getById = (id) => base.getById(Unit, id);
exports.update = (id, body) => base.update(Unit, id, body);
exports.softDelete = (id) => base.softDelete(Unit, id);