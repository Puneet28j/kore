const mongoose = require("mongoose");

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

exports.createOne = async (Model, body) => {
  if (!body?.name?.trim()) {
    const err = new Error("name is required");
    err.statusCode = 400;
    throw err;
  }

  try {
    return await Model.create({
      ...body,
      name: body.name.trim(),
    });
  } catch (e) {
    if (e.code === 11000) {
      const err = new Error("Already exists");
      err.statusCode = 409;
      throw err;
    }
    throw e;
  }
};

exports.list = async (Model, query) => {
  const { q, isActive, page = 1, limit = 20 } = query;

  const filter = { isDeleted: false };

  if (isActive !== undefined) filter.isActive = isActive === "true" || isActive === true;

  if (q) {
    filter.name = { $regex: q, $options: "i" };
  }

  const skip = (Number(page) - 1) * Number(limit);

  const [items, total] = await Promise.all([
    Model.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
    Model.countDocuments(filter),
  ]);

  return { items, total, page: Number(page), limit: Number(limit) };
};

exports.getById = async (Model, id) => {
  if (!isValidId(id)) {
    const err = new Error("Invalid ID");
    err.statusCode = 400;
    throw err;
  }

  const doc = await Model.findOne({ _id: id, isDeleted: false }).lean();
  if (!doc) {
    const err = new Error("Not found");
    err.statusCode = 404;
    throw err;
  }
  return doc;
};

exports.update = async (Model, id, body) => {
  if (!isValidId(id)) {
    const err = new Error("Invalid ID");
    err.statusCode = 400;
    throw err;
  }

  const doc = await Model.findOne({ _id: id, isDeleted: false });
  if (!doc) {
    const err = new Error("Not found");
    err.statusCode = 404;
    throw err;
  }

  if (body.name !== undefined) doc.name = String(body.name).trim();
  if (body.isActive !== undefined) doc.isActive = body.isActive === "true" || body.isActive === true;

  // extra fields safe assign (Manufacturer, Unit)
  Object.keys(body || {}).forEach((k) => {
    if (["name", "isActive"].includes(k)) return;
    if (body[k] !== undefined) doc[k] = body[k];
  });

  try {
    await doc.save();
  } catch (e) {
    if (e.code === 11000) {
      const err = new Error("Already exists");
      err.statusCode = 409;
      throw err;
    }
    throw e;
  }

  return doc;
};

exports.softDelete = async (Model, id) => {
  if (!isValidId(id)) {
    const err = new Error("Invalid ID");
    err.statusCode = 400;
    throw err;
  }

  const doc = await Model.findOne({ _id: id, isDeleted: false });
  if (!doc) {
    const err = new Error("Not found");
    err.statusCode = 404;
    throw err;
  }

  doc.isDeleted = true;
  await doc.save();
  return true;
};