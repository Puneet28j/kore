const mongoose = require("mongoose");
const MasterCatalog = require("../models/MasterCatalog");

const ALLOWED_PAGE_LIMITS = [10, 20, 30, 50, 100, 200, 500, 1000];

const parseMaybeJson = (val, fallback) => {
  if (val === undefined || val === null) return fallback;
  if (typeof val === "object") return val;
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
};

const makeFileUrl = (req, filePath) => {
  const base = `${req.protocol}://${req.get("host")}`;
  return `${base}/${filePath.replace(/\\/g, "/")}`;
};

const buildImagesPayload = (req) => {
  const body = req.body || {};

  let primaryImage = null;

  if (req.files?.primaryImage?.[0]) {
    const f = req.files.primaryImage[0];
    primaryImage = { url: makeFileUrl(req, f.path), key: f.path };
  } else if (body.primaryImageUrl) {
    primaryImage = { url: body.primaryImageUrl };
  }

  const secondaryImages = [];

  if (req.files?.secondaryImages?.length) {
    for (const f of req.files.secondaryImages) {
      secondaryImages.push({ url: makeFileUrl(req, f.path), key: f.path });
    }
  }

  const secondaryImageUrls = parseMaybeJson(body.secondaryImageUrls, []);
  if (Array.isArray(secondaryImageUrls)) {
    for (const u of secondaryImageUrls) {
      secondaryImages.push({ url: u });
    }
  }

  return { primaryImage, secondaryImages };
};

