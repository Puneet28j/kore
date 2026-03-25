const GRNDraft = require("../models/grn.model");

const PAIRS_PER_CARTON = 24;

const todayYYMMDD = () => {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
};

const makeCartonBarcode = (refType, refNo, serial) => {
  // refNo: "1023" from "PO-1023"
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
    const cartonBarcode = makeCartonBarcode(
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

  let modified = false;
  for (const carton of cartonsPayload) {
    const { cartonIndex, pairBarcodes, itemName } = carton;
    if (!pairBarcodes || pairBarcodes.length === 0) continue;

    // Use the explicit cartonIndex for the serial number
    const refNo = String(draft.refId).split("-")[1] || draft.refId;
    const cartonBarcode = makeCartonBarcode(draft.refType, refNo, cartonIndex || draft.cartonSerial);

    draft.cartons.unshift({
      cartonBarcode,
      itemName: itemName || "", // NEW: Save specific variant name
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

exports.submitDraft = async (draftId, { scannedItemNames } = {}) => {
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
  if (draft.refType === "PO") {
    const po = await PurchaseOrder.findOne({ poNumber: draft.refId }).lean();
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

  await draft.save();
  return draft;
};

exports.getHistory = async (search = "") => {
  const q = (search || "").trim();
  const filter = { status: "SUBMITTED" };
  if (q)
    filter.$or = [{ grnNo: new RegExp(q, "i") }, { refId: new RegExp(q, "i") }];

  const list = await GRNDraft.find(filter).sort({ submittedAt: -1 }).limit(50);

  return list.map((d) => ({
    grnId: d._id,
    grnNo: d.grnNo,
    refId: d.refId,
    vendorName: d.vendorName,
    articleName: d.articleName,
    totalPairs: d.totalPairs,
    cartons: d.cartons.length,
    createdAt: d.submittedAt,
  }));
};

exports.getGRNById = async (grnId) => {
  const grn = await GRNDraft.findById(grnId);
  if (!grn) throw new Error("GRN not found");
  return grn;
};
