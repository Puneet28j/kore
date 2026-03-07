const GRNDraft = require("../models/grn.model");

const PAIRS_PER_CARTON = 24;

const todayYYYYMMDD = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
};

const makeCartonBarcode = (refType, refNo, serial) => {
  // refNo: "1023" from "PO-1023"
  return `CTN-${todayYYYYMMDD()}-${refType}-${refNo}-${String(serial).padStart(
    3,
    "0"
  )}`;
};

const makeGRNNo = () => {
  return `GRN-${todayYYYYMMDD()}-${Math.floor(Math.random() * 900 + 100)}`;
};

// when running in production we want to return actual PO and catalogue references
const PurchaseOrder = require("../models/PurchaseOrder");
const MasterCatalog = require("../models/MasterCatalog");
const Brand = require("../models/Brand");

// helper to build regex for search
const makeRegex = (str) => {
  if (!str) return null;
  return new RegExp(str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
};

exports.listReferences = async (search = "") => {
  const q = (search || "").trim();
  const regex = makeRegex(q);

  // fetch PO docs matching search (po number or vendor name)
  const poFilter = { isDeleted: false };
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

  // optional: verify ref exists
  const exists = demoRefs.find((r) => r.id === refId && r.refType === refType);
  if (!exists) throw new Error("Invalid reference");

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

  // duplicate rules
  if (draft.currentPairs.includes(pairBarcode))
    throw new Error("Duplicate in current carton not allowed");
  if (draft.scannedSet.includes(pairBarcode))
    throw new Error("Duplicate in this GRN not allowed");

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

exports.submitDraft = async (draftId) => {
  const draft = await GRNDraft.findById(draftId);
  if (!draft) throw new Error("Draft not found");
  if (draft.status !== "DRAFT") throw new Error("GRN already submitted");

  if (draft.currentPairs.length !== 0) {
    throw new Error(
      `Current carton incomplete (${draft.currentPairs.length}/${PAIRS_PER_CARTON})`
    );
  }
  if (draft.cartons.length === 0) throw new Error("Add at least 1 carton");

  // TODO: Stock entry carton-wise create here
  // For each carton: create Stock model entry
  // Use transaction if needed.

  draft.status = "SUBMITTED";
  draft.submittedAt = new Date();
  draft.grnNo = makeGRNNo();

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
    cartons: d.cartons.length,
    createdAt: d.submittedAt,
  }));
};

exports.getGRNById = async (grnId) => {
  const grn = await GRNDraft.findById(grnId);
  if (!grn) throw new Error("GRN not found");
  return grn;
};
