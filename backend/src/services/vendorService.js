const mongoose = require("mongoose");
const Vendor = require("../models/Vendor");

const ensureValidId = (id, name = "ID") => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const err = new Error(`Invalid ${name}`);
    err.statusCode = 400;
    throw err;
  }
};

const sanitizeVendorPayload = (body = {}) => {
  const v = {
    salutation: body.salutation,
    firstName: body.firstName,
    lastName: body.lastName,

    companyName: body.companyName,
    displayName: body.displayName,
    email: body.email,

    workPhone: body.workPhone,
    mobile: body.mobile,

    pan: body.pan,
    msmeRegistered: body.msmeRegistered,

    currency: body.currency,
    paymentTerms: body.paymentTerms,
    tds: body.tds,

    enablePortal: body.enablePortal,

    billingAddress: body.billingAddress,
    shippingAddress: body.shippingAddress,

    bankDetails: Array.isArray(body.bankDetails) ? body.bankDetails : undefined,
  };

  // remove undefined keys
  Object.keys(v).forEach((k) => v[k] === undefined && delete v[k]);
  return v;
};

exports.create = async (body) => {
  if (!body?.displayName?.trim()) {
    const err = new Error("displayName is required");
    err.statusCode = 400;
    throw err;
  }

  // optional: email uniqueness check (if you want)
  // if (body.email) { ... }

  const payload = sanitizeVendorPayload(body);

  // bankDetails: map frontend "id" -> "rowId"
  if (Array.isArray(payload.bankDetails)) {
    payload.bankDetails = payload.bankDetails.map((b) => ({
      rowId: b.id || b.rowId || "",
      accountHolderName: b.accountHolderName || "",
      bankName: b.bankName || "",
      accountNumber: b.accountNumber || "",
      ifsc: (b.ifsc || "").toUpperCase(),
    }));
  }

  const doc = await Vendor.create(payload);
  return doc;
};

exports.list = async (query) => {
  const { q, page = 1, limit = 20 } = query;

  const filter = { isDeleted: false };

  if (q) {
    filter.$or = [
      { displayName: { $regex: q, $options: "i" } },
      { companyName: { $regex: q, $options: "i" } },
      { email: { $regex: q, $options: "i" } },
      { mobile: { $regex: q, $options: "i" } },
      { workPhone: { $regex: q, $options: "i" } },
    ];
  }

  const skip = (Number(page) - 1) * Number(limit);

  const [items, total] = await Promise.all([
    Vendor.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
    Vendor.countDocuments(filter),
  ]);

  return { items, total, page: Number(page), limit: Number(limit) };
};

exports.getById = async (id) => {
  ensureValidId(id, "vendor id");
  const doc = await Vendor.findOne({ _id: id, isDeleted: false }).lean();
  if (!doc) {
    const err = new Error("Not found");
    err.statusCode = 404;
    throw err;
  }
  return doc;
};

exports.update = async (id, body) => {
  ensureValidId(id, "vendor id");

  const doc = await Vendor.findOne({ _id: id, isDeleted: false });
  if (!doc) {
    const err = new Error("Not found");
    err.statusCode = 404;
    throw err;
  }

  if (body.displayName !== undefined && !String(body.displayName).trim()) {
    const err = new Error("displayName cannot be empty");
    err.statusCode = 400;
    throw err;
  }

  const payload = sanitizeVendorPayload(body);

  // replace bankDetails only if provided
  if (payload.bankDetails !== undefined) {
    payload.bankDetails = payload.bankDetails.map((b) => ({
      rowId: b.id || b.rowId || "",
      accountHolderName: b.accountHolderName || "",
      bankName: b.bankName || "",
      accountNumber: b.accountNumber || "",
      ifsc: (b.ifsc || "").toUpperCase(),
    }));
    doc.bankDetails = payload.bankDetails;
    delete payload.bankDetails;
  }

  // apply remaining fields
  Object.keys(payload).forEach((k) => {
    doc[k] = payload[k];
  });

  await doc.save();
  return doc;
};

exports.softDelete = async (id) => {
  ensureValidId(id, "vendor id");

  const doc = await Vendor.findOne({ _id: id, isDeleted: false });
  if (!doc) {
    const err = new Error("Not found");
    err.statusCode = 404;
    throw err;
  }

  doc.isDeleted = true;
  await doc.save();
  return true;
};