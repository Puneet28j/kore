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

const normalizeVariants = (variantsRaw, articleStage, articleExpectedDate) => {
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
    // Derived (gender-stripped) SKUs win whenever a carton SKU is present —
    // otherwise a stale/incorrectly-formatted value sent by the client would
    // silently override the correct auto-generated one. Falls back to the
    // client-sent sizeSkus only when there's no ctnSku to derive from.
    const finalSizeSkus = { ...sizeSkus, ...derivedSizeSkus };

    // Keep sizeMap's per-size sku in sync with finalSizeSkus — this is what
    // PO/GRN/exports actually read from, so it must match, not just sizeSkus.
    Object.keys(sizeMap).forEach((size) => {
      if (finalSizeSkus[size]) sizeMap[size].sku = finalSizeSkus[size];
    });

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
      // Seed from the article's own stage/date at creation time so it's
      // explicit from the start — GRN promotes each variant independently
      // from here on (see grn.service.js).
      stage: v.stage || articleStage || undefined,
      expectedAvailableDate: v.expectedAvailableDate || articleExpectedDate || undefined,
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
  const variants = normalizeVariants(
    parseMaybeJson(body.variants, []),
    body.stage || "AVAILABLE",
    body.expectedAvailableDate || null
  );

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
  const andConditions = [];

  if (stage === "PREORDER") {
    // An article stays PREORDER at the article level as long as ANY variant
    // is still pending — so this alone correctly captures "has at least one
    // variant not yet available", mixed articles included.
    filter.stage = "PREORDER";
  } else if (stage === "AVAILABLE") {
    // Fully-available articles, PLUS still-PREORDER articles that have at
    // least one variant individually promoted via GRN (e.g. Matrix with 1
    // of 6 variants received) — those must show up here too, not just once
    // every sibling variant is done.
    andConditions.push({
      $or: [
        { stage: { $ne: "PREORDER" } },
        { stage: "PREORDER", "variants.stage": "AVAILABLE" },
      ],
    });
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
    // Composed via $and (not a bare filter.$or) so this doesn't clobber the
    // AVAILABLE-tab $or condition above when both are present at once.
    andConditions.push({
      $or: [
        { articleName: { $regex: q, $options: "i" } },
        { soleColor: { $regex: q, $options: "i" } },
        { productColors: { $in: [new RegExp(q, "i")] } },
        { "variants.itemName": { $regex: q, $options: "i" } },
        { "variants.color": { $regex: q, $options: "i" } },
        { "variants.hsnCode": { $regex: q, $options: "i" } },
        { "variants.sizeRange": { $regex: q, $options: "i" } },
      ],
    });
  }

  if (andConditions.length) filter.$and = andConditions;

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

  // Attach PO-derived planned + active pre-booked pairs to every variant.
  // Planned is no longer stored on the catalog — a still-PREORDER variant's
  // "planned" is exactly what's on Purchase Orders for it, and the remaining
  // bookable amount (planned − preBooked) is what Shop/Pre-Order pages cap
  // distributor bookings against.
  const articleIds = items.map((doc) => doc._id);
  if (articleIds.length) {
    const [plannedMap, preBookedMap, grnReceivedMap] = await Promise.all([
      exports.getPoPlannedQtyMap(articleIds),
      exports.getPreBookedQtyMap(articleIds),
      exports.getGrnReceivedQtyMap(),
    ]);
    items.forEach((doc) => {
      (doc.variants || []).forEach((v) => {
        const key = String(v._id);
        v.poPlannedQty = plannedMap.bySize[key] || {};
        v.plannedPairs = plannedMap.totals[key] || 0;
        v.preBookedPairs = preBookedMap.totals[key] || 0;
        // Still-incoming pairs: what the POs planned minus what GRNs have
        // already received — the "PO Pending" column everywhere.
        v.poPendingPairs = Math.max(
          0,
          (plannedMap.totals[key] || 0) - (grnReceivedMap.totals[key] || 0)
        );
      });
    });
  }

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

// PO-derived planned quantities — the single source of "planned"/"on PO"
// everywhere (Pre-Order tab's Planned, RFD tab's PO Pending base, Shop's
// booking cap). Only counts APPROVED POs — a PO still sitting in accounts'
// billing-approval queue is not a confirmed commitment yet, so it must not
// inflate planned/pre-booking-cap numbers until Accounts & Finance approves
// its bill (matches the existing convention in getVariantStock's PO map).
// Sums every such PO's items per variant: per-size pairs = cartonCount ×
// sizeMap[size].qty (PO sizeMap is a per-carton assortment; see
// POPage/grn.service fallback). Pass articleIds to scope, or omit for the
// whole company. Returns { bySize: {variantId: {size: pairs}}, totals: {variantId: pairs} }.
exports.getPoPlannedQtyMap = async (articleIds) => {
  const PurchaseOrder = require("../models/PurchaseOrder");
  const ids = (articleIds || []).map((id) => new mongoose.Types.ObjectId(String(id)));
  if (articleIds && !ids.length) return { bySize: {}, totals: {} };

  const filter = {
    isDeleted: false,
    billStatus: "APPROVED",
  };
  if (ids.length) filter["items.articleId"] = { $in: ids };

  const pos = await PurchaseOrder.find(filter)
    .select("items.articleId items.variantId items.cartonCount items.quantity items.sizeMap")
    .lean();

  const idSet = ids.length ? new Set(ids.map(String)) : null;
  const bySize = {};
  const totals = {};

  pos.forEach((po) => {
    (po.items || []).forEach((item) => {
      if (idSet && (!item.articleId || !idSet.has(String(item.articleId)))) return;
      if (!item.variantId) return;
      const key = String(item.variantId);
      const cartons = Math.max(0, Number(item.cartonCount || 0)) || 1;
      const sizeMap = item.sizeMap || {};
      const sizeEntries = Object.entries(sizeMap);
      if (sizeEntries.length) {
        if (!bySize[key]) bySize[key] = {};
        sizeEntries.forEach(([size, cell]) => {
          const pairs = cartons * Math.max(0, Number(cell?.qty || 0));
          if (pairs <= 0) return;
          const cleanSize = String(size).trim();
          bySize[key][cleanSize] = (bySize[key][cleanSize] || 0) + pairs;
          totals[key] = (totals[key] || 0) + pairs;
        });
      } else {
        // No size breakup on the PO item — fall back to its total quantity
        totals[key] = (totals[key] || 0) + Math.max(0, Number(item.quantity || 0));
      }
    });
  });

  return { bySize, totals };
};

// Pairs physically received via submitted GRNs, per variant — subtracted
// from the PO planned total to get "PO Pending" (still incoming). Counted
// from the scanned pair barcodes, so a partially-received PO contributes
// exactly its unreceived remainder.
exports.getGrnReceivedQtyMap = async () => {
  const GRNDraft = require("../models/grn.model");
  const rows = await GRNDraft.aggregate([
    { $match: { status: "SUBMITTED" } },
    { $unwind: "$cartons" },
    { $match: { "cartons.variantId": { $nin: [null, ""] } } },
    {
      $group: {
        _id: "$cartons.variantId",
        pairs: { $sum: { $size: { $ifNull: ["$cartons.pairBarcodes", []] } } },
      },
    },
  ]);
  const totals = {};
  rows.forEach((r) => {
    totals[String(r._id)] = r.pairs;
  });
  return { totals };
};

// Still-owed pre-booked pairs per variant — caps how much MORE can be
// pre-booked against a PO's remaining (not-yet-arrived) planned quantity.
// For each active order's still-PREORDER item, only sizeQuantities MINUS
// whatever's already been reserved out of arrived GRN stock counts — that
// reserved portion has already been fulfilled from real stock, so it's no
// longer competing for the PO's future arrivals (see promotePreOrderItems).
// An item that's fully promoted to REGULAR drops out entirely: a completed
// booking, nothing left owed.
exports.getPreBookedQtyMap = async (articleIds) => {
  const Order = require("../models/Order");
  const q = {
    status: { $nin: ["RECEIVED", "CANCELLED"] },
    items: { $elemMatch: { bookingType: "PREORDER" } },
  };
  if (articleIds && articleIds.length) {
    q["items.articleId"] = { $in: articleIds.map((id) => new mongoose.Types.ObjectId(String(id))) };
  }
  const orders = await Order.find(q).select("items").lean();

  const bySize = {};
  const totals = {};
  orders.forEach((order) => {
    (order.items || []).forEach((item) => {
      if (item.bookingType !== "PREORDER") return;
      if (!item.variantId) return;
      const key = String(item.variantId);
      const sizeQuantities = item.sizeQuantities || {};
      const reserved = item.preorderReservedSizeQuantities || {};
      const entries = Object.entries(sizeQuantities);
      if (entries.length) {
        if (!bySize[key]) bySize[key] = {};
        entries.forEach(([size, qty]) => {
          const cleanSize = String(size).trim();
          const owed = Number(qty || 0) - Number(reserved[size] || 0);
          const pairs = Math.max(0, owed);
          if (pairs <= 0) return;
          bySize[key][cleanSize] = (bySize[key][cleanSize] || 0) + pairs;
          totals[key] = (totals[key] || 0) + pairs;
        });
      } else {
        totals[key] = (totals[key] || 0) + Math.max(0, Number(item.pairCount || 0));
      }
    });
  });

  return { bySize, totals };
};

/** Company-wide live + blocked pair totals across all non-deleted catalog items */
exports.getStockTotals = async (stage) => {
  const baseStages = [
    { $match: { isDeleted: false } },
    { $unwind: { path: "$variants", preserveNullAndEmptyArrays: false } },
  ];

  if (stage) {
    // Match each variant's OWN effective stage (its own override, falling
    // back to the parent article's) rather than the article's stage alone
    // — otherwise a variant promoted via GRN on an otherwise-still-PREORDER
    // article (e.g. 1 of 6 variants received) would be excluded from the
    // AVAILABLE total, and vice versa.
    baseStages.push({
      $match: {
        $expr: { $eq: [{ $ifNull: ["$variants.stage", "$stage"] }, stage] },
      },
    });
  }

  const [liveRow] = await MasterCatalog.aggregate([
    ...baseStages,
    { $project: { sizeCells: { $objectToArray: { $ifNull: ["$variants.sizeMap", {}] } } } },
    { $unwind: { path: "$sizeCells", preserveNullAndEmptyArrays: false } },
    {
      $group: {
        _id: null,
        total: { $sum: { $convert: { input: "$sizeCells.v.qty", to: "double", onError: 0, onNull: 0 } } },
      },
    },
  ]);

  // Planned pairs come from Purchase Orders now (not a stored field) and only
  // exist for still-PREORDER variants — the AVAILABLE tab has nothing planned.
  let totalPlannedPairs = 0;
  if (stage !== "AVAILABLE") {
    const preorderDocs = await MasterCatalog.find({
      isDeleted: false,
      $or: [{ stage: "PREORDER" }, { "variants.stage": "PREORDER" }],
    })
      .select("stage variants._id variants.stage")
      .lean();

    const preorderVariantIds = new Set();
    const preorderArticleIds = [];
    preorderDocs.forEach((doc) => {
      let hasPreorderVariant = false;
      (doc.variants || []).forEach((v) => {
        if ((v.stage || doc.stage) === "PREORDER") {
          preorderVariantIds.add(String(v._id));
          hasPreorderVariant = true;
        }
      });
      if (hasPreorderVariant) preorderArticleIds.push(doc._id);
    });

    if (preorderArticleIds.length) {
      const plannedMap = await exports.getPoPlannedQtyMap(preorderArticleIds);
      Object.entries(plannedMap.totals).forEach(([variantId, pairs]) => {
        if (preorderVariantIds.has(variantId)) totalPlannedPairs += pairs;
      });
    }
  }

  // Company-wide "PO Pending" — same per-variant formula the list API
  // injects (PO planned − GRN received), so the header card always tallies
  // with the per-variant column.
  const [allPlannedMap, grnReceivedMap, bookedMap] = await Promise.all([
    exports.getPoPlannedQtyMap(),
    exports.getGrnReceivedQtyMap(),
    exports.getBookedQuantityMap(),
  ]);
  let totalPoPendingPairs = 0;
  Object.entries(allPlannedMap.totals).forEach(([variantId, pairs]) => {
    totalPoPendingPairs += Math.max(0, pairs - (grnReceivedMap.totals[variantId] || 0));
  });

  // Company-wide "Booked" — same getBookedQuantityMap every per-variant
  // Booked column already reads, scoped to variants matching this tab's
  // stage filter (a variant's own effective stage, falling back to its
  // article's — same rule used above for the live-stock aggregate).
  let totalBookedPairs = 0;
  if (stage) {
    const stageByVariant = {};
    const allDocs = await MasterCatalog.find({ isDeleted: false })
      .select("stage variants._id variants.stage")
      .lean();
    allDocs.forEach((doc) => {
      (doc.variants || []).forEach((v) => {
        stageByVariant[String(v._id)] = v.stage || doc.stage;
      });
    });
    Object.entries(bookedMap.totals).forEach(([variantId, pairs]) => {
      if (stageByVariant[variantId] === stage) totalBookedPairs += pairs;
    });
  } else {
    totalBookedPairs = Object.values(bookedMap.totals).reduce((s, p) => s + p, 0);
  }

  return {
    totalLivePairs: Math.max(0, Math.round(liveRow?.total || 0)),
    // Expected/planned pairs (from POs) for still-PREORDER variants — NOT real stock.
    totalPlannedPairs: Math.max(0, Math.round(totalPlannedPairs)),
    totalPoPendingPairs: Math.max(0, Math.round(totalPoPendingPairs)),
    totalBookedPairs: Math.max(0, Math.round(totalBookedPairs)),
  };
};

// Bulk "booked quantity" across ALL variants in one query — covers every
// variant in a single pass so list-level reports (Stock Report, Master
// Stock) don't need one query per variant.
//
// "Booked" = whatever is still sitting reserved/undispatched, not just
// orders whose status happens to be BOOKED/PENDING. A PARTIAL order (some
// cartons scanned, some not) still has a real remainder waiting in the
// warehouse — that remainder must keep counting as booked, otherwise the
// tally drops the moment ANY carton is scanned, even though most of the
// order hasn't shipped yet. So: remaining = ordered − already-fulfilled,
// per size, clamped at 0 — this naturally reduces to "full ordered qty"
// for BOOKED/PENDING (fulfilled is empty there) and to the true leftover
// for PARTIAL, while a fully-dispatched order (fulfilled === ordered)
// contributes 0 either way.
// Optional `statuses` narrows which orders count (default: every
// reserved/undispatched state). NOTE on tallying against sizeMap.qty:
// BOOKED/PARTIAL orders have ALREADY been deducted from sizeMap at booking
// time, while PENDING ones have not — callers computing "free stock from
// sizeMap" must subtract only the PENDING portion (pass ["PENDING"]).
exports.getBookedQuantityMap = async (statuses = ["BOOKED", "PENDING", "PARTIAL"]) => {
  const Order = require("../models/Order");
  const orders = await Order.find({
    status: { $in: statuses },
  }).lean();

  // variantId -> { size -> qty }
  const bySize = {};
  // variantId -> total pairs (sum across all sizes)
  const totals = {};

  orders.forEach((order) => {
    (order.items || []).forEach((item) => {
      if (!item.variantId) return;
      const key = item.variantId.toString();
      const fulfilledSizeQuantities = item.fulfilledSizeQuantities instanceof Map
        ? Object.fromEntries(item.fulfilledSizeQuantities)
        : (item.fulfilledSizeQuantities || {});

      // Still-PREORDER item: only what's actually been RESERVED out of
      // arrived GRN stock is real, undispatched, warehouse-sitting stock —
      // that's genuinely "booked" the same as any other order's remainder.
      // The still-owed-but-not-yet-reserved portion isn't backed by real
      // stock yet, so it must not count here (see promotePreOrderItems).
      const sizeQuantities =
        item.bookingType === "PREORDER"
          ? (item.preorderReservedSizeQuantities instanceof Map
              ? Object.fromEntries(item.preorderReservedSizeQuantities)
              : item.preorderReservedSizeQuantities || {})
          : (item.sizeQuantities instanceof Map
              ? Object.fromEntries(item.sizeQuantities)
              : (item.sizeQuantities || {}));

      if (!bySize[key]) bySize[key] = {};
      Object.entries(sizeQuantities).forEach(([size, qty]) => {
        const cleanSize = String(size).trim();
        const ordered = Number(qty || 0);
        const fulfilled = Number(fulfilledSizeQuantities[size] || 0);
        const remaining = Math.max(0, ordered - fulfilled);
        if (remaining === 0) return;
        bySize[key][cleanSize] = (bySize[key][cleanSize] || 0) + remaining;
        totals[key] = (totals[key] || 0) + remaining;
      });
    });
  });

  return { bySize, totals };
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
    const normalized = normalizeVariants(variantsRaw, doc.stage, doc.expectedAvailableDate);

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
        // sku + sizeSkus: only update if new sku provided (preserve manual edits otherwise).
        // v.sizeSkus/v.sizeMap are already correctly derived (gender stripped) and kept
        // in sync by normalizeVariants() above, so just apply them as-is here.
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

  // Seed totalReceived from sizeMap.qty — this reflects manual Stock Inward/Outward
  // movements AND direct order-booking deductions (see adjustVariantStock).
  // GRN-based receipts are layered on top below, but ONLY if sizeMap has no entry
  // for that size at all (prevents double-counting when sizeMap is also updated by
  // GRN submit). Track presence separately from qty — a size that's genuinely down
  // to 0 (fully booked out) must NOT fall back to stale GRN-derived totals, which
  // was the bug: the old `if (qty > 0)` check treated "0 because fully booked" the
  // same as "never populated", making booked-out stock reappear in the live count.
  const sizeMapBaseStock = {};
  const sizeMapHasEntry = {};
  Object.entries(sizeMapData).forEach(([size, cell]) => {
    const cleanSize = size.trim();
    if (cell && typeof cell === "object") {
      sizeMapBaseStock[cleanSize] = Number(cell.qty || 0);
      sizeMapHasEntry[cleanSize] = true;
    }
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

  // Dispatched pairs are no longer tracked separately here — booking already
  // deducts sizeMap.qty directly (see adjustVariantStock), so dispatch has
  // nothing further to subtract from live stock.

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

  // 5a. BLOCKED: still-undispatched quantity from BOOKED/PENDING/PARTIAL
  // orders — a PARTIAL order (some cartons scanned, some not) still has a
  // real remainder sitting in the warehouse, so it must keep counting here
  // (remaining = ordered − fulfilled, same formula as getBookedQuantityMap).
  const bookedOrders = await Order.find({
    "items.variantId": variantId,
    status: { $in: ["BOOKED", "PENDING", "PARTIAL"] }
  }).lean();

  const blockedStockMap = {};
  bookedOrders.forEach(order => {
    const item = (order.items || []).find(i => i.variantId && i.variantId.toString() === variantId.toString());
    if (!item) return;
    // Still-PREORDER item — only the RESERVED-so-far portion is real,
    // undispatched warehouse stock (already deducted straight from
    // sizeMap.qty, see promotePreOrderItems); the still-owed remainder
    // isn't backed by real stock and must not count here.
    const sizeSource =
      item.bookingType === "PREORDER" ? item.preorderReservedSizeQuantities : item.sizeQuantities;
    if (sizeSource) {
      const entries = sizeSource instanceof Map
        ? Array.from(sizeSource.entries())
        : Object.entries(sizeSource);
      const fulfilledEntries = item.fulfilledSizeQuantities instanceof Map
        ? Object.fromEntries(item.fulfilledSizeQuantities)
        : (item.fulfilledSizeQuantities || {});
      entries.forEach(([size, qty]) => {
        const cleanSz = size.trim();
        const ordered = Number(qty || 0);
        const fulfilled = Number(fulfilledEntries[size] || 0);
        const remaining = Math.max(0, ordered - fulfilled);
        if (remaining === 0) return;
        blockedStockMap[cleanSz] = (blockedStockMap[cleanSz] || 0) + remaining;
      });
    }
  });

  console.log(`[DEBUG DYNAMIC] Blocked per size (BOOKED/PENDING/PARTIAL remaining):`, blockedStockMap);

  // 5. Combine: Live Stock = sizeMap.qty (canonical) + Returned
  // sizeMap.qty is written by GRN submit ($inc), manual stockMovement, AND now
  // directly by order booking/cancellation (see adjustVariantStock in
  // order.service.js) — so it already excludes booked and dispatched orders.
  // Dispatched pairs are NOT subtracted again here (that used to double-count
  // once booking started deducting stock immediately instead of at dispatch).
  variantSizes.forEach(sz => {
    // Use sizeMap.qty whenever the size has an entry at all — including a
    // genuine 0 (fully booked out). Only fall back to GRN-derived totalReceived
    // for old variants where sizeMap truly has no entry for that size.
    const received = sizeMapHasEntry[sz] ? sizeMapBaseStock[sz] : (totalReceived[sz] || 0);
    liveStockMap[sz] = Math.max(0, received + (totalReturned[sz] || 0));
  });

  // PO Pending per size — same formula and same PO set as the list API's
  // poPendingPairs (non-deleted, non-rejected POs; planned minus pairs
  // already received via GRN, clamped at 0), so this page always tallies
  // with Master Stock's PO Pending column.
  const plannedMap = await exports.getPoPlannedQtyMap([catalog._id]);
  const plannedBySize = plannedMap.bySize[String(variantId)] || {};
  Object.entries(plannedBySize).forEach(([sz, plannedPairs]) => {
    const cleanSz = String(sz).trim();
    const alreadyReceived = totalReceived[cleanSz] || 0;
    const remaining = Math.max(0, plannedPairs - alreadyReceived);
    if (remaining > 0) poMap[cleanSz] = remaining;
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
// Stock Movement — manually adjust a variant's real stock (sizeMap.qty).
// Still-PREORDER variants are excluded from Inward entirely: their planned
// quantity comes from Purchase Orders and their real stock only ever arrives
// via GRN (which also promotes them to AVAILABLE).
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

  // Manual Inward on a still-PREORDER variant is not allowed — its planned
  // quantity is whatever the Purchase Orders say, and real stock arrives via
  // GRN only (which promotes it to AVAILABLE).
  const effectiveStage = variant.stage || catalog.stage;
  if (type === "INWARD" && effectiveStage === "PREORDER") {
    const err = new Error(
      "Manual inward is not allowed for a pre-order variant — planned quantity comes from its Purchase Order and stock arrives via GRN"
    );
    err.statusCode = 400;
    throw err;
  }

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
