const mongoose = require("mongoose");
const PurchaseOrder = require("../models/PurchaseOrder");
const Vendor = require("../models/Vendor");
const Counter = require("../models/Counter");

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
  const base = Number(it.basePrice || 0); // price per carton (24 pairs)

  // Calculate quantity (pairs) from sizeMap if it exists
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

  const cartonCount =
    Number(it.cartonCount || 0) || Math.floor(qty / 24) || 1;

  const taxRate = Number(it.taxRate || 0);

  // unitTotal is ex-tax; basePrice is per carton, so total = cartons × price/carton
  const unitTotal = round2(base * cartonCount);
  const taxPerItem = round2((unitTotal * taxRate) / 100);

  return {
    ...it,
    quantity: qty,
    cartonCount,
    basePrice: base,
    taxRate,
    taxPerItem,
    unitTotal,
  };
};

const computeTotals = (items, discountPercent) => {
  const computed = items.map(computeItem);

  const subTotal = round2(
    computed.reduce((sum, it) => sum + Number(it.unitTotal || 0), 0)
  );

  const discPct = Math.min(100, Math.max(0, Number(discountPercent || 0)));
  const discountAmount = round2((subTotal * discPct) / 100);

  const totalTax = round2(
    computed.reduce((sum, it) => sum + Number(it.taxPerItem || 0), 0)
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

// PO numbers are allocated only on bill approval (see approveBill), not at
// creation, so drafts never burn a hole in the sequence.
const PO_COUNTER_ID = "po_number";

// One-time seed so the counter picks up after any pre-existing poNumbers
// (from before allocation moved to approval time) instead of restarting at 1.
const bootstrapPoCounterIfNeeded = async () => {
  const existing = await Counter.findOne({ id: PO_COUNTER_ID }).lean();
  if (existing) return;

  const docs = await PurchaseOrder.find({ poNumber: { $exists: true } })
    .select("poNumber")
    .lean();
  let seed = 0;
  docs.forEach((d) => {
    const n = parseInt(d.poNumber?.match(/PO-(\d+)/)?.[1] || "0", 10);
    if (n > seed) seed = n;
  });

  await Counter.findOneAndUpdate(
    { id: PO_COUNTER_ID },
    { $setOnInsert: { seq: seed } },
    { upsert: true }
  );
};

const allocatePoNumber = async () => {
  await bootstrapPoCounterIfNeeded();
  const counter = await Counter.findOneAndUpdate(
    { id: PO_COUNTER_ID },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return `PO-${String(counter.seq).padStart(5, "0")}`;
};

exports.create = async (body) => {
  ensureValidId(body.vendorId, "vendorId");

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

      // poNumber is allocated on approval, not here — ignore any value a
      // caller might still send.
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
          color: it.color || "",
          gender: it.gender || "",
          assortment: it.assortment || "",
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
          onlineMrp: it.onlineMrp || 0,
          offlineMrp: it.offlineMrp || 0,

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
    // poNumber is not editable here — it's allocated once, on approval.
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
        color: it.color || "",
        gender: it.gender || "",
        assortment: it.assortment || "",
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
        onlineMrp: it.onlineMrp || 0,
        offlineMrp: it.offlineMrp || 0,
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

  // Idempotent: a double-click/duplicate approve must not allocate a second number.
  if (doc.billStatus === "APPROVED") {
    return doc;
  }

  doc.billStatus = "APPROVED";
  doc.billRemark = body?.remark || "";
  doc.billApprovedAt = new Date();
  doc.billRejectedAt = null;

  if (!doc.poNumber) {
    doc.poNumber = await allocatePoNumber();
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

  const remark = String(body?.remark || "").trim();
  if (!remark) {
    const err = new Error("A reason is required to reject a bill");
    err.statusCode = 400;
    throw err;
  }

  doc.billStatus = "REJECTED";
  doc.billRemark = remark;
  doc.billRejectedAt = new Date();
  doc.billApprovedAt = null;

  await doc.save();
  return doc;
};

// Total payable — sum of every invoice logged against this PO, falling back
// to the PO's own total when nothing's been logged yet.
const getTotalInvoiced = (doc) =>
  doc.invoices && doc.invoices.length
    ? doc.invoices.reduce((s, inv) => s + (Number(inv.invoiceAmount) || 0), 0)
    : doc.total || 0;

// ✅ vendor payable — log one of (possibly several) vendor invoices raised
// against this PO, e.g. for partial shipments billed separately. Only
// meaningful once the bill is approved (that's what makes it a real
// commitment). Each call ADDS an entry — never overwrites an earlier one.
exports.addInvoice = async (id, { invoiceNumber, invoiceAmount }) => {
  ensureValidId(id, "po id");

  const doc = await PurchaseOrder.findOne({ _id: id, isDeleted: false, billStatus: "APPROVED" });
  if (!doc) {
    const err = new Error("Approved bill not found");
    err.statusCode = 404;
    throw err;
  }

  const amt = Number(invoiceAmount);
  if (!Number.isFinite(amt) || amt <= 0) {
    const err = new Error("invoiceAmount must be greater than 0");
    err.statusCode = 400;
    throw err;
  }

  if (!doc.invoices) doc.invoices = [];
  doc.invoices.push({
    invoiceNumber: String(invoiceNumber || "").trim(),
    invoiceAmount: amt,
    date: new Date(),
  });

  // Adding more invoiced amount can only ever increase what's owed — if the
  // PO had already been marked PAID against a smaller total, it must fall
  // back to PARTIAL (or PENDING) now that there's more to pay.
  const totalInvoiced = getTotalInvoiced(doc);
  const alreadyPaid = doc.amountPaid || 0;
  doc.paymentStatus =
    alreadyPaid <= 0 ? "UNPAID" : alreadyPaid >= totalInvoiced - 0.005 ? "PAID" : "PARTIAL";

  await doc.save();
  return doc;
};

// ✅ vendor payable — record one payment against this PO's combined invoiced
// total. Mirrors the distributor-side Order.recordPayment ledger (see
// order.service.js).
exports.recordPayment = async (id, { amount, note, recordedBy }) => {
  ensureValidId(id, "po id");

  const doc = await PurchaseOrder.findOne({ _id: id, isDeleted: false, billStatus: "APPROVED" });
  if (!doc) {
    const err = new Error("Approved bill not found");
    err.statusCode = 404;
    throw err;
  }

  const payAmount = Number(amount);
  if (!Number.isFinite(payAmount) || payAmount <= 0) {
    const err = new Error("Payment amount must be greater than 0");
    err.statusCode = 400;
    throw err;
  }

  const totalInvoiced = getTotalInvoiced(doc);
  const alreadyPaid = doc.amountPaid || 0;
  const remaining = Math.max(0, totalInvoiced - alreadyPaid);
  // Half-a-paisa tolerance — floating point subtraction (e.g. 19353.6 -
  // 10000) can land a hair off the "exact" remaining value, which must
  // never block a distributor/vendor from paying off the last of a balance.
  if (payAmount > remaining + 0.005) {
    const err = new Error(
      `Payment (₹${payAmount.toLocaleString()}) exceeds remaining balance (₹${remaining.toLocaleString()})`
    );
    err.statusCode = 400;
    throw err;
  }

  doc.payments.push({ amount: payAmount, date: new Date(), note: note || "", recordedBy: recordedBy || "" });
  doc.amountPaid = alreadyPaid + payAmount;
  doc.paymentStatus = doc.amountPaid >= totalInvoiced - 0.005 ? "PAID" : "PARTIAL";

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
