const GRNDraft = require("../models/grn.model");

const PAIRS_PER_CARTON = 24;

const todayYYMMDD = () => {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
};

// Primary carton barcode: <Carton SKU>-CT<serial>, e.g. "Riv-blk-04-08-CT001".
// Serial restarts at 1 for every new GRN draft (draft.cartonSerial / cartonIndex).
const makeCartonBarcode = (cartonSku, serial) =>
  `${cartonSku}-CT${String(serial).padStart(4, "0")}`;

// Legacy format, kept only for the unused-by-UI single-pair scanPair path,
// which has no catalog/variant context to derive a Carton SKU from.
const makeLegacyCartonBarcode = (refType, refNo, serial) => {
  const dateStr = todayYYMMDD();
  return `CTN-${dateStr}-${refType}-${refNo}-${String(serial).padStart(
    3,
    "0"
  )}`;
};

const makeGRNNo = (articleName, poNo, sequence) => {
  const cleanArticle = (articleName || "ITEM").split("-")[0].substring(0, 3).toUpperCase();
  const cleanPO = (poNo || "PO").split("-").pop().slice(-5).toUpperCase();
  const dateStr = todayYYMMDD();
  return `GRN-${cleanArticle}-${cleanPO}-${dateStr}-${String(sequence).padStart(3, "0")}`;
};

// when running in production we want to return actual PO and catalogue references
const PurchaseOrder = require("../models/PurchaseOrder");
const MasterCatalog = require("../models/MasterCatalog");
const Brand = require("../models/Brand");
const Counter = require("../models/Counter");