const normalizeVariants = (variantsRaw) => {
  const variants = Array.isArray(variantsRaw) ? variantsRaw : [];

  return variants.map((v) => {
    const sizeMap = parseMaybeJson(v.sizeMap, v.sizeMap || {});
    return {
      itemName: v.itemName,
      color: v.color || "",
      sizeRange: v.sizeRange || "",
      costPrice: Number(v.costPrice || 0),
      sellingPrice: Number(v.sellingPrice || 0),
      mrp: Number(v.mrp || 0),
      hsnCode: v.hsnCode || "",
      sizeMap: sizeMap || {},
    };
  });
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

const normalizeLimit = (limit) => {
  const parsed = Number(limit);
  if (ALLOWED_PAGE_LIMITS.includes(parsed)) return parsed;
  return 10; // default
};

const normalizePage = (page) => {
  const parsed = Number(page);
  if (!Number.isInteger(parsed) || parsed < 1) return 1;
  return parsed;
};

exports.create = async (req) => {
  const body = req.body || {};
  const { primaryImage, secondaryImages } = buildImagesPayload(req);

  if (!primaryImage?.url) {
    const err = new Error(
      "primaryImage is required (upload file or send primaryImageUrl)"
    );
    err.statusCode = 400;
    throw err;
  }

  const productColors = parseMaybeJson(body.productColors, []);
  const sizeRanges = parseMaybeJson(body.sizeRanges, []);
  const variants = normalizeVariants(parseMaybeJson(body.variants, []));

  const doc = await MasterCatalog.create({
    articleName: body.articleName,
    soleColor: body.soleColor,
    mrp: Number(body.mrp || 0),
    gender: body.gender,
    categoryId: body.categoryId,
    brandId: body.brandId,
    manufacturerCompanyId: body.manufacturerCompanyId,
    unitId: body.unitId,
    productColors: Array.isArray(productColors) ? productColors : [],
    sizeRanges: Array.isArray(sizeRanges) ? sizeRanges : [],
    stage: body.stage || "AVAILABLE",
    expectedAvailableDate: body.expectedAvailableDate || null,
    isActive: parseBoolean(body.isActive, true),
    primaryImage,
    secondaryImages,
    variants,
  });

  return doc;
};

exports.list = async (query) => {
  const {
    q,
    stage,
    categoryId,
    brandId,
    manufacturerCompanyId,
    gender,
    isActive,
    page = 1,
    limit = 10,
  } = query;

  const normalizedPage = normalizePage(page);
  const normalizedLimit = normalizeLimit(limit);
  const skip = (normalizedPage - 1) * normalizedLimit;

  const filter = { isDeleted: false };

  if (stage) filter.stage = stage;
  if (gender) filter.gender = gender;

  if (categoryId && mongoose.Types.ObjectId.isValid(categoryId)) {
    filter.categoryId = categoryId;
  }

  if (brandId && mongoose.Types.ObjectId.isValid(brandId)) {
    filter.brandId = brandId;
  }

  if (
    manufacturerCompanyId &&
    mongoose.Types.ObjectId.isValid(manufacturerCompanyId)
  ) {
    filter.manufacturerCompanyId = manufacturerCompanyId;
  }

  const parsedIsActive = parseBoolean(isActive, undefined);
  if (parsedIsActive !== undefined) {
    filter.isActive = parsedIsActive;
  }

  if (q) {
    filter.$or = [
      { articleName: { $regex: q, $options: "i" } },
      { soleColor: { $regex: q, $options: "i" } },
      { productColors: { $in: [new RegExp(q, "i")] } },
      { "variants.itemName": { $regex: q, $options: "i" } },
      { "variants.color": { $regex: q, $options: "i" } },
      { "variants.hsnCode": { $regex: q, $options: "i" } },
    ];
  }

  // ✅ only requested page data
  const items = await MasterCatalog.find(filter)
    .populate("categoryId", "name")
    .populate("brandId", "name")
    .populate("manufacturerCompanyId", "name")
    .populate("unitId", "name")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(normalizedLimit)
    .lean();

  // ✅ total count alag se pagination ke liye
  const total = await MasterCatalog.countDocuments(filter);

  return {
    items,
    total,
    page: normalizedPage,
    limit: normalizedLimit,
    totalPages: Math.ceil(total / normalizedLimit) || 1,
    hasNextPage: normalizedPage < Math.ceil(total / normalizedLimit),
    hasPrevPage: normalizedPage > 1,
    pageSizeOptions: ALLOWED_PAGE_LIMITS,
  };
};

exports.getById = async (id) => {
  const doc = await MasterCatalog.findOne({ _id: id, isDeleted: false })
    .populate("categoryId", "name")
    .populate("brandId", "name")
    .populate("manufacturerCompanyId", "name")
    .populate("unitId", "name")
    .lean();

  if (!doc) {
    const err = new Error("Not found");
    err.statusCode = 404;
    throw err;
  }

  return doc;
};

exports.update = async (req, id) => {
  const body = req.body || {};
  const isJsonRequest =
    req.headers["content-type"] === "application/json" || !req.files;

  const doc = await MasterCatalog.findOne({ _id: id, isDeleted: false });
  if (!doc) {
    const err = new Error("Not found");
    err.statusCode = 404;
    throw err;
  }

  const patch = {
    articleName: body.articleName,
    soleColor: body.soleColor,
    mrp: body.mrp !== undefined ? Number(body.mrp || 0) : undefined,
    gender: body.gender,
    categoryId: body.categoryId,
    brandId: body.brandId,
    manufacturerCompanyId: body.manufacturerCompanyId,
    unitId: body.unitId,
    stage: body.stage,
    expectedAvailableDate: body.expectedAvailableDate || null,
    isActive: parseBoolean(body.isActive, undefined),
  };

  Object.keys(patch).forEach((k) => {
    if (patch[k] !== undefined) doc[k] = patch[k];
  });

  if (body.productColors !== undefined) {
    const productColors = parseMaybeJson(body.productColors, []);
    doc.productColors = Array.isArray(productColors) ? productColors : [];
  }

  if (body.sizeRanges !== undefined) {
    const sizeRanges = parseMaybeJson(body.sizeRanges, []);
    doc.sizeRanges = Array.isArray(sizeRanges) ? sizeRanges : [];
  }

  const replaceSecondary =
    body.replaceSecondary === "true" || body.replaceSecondary === true;
  if (replaceSecondary) doc.secondaryImages = [];

  const { primaryImage, secondaryImages } = buildImagesPayload(req);

  if (primaryImage?.url) doc.primaryImage = primaryImage;
  if (secondaryImages?.length) doc.secondaryImages.push(...secondaryImages);

  if (body.variants !== undefined) {
    const variantsRaw = parseMaybeJson(body.variants, []);
    doc.variants = normalizeVariants(variantsRaw);
  }

  await doc.save();
  return doc;
};

exports.toggleActive = async (id) => {
  const doc = await MasterCatalog.findOne({ _id: id, isDeleted: false });
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
  const doc = await MasterCatalog.findOne({ _id: id, isDeleted: false });
  if (!doc) {
    const err = new Error("Not found");
    err.statusCode = 404;
    throw err;
  }

  doc.isDeleted = true;
  await doc.save();
  return true;
};
