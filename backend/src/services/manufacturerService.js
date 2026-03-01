const Manufacturer = require("../models/Manufacturer");
const base = require("./_baseTaxonomyService");

exports.create = (body) => base.createOne(Manufacturer, body);
exports.list = (query) => base.list(Manufacturer, query);
exports.getById = (id) => base.getById(Manufacturer, id);
exports.update = (id, body) => base.update(Manufacturer, id, body);
exports.softDelete = (id) => base.softDelete(Manufacturer, id);