// helper to get next sequence
const getNextSequence = async (name) => {
  const counter = await Counter.findOneAndUpdate(
    { id: name },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return counter.seq;
};

// helper to build regex for search
const makeRegex = (str) => {
  if (!str) return null;
  return new RegExp(str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
};

exports.listReferences = async (search = "") => {
  const q = (search || "").trim();
  const regex = makeRegex(q);

  // fetch PO docs matching search (po number or vendor name)
  const poFilter = { isDeleted: false, billStatus: "APPROVED" };
  if (regex) {
    poFilter.$or = [
      { poNumber: regex },
      { vendorName: regex },
      { "items.itemName": regex },
    ];
  }
  // include minimal item information so we can show names in dropdown
  const poDocs = await PurchaseOrder.find(poFilter)
    .select("poNumber vendorName items.itemName items.sku")
    .limit(100)
    .lean();

  // fetch catalog items matching search (article name)
  const catFilter = { isDeleted: false };
  if (regex) {
    catFilter.articleName = regex;
  }
  let catDocs = await MasterCatalog.find(catFilter)
    .select("articleName brandId")
    .limit(100)
    .lean();

  // populate brand name for catalogs
  const brandIds = [
    ...new Set(catDocs.map((c) => c.brandId?.toString())),
  ].filter(Boolean);
  const brands = brandIds.length
    ? await Brand.find({ _id: { $in: brandIds } })
        .select("name")
        .lean()
    : [];
  const brandMap = brands.reduce((acc, b) => {
    acc[b._id.toString()] = b.name;
    return acc;
  }, {});

  // map to unified structure
  const list = [];

  poDocs.forEach((po) => {
    // build a small summary of items we care about for display
    let articleDesc = "";
    if (po.items && po.items.length > 0) {
      const names = po.items.map((it) => it.itemName || it.sku).filter(Boolean);
      articleDesc = names.slice(0, 2).join(", ");
      if (names.length > 2) articleDesc += ` (+${names.length - 2} more)`;
    }
    list.push({
      id: po.poNumber,
      refType: "PO",
      party: po.vendorName,
      article: articleDesc,
    });
  });

  catDocs.forEach((cat) => {
    list.push({
      id: `CAT-${cat._id}`,
      refType: "CAT",
      party: brandMap[cat.brandId?.toString()] || "",
      article: cat.articleName,
    });
  });

  return list;
};

exports.createDraft = async ({ refType, refId }) => {
  if (!refType || !refId) throw new Error("refType and refId required");

  // create fresh draft
  const draft = await GRNDraft.create({
    refType,
    refId,
    currentPairs: [],
    cartons: [],
    scannedSet: [],
    cartonSerial: 1,
    status: "DRAFT",
  });

  return draft;
};

exports.getDraft = async (draftId) => {
  const draft = await GRNDraft.findById(draftId);
  if (!draft) throw new Error("Draft not found");
  return draft;
};

exports.scanPair = async (draftId, pairBarcodeRaw) => {
  const pairBarcode = (pairBarcodeRaw || "").trim();
  if (!pairBarcode) throw new Error("pairBarcode required");

  const draft = await GRNDraft.findById(draftId);
  if (!draft) throw new Error("Draft not found");
  if (draft.status !== "DRAFT") throw new Error("GRN already submitted");

  // add
  draft.currentPairs.push(pairBarcode);
  draft.scannedSet.push(pairBarcode);

  // auto lock at 24
  if (draft.currentPairs.length === PAIRS_PER_CARTON) {
    const refNo = String(draft.refId).split("-")[1] || draft.refId; // "1023"
    const cartonBarcode = makeLegacyCartonBarcode(
      draft.refType,
      refNo,
      draft.cartonSerial
    );

    draft.cartons.unshift({
      cartonBarcode,
      pairBarcodes: [...draft.currentPairs],
      lockedAt: new Date(),
    });

    draft.cartonSerial += 1;
    draft.currentPairs = [];
  }

  await draft.save();

  return draft;
};

exports.bulkScan = async (draftId, cartonsPayload) => {
  if (!Array.isArray(cartonsPayload)) throw new Error("cartons payload must be an array");

  const draft = await GRNDraft.findById(draftId);
  if (!draft) throw new Error("Draft not found");
  if (draft.status !== "DRAFT") throw new Error("GRN already submitted");

  // Fetch already received cartons for this reference to prevent duplicates
  const doneMap = await exports.getReceivedCartons(draft.refId);

  let modified = false;
  for (const carton of cartonsPayload) {
    const { cartonIndex, pairBarcodes, itemName, variantId, cartonSku } = carton;
    if (!pairBarcodes || pairBarcodes.length === 0) continue;

    // Check for duplicates
    if (itemName && doneMap[itemName] && doneMap[itemName].includes((cartonIndex || 1) - 1)) {
      throw new Error(`Carton ${cartonIndex} for "${itemName}" has already been received in a previous GRN.`);
    }

    // Carton SKU comes from the Master Catalog's "Carton SKU" (Channel & SKU) field,
    // threaded through by the frontend; itemName is a defensive fallback only.
    const cartonBarcode = makeCartonBarcode(cartonSku || itemName || "CTN", cartonIndex || draft.cartonSerial);

    draft.cartons.unshift({
      cartonBarcode,
      itemName: itemName || "", 
      variantId: variantId || "", // Save ID for reliable stock updates
      pairBarcodes: [...pairBarcodes],
      lockedAt: new Date(),
    });

    // Mark these pairs as scanned so rescanning prevents duplicates if logic depends on it
    pairBarcodes.forEach(b => draft.scannedSet.push(b));
    modified = true;
    
    // Increment cartonSerial just in case it's used elsewhere, though we now rely on explicit indices
    draft.cartonSerial = Math.max(draft.cartonSerial, (cartonIndex || draft.cartonSerial) + 1);
  }

  // Clear currentPairs since we bulk inserted locked cartons directly
  draft.currentPairs = [];

  if (modified) {
    await draft.save();
  }
  return draft;
};

exports.rescanCurrent = async (draftId) => {
  const draft = await GRNDraft.findById(draftId);
  if (!draft) throw new Error("Draft not found");
  if (draft.status !== "DRAFT") throw new Error("GRN already submitted");

  // remove currentPairs from scannedSet
  const removeSet = new Set(draft.currentPairs);
  draft.scannedSet = draft.scannedSet.filter((x) => !removeSet.has(x));

  draft.currentPairs = [];
  await draft.save();

  return draft;
};

exports.removeCarton = async (draftId, cartonBarcode) => {
  const draft = await GRNDraft.findById(draftId);
  if (!draft) throw new Error("Draft not found");
  if (draft.status !== "DRAFT") throw new Error("GRN already submitted");

  const target = draft.cartons.find((c) => c.cartonBarcode === cartonBarcode);
  if (!target) throw new Error("Carton not found");

  // remove its pairs from scannedSet
  const removeSet = new Set(target.pairBarcodes);
  draft.scannedSet = draft.scannedSet.filter((x) => !removeSet.has(x));

  // remove carton
  draft.cartons = draft.cartons.filter(
    (c) => c.cartonBarcode !== cartonBarcode
  );

  await draft.save();
  return draft;
};

exports.submitDraft = async (draftId, {
  scannedItemNames,
  grnDate,
  vendorInvoiceNos,
  vendorChallanNos,
  vehicleNo,
  eWayBillNo,
  receivedBy,
  receivedByMobile,
  warehouse,
  remarks,
  poIds,
} = {}) => {
  const draft = await GRNDraft.findById(draftId);
  if (!draft) throw new Error("Draft not found");
  if (draft.status !== "DRAFT") throw new Error("GRN already submitted");

  if (draft.currentPairs.length !== 0) {
    throw new Error(
      `Current carton incomplete (${draft.currentPairs.length}/${PAIRS_PER_CARTON})`
    );
  }
  if (draft.cartons.length === 0) throw new Error("Add at least 1 carton");

  // Fetch PO for metadata
  let vendorName = "";
  let articleName = "";
  let po = null;
  if (draft.refType === "PO") {
    po = await PurchaseOrder.findOne({ poNumber: draft.refId }).lean();
    if (po) {
      vendorName = po.vendorName || "";
      // Use scannedItemNames from frontend if provided, otherwise fall back to first item
      if (scannedItemNames && scannedItemNames.length > 0) {
        articleName = scannedItemNames.join(", ");
      } else {
        articleName = (po.items && po.items[0]?.itemName) || "";
      }
    }
  } else if (draft.refType === "CAT") {
    const cat = await MasterCatalog.findById(draft.refId.replace("CAT-", "")).lean();
    if (cat) {
      articleName = cat.articleName || "";
    }
  }

  const totalPairs = draft.cartons.reduce((sum, c) => sum + c.pairBarcodes.length, 0);

  const sequence = await getNextSequence("grn_no");
  draft.status = "SUBMITTED";
  draft.submittedAt = new Date();
  draft.grnNo = makeGRNNo(articleName, draft.refId, sequence);
  draft.vendorName = vendorName;
  draft.articleName = articleName;
  draft.totalPairs = totalPairs;

  // Save GRN form fields
  if (grnDate) draft.grnDate = new Date(grnDate);
  if (vendorInvoiceNos) draft.vendorInvoiceNos = vendorInvoiceNos;
  if (vendorChallanNos) draft.vendorChallanNos = vendorChallanNos;
  if (vehicleNo) draft.vehicleNo = vehicleNo;
  if (eWayBillNo) draft.eWayBillNo = eWayBillNo;
  if (receivedBy) draft.receivedBy = receivedBy;
  if (receivedByMobile) draft.receivedByMobile = receivedByMobile;
  if (warehouse) draft.warehouse = warehouse;
  if (remarks) draft.remarks = remarks;
  if (poIds && poIds.length > 0) draft.poIds = poIds;

  // ─── Inventory Update Logic ──────────────────────────────
  // Group cartons by variantId (reliable)
  const cartonsByVariant = (draft.cartons || []).reduce((acc, c) => {
    const key = c.variantId || "UNKNOWN";
    if (!acc[key]) acc[key] = { count: 0, itemName: c.itemName || articleName, variantId: c.variantId };
    acc[key].count += 1;
    return acc;
  }, {});

  // Variants that actually received stock in this GRN — drives the pre-order
  // auto-release pass after the draft is saved.
  const stockedVariantIds = [];

  for (const [key, info] of Object.entries(cartonsByVariant)) {
    const { variantId, itemName } = info;
    if (!variantId) continue;
    
    const catalog = await MasterCatalog.findOne({ "variants._id": variantId });
    if (!catalog) continue;

    const variant = catalog.variants.id(variantId);
    if (!variant) continue;

    // ─── Actual Scanned Quantity Calculation ───
    // Build a reverse lookup of SKU -> Size Name
    // ⚡ CRITICAL: We prioritize the Purchase Order's sizeMap because barcodes are generated 
    // from the PO's SKU entries, which might differ from the Master Catalog defaults.
    const poItem = po ? po.items.find(it => 
      (it.variantId && String(it.variantId) === String(variant._id))
    ) : null;

    console.log(`[GRN-SUBMIT-DEBUG] Processing variant "${variant.itemName}" (ID: ${variant._id})`);
    if (po) {
      console.log(`[GRN-SUBMIT-DEBUG] Matched PO: ${po.poNumber}. Item found: ${!!poItem}`);
    }

    const skuToSize = {};
    const poSizeMap = poItem ? (poItem.sizeMap && typeof poItem.sizeMap.toJSON === 'function' ? poItem.sizeMap.toJSON() : (poItem.sizeMap || {})) : {};

    Object.entries(poSizeMap).forEach(([size, cell]) => {
      if (cell && cell.sku) {
        skuToSize[String(cell.sku).trim().toLowerCase()] = size.trim();
      }
    });

    const poSkusCount = Object.keys(skuToSize).length;
    console.log(`[GRN-SUBMIT-DEBUG] SKUs found in PO: ${poSkusCount}`);

    // Fallback: If PO had no SKUs, check Master Catalog
    if (poSkusCount === 0 && variant.sizeMap) {
      console.log(`[GRN-SUBMIT-DEBUG] PO has no SKUs, checking Master Catalog for SKUs...`);
      const masterSizeMap = variant.sizeMap && typeof variant.sizeMap.toJSON === 'function' ? variant.sizeMap.toJSON() : (variant.sizeMap || {});
      Object.entries(masterSizeMap).forEach(([size, cell]) => {
        if (cell && cell.sku) {
          skuToSize[String(cell.sku).trim().toLowerCase()] = size.trim();
        }
      });
      console.log(`[GRN-SUBMIT-DEBUG] Total SKUs after Master check: ${Object.keys(skuToSize).length}`);
    }

    // Filter cartons that belong to THIS specific variant
    const variantCartons = (draft.cartons || []).filter(c => 
      (c.variantId && String(c.variantId) === String(variant._id))
    );

    console.log(`[GRN-SUBMIT-DEBUG] Found ${variantCartons.length} cartons for this variant in the draft.`);

    const actualCounts = {};
    let matchedBarcodes = 0;
    variantCartons.forEach(carton => {
      (carton.pairBarcodes || []).forEach(barcode => {
        const cleanBar = String(barcode).trim().toLowerCase();
        const size = skuToSize[cleanBar];
        if (size) {
          matchedBarcodes++;
          actualCounts[size] = (actualCounts[size] || 0) + 1;
        }
      });
    });

    console.log(`[GRN-SUBMIT-DEBUG] SKU Matching result: ${matchedBarcodes} pairs matched out of ${variantCartons.length * 24} expected.`);

    // ─── FALLBACK: If SKU matching found nothing, use PO-based quantity breakup ───
    const totalCounted = Object.values(actualCounts).reduce((s, v) => s + v, 0);
    
    if (totalCounted === 0 && variantCartons.length > 0) {
      if (poItem && Object.keys(poSizeMap).length > 0) {
        console.log(`[GRN-SUBMIT-DEBUG] ⚡ SKU match failed. Triggering PO-based fallback for ${variantCartons.length} cartons.`);
        Object.entries(poSizeMap).forEach(([size, cell]) => {
          const cleanSize = size.trim();
          actualCounts[cleanSize] = variantCartons.length * (Number(cell?.qty) || 0);
        });
      } else {
        // Last resort: use Master Catalog assortment
        console.log(`[GRN-SUBMIT-DEBUG] ⚡ SKU match failed & PO data missing. Triggering Master-based fallback.`);
        const sizeQuantitiesData = variant.sizeQuantities && typeof variant.sizeQuantities.toJSON === 'function' 
          ? variant.sizeQuantities.toJSON() : (variant.sizeQuantities || {});

        if (Object.keys(sizeQuantitiesData).length > 0) {
          Object.entries(sizeQuantitiesData).forEach(([size, qtyPerCarton]) => {
            const cleanSize = size.trim();
            actualCounts[cleanSize] = variantCartons.length * (Number(qtyPerCarton) || 0);
          });
        }
      }
    }

    console.log(`[GRN-SUBMIT-DEBUG] Final counts for inventory update:`, actualCounts);

    // ─── Perform Atomic Update with Actual Counts ───
    if (Object.keys(actualCounts).length > 0) {
      const incUpdate = {};
      Object.entries(actualCounts).forEach(([size, count]) => {
        const cleanSize = String(size).trim();
        incUpdate[`variants.$.sizeMap.${cleanSize}.qty`] = count;
      });

      await MasterCatalog.updateOne(
        { "variants._id": variant._id },
        { $inc: incUpdate }
      );
      stockedVariantIds.push(String(variant._id));
      // No explicit stage promotion needed — RFD/PreOrder is computed live
      // from sizeMap.qty + PO-pending, so incrementing qty above already
      // makes this variant RFD by definition.
    }
  }

  // ─── Assign global carton serials and populate available pool ───────────
  for (const [variantId, info] of Object.entries(cartonsByVariant)) {
    if (!variantId || variantId === "UNKNOWN") continue;
    const catalog = await MasterCatalog.findOne({ "variants._id": variantId });
    const variant = catalog?.variants.id(variantId);
    if (!variant) continue;

    const cartonSku = variant.sku || variant.itemName || "CTN";
    const count = info.count;

    const counter = await Counter.findOneAndUpdate(
      { id: `carton-serial-${variantId}` },
      { $inc: { seq: count } },
      { new: true, upsert: true }
    );
    const lastSerial = counter.seq;
    const firstSerial = lastSerial - count + 1;

    const newCodes = Array.from({ length: count }, (_, i) =>
      `${cartonSku}-CT${String(firstSerial + i).padStart(4, "0")}`
    );

    variant.availableCartons = [...(variant.availableCartons || []), ...newCodes];
    catalog.markModified("variants");
    await catalog.save();

    // Update carton barcodes in the draft to match the global serials
    let codeIdx = 0;
    for (const carton of draft.cartons) {
      if (String(carton.variantId) === variantId && codeIdx < newCodes.length) {
        carton.cartonBarcode = newCodes[codeIdx++];
      }
    }
  }

  await draft.save();

  // Notify every order with a still-PREORDER item on this variant — under
  // the shared-pool model they all now see the same live carton pool, so
  // ALL of them (not just one) need their Scan screen refreshed, not just
  // whichever order happened to be "next in line". GRN submission itself
  // must not fail if this step errors.
  if (stockedVariantIds.length) {
    try {
      const orderService = require("./order.service");
      const affectedOrders = await orderService.promotePreOrderItems(stockedVariantIds);
      if (affectedOrders.length) {
        let emitOrderUpdate;
        try {
          ({ emitOrderUpdate } = require("../socket"));
        } catch (_) {}
        affectedOrders.forEach((o) => {
          try {
            if (emitOrderUpdate) emitOrderUpdate(o);
          } catch (_) {}
        });
        console.log(`[GRN-SUBMIT] Notified ${affectedOrders.length} order(s) waiting on this stock`);
      }
    } catch (err) {
      console.error("[GRN-SUBMIT] Pre-order notification failed:", err.message);
    }

    // Top up any REGULAR items stuck without allocatedCartons because the
    // barcode pool was short/empty at booking time — see
    // backfillRegularCartonAllocations for why this can't just self-heal.
    try {
      const orderService = require("./order.service");
      const backfilledOrders = await orderService.backfillRegularCartonAllocations(stockedVariantIds);
      if (backfilledOrders.length) {
        let emitOrderUpdate;
        try {
          ({ emitOrderUpdate } = require("../socket"));
        } catch (_) {}
        backfilledOrders.forEach((o) => {
          try {
            if (emitOrderUpdate) emitOrderUpdate(o);
          } catch (_) {}
        });
        console.log(`[GRN-SUBMIT] Backfilled carton codes for ${backfilledOrders.length} regular order(s)`);
      }
    } catch (err) {
      console.error("[GRN-SUBMIT] Regular carton backfill failed:", err.message);
    }
  }

  return draft;
};

exports.getReceivedCartons = async (refId) => {
  const submittedGRNs = await GRNDraft.find({ refId, status: "SUBMITTED" }).lean();
  const doneMap = {};

  submittedGRNs.forEach(grn => {
    (grn.cartons || []).forEach(c => {
      // Prefer variantId over itemName for the map key to prevent collisions
      const key = c.variantId || c.itemName || (grn.articleName.includes(",") ? grn.articleName.split(",")[0].trim() : grn.articleName);
      if (!doneMap[key]) doneMap[key] = [];
      
      // Extract serial from barcode e.g. "Riv-blk-04-08-CT001" -> 0.
      // Match the trailing CT<digits> rather than splitting on "-", since the
      // Carton SKU portion itself commonly contains dashes.
      const match = (c.cartonBarcode || "").match(/CT(\d+)$/);
      const serial = match ? parseInt(match[1], 10) : NaN;

      if (!isNaN(serial) && !doneMap[key].includes(serial - 1)) {
        doneMap[key].push(serial - 1);
      }
    });
  });

  return doneMap;
};

exports.getHistory = async (params = {}) => {
  const { search, dateFrom, dateTo, refId, vendor, sortBy, sortOrder } = params;
  const filter = { status: "SUBMITTED" };

  // Text search across multiple fields, including carton barcodes (e.g. "Riv-rog-04-08-CT001")
  if (search) {
    const regex = makeRegex(search);
    filter.$or = [
      { grnNo: regex },
      { refId: regex },
      { articleName: regex },
      { vendorName: regex },
      { "cartons.cartonBarcode": regex },
    ];
  }

  // Date range filter on submittedAt
  if (dateFrom || dateTo) {
    filter.submittedAt = {};
    if (dateFrom) filter.submittedAt.$gte = new Date(dateFrom);
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      filter.submittedAt.$lte = end;
    }
  }

  // PO reference exact match
  if (refId) filter.refId = refId;

  // Vendor regex search
  if (vendor) filter.vendorName = makeRegex(vendor);

  // Sorting
  const validSortFields = ["submittedAt", "grnNo", "totalPairs", "vendorName", "refId", "articleName"];
  const field = validSortFields.includes(sortBy) ? sortBy : "submittedAt";
  const order = sortOrder === "asc" ? 1 : -1;

  const list = await GRNDraft.find(filter).sort({ [field]: order }).lean();

  return list.map((d) => ({
    grnId: d._id,
    grnNo: d.grnNo,
    refId: d.refId,
    poIds: d.poIds || [],
    vendorName: d.vendorName,
    articleName: d.articleName,
    totalPairs: d.totalPairs,
    cartons: (d.cartons || []).length,
    createdAt: d.submittedAt,
  }));
};

exports.getHistoryForExport = async (params = {}) => {
  const { search, dateFrom, dateTo, refId, vendor, sortBy, sortOrder } = params;
  const filter = { status: "SUBMITTED" };

  if (search) {
    const regex = makeRegex(search);
    filter.$or = [
      { grnNo: regex },
      { refId: regex },
      { articleName: regex },
      { vendorName: regex },
      { "cartons.cartonBarcode": regex },
    ];
  }

  if (dateFrom || dateTo) {
    filter.submittedAt = {};
    if (dateFrom) filter.submittedAt.$gte = new Date(dateFrom);
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      filter.submittedAt.$lte = end;
    }
  }

  if (refId) filter.refId = refId;
  if (vendor) filter.vendorName = makeRegex(vendor);

  const validSortFields = ["submittedAt", "grnNo", "totalPairs", "vendorName", "refId", "articleName"];
  const field = validSortFields.includes(sortBy) ? sortBy : "submittedAt";
  const order = sortOrder === "asc" ? 1 : -1;

  const list = await GRNDraft.find(filter).sort({ [field]: order }).lean();

  return list.map((d) => ({
    grnId: d._id,
    grnNo: d.grnNo || "",
    refId: d.refId || "",
    refType: d.refType || "",
    vendorName: d.vendorName || "",
    articleName: d.articleName || "",
    totalPairs: d.totalPairs || 0,
    status: d.status || "",
    submittedAt: d.submittedAt || "",
    createdAt: d.createdAt || "",
    cartons: (d.cartons || []).map((c, idx) => ({
      index: idx + 1,
      cartonBarcode: c.cartonBarcode || "",
      itemName: c.itemName || "",
      variantId: c.variantId || "",
      pairsCount: (c.pairBarcodes || []).length,
      lockedAt: c.lockedAt || "",
      // SKU breakdown: count of each unique barcode (SKU)
      skuBreakdown: (c.pairBarcodes || []).reduce((acc, b) => {
        acc[b] = (acc[b] || 0) + 1;
        return acc;
      }, {}),
    })),
  }));
};

exports.getGRNById = async (grnId) => {
  const grn = await GRNDraft.findById(grnId);
  if (!grn) throw new Error("GRN not found");
  return grn;
};

