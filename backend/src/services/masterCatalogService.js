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
  // Return relative path for dynamic hosting
  return filePath.replace(/\\/g, "/");
};

// ✅ frontend dynamic field names: images_Red, images_Black ...
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

// listing compatibility: first image = primary, rest = secondary
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

    // frontend format: sizeQuantities + optional sizeSkus
    if (v.sizeQuantities && typeof v.sizeQuantities === "object") {
      Object.keys(v.sizeQuantities).forEach((size) => {
        sizeMap[size] = {
          qty: Number(v.sizeQuantities[size] || 0),
          sku: v.sizeSkus?.[size] || "",
        };
      });
    }

    // agar direct sizeMap aa jaye to bhi handle kar lo
    if (v.sizeMap && typeof v.sizeMap === "object") {
      Object.keys(v.sizeMap).forEach((size) => {
        const cell = v.sizeMap[size] || {};
        sizeMap[size] = {
          qty: Number(cell.qty || 0),
          sku: cell.sku || "",
        };
      });
    }

    return {
      _id: v._id || v.id || undefined,
      itemName: v.itemName,
      color: v.color || "",
      sizeRange: v.sizeRange || "",
      costPrice: Number(v.costPrice || 0),
      sellingPrice: Number(v.sellingPrice || 0),
      mrp: Number(v.mrp || 0),
      hsnCode: v.hsnCode || "",
      sizeMap,
      isActive: parseBoolean(v.isActive, true),
    };
  });
};

