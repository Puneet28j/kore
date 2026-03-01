const MasterCatalog = require("../models/MasterCatalog");

/**
 * multipart/form-data me JSON string aa sakta hai
 * json me already object/array hota hai
 */
const parseMaybeJson = (val, fallback) => {
  if (val === undefined || val === null) return fallback;
  if (typeof val === "object") return val; // already parsed
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

  // primary: file OR url
  let primaryImage = null;

  if (req.files?.primaryImage?.[0]) {
    const f = req.files.primaryImage[0];
    primaryImage = { url: makeFileUrl(req, f.path), key: f.path };
  } else if (body.primaryImageUrl) {
    primaryImage = { url: body.primaryImageUrl };
  }

  // secondary: files + urls
  const secondaryImages = [];

  if (req.files?.secondaryImages?.length) {
    for (const f of req.files.secondaryImages) {
      secondaryImages.push({ url: makeFileUrl(req, f.path), key: f.path });
    }
  }

  const secondaryImageUrls = parseMaybeJson(body.secondaryImageUrls, []);
  if (Array.isArray(secondaryImageUrls)) {
    for (const u of secondaryImageUrls) secondaryImages.push({ url: u });
  }

  return { primaryImage, secondaryImages };
};

/** ✅ frontend table ke hisaab se variants normalize */
const normalizeVariants = (variantsRaw) => {
  const variants = Array.isArray(variantsRaw) ? variantsRaw : [];
  return variants.map((v) => {
    // sizeMap: object ya map string dono aa sakta hai
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

exports.create = async (req) => {
  const body = req.body || {};

  const { primaryImage, secondaryImages } = buildImagesPayload(req);

  if (!primaryImage?.url) {
    const err = new Error("primaryImage is required (upload file or send primaryImageUrl)");
    err.statusCode = 400;
    throw err;
  }

  const productColors = parseMaybeJson(body.productColors, []);
  const sizeRanges = parseMaybeJson(body.sizeRanges, []);
  const variants = normalizeVariants(parseMaybeJson(body.variants, []));

  const doc = await MasterCatalog.create({
    // ---- PART 1 ----
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

    primaryImage,
    secondaryImages,

    // ---- PART 2 ----
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
    page = 1,
    limit = 20,
  } = query;

  const filter = { isDeleted: false };

  if (stage) filter.stage = stage;
  if (categoryId) filter.categoryId = categoryId;
  if (brandId) filter.brandId = brandId;
  if (manufacturerCompanyId) filter.manufacturerCompanyId = manufacturerCompanyId;
  if (gender) filter.gender = gender;

  if (q) {
    filter.$or = [
      { articleName: { $regex: q, $options: "i" } },
      { soleColor: { $regex: q, $options: "i" } },
      { productColors: { $in: [new RegExp(q, "i")] } },
    ];
  }

  const skip = (Number(page) - 1) * Number(limit);

  const [items, total] = await Promise.all([
    MasterCatalog.find(filter)
      .populate("categoryId", "name")
      .populate("brandId", "name")
      .populate("manufacturerCompanyId", "name")
      .populate("unitId", "name")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    MasterCatalog.countDocuments(filter),
  ]);

  return { items, total, page: Number(page), limit: Number(limit) };
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

  const doc = await MasterCatalog.findOne({ _id: id, isDeleted: false });
  if (!doc) {
    const err = new Error("Not found");
    err.statusCode = 404;
    throw err;
  }

  // ---- base fields (only if provided) ----
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
  };

  Object.keys(patch).forEach((k) => {
    if (patch[k] !== undefined) doc[k] = patch[k];
  });

  // ---- attributes arrays ----
  if (body.productColors !== undefined) {
    const productColors = parseMaybeJson(body.productColors, []);
    doc.productColors = Array.isArray(productColors) ? productColors : [];
  }

  if (body.sizeRanges !== undefined) {
    const sizeRanges = parseMaybeJson(body.sizeRanges, []);
    doc.sizeRanges = Array.isArray(sizeRanges) ? sizeRanges : [];
  }

  // ---- images ----
  const replaceSecondary = body.replaceSecondary === "true" || body.replaceSecondary === true;
  if (replaceSecondary) doc.secondaryImages = [];

  const { primaryImage, secondaryImages } = buildImagesPayload(req);

  if (primaryImage?.url) doc.primaryImage = primaryImage;
  if (secondaryImages?.length) doc.secondaryImages.push(...secondaryImages);

  // ---- variants (replace only if provided) ----
  if (body.variants !== undefined) {
    const variantsRaw = parseMaybeJson(body.variants, []);
    doc.variants = normalizeVariants(variantsRaw);
  }

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