const mongoose = require("mongoose");
const MasterCatalog = require("../models/MasterCatalog");

const ALLOWED_PAGE_LIMITS = [1, 2, 5, 10, 12, 20, 24, 30, 50, 100, 200, 500, 1000];

const parseMaybeJson = (val, fallback) => {
  if (val === undefined || val === null) return fallback;
  if (typeof val === "object") return val;
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
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
  return 10;
};

const normalizePage = (page) => {
  const parsed = Number(page);
  if (!Number.isInteger(parsed) || parsed < 1) return 1;
  return parsed;
};

const makeFileUrl = (req, filePath) => {
  // Normalise to forward slashes (Windows compatibility)
  const forwardSlash = filePath.replace(/\\/g, "/");
  // Ensure it starts with / so it is a proper server-relative URL
  return forwardSlash.startsWith("/") ? forwardSlash : `/${forwardSlash}`;
};

const buildColorMediaFromUrls = (colorImageUrlsRaw, productColors = []) => {
  let urlMap = {};
  try { urlMap = typeof colorImageUrlsRaw === "string" ? JSON.parse(colorImageUrlsRaw) : (colorImageUrlsRaw || {}); } catch {}
  return productColors
    .filter((color) => urlMap[color])
    .map((color) => ({ color, images: [{ url: urlMap[color], key: "", isCover: true }] }));
};

const buildColorMediaPayload = (req, productColors = []) => {
  const files = Array.isArray(req.files) ? req.files : [];
  const colorMedia = [];

  for (const color of productColors) {
    const fieldName = `images_${color}`;
    const colorFiles = files.filter((f) => f.fieldname === fieldName);

    if (!colorFiles.length) continue;

    const images = colorFiles.map((f, idx) => ({
      url: makeFileUrl(req, f.path),
      key: f.path,
      isCover: idx === 0,
    }));

    colorMedia.push({
      color,
      images,
    });
  }

  return colorMedia;
};

const buildFlatImagesFromColorMedia = (colorMedia = []) => {
  const allImages = [];

  colorMedia.forEach((cm) => {
    cm.images.forEach((img) => {
      allImages.push({
        url: img.url,
        key: img.key || "",
      });
    });
  });

  return {
    primaryImage: allImages[0] || { url: "", key: "" },
    secondaryImages: allImages.slice(1),
  };
};

const normalizeVariants = (variantsRaw) => {
  const variants = Array.isArray(variantsRaw) ? variantsRaw : [];

  return variants.map((v) => {
    const sizeMap = {};
    const sizeQuantities = {};
    const sizeSkus = {};

    // 1. Process Assortment (Breakup)
    if (v.sizeQuantities && typeof v.sizeQuantities === "object") {
      Object.keys(v.sizeQuantities).forEach((size) => {
        sizeQuantities[size] = Number(v.sizeQuantities[size] || 0);
        sizeSkus[size] = v.sizeSkus?.[size] || "";
      });
    }

    // 2. Process Inventory Stock (Physical Warehouse Qty)
    if (v.sizeMap && typeof v.sizeMap === "object") {
      Object.keys(v.sizeMap).forEach((size) => {
        const cell = v.sizeMap[size] || {};
        sizeMap[size] = {
          qty: Number(cell.qty || 0),
          sku: cell.sku || "",
        };
      });
    } else if (v.sizeQuantities && typeof v.sizeQuantities === "object") {
      // Fallback: Initialize stock to 0 but keep SKU
      Object.keys(v.sizeQuantities).forEach((size) => {
        sizeMap[size] = {
          qty: 0,
          sku: v.sizeSkus?.[size] || "",
        };
      });
    }

    const tag = ["online", "offline"].includes(v.tag) ? v.tag : "online";
    const onlineMrp  = Number(v.onlineMrp  || 0);
    const offlineMrp = Number(v.offlineMrp || 0);
    // Backward-compat: mrp = max(online, offline) or explicit mrp
    const mrp = Number(v.mrp || 0) || Math.max(onlineMrp, offlineMrp);

    // Auto-generate sizeSkus from carton-level sku + sizeRange if sku provided
    const ctnSku     = (v.sku || "").trim();
    const sizeRange  = (v.sizeRange || "").trim();
    const derivedSizeSkus = autoGenerateSizeSkus(ctnSku, sizeRange, Object.keys(sizeQuantities));
    // Merge: explicit sizeSkus take priority over derived ones
    const finalSizeSkus = { ...derivedSizeSkus, ...sizeSkus };

    return {
      _id: v._id || v.id || undefined,
      itemName: v.itemName,
      color: v.color || "",
      sizeRange,
      sizeRangeId: v.sizeRangeId || "",
      costPrice: Number(v.costPrice || 0),
      sellingPrice: Number(v.sellingPrice || 0),
      mrp,
      hsnCode: v.hsnCode || "",
      sizeMap,
      sizeQuantities,
      sizeSkus: finalSizeSkus,
      isActive: parseBoolean(v.isActive, true),
      tag,
      onlineMrp,
      offlineMrp,
      sku: ctnSku,
    };
  });
};