exports.create = async (req) => {
  const body = req.body || {};

  const productColors = parseMaybeJson(body.productColors, []);
  const sizeRanges = parseMaybeJson(body.sizeRanges, []);
  const variants = normalizeVariants(parseMaybeJson(body.variants, []));

  const colorMedia = buildColorMediaPayload(
    req,
    Array.isArray(productColors) ? productColors : []
  );

  const { primaryImage, secondaryImages } =
    buildFlatImagesFromColorMedia(colorMedia);

  if (!primaryImage?.url) {
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

  const items = await MasterCatalog.find(filter)
    .populate("categoryId", "name")
    .populate("brandId", "name")
    .populate("manufacturerCompanyId", "name")
    .populate("unitId", "name")
    .sort({ createdAt: -1 })
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

    // Convert current variants to a map for ID-based lookup
    const existingById = new Map(
      doc.variants.map((v) => [v._id.toString(), v])
    );

    // Create a secondary map for name+color based lookup as fallback
    const existingByNameColor = new Map(
      doc.variants.map((v) => [
        `${v.itemName.trim().toLowerCase()}|${(v.color || "")
          .trim()
          .toLowerCase()}`,
        v,
      ])
    );

    const newVariants = [];

    normalized.forEach((v) => {
      let matched = null;

      // 1. Primary Match: By ID
      if (v._id && existingById.has(v._id.toString())) {
        matched = existingById.get(v._id.toString());
      }
      // 2. Secondary Match: By Name + Color (Fallback if ID is missing or mismatched)
      else {
        const key = `${v.itemName.trim().toLowerCase()}|${(v.color || "")
          .trim()
          .toLowerCase()}`;
        if (existingByNameColor.has(key)) {
          matched = existingByNameColor.get(key);
        }
      }

      if (matched) {
        // Update existing variant fields
        matched.itemName = v.itemName;
        matched.color = v.color;
        matched.sizeRange = v.sizeRange;
        matched.costPrice = v.costPrice;
        matched.sellingPrice = v.sellingPrice;
        matched.mrp = v.mrp;
        matched.hsnCode = v.hsnCode;
        matched.sizeMap = v.sizeMap;
        matched.isActive = v.isActive;

        // Remove from both maps to prevent double matching or accidental deletion
        existingById.delete(matched._id.toString());
        existingByNameColor.delete(
          `${matched.itemName.trim().toLowerCase()}|${(matched.color || "")
            .trim()
            .toLowerCase()}`
        );

        newVariants.push(matched);
      } else {
        // 3. No match: Treat as new variant
        const vCopy = { ...v };
        delete vCopy._id; // Let Mongoose generate a new unique ID
        newVariants.push(vCopy);
      }
    });

    // Replace the variants array with the updated list (preserving matched ones and adding new ones)
    doc.variants = newVariants;
  }

  // ✅ dynamic color images replace logic
  const hasNewColorImages =
    Array.isArray(req.files) &&
    req.files.some((f) => f.fieldname && f.fieldname.startsWith("images_"));

  const replaceColorMedia =
    body.replaceColorMedia === "true" || body.replaceColorMedia === true;

  if (hasNewColorImages) {
    const incomingColorMedia = buildColorMediaPayload(req, doc.productColors);

    if (replaceColorMedia) {
      doc.colorMedia = incomingColorMedia;
    } else {
      const existingMap = new Map(
        (doc.colorMedia || []).map((cm) => [cm.color, cm.images || []])
      );

      incomingColorMedia.forEach((cm) => {
        const oldImages = existingMap.get(cm.color) || [];
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
    }

    const { primaryImage, secondaryImages } = buildFlatImagesFromColorMedia(
      doc.colorMedia
    );
    doc.primaryImage = primaryImage;
    doc.secondaryImages = secondaryImages;
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

exports.getVariantStock = async (variantId) => {
  const PurchaseOrder = require("../models/PurchaseOrder");
  const GRNDraft = require("../models/grn.model");
  const MasterCatalog = require("../models/MasterCatalog");

  // 1. Find the parent catalog and the variant to get the SKUs
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

  // 1a. Normalize sizeMap (support Map + plain object + legacy sizeQuantities/sizeSkus)
  let normalizedSizeMap = new Map();

  const setSizeCell = (size, cell) => {
    const sizeKey = String(size || "").trim();
    if (!sizeKey) return;
    const qty = Number(cell?.qty || 0);
    const sku = (cell?.sku || "").trim();
    normalizedSizeMap.set(sizeKey, { qty, sku });
  };

  if (variant.sizeMap instanceof Map) {
    for (const [size, cell] of variant.sizeMap.entries()) {
      setSizeCell(size, cell);
    }
  } else if (variant.sizeMap && typeof variant.sizeMap === "object") {
    Object.keys(variant.sizeMap).forEach((size) => {
      setSizeCell(size, variant.sizeMap[size]);
    });
  }

  if (
    normalizedSizeMap.size === 0 &&
    variant.sizeQuantities &&
    typeof variant.sizeQuantities === "object"
  ) {
    Object.keys(variant.sizeQuantities).forEach((size) => {
      setSizeCell(size, {
        qty: variant.sizeQuantities[size],
        sku: variant.sizeSkus?.[size] || "",
      });
    });
  }

  const sizes = Array.from(normalizedSizeMap.keys());
  let skus = sizes
    .map((sz) => (normalizedSizeMap.get(sz) || {}).sku)
    .filter((v) => typeof v === "string" && v.trim().length > 0);

  // 1b. If variant lacks SKUs, try to fetch them from related PO
  if (skus.length === 0) {
    const PurchaseOrder = require("../models/PurchaseOrder");
    const posWithSkus = await PurchaseOrder.find({
      isDeleted: false,
      $or: [
        { "items.variantId": variantId.toString() },
        { "items.itemName": variant.itemName || "" },
      ],
    })
      .lean()
      .limit(1);

    if (posWithSkus.length > 0) {
      const poItem = (posWithSkus[0].items || []).find(
        (item) =>
          String(item.variantId) === String(variantId) ||
          item.itemName === variant.itemName
      );

      if (poItem && poItem.sizeMap) {
        for (const [sz, cell] of Object.entries(poItem.sizeMap)) {
          if (!normalizedSizeMap.has(sz) && cell && cell.sku) {
            setSizeCell(sz, cell);
          } else if (normalizedSizeMap.has(sz)) {
            const existing = normalizedSizeMap.get(sz);
            if (!existing.sku && cell && cell.sku) {
              existing.sku = cell.sku;
              normalizedSizeMap.set(sz, existing);
            }
          }
        }

        // Recalculate skus after fetching from PO
        skus = Array.from(normalizedSizeMap.values())
          .map((cell) => (cell && cell.sku ? cell.sku : ""))
          .filter((v) => typeof v === "string" && v.trim().length > 0);
      }
    }
  }

  console.log(
    `[getVariantStock] variantId: ${variantId}, name: ${variant.itemName}, sizes: ${sizes}, skus: ${skus}`
  );

  // 2. Calculate PO Quantity (Sum of cartonCount * sizeMap[size].qty)
  // Match by both ID and Name to handle inconsistent storage
  const poFilter = {
    isDeleted: false,
    $or: [
      { "items.variantId": variantId.toString() },
      { "items.itemName": variant.itemName || "" },
    ],
  };

  if (variant.sku) {
    poFilter.$or.push({ "items.sku": variant.sku });
  }

  const pos = await PurchaseOrder.find(poFilter).lean();

  console.log(`[getVariantStock] found ${pos.length} matched POs`);

  const poMap = {};
  sizes.forEach((sz) => {
    poMap[sz] = 0;
  });

  pos.forEach((po) => {
    (po.items || []).forEach((item) => {
      if (
        String(item.variantId) === String(variantId) ||
        item.itemName === variant.itemName ||
        (variant.sku && item.sku === variant.sku)
      ) {
        sizes.forEach((sz) => {
          const qtyPerCarton = item.sizeMap?.[sz]?.qty || 0;
          const cartonCount = item.cartonCount || 0;
          poMap[sz] += cartonCount * qtyPerCarton;
        });
      }
    });
  });

  const poNumbers = pos.map((p) => p.poNumber).filter(Boolean);

  // 3. Find GRNs that reference those POs and accumulate live stock
  const grns = await GRNDraft.find({
    status: "SUBMITTED",
    refId: { $in: poNumbers },
  }).lean();

  console.log(
    `[getVariantStock] found ${grns.length} submitted GRNs for refIds: ${poNumbers}`
  );

  const liveStockMap = {};
  sizes.forEach((sz) => {
    liveStockMap[sz] = 0;
  });

  // Build SKU-to-size mapping from the actual POs (source of truth)
  const skuToSizeFromPO = {};
  pos.forEach((po) => {
    (po.items || []).forEach((item) => {
      if (
        String(item.variantId) === String(variantId) ||
        item.itemName === variant.itemName ||
        (variant.sku && item.sku === variant.sku)
      ) {
        // Extract SKU to size mapping from this PO item
        if (item.sizeMap) {
          for (const [size, cell] of Object.entries(item.sizeMap)) {
            if (cell && cell.sku) {
              skuToSizeFromPO[cell.sku] = size;
            }
          }
        }
      }
    });
  });

  // Also include variants SKUs as fallback
  const skuToSize = { ...skuToSizeFromPO };
  sizes.forEach((sz) => {
    const entry = normalizedSizeMap.get(sz);
    if (entry && entry.sku && !skuToSize[entry.sku]) {
      skuToSize[entry.sku] = sz;
    }
  });

  // Process GRNs and accumulate stock using the SKU-to-size mapping
  grns.forEach((grn) => {
    (grn.cartons || []).forEach((carton) => {
      (carton.pairBarcodes || []).forEach((barcode) => {
        // First try direct SKU match (most reliable)
        let sz = skuToSize[barcode];

        // Fallback: try pattern matching if barcode follows {itemName}-{size} format
        if (!sz && variant.itemName && typeof barcode === "string") {
          const fallbackPrefix = `${variant.itemName}-`;
          if (barcode.startsWith(fallbackPrefix)) {
            const parts = barcode.split("-");
            sz = parts[parts.length - 1];
          }
        }

        // Increment stock if size found and valid
        if (sz && liveStockMap[sz] !== undefined) {
          liveStockMap[sz] += 1;
        }
      });
    });
  });

  console.log(
    `[getVariantStock] PO-based SKU mapping:`,
    skuToSizeFromPO,
    `liveStockMap:`,
    liveStockMap
  );

  return { poMap, liveStockMap };
};
