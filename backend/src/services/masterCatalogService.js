const MasterCatalog = require("../models/MasterCatalog");

/**
 * multipart/form-data me JSON string aa sakta hai
 */
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
  const body = req.body;

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

exports.create = async (req) => {
  const body = req.body;

  const variants = parseMaybeJson(body.variants, []);
  const { primaryImage, secondaryImages } = buildImagesPayload(req);

  if (!primaryImage?.url) {
    const err = new Error("primaryImage is required (upload file or send primaryImageUrl)");
    err.statusCode = 400;
    throw err;
  }

  const doc = await MasterCatalog.create({
    // PART 1
    articleName: body.articleName,
    soleColor: body.soleColor,
    gender: body.gender,

    categoryId: body.categoryId,
    brandId: body.brandId,
    manufacturerCompanyId: body.manufacturerCompanyId,
    unitId: body.unitId,

    stage: body.stage || "AVAILABLE",
    expectedAvailableDate: body.expectedAvailableDate || null,

    primaryImage,
    secondaryImages,

    // PART 2 (order preserved)
    variants: Array.isArray(variants) ? variants : [],
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
    ];
  }

  const skip = (Number(page) - 1) * Number(limit);

  const [items, total] = await Promise.all([
    MasterCatalog.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    MasterCatalog.countDocuments(filter),
  ]);

  return { items, total, page: Number(page), limit: Number(limit) };
};

exports.getById = async (id) => {
  const doc = await MasterCatalog.findOne({ _id: id, isDeleted: false }).lean();
  if (!doc) {
    const err = new Error("Not found");
    err.statusCode = 404;
    throw err;
  }
  return doc;
};

exports.update = async (req, id) => {
  const body = req.body;

  const doc = await MasterCatalog.findOne({ _id: id, isDeleted: false });
  if (!doc) {
    const err = new Error("Not found");
    err.statusCode = 404;
    throw err;
  }

  // base fields
  const update = {
    articleName: body.articleName,
    soleColor: body.soleColor,
    gender: body.gender,

    categoryId: body.categoryId,
    brandId: body.brandId,
    manufacturerCompanyId: body.manufacturerCompanyId,
    unitId: body.unitId,

    stage: body.stage,
    expectedAvailableDate: body.expectedAvailableDate || null,
  };

  Object.keys(update).forEach((k) => {
    if (update[k] !== undefined) doc[k] = update[k];
  });

  // images
  const replaceSecondary = body.replaceSecondary === "true" || body.replaceSecondary === true;
  if (replaceSecondary) doc.secondaryImages = [];

  const { primaryImage, secondaryImages } = buildImagesPayload(req);

  if (primaryImage?.url) doc.primaryImage = primaryImage;
  if (secondaryImages?.length) doc.secondaryImages.push(...secondaryImages);

  // variants (replace only if provided)
  const variants = parseMaybeJson(body.variants, null);
  if (Array.isArray(variants)) {
    doc.variants = variants; // ✅ order preserved
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