const mongoose = require("mongoose");
const PurchaseOrder = require("../models/PurchaseOrder");
const Vendor = require("../models/Vendor"); // assume already exists

const round2 = (n) => Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;

const computeItem = (it) => {
  const base = Number(it.basePrice || 0);
  const qty = Math.max(1, Number(it.quantity || 1));
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
    computed.reduce((sum, it) => sum + Number(it.basePrice || 0) * Number(it.quantity || 0), 0)
  );

  const discPct = Math.min(100, Math.max(0, Number(discountPercent || 0)));
  const discountAmount = round2((subTotal * discPct) / 100);

  const totalTax = round2(
    computed.reduce((sum, it) => sum + Number(it.taxPerItem || 0) * Number(it.quantity || 0), 0)
  );

  const total = round2(subTotal - discountAmount + totalTax);

  return { items: computed, subTotal, discountPercent: discPct, discountAmount, totalTax, total };
};

const ensureValidId = (id, name = "ID") => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const err = new Error(`Invalid ${name}`);
    err.statusCode = 400;
    throw err;
  }
};

exports.generateNextPONumber = async () => {
  const last = await PurchaseOrder.findOne({ isDeleted: false }).sort({ createdAt: -1 }).lean();
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
  const filtered = rawItems.filter((it) => it.articleId || it.itemName || it.sku);

  if (filtered.length === 0) {
    const err = new Error("At least one item is required");
    err.statusCode = 400;
    throw err;
  }

  const totals = computeTotals(filtered, body.discountPercent);

  try {
    const doc = await PurchaseOrder.create({
      vendorId: body.vendorId,
      vendorName: body.vendorName || vendor.displayName || vendor.companyName || "",

      poNumber: body.poNumber,
      referenceNumber: body.referenceNumber || "",

      date: body.date ? new Date(body.date) : new Date(),
      deliveryDate: body.deliveryDate ? new Date(body.deliveryDate) : null,

      paymentTerms: body.paymentTerms || "Due on Receipt",
      shipmentPreference: body.shipmentPreference || "",

      notes: body.notes || "",
      termsAndConditions: body.termsAndConditions || "",

      items: totals.items.map((it) => ({
        rowId: it.id || it.rowId || "",
        articleId: mongoose.Types.ObjectId.isValid(it.articleId) ? it.articleId : undefined,
        variantId: mongoose.Types.ObjectId.isValid(it.variantId) ? it.variantId : undefined,

        itemName: it.itemName || "",
        image: it.image || "",
        sku: it.sku || "",
        skuCompany: it.skuCompany || "",
        itemTaxCode: it.itemTaxCode || "",

        quantity: it.quantity,
        taxRate: it.taxRate,
        taxType: it.taxType || "GST",
        basePrice: it.basePrice,

        taxPerItem: it.taxPerItem,
        unitTotal: it.unitTotal,
      })),

      subTotal: totals.subTotal,
      discountPercent: totals.discountPercent,
      discountAmount: totals.discountAmount,
      totalTax: totals.totalTax,
      total: totals.total,

      status: body.status === "SENT" ? "SENT" : "DRAFT",
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
  const { q, status, vendorId, page = 1, limit = 20, from, to } = query;

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

  const skip = (Number(page) - 1) * Number(limit);

  const [items, total] = await Promise.all([
    PurchaseOrder.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
    PurchaseOrder.countDocuments(filter),
  ]);

  return { items, total, page: Number(page), limit: Number(limit) };
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

exports.update = async (id, body) => {
  ensureValidId(id, "po id");

  const doc = await PurchaseOrder.findOne({ _id: id, isDeleted: false });
  if (!doc) {
    const err = new Error("Not found");
    err.statusCode = 404;
    throw err;
  }

  // allow update header fields
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

  // vendor change validation
  if (patch.vendorId !== undefined) {
    ensureValidId(patch.vendorId, "vendorId");
    const vendor = await Vendor.findById(patch.vendorId).lean();
    if (!vendor) {
      const err = new Error("Vendor not found");
      err.statusCode = 404;
      throw err;
    }
    doc.vendorId = patch.vendorId;
    doc.vendorName = patch.vendorName || vendor.displayName || vendor.companyName || "";
  }

  // header fields
  ["poNumber","referenceNumber","paymentTerms","shipmentPreference","notes","termsAndConditions"].forEach((k) => {
    if (patch[k] !== undefined) doc[k] = patch[k];
  });
  if (patch.date !== undefined) doc.date = patch.date;
  if (patch.deliveryDate !== undefined) doc.deliveryDate = patch.deliveryDate;
  if (patch.status !== undefined) doc.status = patch.status === "SENT" ? "SENT" : "DRAFT";

  // items replace + totals recompute (only if provided)
  if (body.items !== undefined) {
    const rawItems = Array.isArray(body.items) ? body.items : [];
    const filtered = rawItems.filter((it) => it.articleId || it.itemName || it.sku);
    if (filtered.length === 0) {
      const err = new Error("At least one item is required");
      err.statusCode = 400;
      throw err;
    }

    const totals = computeTotals(filtered, body.discountPercent);

    doc.items = totals.items.map((it) => ({
      rowId: it.id || it.rowId || "",
      articleId: mongoose.Types.ObjectId.isValid(it.articleId) ? it.articleId : undefined,
      variantId: mongoose.Types.ObjectId.isValid(it.variantId) ? it.variantId : undefined,
      itemName: it.itemName || "",
      image: it.image || "",
      sku: it.sku || "",
      skuCompany: it.skuCompany || "",
      itemTaxCode: it.itemTaxCode || "",
      quantity: it.quantity,
      taxRate: it.taxRate,
      taxType: it.taxType || "GST",
      basePrice: it.basePrice,
      taxPerItem: it.taxPerItem,
      unitTotal: it.unitTotal,
    }));

    doc.subTotal = totals.subTotal;
    doc.discountPercent = totals.discountPercent;
    doc.discountAmount = totals.discountAmount;
    doc.totalTax = totals.totalTax;
    doc.total = totals.total;
  } else if (body.discountPercent !== undefined) {
    // discount changed but items not provided
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