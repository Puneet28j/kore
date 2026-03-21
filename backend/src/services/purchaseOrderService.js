const mongoose = require("mongoose");
const PurchaseOrder = require("../models/PurchaseOrder");
const Vendor = require("../models/Vendor");

const ALLOWED_PAGE_LIMITS = [10, 20, 30, 50, 100, 200, 500, 1000];

const round2 = (n) => Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;

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

const ensureValidId = (id, name = "ID") => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const err = new Error(`Invalid ${name}`);
    err.statusCode = 400;
    throw err;
  }
};

const computeItem = (it) => {
  const base = Number(it.basePrice || 0);

  // Calculate quantity from sizeMap if it exists
  let qty = Number(it.quantity || 1);
  if (it.sizeMap) {
    let derivedQty = 0;
    if (it.sizeMap instanceof Map) {
      it.sizeMap.forEach((value) => {
        derivedQty += Number(value?.qty || 0);
      });
    } else if (typeof it.sizeMap === "object" && it.sizeMap !== null) {
      Object.values(it.sizeMap).forEach((value) => {
        derivedQty += Number(value?.qty || 0);
      });
    }
    if (derivedQty > 0) {
      qty = derivedQty;
    }
  }
  qty = Math.max(1, qty);

  const taxRate = Number(it.taxRate || 0);

  const taxPerItem = round2((base * taxRate) / 100);
  const unitTotal = round2((base + taxPerItem) * qty);

  return {
    ...it,
    quantity: qty,
    basePrice: base,
    taxRate,
    taxPerItem,
    unitTotal,
  };
};

const computeTotals = (items, discountPercent) => {
  const computed = items.map(computeItem);

  const subTotal = round2(
    computed.reduce(
      (sum, it) => sum + Number(it.basePrice || 0) * Number(it.quantity || 0),
      0
    )
  );

  const discPct = Math.min(100, Math.max(0, Number(discountPercent || 0)));
  const discountAmount = round2((subTotal * discPct) / 100);

  const totalTax = round2(
    computed.reduce(
      (sum, it) => sum + Number(it.taxPerItem || 0) * Number(it.quantity || 0),
      0
    )
  );

  const total = round2(subTotal - discountAmount + totalTax);

  return {
    items: computed,
    subTotal,
    discountPercent: discPct,
    discountAmount,
    totalTax,
    total,
  };
};

exports.generateNextPONumber = async () => {
  const last = await PurchaseOrder.findOne({ isDeleted: false })
    .sort({ createdAt: -1 })
    .select("poNumber")
    .lean();

  const lastNum = last?.poNumber?.match(/PO-(\d+)/)?.[1];
  const next = (lastNum ? parseInt(lastNum, 10) : 0) + 1;

  return `PO-${String(next).padStart(5, "0")}`;
};