// Strip gender letter from a base string (e.g. "ARM-NVY-M-" → "ARM-NVY-")
// A gender segment is a single letter immediately before the size range.
function stripGenderFromBase(base) {
  // base ends with "-" (e.g. "ARM-NVY-M-")
  const withoutTrail = base.endsWith("-") ? base.slice(0, -1) : base;
  const segments = withoutTrail.split("-");
  const last = segments[segments.length - 1] || "";
  if (last.length === 1 && /^[A-Za-z]$/.test(last)) {
    // Remove the single-letter gender segment and restore trailing dash
    return withoutTrail.slice(0, -(last.length + 1)) + "-";
  }
  return base;
}

// Auto-generate per-size SKUs from carton SKU (e.g. slk-blk-5-9 → {5:slk-blk-5, 6:slk-blk-6 ...})
// Gender letter in SKU (e.g. ARM-NVY-M-6-10) is stripped from per-pair SKUs → ARM-NVY-6 etc.
function autoGenerateSizeSkus(ctnSku, sizeRange, sizeKeys) {
  if (!ctnSku || !sizeKeys.length) return {};
  const result = {};
  let base = null;
  // Strategy 1: exact sizeRange suffix (e.g. "amr-gry-7-11" ends with "7-11")
  if (sizeRange && ctnSku.endsWith(sizeRange)) {
    base = ctnSku.slice(0, ctnSku.length - sizeRange.length);
  }
  // Strategy 2: regex — strip trailing -startSize-endSize regardless of stored sizeRange
  if (base === null) {
    const m = ctnSku.match(/^(.*)-\d+-\d+$/);
    if (m) base = m[1] + "-";
  }
  if (base !== null) {
    base = stripGenderFromBase(base);
    sizeKeys.forEach(sz => { result[sz] = `${base}${sz}`; });
  } else {
    sizeKeys.forEach(sz => { result[sz] = `${ctnSku}-${sz}`; });
  }
  return result;
}

const makeCompositeKey = (v) => {
  return `${(v.color || "").trim().toLowerCase()}|${(v.sizeRange || "")
    .trim()
    .toLowerCase()}|${(v.sizeRangeId || "").trim()}`;
};

const makeLegacyFallbackKey = (v) => {
  return `${(v.itemName || "").trim().toLowerCase()}|${(v.color || "")
    .trim()
    .toLowerCase()}|${(v.sizeRange || "").trim().toLowerCase()}`;
};

exports.create = async (req) => {
  const body = req.body || {};

  const articleName = (body.articleName || "").trim();

  const productColors = parseMaybeJson(body.productColors, []);
  const sizeRanges = parseMaybeJson(body.sizeRanges, []);
  const variants = normalizeVariants(parseMaybeJson(body.variants, []));

  const colorImageUrls = body.colorImageUrls;
  const colorMedia = colorImageUrls
    ? buildColorMediaFromUrls(colorImageUrls, Array.isArray(productColors) ? productColors : [])
    : buildColorMediaPayload(req, Array.isArray(productColors) ? productColors : []);

  const { primaryImage, secondaryImages } =
    buildFlatImagesFromColorMedia(colorMedia);

  if (!primaryImage?.url && !colorImageUrls) {
    const err = new Error("At least one product image is required");
    err.statusCode = 400;
    throw err;
  }

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
    colorMedia,
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
    sort,
    page = 1,
    limit = 10,
  } = query;

  const normalizedPage = normalizePage(page);
  const normalizedLimit = normalizeLimit(limit);
  const skip = (normalizedPage - 1) * normalizedLimit;

  const filter = { isDeleted: false };

  if (stage === "WISHLIST") {
    filter.stage = "WISHLIST";
  } else if (stage === "AVAILABLE") {
    filter.stage = { $ne: "WISHLIST" };
  } else if (stage) {
    filter.stage = stage;
  }
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
      { "variants.sizeRange": { $regex: q, $options: "i" } },
    ];
  }

  let sortObj = { createdAt: -1 };
  if (sort === "price_asc") sortObj = { mrp: 1, createdAt: -1 };
  else if (sort === "price_desc") sortObj = { mrp: -1, createdAt: -1 };
  else if (sort === "name_asc") sortObj = { articleName: 1 };
  else if (sort === "oldest") sortObj = { createdAt: 1 };
  else if (sort === "newest") sortObj = { createdAt: -1 };

  const items = await MasterCatalog.find(filter)
    .populate("categoryId", "name")
    .populate("brandId", "name")
    .populate("manufacturerCompanyId", "name")
    .populate("unitId", "name")
    .sort(sortObj)
    .skip(skip)
    .limit(normalizedLimit)
    .lean();

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

