const mongoose = require("mongoose");
const Vendor = require("../models/Vendor");

const ALLOWED_PAGE_LIMITS = [10, 20, 30, 50, 100, 200, 500, 1000];

const ensureValidId = (id, name = "ID") => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const err = new Error(`Invalid ${name}`);
    err.statusCode = 400;
    throw err;
  }
};

const normalizePage = (page) => {
  const parsed = Number(page);
  if (!Number.isInteger(parsed) || parsed < 1) return 1;
  return parsed;
};

const normalizeLimit = (limit) => {
  const parsed = Number(limit);
  if (ALLOWED_PAGE_LIMITS.includes(parsed)) return parsed;
  return 10;
};

const parseBoolean = (value, fallback = undefined) => {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;

  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (v === "true") return true;
    if (v === "false") return false;
  }

  return fallback;
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

    gstNumber: body.gstNumber,
    cinNumber: body.cinNumber,
    vendorCode: body.vendorCode,
    pan: body.pan,
    brand: body.brand,
    msmeRegistered: body.msmeRegistered,

    currency: body.currency,
    paymentTerms: body.paymentTerms,
    tds: body.tds,

    enablePortal: body.enablePortal,
    isActive: body.isActive,

    billingAddress: body.billingAddress,
    shippingAddress: body.shippingAddress,

    bankDetails: Array.isArray(body.bankDetails) ? body.bankDetails : undefined,

    isActive: parseBoolean(body.isActive, undefined),
  };

  Object.keys(v).forEach((k) => v[k] === undefined && delete v[k]);
  return v;
};

exports.create = async (body) => {
  if (!body?.displayName?.trim()) {
    const err = new Error("displayName is required");
    err.statusCode = 400;
    throw err;
  }

  const payload = sanitizeVendorPayload(body);

  if (Array.isArray(payload.bankDetails)) {
    payload.bankDetails = payload.bankDetails.map((b) => ({
      rowId: b.id || b.rowId || "",
      accountHolderName: b.accountHolderName || "",
      bankName: b.bankName || "",
      accountNumber: b.accountNumber || "",
      ifsc: (b.ifsc || "").toUpperCase(),
    }));
  }

  if (payload.isActive === undefined) {
    payload.isActive = true;
  }

  const doc = await Vendor.create(payload);
  return doc;
};

exports.list = async (query) => {
  const { q, page = 1, limit = 10, isActive } = query;

  const normalizedPage = normalizePage(page);
  const normalizedLimit = normalizeLimit(limit);
  const skip = (normalizedPage - 1) * normalizedLimit;

  const filter = { isDeleted: false };

  const parsedIsActive = parseBoolean(isActive, undefined);
  if (parsedIsActive !== undefined) {
    filter.isActive = parsedIsActive;
  }

  if (q) {
    filter.$or = [
      { displayName: { $regex: q, $options: "i" } },
      { companyName: { $regex: q, $options: "i" } },
      { email: { $regex: q, $options: "i" } },
      { mobile: { $regex: q, $options: "i" } },
      { workPhone: { $regex: q, $options: "i" } },
      { vendorCode: { $regex: q, $options: "i" } },
      { brand: { $regex: q, $options: "i" } },
    ];
  }

  const [items, total] = await Promise.all([
    Vendor.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(normalizedLimit)
      .lean(),
    Vendor.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(total / normalizedLimit) || 1;

  return {
    items,
    total,
    page: normalizedPage,
    limit: normalizedLimit,
    totalPages,
    hasNextPage: normalizedPage < totalPages,
    hasPrevPage: normalizedPage > 1,
    pageSizeOptions: ALLOWED_PAGE_LIMITS,
  };
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

  Object.keys(payload).forEach((k) => {
    doc[k] = payload[k];
  });

  await doc.save();
  return doc;
};

exports.toggleActive = async (id) => {
  ensureValidId(id, "vendor id");

  const doc = await Vendor.findOne({ _id: id, isDeleted: false });
  if (!doc) {
    const err = new Error("Not found");
    err.statusCode = 404;
    throw err;
  }

  doc.isActive = !doc.isActive;
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