exports.create = async (body) => {
  ensureValidId(body.vendorId, "vendorId");

  if (!body.poNumber) {
    const err = new Error("poNumber is required");
    err.statusCode = 400;
    throw err;
  }

  const vendor = await Vendor.findById(body.vendorId).lean();
  if (!vendor) {
    const err = new Error("Vendor not found");
    err.statusCode = 404;
    throw err;
  }

  const rawItems = Array.isArray(body.items) ? body.items : [];
  const filtered = rawItems.filter(
    (it) => it.articleId || it.itemName || it.sku
  );

  if (filtered.length === 0) {
    const err = new Error("At least one item is required");
    err.statusCode = 400;
    throw err;
  }

  const totals = computeTotals(filtered, body.discountPercent);

  try {
    const doc = await PurchaseOrder.create({
      vendorId: body.vendorId,
      vendorName:
        body.vendorName || vendor.displayName || vendor.companyName || "",

      poNumber: body.poNumber,
      referenceNumber: body.referenceNumber || "",

      date: body.date ? new Date(body.date) : new Date(),
      deliveryDate: body.deliveryDate ? new Date(body.deliveryDate) : null,

      paymentTerms: body.paymentTerms || "Due on Receipt",
      shipmentPreference: body.shipmentPreference || "",

      notes: body.notes || "",
      termsAndConditions: body.termsAndConditions || "",

      items: totals.items.map((it) => {
        // Ensure sizeMap is a proper object (Mongoose will convert to Map)
        let sizeMapData = {};
        if (it.sizeMap) {
          if (it.sizeMap instanceof Map) {
            // Convert Map to plain object
            it.sizeMap.forEach((value, key) => {
              sizeMapData[String(key)] = {
                qty: Number(value?.qty || 0),
                sku: String(value?.sku || ""),
              };
            });
          } else if (typeof it.sizeMap === "object" && it.sizeMap !== null) {
            // Already an object, ensure proper structure
            Object.entries(it.sizeMap).forEach(([key, value]) => {
              sizeMapData[String(key)] = {
                qty: Number(value?.qty || 0),
                sku: String(value?.sku || ""),
              };
            });
          }
        }

        return {
          rowId: it.id || it.rowId || "",
          articleId: mongoose.Types.ObjectId.isValid(it.articleId)
            ? it.articleId
            : undefined,
          variantId: it.variantId || "",

          itemName: it.itemName || "",
          image: it.image || "",
          sku: it.sku || "",
          skuCompany: it.skuCompany || "",
          itemTaxCode: it.itemTaxCode || "",

          quantity: it.quantity,
          taxRate: it.taxRate,
          cartonCount: Number(it.cartonCount || 0),
          taxType: it.taxType || "GST",
          basePrice: it.basePrice,
          mrp: it.mrp || 0,

          taxPerItem: it.taxPerItem,
          unitTotal: it.unitTotal,
          sizeMap: sizeMapData,
        };
      }),

      subTotal: totals.subTotal,
      discountPercent: totals.discountPercent,
      discountAmount: totals.discountAmount,
      totalTax: totals.totalTax,
      total: totals.total,

      status: body.status === "SENT" ? "SENT" : "DRAFT",

      billStatus: "PENDING",
      billRemark: "",
      billApprovedAt: null,
      billRejectedAt: null,
    });

    return doc;
  } catch (e) {
    if (e.code === 11000) {
      const err = new Error("poNumber already exists");
      err.statusCode = 409;
      throw err;
    }
    throw e;
  }
};