/** Company-wide live + blocked pair totals across all non-deleted catalog items */
exports.getStockTotals = async (stage) => {
  const matchStage = { isDeleted: false };
  if (stage) matchStage.stage = stage;
  const [row] = await MasterCatalog.aggregate([
    { $match: matchStage },
    { $unwind: { path: "$variants", preserveNullAndEmptyArrays: false } },
    {
      $project: {
        sizeCells: {
          $objectToArray: { $ifNull: ["$variants.sizeMap", {}] },
        },
      },
    },
    { $unwind: { path: "$sizeCells", preserveNullAndEmptyArrays: false } },
    {
      $group: {
        _id: null,
        totalLivePairs: {
          $sum: { $convert: { input: "$sizeCells.v.qty", to: "double", onError: 0, onNull: 0 } },
        },
      },
    },
  ]);

  return {
    totalLivePairs: Math.max(0, Math.round(row?.totalLivePairs || 0)),
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

  // Propagate article-level onlineMrp/offlineMrp to all matching variants
  const newOnlineMrp = body.onlineMrp !== undefined ? Number(body.onlineMrp) : null;
  const newOfflineMrp = body.offlineMrp !== undefined ? Number(body.offlineMrp) : null;
  if (newOnlineMrp !== null || newOfflineMrp !== null) {
    (doc.variants || []).forEach((v) => {
      const tag = (v.tag || "").toLowerCase();
      if (newOnlineMrp !== null && tag === "online") {
        v.onlineMrp = newOnlineMrp;
        v.mrp = newOnlineMrp;
      } else if (newOfflineMrp !== null && tag === "offline") {
        v.offlineMrp = newOfflineMrp;
        v.mrp = newOfflineMrp;
      } else if (newOnlineMrp !== null && !tag) {
        // Untagged variant — use the higher of the two as default mrp
        v.onlineMrp = newOnlineMrp;
        if (newOfflineMrp !== null) v.offlineMrp = newOfflineMrp;
        v.mrp = Math.max(newOnlineMrp, newOfflineMrp ?? newOnlineMrp);
      }
    });
  }

  if (body.productColors !== undefined) {
    const productColors = parseMaybeJson(body.productColors, []);
    doc.productColors = Array.isArray(productColors) ? productColors : [];
  }

  if (body.sizeRanges !== undefined) {
    const sizeRanges = parseMaybeJson(body.sizeRanges, []);
    doc.sizeRanges = Array.isArray(sizeRanges) ? sizeRanges : [];
  }

  if (body.variants !== undefined) {
    const variantsRaw = parseMaybeJson(body.variants, []);
    const normalized = normalizeVariants(variantsRaw);

    const existingById = new Map(
      doc.variants.map((v) => [v._id.toString(), v])
    );

    const existingByComposite = new Map(
      doc.variants.map((v) => [makeCompositeKey(v), v])
    );

    const existingByLegacyFallback = new Map(
      doc.variants.map((v) => [makeLegacyFallbackKey(v), v])
    );

    const newVariants = [];

    normalized.forEach((v) => {
      let matched = null;

      // 1. Primary match by DB _id
      if (v._id && existingById.has(v._id.toString())) {
        matched = existingById.get(v._id.toString());
      }

      // 2. Secondary match by color + sizeRange + sizeRangeId
      if (!matched && v.sizeRangeId) {
        const compositeKey = makeCompositeKey(v);
        if (existingByComposite.has(compositeKey)) {
          matched = existingByComposite.get(compositeKey);
        }
      }

      // 3. Legacy fallback for old data
      if (!matched) {
        const fallbackKey = makeLegacyFallbackKey(v);
        if (existingByLegacyFallback.has(fallbackKey)) {
          matched = existingByLegacyFallback.get(fallbackKey);
        }
      }

      if (matched) {
        matched.itemName = v.itemName;
        matched.color = v.color;
        matched.sizeRange = v.sizeRange;
        matched.sizeRangeId = v.sizeRangeId || matched.sizeRangeId || "";
        matched.costPrice = v.costPrice;
        matched.sellingPrice = v.sellingPrice;
        matched.mrp = v.mrp;
        matched.hsnCode = v.hsnCode;
        matched.sizeMap = v.sizeMap;
        matched.sizeQuantities = v.sizeQuantities;
        matched.sizeSkus = v.sizeSkus;
        matched.isActive = v.isActive;
        if (v.tag) matched.tag = v.tag;
        if (v.onlineMrp !== undefined) matched.onlineMrp = v.onlineMrp;
        if (v.offlineMrp !== undefined) matched.offlineMrp = v.offlineMrp;
        // sku + sizeSkus: only update if new sku provided (preserve manual edits otherwise)
        if (v.sku) { matched.sku = v.sku; matched.sizeSkus = v.sizeSkus; }

        existingById.delete(matched._id.toString());
        existingByComposite.delete(makeCompositeKey(matched));
        existingByLegacyFallback.delete(makeLegacyFallbackKey(matched));

        newVariants.push(matched);
      } else {
        const vCopy = { ...v };
        delete vCopy._id;
        newVariants.push(vCopy);
      }
    });

    doc.variants = newVariants;
  }

  const hasNewColorImages =
    Array.isArray(req.files) &&
    req.files.some((f) => f.fieldname && f.fieldname.startsWith("images_"));

  const replaceColorMedia =
    body.replaceColorMedia === "true" || body.replaceColorMedia === true;

  if (hasNewColorImages) {
    const incomingColorMedia = buildColorMediaPayload(req, doc.productColors);

    const existingMap = new Map(
      (doc.colorMedia || []).map((cm) => [cm.color, cm.images || []])
    );

    incomingColorMedia.forEach((cm) => {
      // replaceColorMedia only replaces images for the color(s) actually
      // re-uploaded — colors not present in this request keep their existing media.
      const oldImages = replaceColorMedia ? [] : existingMap.get(cm.color) || [];
      existingMap.set(cm.color, [...oldImages, ...cm.images]);
    });

    doc.colorMedia = Array.from(existingMap.entries()).map(
      ([color, images]) => ({
        color,
        images: images.map((img, idx) => ({
          ...img,
          isCover: idx === 0,
        })),
      })
    );

    const { primaryImage, secondaryImages } = buildFlatImagesFromColorMedia(
      doc.colorMedia
    );
    doc.primaryImage = primaryImage;
    doc.secondaryImages = secondaryImages;
  }

  await doc.save();

  // ── Price propagation to PENDING + PRE_BOOKED orders ─────────────────────
  // Priority: article-level MRP (if changed) → variant sellingPrice (if changed)
  try {
    const { propagatePriceUpdate } = require("./order.service");
    let pricePerPair = null;

    if (body.mrp !== undefined && Number(body.mrp) > 0) {
      // Article-level MRP changed — use it as the per-pair price for orders
      pricePerPair = Number(body.mrp);
    } else if (body.variants !== undefined) {
      // Variant sellingPrice changed — use first active variant's price
      const activeVariant = (doc.variants || []).find(v => v.isActive !== false);
      if (activeVariant && activeVariant.sellingPrice > 0) {
        pricePerPair = activeVariant.sellingPrice;
      }
    }

    if (pricePerPair) {
      await propagatePriceUpdate(doc._id, pricePerPair);
    }
  } catch (e) {
    console.error("Price propagation failed:", e.message);
  }

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

exports.getVariantStock = async (variantId) => {
  const PurchaseOrder = require("../models/PurchaseOrder");
  const MasterCatalog = require("../models/MasterCatalog");

  const catalog = await MasterCatalog.findOne({ "variants._id": variantId });
  if (!catalog) {
    const err = new Error("Variant not found");
    err.statusCode = 404;
    throw err;
  }

  const variant = catalog.variants.id(variantId);
  if (!variant) {
    const err = new Error("Variant not found in catalog");
    err.statusCode = 404;
    throw err;
  }

  const GRNDraft = require("../models/grn.model");
  const Order = require("../models/Order");
  const Return = require("../models/Return");

  const liveStockMap = {};
  const poMap = {};

  // 1. Build SKU-to-Size mapping for the variant
  const skuToSize = {};
  const variantSizes = [];
  
  // Robust Map to JSON conversion for Mongoose
  const sizeMapData = variant.sizeMap && typeof variant.sizeMap.toJSON === 'function' ? variant.sizeMap.toJSON() : (variant.sizeMap || {});
  const sizeSkusData = variant.sizeSkus && typeof variant.sizeSkus.toJSON === 'function' ? variant.sizeSkus.toJSON() : (variant.sizeSkus || {});

  // Seed totalReceived from sizeMap.qty — this reflects manual Stock Inward/Outward movements
  // GRN-based receipts will be layered on top below, but ONLY if no sizeMap.qty exists yet
  // (prevents double-counting when sizeMap is also updated by GRN submit)
  const sizeMapBaseStock = {};
  Object.entries(sizeMapData).forEach(([size, cell]) => {
    const cleanSize = size.trim();
    const qty = Number(cell?.qty || 0);
    if (qty > 0) sizeMapBaseStock[cleanSize] = qty;
  });

  Object.entries(sizeMapData).forEach(([size, cell]) => {
    const cleanSize = size.trim();
    variantSizes.push(cleanSize);
    if (cell && cell.sku) {
      skuToSize[String(cell.sku).trim().toLowerCase()] = cleanSize;
    }
  });

  Object.entries(sizeSkusData).forEach(([size, sku]) => {
    if (sku) {
      const cleanSize = size.trim();
      skuToSize[String(sku).trim().toLowerCase()] = cleanSize;
      if (!variantSizes.includes(cleanSize)) variantSizes.push(cleanSize);
    }
  });

  console.log(`[DEBUG DYNAMIC] SKU to Size Map:`, skuToSize);
  console.log(`[DEBUG DYNAMIC] Valid Variant Sizes:`, variantSizes);

  // 2. DYNAMIC CALCULATION: Total Received from GRNs
  const submittedGRNs = await GRNDraft.find({ 
    "cartons.variantId": variantId.toString(),
    status: "SUBMITTED" 
  }).lean();

  console.log(`[LIVE-STOCK-DEBUG] Found ${submittedGRNs.length} submitted GRNs for variant "${variant.itemName}" (ID: ${variantId})`);

  // Fetch unique POs to get their SKU maps and quantity breakups
  const poNumbers = [...new Set(submittedGRNs.filter(g => g.refType === 'PO').map(g => g.refId))];
  const poDocs = await PurchaseOrder.find({ poNumber: { $in: poNumbers } }).lean();
  const poLookup = poDocs.reduce((acc, p) => { acc[p.poNumber] = p; return acc; }, {});

  console.log(`[LIVE-STOCK-DEBUG] Fetched ${poDocs.length} unique POs: ${poNumbers.join(", ")}`);

  // Expand skuToSize with SKUs from all relevant POs
  poDocs.forEach(po => {
    const poItem = po.items.find(it => 
      (it.variantId && String(it.variantId) === variantId.toString())
    );
    if (poItem && poItem.sizeMap) {
      const poSizeMap = poItem.sizeMap && typeof poItem.sizeMap.toJSON === 'function' ? poItem.sizeMap.toJSON() : poItem.sizeMap;
      const skusCount = Object.values(poSizeMap).filter(v => v.sku).length;
      console.log(`[LIVE-STOCK-DEBUG] PO "${po.poNumber}" item match found. SKUs in PO: ${skusCount}`);
      
      Object.entries(poSizeMap).forEach(([size, cell]) => {
        if (cell && cell.sku) {
          skuToSize[String(cell.sku).trim().toLowerCase()] = size.trim();
        }
      });
    } else {
      console.log(`[LIVE-STOCK-DEBUG] PO "${po.poNumber}" - No matching item found for variant "${variant.itemName}"`);
    }
  });

  const totalReceived = {};
  const receivedPerPO = {}; // { poNumber: { size: qty } }
  let totalBarcodesProcessed = 0;
  let totalMatchesFound = 0;

  // ── PRIMARY: SKU-based barcode matching (using Master + all PO SKUs) ──
  submittedGRNs.forEach(grn => {
    (grn.cartons || []).forEach(carton => {
      const isMatch = (carton.variantId && String(carton.variantId) === variantId.toString());
      if (!isMatch) return;

      (carton.pairBarcodes || []).forEach(barcode => {
        totalBarcodesProcessed++;
        const cleanBar = String(barcode).trim().toLowerCase();
        let sz = skuToSize[cleanBar];

        if (!sz) {
          const matchedSize = variantSizes.find(vSize => {
            const lowVSize = String(vSize).toLowerCase();
            return cleanBar.endsWith("-" + lowVSize) || cleanBar.endsWith(" " + lowVSize);
          });
          if (matchedSize) {
            sz = matchedSize;
            skuToSize[cleanBar] = sz;
          }
        }

        if (sz) {
          totalMatchesFound++;
          totalReceived[sz] = (totalReceived[sz] || 0) + 1;

          if (grn.refType === 'PO') {
            const poNum = grn.refId;
            if (!receivedPerPO[poNum]) receivedPerPO[poNum] = {};
            receivedPerPO[poNum][sz] = (receivedPerPO[poNum][sz] || 0) + 1;
          }
        }
      });
    });
  });

  console.log(`[LIVE-STOCK-DEBUG] SKU Matching: Processed ${totalBarcodesProcessed} barcodes, Found ${totalMatchesFound} matches`);

  // ── FALLBACK: Use PO quantity breakup if SKU matching found nothing ──
  const skuMatchedTotal = Object.values(totalReceived).reduce((s, v) => s + v, 0);

  if (skuMatchedTotal === 0 && submittedGRNs.length > 0) {
    console.log(`[LIVE-STOCK-DEBUG] ⚡ NO matches found via SKUs. Triggering PO-based fallback logic...`);
    
    submittedGRNs.forEach(grn => {
      const po = poLookup[grn.refId];
      const poItem = po ? po.items.find(it => 
        (it.variantId && String(it.variantId) === variantId.toString())
      ) : null;
      
      const poSizeMap = poItem ? (poItem.sizeMap && typeof poItem.sizeMap.toJSON === 'function' ? poItem.sizeMap.toJSON() : (poItem.sizeMap || {})) : {};
      const hasPOSizes = Object.keys(poSizeMap).length > 0;

      // Count matching cartons for THIS specific GRN
      let cartonCount = 0;
      (grn.cartons || []).forEach(carton => {
        const isMatch = (carton.variantId && String(carton.variantId) === variantId.toString());
        if (isMatch) cartonCount++;
      });

      if (cartonCount === 0) {
        console.log(`[LIVE-STOCK-DEBUG] GRN ${grn.grnNo}: 0 cartons match this variant.`);
        return;
      }

      if (hasPOSizes) {
        console.log(`[LIVE-STOCK-DEBUG] GRN ${grn.grnNo}: Applying PO "${po.poNumber}" quantity breakup for ${cartonCount} cartons`);
        Object.entries(poSizeMap).forEach(([size, cell]) => {
          const cleanSize = size.trim();
          const added = (cartonCount * (Number(cell?.qty) || 0));
          totalReceived[cleanSize] = (totalReceived[cleanSize] || 0) + added;

          if (grn.refType === 'PO') {
            const poNum = grn.refId;
            if (!receivedPerPO[poNum]) receivedPerPO[poNum] = {};
            receivedPerPO[poNum][cleanSize] = (receivedPerPO[poNum][cleanSize] || 0) + added;
          }
        });
      } else {
        console.log(`[LIVE-STOCK-DEBUG] GRN ${grn.grnNo}: PO data missing, falling back to Master Catalog assortment for ${cartonCount} cartons`);
        const sizeQuantitiesData = variant.sizeQuantities && typeof variant.sizeQuantities.toJSON === 'function' 
          ? variant.sizeQuantities.toJSON() : (variant.sizeQuantities || {});
        Object.entries(sizeQuantitiesData).forEach(([size, qtyPerCarton]) => {
          const cleanSize = size.trim();
          totalReceived[cleanSize] = (totalReceived[cleanSize] || 0) + (cartonCount * (Number(qtyPerCarton) || 0));
        });
      }
    });
  }

  console.log(`[LIVE-STOCK-DEBUG] Final calculated stock:`, totalReceived);

  // 3. DYNAMIC CALCULATION: Total Dispatched from Orders
  const fulfilledOrders = await Order.find({ 
    "items.variantId": variantId, 
    status: { $in: ["PFD", "RFD", "OFD", "RECEIVED", "PARTIAL"] } 
  }).lean();

  const totalDispatched = {};
  fulfilledOrders.forEach(order => {
    const item = (order.items || []).find(i => i.variantId && i.variantId.toString() === variantId.toString());
    if (item && item.fulfilledSizeQuantities) {
      const entries = item.fulfilledSizeQuantities instanceof Map 
        ? Array.from(item.fulfilledSizeQuantities.entries()) 
        : Object.entries(item.fulfilledSizeQuantities);
      
      entries.forEach(([size, qty]) => {
        const cleanSz = size.trim();
        totalDispatched[cleanSz] = (totalDispatched[cleanSz] || 0) + Number(qty || 0);
      });
    }
  });

  // 4. DYNAMIC CALCULATION: Total Returned from Returns
  const returnRecords = await Return.find({
    "items.variantId": variantId
  }).lean();

  const totalReturned = {};
  returnRecords.forEach(ret => {
    const item = (ret.items || []).find(i => i.variantId && i.variantId.toString() === variantId.toString());
    if (item && item.sizeQuantities) {
      const entries = item.sizeQuantities instanceof Map 
        ? Array.from(item.sizeQuantities.entries()) 
        : Object.entries(item.sizeQuantities);
      
      entries.forEach(([size, qty]) => {
        const cleanSz = size.trim();
        totalReturned[cleanSz] = (totalReturned[cleanSz] || 0) + Number(qty || 0);
      });
    }
  });

  console.log(`[DEBUG DYNAMIC] Returned per size:`, totalReturned);

  // 5a. BLOCKED: quantities from BOOKED/PENDING orders (reserved but not yet dispatched)
  const bookedOrders = await Order.find({
    "items.variantId": variantId,
    status: { $in: ["BOOKED", "PENDING"] }
  }).lean();

  const blockedStockMap = {};
  bookedOrders.forEach(order => {
    const item = (order.items || []).find(i => i.variantId && i.variantId.toString() === variantId.toString());
    if (item && item.sizeQuantities) {
      const entries = item.sizeQuantities instanceof Map
        ? Array.from(item.sizeQuantities.entries())
        : Object.entries(item.sizeQuantities);
      entries.forEach(([size, qty]) => {
        const cleanSz = size.trim();
        blockedStockMap[cleanSz] = (blockedStockMap[cleanSz] || 0) + Number(qty || 0);
      });
    }
  });

  console.log(`[DEBUG DYNAMIC] Blocked per size (BOOKED/PENDING):`, blockedStockMap);

  // 5. Combine: Live Stock = sizeMap.qty (canonical) - Dispatched + Returned
  // sizeMap.qty is written by BOTH GRN submit ($inc) and manual stockMovement.
  // Using GRN-derived totalReceived was ignoring manual inward/outward movements.
  variantSizes.forEach(sz => {
    const baseQty = sizeMapBaseStock[sz] || 0;
    // Use sizeMap.qty if it has been populated (either by GRN or manual movement).
    // Fall back to GRN-derived totalReceived only for old variants where sizeMap was never set.
    const received = baseQty > 0 ? baseQty : (totalReceived[sz] || 0);
    liveStockMap[sz] = Math.max(0, received + (totalReturned[sz] || 0) - (totalDispatched[sz] || 0));
  });

  // Calculate PO Map for upcoming stock
  const pos = await PurchaseOrder.find({
    isDeleted: false,
    billStatus: "APPROVED",
    "items.variantId": variantId.toString()
  }).lean();

  pos.forEach((po) => {
    const receivedForThisPO = receivedPerPO[po.poNumber] || {};

    (po.items || []).forEach((item) => {
      const isMatch = String(item.variantId) === String(variantId);
      
      if (isMatch && item.sizeMap) {
        Object.entries(item.sizeMap).forEach(([sz, cell]) => {
          const qtyPerCarton = Number(cell?.qty || 0);
          const cartonCount = Number(item.cartonCount || 0);
          const cleanSz = sz.trim();
          
          const totalOrdered = cartonCount * qtyPerCarton;
          const alreadyReceived = receivedForThisPO[cleanSz] || 0;
          const remaining = Math.max(0, totalOrdered - alreadyReceived);
          
          poMap[cleanSz] = (poMap[cleanSz] || 0) + remaining;
        });
      }
    });
  });

  return { poMap, liveStockMap, blockedStockMap };
};

// Reset Variant Stock - Surgical Purge of Receipts and Fulfillments
exports.resetVariantStock = async (variantIdStr) => {
  const mongoose = require("mongoose");
  const GRNDraft = require("../models/grn.model");
  const Order = require("../models/Order");

  console.log(`[DEBUG RESET] Starting reset for variant ID: ${variantIdStr}`);
  
  let variantId;
  try {
    variantId = new mongoose.Types.ObjectId(variantIdStr);
  } catch (e) {
    throw new Error("Invalid variant ID format");
  }

  // 1. Delete all SUBMITTED GRNs that contain this variantId
  const grnResult = await GRNDraft.deleteMany({
    "cartons.variantId": variantIdStr, // GRN model uses String for variantId
    status: "SUBMITTED"
  });
  console.log(`[DEBUG RESET] Deleted ${grnResult.deletedCount} GRN documents.`);

  // 2. Surgical Reset of all Order fulfillment data for this variant
  const orderResult = await Order.updateMany(
    { "items.variantId": variantId },
    { 
      $set: { 
        "items.$[elem].fulfilledSizeQuantities": {},
        "items.$[elem].fulfilledCartonCount": 0,
        "items.$[elem].fulfilledPairCount": 0
      } 
    },
    { 
      arrayFilters: [{ "elem.variantId": variantId }],
      multi: true 
    }
  );
  
  console.log(`[DEBUG RESET] Modified ${orderResult.modifiedCount} Order documents.`);

  return { 
    success: true, 
    message: `Reset complete. ${grnResult.deletedCount} GRNs removed, ${orderResult.modifiedCount} Orders cleaned.` 
  };
};
// Stock Movement — manually adjust sizeMap.qty for a variant
exports.stockMovement = async (variantIdStr, { type, cartons, reason, note, user }) => {
  const MasterCatalog = require("../models/MasterCatalog");
  const activityLog = require("./activityLog.service");

  const catalog = await MasterCatalog.findOne({ "variants._id": variantIdStr });
  if (!catalog) {
    const err = new Error("Variant not found"); err.statusCode = 404; throw err;
  }
  const variant = catalog.variants.id(variantIdStr);
  if (!variant) {
    const err = new Error("Variant not found in catalog"); err.statusCode = 404; throw err;
  }

  const sizeQuantitiesData =
    variant.sizeQuantities && typeof variant.sizeQuantities.toJSON === "function"
      ? variant.sizeQuantities.toJSON()
      : Object.fromEntries(variant.sizeQuantities || []);

  const delta = {};
  Object.entries(sizeQuantitiesData).forEach(([size, qtyPerCarton]) => {
    const pairs = Math.round(Number(qtyPerCarton || 0) * cartons);
    if (pairs <= 0) return;
    delta[size] = pairs;
    const cell = variant.sizeMap.get(size) || { qty: 0, sku: "" };
    if (type === "INWARD") {
      cell.qty = (cell.qty || 0) + pairs;
    } else {
      cell.qty = Math.max(0, (cell.qty || 0) - pairs);
    }
    variant.sizeMap.set(size, cell);
  });

  catalog.markModified("variants");
  await catalog.save();

  const dirLabel = type === "INWARD" ? "Inward" : "Outward";
  const totalPairs = Object.values(delta).reduce((s, v) => s + v, 0);

  // Physical cartons genuinely arrive for these reasons — assign box labels
  // the same way GRN does (<Carton SKU>-CT<serial>), restarting at CT001 for
  // this movement. No printed-label rescan gate here (unlike GRN receiving).
  const PHYSICAL_BOX_REASONS = ["Returned Stock", "Stock Transfer In"];
  let cartonBarcodes = [];
  if (type === "INWARD" && PHYSICAL_BOX_REASONS.includes(reason)) {
    const cartonSku = variant.sku || variant.itemName || "CTN";
    cartonBarcodes = Array.from({ length: cartons }, (_, i) =>
      `${cartonSku}-CT${String(i + 1).padStart(4, "0")}`
    );
  }

  await activityLog.createLog({
    action: type === "INWARD" ? "STOCK_INWARD" : "STOCK_OUTWARD",
    entityType: "STOCK",
    entityId: String(variantIdStr),
    description: `Stock ${dirLabel}: ${cartons} carton(s) / ${totalPairs} pairs for "${variant.itemName || variant.color}" — ${reason}${note ? `: ${note}` : ""}`,
    metadata: { variantId: variantIdStr, articleId: String(catalog._id), cartons, totalPairs, delta, reason, note, type, cartonBarcodes },
    user,
  });

  return { variantId: variantIdStr, articleId: String(catalog._id), type, cartons, totalPairs, delta, cartonBarcodes };
};

exports.updateVariantSku = async (variantId, sku) => {
  const catalog = await MasterCatalog.findOne({ "variants._id": variantId });
  if (!catalog) { const err = new Error("Variant not found"); err.statusCode = 404; throw err; }
  const variant = catalog.variants.id(variantId);
  if (!variant) { const err = new Error("Variant not found in catalog"); err.statusCode = 404; throw err; }
  const ctnSku = (sku || "").trim();
  variant.sku = ctnSku;
  // Regenerate sizeSkus from new carton SKU
  const sizeKeys = variant.sizeQuantities ? Array.from(variant.sizeQuantities.keys()) : [];
  const newSizeSkus = autoGenerateSizeSkus(ctnSku, variant.sizeRange || "", sizeKeys);
  sizeKeys.forEach(sz => { variant.sizeSkus.set(sz, newSizeSkus[sz] || ""); });
  catalog.markModified("variants");
  await catalog.save();
  const sizeSkusObj = Object.fromEntries(variant.sizeSkus || []);
  return { variantId, sku: variant.sku, sizeSkus: sizeSkusObj };
};