exports.list = async (query) => {
  const { q, status, vendorId, page = 1, limit = 10, from, to } = query;

  const normalizedPage = normalizePage(page);
  const normalizedLimit = normalizeLimit(limit);
  const skip = (normalizedPage - 1) * normalizedLimit;

  const filter = { isDeleted: false };

  if (status) filter.status = status;

  if (vendorId) {
    ensureValidId(vendorId, "vendorId");
    filter.vendorId = vendorId;
  }

  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = new Date(from);
    if (to) filter.date.$lte = new Date(to);
  }

  if (q) {
    filter.$or = [
      { poNumber: { $regex: q, $options: "i" } },
      { vendorName: { $regex: q, $options: "i" } },
      { referenceNumber: { $regex: q, $options: "i" } },
    ];
  }

  const [items, total] = await Promise.all([
    PurchaseOrder.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(normalizedLimit)
      .lean(),
    PurchaseOrder.countDocuments(filter),
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

// ✅ bill page list
exports.listBills = async (query) => {
  const { q, billStatus, vendorId, page = 1, limit = 10, from, to } = query;

  const normalizedPage = normalizePage(page);
  const normalizedLimit = normalizeLimit(limit);
  const skip = (normalizedPage - 1) * normalizedLimit;

  const filter = {
    isDeleted: false,
    status: "SENT", // bill page me sirf sent PO dikhana better rahega
  };

  if (billStatus) filter.billStatus = billStatus;

  if (vendorId) {
    ensureValidId(vendorId, "vendorId");
    filter.vendorId = vendorId;
  }

  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = new Date(from);
    if (to) filter.date.$lte = new Date(to);
  }

  if (q) {
    filter.$or = [
      { poNumber: { $regex: q, $options: "i" } },
      { vendorName: { $regex: q, $options: "i" } },
      { referenceNumber: { $regex: q, $options: "i" } },
      { billRemark: { $regex: q, $options: "i" } },
    ];
  }

  const [items, total] = await Promise.all([
    PurchaseOrder.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(normalizedLimit)
      .lean(),
    PurchaseOrder.countDocuments(filter),
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
  ensureValidId(id, "po id");

  const doc = await PurchaseOrder.findOne({ _id: id, isDeleted: false }).lean();
  if (!doc) {
    const err = new Error("Not found");
    err.statusCode = 404;
    throw err;
  }

  return doc;
};

// ✅ bill detail
exports.getBillById = async (id) => {
  ensureValidId(id, "bill id");

  const doc = await PurchaseOrder.findOne({
    _id: id,
    isDeleted: false,
    status: "SENT",
  }).lean();

  if (!doc) {
    const err = new Error("Bill not found");
    err.statusCode = 404;
    throw err;
  }

  return doc;
};

exports.update = async (id, body) => {
  ensureValidId(id, "po id");

  const doc = await PurchaseOrder.findOne({ _id: id, isDeleted: false });
  if (!doc) {
    const err = new Error("Not found");
    err.statusCode = 404;
    throw err;
  }

  // ✅ PREVENT UPDATES IF PO IS ALREADY APPROVED
  if (doc.billStatus === "APPROVED") {
    const err = new Error("Approved Purchase Orders cannot be modified");
    err.statusCode = 403;
    throw err;
  }

  const patch = {
    vendorId: body.vendorId,
    vendorName: body.vendorName,
    poNumber: body.poNumber,
    referenceNumber: body.referenceNumber,
    date: body.date ? new Date(body.date) : undefined,
    deliveryDate: body.deliveryDate ? new Date(body.deliveryDate) : undefined,
    paymentTerms: body.paymentTerms,
    shipmentPreference: body.shipmentPreference,
    notes: body.notes,
    termsAndConditions: body.termsAndConditions,
    status: body.status,
  };

  if (patch.vendorId !== undefined) {
    ensureValidId(patch.vendorId, "vendorId");
    const vendor = await Vendor.findById(patch.vendorId).lean();
    if (!vendor) {
      const err = new Error("Vendor not found");
      err.statusCode = 404;
      throw err;
    }
    doc.vendorId = patch.vendorId;
    doc.vendorName =
      patch.vendorName || vendor.displayName || vendor.companyName || "";
  }

  [
    "poNumber",
    "referenceNumber",
    "paymentTerms",
    "shipmentPreference",
    "notes",
    "termsAndConditions",
  ].forEach((k) => {
    if (patch[k] !== undefined) doc[k] = patch[k];
  });

  if (patch.date !== undefined) doc.date = patch.date;
  if (patch.deliveryDate !== undefined) doc.deliveryDate = patch.deliveryDate;
  if (patch.status !== undefined) {
    const newStatus = patch.status === "SENT" ? "SENT" : "DRAFT";
    
    // ✅ Revision logic: if re-sending a rejected PO
    if (doc.status === "SENT" && doc.billStatus === "REJECTED" && newStatus === "SENT") {
      doc.isRevised = true;
      doc.revisionCount = (doc.revisionCount || 0) + 1;
      doc.billStatus = "PENDING";
      doc.billRemark = "";
      doc.billRejectedAt = null;
    }
    
    doc.status = newStatus;
  }

  if (body.items !== undefined) {
    const rawItems = Array.isArray(body.items) ? body.items : [];
    const filtered = rawItems.filter(
      (it) => it.articleId || it.itemName || it.sku
    );

    if (filtered.length === 0) {
      const err = new Error("At least one item is required");
      err.statusCode = 400;
      throw err;
    }

    const totals = computeTotals(filtered, body.discountPercent);

    doc.items = totals.items.map((it) => {
      // Ensure sizeMap is a proper object (Mongoose will convert to Map)
      let sizeMapData = {};
      if (it.sizeMap) {
        if (it.sizeMap instanceof Map) {
          // Convert Map to plain object
          it.sizeMap.forEach((value, key) => {
            sizeMapData[String(key)] = {
              qty: Number(value?.qty || 0),
              sku: String(value?.sku || ""),
            };
          });
        } else if (typeof it.sizeMap === "object" && it.sizeMap !== null) {
          // Already an object, ensure proper structure
          Object.entries(it.sizeMap).forEach(([key, value]) => {
            sizeMapData[String(key)] = {
              qty: Number(value?.qty || 0),
              sku: String(value?.sku || ""),
            };
          });
        }
      }

      return {
        rowId: it.id || it.rowId || "",
        articleId: mongoose.Types.ObjectId.isValid(it.articleId)
          ? it.articleId
          : undefined,
        variantId: it.variantId || "",
        itemName: it.itemName || "",
        image: it.image || "",
        sku: it.sku || "",
        skuCompany: it.skuCompany || "",
        itemTaxCode: it.itemTaxCode || "",
        quantity: it.quantity,
        cartonCount: Number(it.cartonCount || 0),
        taxRate: it.taxRate,
        taxType: it.taxType || "GST",
        basePrice: it.basePrice,
        mrp: it.mrp || 0,
        taxPerItem: it.taxPerItem,
        unitTotal: it.unitTotal,
        sizeMap: sizeMapData,
      };
    });

    doc.subTotal = totals.subTotal;
    doc.discountPercent = totals.discountPercent;
    doc.discountAmount = totals.discountAmount;
    doc.totalTax = totals.totalTax;
    doc.total = totals.total;
  } else if (body.discountPercent !== undefined) {
    const totals = computeTotals(doc.items, body.discountPercent);
    doc.discountPercent = totals.discountPercent;
    doc.discountAmount = totals.discountAmount;
    doc.totalTax = totals.totalTax;
    doc.total = totals.total;
    doc.subTotal = totals.subTotal;
    doc.items = totals.items;
  }

  try {
    await doc.save();
  } catch (e) {
    if (e.code === 11000) {
      const err = new Error("poNumber already exists");
      err.statusCode = 409;
      throw err;
    }
    throw e;
  }

  return doc;
};

// ✅ approve bill
exports.approveBill = async (id, body) => {
  ensureValidId(id, "bill id");

  const doc = await PurchaseOrder.findOne({
    _id: id,
    isDeleted: false,
    status: "SENT",
  });

  if (!doc) {
    const err = new Error("Bill not found");
    err.statusCode = 404;
    throw err;
  }

  doc.billStatus = "APPROVED";
  doc.billRemark = body?.remark || "";
  doc.billApprovedAt = new Date();
  doc.billRejectedAt = null;

  await doc.save();
  return doc;
};

// ✅ reject bill
exports.rejectBill = async (id, body) => {
  ensureValidId(id, "bill id");

  const doc = await PurchaseOrder.findOne({
    _id: id,
    isDeleted: false,
    status: "SENT",
  });

  if (!doc) {
    const err = new Error("Bill not found");
    err.statusCode = 404;
    throw err;
  }

  doc.billStatus = "REJECTED";
  doc.billRemark = body?.remark || "";
  doc.billRejectedAt = new Date();
  doc.billApprovedAt = null;

  await doc.save();
  return doc;
};

exports.softDelete = async (id) => {
  ensureValidId(id, "po id");

  const doc = await PurchaseOrder.findOne({ _id: id, isDeleted: false });
  if (!doc) {
    const err = new Error("Not found");
    err.statusCode = 404;
    throw err;
  }

  doc.isDeleted = true;
  await doc.save();
  return true;
};
