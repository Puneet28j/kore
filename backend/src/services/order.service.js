const mongoose = require("mongoose");
const Order = require("../models/Order");
const User = require("../models/User");
const MasterCatalog = require("../models/MasterCatalog");
const Return = require("../models/Return");
const activityLog = require("./activityLog.service");
const notification = require("./notification.service");

const toSnapshotAssortment = (variant) => {
  const quantities = variant?.sizeQuantities?.toObject
    ? variant.sizeQuantities.toObject()
    : variant?.sizeQuantities || {};
  if (Object.keys(quantities).length) return quantities;

  const sizeMap = variant?.sizeMap?.toObject
    ? variant.sizeMap.toObject()
    : variant?.sizeMap || {};
  return Object.fromEntries(
    Object.entries(sizeMap).map(([size, cell]) => [size, Number(cell?.qty || 0)])
  );
};

const buildProductSnapshot = (catalog, variant) => {
  const colorMedia = (catalog?.colorMedia || []).find(
    (media) => String(media.color || "").trim().toLowerCase() === String(variant?.color || "").trim().toLowerCase()
  );
  const colorImage = colorMedia?.images?.[0];
  const primaryImage = catalog?.primaryImage;

  return {
    articleName: catalog?.articleName || "",
    color: variant?.color || "",
    sizeRange: variant?.sizeRange || "",
    assortment: toSnapshotAssortment(variant),
    imageUrl: colorImage?.url || colorImage || primaryImage?.url || primaryImage || "",
  };
};

// Pull cartonCount codes from the front of variant.availableCartons and store on item.
// No-op if the pool is empty (legacy/GRN orders — backward compat).
const allocateCartonsToItem = async (item) => {
  if (!item.variantId || !item.cartonCount) return;
  const variantCatalog = await MasterCatalog.findOne({ "variants._id": item.variantId });
  const variantDoc = variantCatalog?.variants.id(item.variantId);
  if (!variantDoc || !(variantDoc.availableCartons || []).length) return;
  const pool = variantDoc.availableCartons;
  const allocated = pool.slice(0, item.cartonCount);
  if (allocated.length === 0) return;
  item.allocatedCartons = allocated;
  variantDoc.availableCartons = pool.slice(allocated.length);
  variantCatalog.markModified("variants");
  await variantCatalog.save();
};

// Extract 2-letter prefix from company name (e.g. "Coding Wala" → "CW", "Aura" → "AU")
const getCompanyPrefix = (companyName) => {
  if (!companyName) return "OR";
  const words = companyName.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  const letters = companyName.replace(/[^A-Za-z]/g, "");
  return letters.slice(0, 2).toUpperCase() || "OR";
};

const generateNextOrderNumber = async (prefix = "OR") => {
  // Find last order with any prefix to keep global sequence
  const lastOrder = await Order.findOne({
    orderNumber: { $exists: true, $ne: null },
  })
    .sort({ createdAt: -1 })
    .select("orderNumber")
    .lean();

  let next = 1;
  if (lastOrder?.orderNumber) {
    const match = lastOrder.orderNumber.match(/\d+$/);
    next = (match ? parseInt(match[0], 10) : 0) + 1;
  }

  return `${prefix}-${String(next).padStart(5, "0")}`;
};

// Directly adjusts MasterCatalog.variants[].sizeMap[size].qty for a set of
// order items — this IS the live/available stock shown in Catalogue, Master
// Inventory and Stock Report, so booking/cancelling an order must keep it in
// sync immediately (sign = -1 to deduct on booking, +1 to restore on cancel).
const adjustVariantStock = async (items, sign) => {
  for (const item of items || []) {
    if (!item.variantId) continue;
    const sizeQuantities = item.sizeQuantities
      ? (item.sizeQuantities instanceof Map
          ? Object.fromEntries(item.sizeQuantities)
          : item.sizeQuantities)
      : {};
    if (!Object.keys(sizeQuantities).length) continue;

    try {
      const catalog = await MasterCatalog.findOne({
        "variants._id": item.variantId,
      });
      if (!catalog) continue;
      const variant = catalog.variants.id(item.variantId);
      if (!variant || !variant.sizeMap) continue;

      Object.entries(sizeQuantities).forEach(([size, qty]) => {
        const cell = variant.sizeMap.get(size);
        if (!cell) return;
        cell.qty = Math.max(0, (cell.qty || 0) + sign * Number(qty || 0));
        variant.sizeMap.set(size, cell);
      });

      catalog.markModified("variants");
      await catalog.save();
    } catch (err) {
      console.error("[adjustVariantStock] Failed for variant", item.variantId, err.message);
    }
  }
};

// How many whole cartons of an order item are backed by REAL stock right
// now. A REGULAR item is always fully backed (stock deducted in full at
// booking) — this simply returns its cartonCount. A still-PREORDER item's
// backing is now a SHARED, live pool: every waiting pre-order for the same
// variant sees the same available cartons (no per-order exclusive claim
// anymore — see promotePreOrderItems), and it's only at actual scan time
// that one specific carton gets claimed by whichever order's operator
// scanned it first (see scanCarton). So "reserved" here = already-scanned-
// by-me + however many are CURRENTLY sitting free in the shared pool,
// capped at what this item still needs. `liveAvailableOverride` lets a
// caller that already has the fresh pool count (e.g. scanCarton, mid
// atomic-claim) pass it directly instead of relying on the read-time
// snapshot attached by attachLiveCartonAvailability.
const computeReservedCartons = (item, liveAvailableOverride) => {
  if (item.bookingType !== "PREORDER") return item.cartonCount || 0;

  const cartonCount = item.cartonCount || 0;
  if (cartonCount <= 0) return 0;

  const fulfilled = item.fulfilledCartonCount || 0;
  const liveAvailable =
    liveAvailableOverride !== undefined
      ? liveAvailableOverride
      : (item.liveAvailableCartonCodes || []).length;

  return Math.min(cartonCount, fulfilled + Math.max(0, liveAvailable));
};

// Attaches a live, transient (never persisted) snapshot of each still-
// PREORDER item's variant's currently-available carton barcodes — capped at
// however many more that item still needs. This is what lets every waiting
// pre-order for the same variant see the SAME shared cartons at once on the
// Scan screen; nothing is "owned" until scanCarton's atomic $pull actually
// claims one. Mutates `orders` in place (accepts a single lean order object
// or an array of them) and also returns it for convenience.
const attachLiveCartonAvailability = async (orders) => {
  const list = Array.isArray(orders) ? orders : [orders];
  const variantIds = new Set();
  list.forEach((o) => {
    (o?.items || []).forEach((item) => {
      if (item.bookingType === "PREORDER" && item.variantId) {
        variantIds.add(String(item.variantId));
      }
    });
  });
  if (!variantIds.size) return orders;

  const catalogs = await MasterCatalog.find({
    "variants._id": { $in: [...variantIds] },
  })
    .select("variants._id variants.availableCartons")
    .lean();

  const poolByVariant = {};
  catalogs.forEach((c) => {
    (c.variants || []).forEach((v) => {
      const vid = String(v._id);
      if (variantIds.has(vid)) poolByVariant[vid] = v.availableCartons || [];
    });
  });

  list.forEach((o) => {
    (o?.items || []).forEach((item) => {
      if (item.bookingType !== "PREORDER" || !item.variantId) return;
      const pool = poolByVariant[String(item.variantId)] || [];
      const stillNeeded = Math.max(
        0,
        (item.cartonCount || 0) - (item.fulfilledCartonCount || 0)
      );
      item.liveAvailableCartonCodes = pool.slice(0, stillNeeded);
    });
  });

  return orders;
};

// Tops up REGULAR items that are short on allocatedCartons for one of
// `variantIds` — this happens when an item was booked (deducting sizeMap.qty
// immediately, as REGULAR items always do) at a moment when the carton-
// barcode pool (variant.availableCartons) was empty or smaller than needed;
// allocateCartonsToItem is a no-op in that case and, unlike still-PREORDER
// items, nothing ever retries it once new cartons land via GRN — so the item
// stays stuck showing "owed" with no barcode to actually scan. Called
// alongside promotePreOrderItems after every GRN. Oldest-active-order-first,
// exclusive (REGULAR stock is committed at booking, not shared).
const backfillRegularCartonAllocations = async (variantIds) => {
  const idStrs = [...new Set((variantIds || []).map(String))];
  if (!idStrs.length) return [];

  const candidates = await Order.find({
    status: { $nin: ["RECEIVED", "CANCELLED"] },
    items: { $elemMatch: { variantId: { $in: idStrs }, bookingType: "REGULAR" } },
  }).sort({ createdAt: 1 });
  if (!candidates.length) return [];

  const updatedOrders = [];
  for (const order of candidates) {
    let orderChanged = false;

    for (const item of order.items) {
      if (item.bookingType !== "REGULAR") continue;
      if (!item.variantId || !idStrs.includes(String(item.variantId))) continue;
      const shortBy = (item.cartonCount || 0) - (item.allocatedCartons || []).length;
      if (shortBy <= 0) continue;

      const catalog = await MasterCatalog.findOne({ "variants._id": item.variantId });
      const variant = catalog?.variants?.id(item.variantId);
      const pool = variant?.availableCartons || [];
      if (!pool.length) continue;

      const newCodes = pool.slice(0, shortBy);
      item.allocatedCartons = [...(item.allocatedCartons || []), ...newCodes];
      variant.availableCartons = pool.slice(newCodes.length);
      catalog.markModified("variants");
      await catalog.save();
      orderChanged = true;
    }

    if (!orderChanged) continue;
    order.markModified("items");
    await order.save();
    updatedOrders.push(order);
  }

  return updatedOrders;
};

const generateNextReturnNumber = async () => {
  const lastRet = await Return.findOne()
    .sort({ createdAt: -1 })
    .select("returnNumber")
    .lean();

  if (!lastRet || !lastRet.returnNumber) {
    return "RET-00001";
  }

  const lastNum = lastRet.returnNumber.match(/RET-(\d+)/)?.[1];
  const next = (lastNum ? parseInt(lastNum, 10) : 0) + 1;

  return `RET-${String(next).padStart(5, "0")}`;
};

const createOrder = async (distributorId, orderData) => {
  try {
    const distributor = await User.findById(distributorId);
    if (!distributor) {
      throw new Error("Distributor not found");
    }

    let distrName = distributor.name || distributor.email;
    if (distributor.companyName) {
      distrName = `${distributor.companyName} (${distrName})`;
    }

    const { items, totalAmount, totalCartons, totalPairs, date } = orderData;
    const gstRate =
      typeof orderData.gstRate === "number" ? orderData.gstRate : 5;

    let discountPercentage = 0;
    let creditLimit = 0;
    if (distributor.distributorId) {
      const Distributor = require("../models/Distributor");
      const distProfile = await Distributor.findById(
        distributor.distributorId
      ).lean();
      if (distProfile) {
        discountPercentage = distProfile.discountPercentage || 0;
        creditLimit =
          typeof distProfile.creditLimit === "number"
            ? distProfile.creditLimit
            : 0;
      }
    }

    const discountAmount = (totalAmount * discountPercentage) / 100;
    const finalAmount = totalAmount - discountAmount;
    const gstAmount = Math.round(((finalAmount * gstRate) / 100) * 100) / 100;

    // Use provided date or fallback to today
    const orderDate = date || new Date().toISOString().split("T")[0];

    // Validate cart references before they become permanent order data.
    const sanitizedItems = (items || []).map((item) => {
      const sanitized = { ...item };
      if (!mongoose.Types.ObjectId.isValid(sanitized.articleId)) {
        const err = new Error("One or more cart items no longer exist in the catalog. Please refresh your cart and try again.");
        err.statusCode = 409;
        throw err;
      }
      if (!mongoose.Types.ObjectId.isValid(sanitized.variantId)) {
        const err = new Error("One or more selected variants are no longer available. Please refresh your cart and try again.");
        err.statusCode = 409;
        throw err;
      }
      // Ensure numeric fields are valid numbers
      sanitized.cartonCount = Number(sanitized.cartonCount) || 0;
      sanitized.pairCount = Number(sanitized.pairCount) || 0;
      sanitized.price = Number(sanitized.price) || 0;
      return sanitized;
    });

    // Resolve each item's bookingType server-side from the variant's CURRENT
    // live stock + PO-pending status — never trust a client-supplied flag. A
    // cart can freely mix RFD and pre-order items; they end up in ONE order
    // here, distinguished per-item so RFD items are dispatchable immediately
    // while pre-order items wait (see scanCarton / promotePreOrderItems).
    const masterCatalogService = require("./masterCatalogService");
    const articleIdsForStage = [
      ...new Set(sanitizedItems.map((i) => String(i.articleId)).filter(Boolean)),
    ];
    const catalogsForStage = articleIdsForStage.length
      ? await MasterCatalog.find({ _id: { $in: articleIdsForStage }, isDeleted: false })
          .select("articleName primaryImage colorMedia variants")
          .lean()
      : [];
    const catalogById = new Map(
      catalogsForStage.map((cat) => [String(cat._id), cat])
    );

    // Fetched once here and reused below for the pre-order PO cap check too.
    const [plannedMap, grnReceivedMap] = articleIdsForStage.length
      ? await Promise.all([
          masterCatalogService.getPoPlannedQtyMap(articleIdsForStage),
          masterCatalogService.getGrnReceivedQtyMap(),
        ])
      : [{ bySize: {}, totals: {} }, { totals: {} }];

    const unavailableItemNames = [];
    sanitizedItems.forEach((item) => {
      const catalog = catalogById.get(String(item.articleId));
      const variant = catalog?.variants?.find(
        (v) => String(v._id) === String(item.variantId)
      );
      if (!catalog || !variant) {
        const err = new Error("One or more selected variants were changed or removed. Please refresh your cart and try again.");
        err.statusCode = 409;
        throw err;
      }
      if (variant.isActive === false) {
        const err = new Error("One or more selected variants are no longer available. Please refresh your cart and try again.");
        err.statusCode = 409;
        throw err;
      }

      item.productSnapshot = buildProductSnapshot(catalog, variant);
      const variantKey = String(item.variantId);
      const poPending = Math.max(
        0,
        (plannedMap.totals[variantKey] || 0) - (grnReceivedMap.totals[variantKey] || 0)
      );
      const classification = masterCatalogService.classifyVariantAvailability(variant, poPending);
      if (classification === "NONE") {
        unavailableItemNames.push(variant.itemName || catalog.articleName);
        return;
      }
      item.bookingType = classification === "RFD" ? "REGULAR" : "PREORDER";
    });

    if (unavailableItemNames.length) {
      const err = new Error(
        `The following item(s) are currently unavailable (no stock and no pending purchase order): ${unavailableItemNames.join(", ")}. Please remove them from your cart and try again.`
      );
      err.statusCode = 400;
      throw err;
    }

    const regularItems = sanitizedItems.filter((i) => i.bookingType === "REGULAR");
    const preorderItems = sanitizedItems.filter((i) => i.bookingType === "PREORDER");

    // Credit limit only applies to the REGULAR portion — pre-order items
    // aren't a stock commitment yet. creditAmount (stored below) is what
    // future orders' pending-credit sum reads, so a mixed order only ever
    // counts its regular slice against the distributor's limit.
    let creditAmount = 0;
    if (regularItems.length > 0) {
      const regularTotalAmount = regularItems.reduce((s, i) => s + i.price, 0);
      const regularDiscountAmount = (regularTotalAmount * discountPercentage) / 100;
      creditAmount = regularTotalAmount - regularDiscountAmount;

      if (creditLimit === 0) {
        throw new Error(
          "You have no credit limit to book an order. Please contact administrator."
        );
      }
      const pendingOrders = await Order.aggregate([
        {
          $match: {
            distributorId: distributor._id,
            status: { $nin: ["RECEIVED", "CANCELLED", "PRE_BOOKED", "CONFIRMED"] },
          },
        },
        {
          $group: {
            _id: null,
            totalPending: {
              $sum: {
                $ifNull: ["$creditAmount", { $ifNull: ["$finalAmount", "$totalAmount"] }],
              },
            },
          },
        },
      ]);
      const pendingValue = pendingOrders[0]?.totalPending || 0;
      if (pendingValue + creditAmount > creditLimit) {
        const available = creditLimit - pendingValue;
        throw new Error(
          `Credit limit exceeded. Available credit: ₹${
            available > 0 ? available.toLocaleString() : 0
          }. Required: ₹${creditAmount.toLocaleString()}`
        );
      }
    }

    // Pre-order items are capped by the Purchase Orders raised for each
    // variant: total active pre-booked pairs (existing PRE_BOOKED/CONFIRMED
    // orders + still-PREORDER items on active orders + this order) must
    // never exceed what's planned on POs. No stock check — pre-orders are
    // booked against incoming stock, not sizeMap.qty.
    if (preorderItems.length > 0) {
      const capItems = preorderItems.filter((i) => i.variantId);
      const articleIds = [...new Set(capItems.map((i) => String(i.articleId)))];
      if (articleIds.length) {
        const preBookedMap = await masterCatalogService.getPreBookedQtyMap(articleIds);

        const requestedByVariant = {};
        capItems.forEach((item) => {
          const key = String(item.variantId);
          const requested =
            item.pairCount ||
            Object.values(item.sizeQuantities || {}).reduce(
              (s, q) => s + Number(q || 0),
              0
            );
          requestedByVariant[key] = (requestedByVariant[key] || 0) + requested;
        });

        for (const [variantId, requested] of Object.entries(requestedByVariant)) {
          const planned = plannedMap.totals[variantId] || 0;
          const alreadyBooked = preBookedMap.totals[variantId] || 0;
          const remaining = Math.max(0, planned - alreadyBooked);
          if (requested > remaining) {
            throw new Error(
              planned === 0
                ? "This item cannot be pre-booked yet — no Purchase Order has been raised for it."
                : `Pre-order limit reached. Only ${remaining} pair(s) can still be pre-booked for this item (planned ${planned}, already pre-booked ${alreadyBooked}).`
            );
          }
        }
      }
    }

    // Every order books immediately (status BOOKED, orderNumber assigned) —
    // there's no separate PRE_BOOKED holding state anymore. A pure-preorder
    // order simply has zero items ready to scan until their GRN lands; a
    // mixed order can dispatch its RFD items right away.
    let orderNumber;
    try {
      const distUser = await User.findById(distributorId)
        .select("distributorId")
        .lean();
      let prefix = "OR";
      if (distUser?.distributorId) {
        const Distributor = require("../models/Distributor");
        const dist = await Distributor.findById(distUser.distributorId)
          .select("companyName")
          .lean();
        if (dist?.companyName) prefix = getCompanyPrefix(dist.companyName);
      }
      orderNumber = await generateNextOrderNumber(prefix);
    } catch {
      orderNumber = await generateNextOrderNumber("OR");
    }

    const order = new Order({
      orderType: "REGULAR",
      distributorId,
      distributorName: distrName,
      date: orderDate,
      status: "BOOKED",
      orderNumber,
      items: sanitizedItems,
      totalAmount: Number(totalAmount) || 0,
      totalCartons: Number(totalCartons) || 0,
      totalPairs: Number(totalPairs) || 0,
      discountPercentage,
      discountAmount,
      finalAmount: isNaN(finalAmount) ? 0 : finalAmount,
      creditAmount: isNaN(creditAmount) ? 0 : creditAmount,
      gstRate,
      gstAmount: isNaN(gstAmount) ? 0 : gstAmount,
    });

    const savedOrder = await order.save();

    // Pre-allocate carton codes from the pool for each REGULAR item
    let poolChanged = false;
    for (const item of savedOrder.items) {
      if (item.bookingType !== "REGULAR") continue;
      const before = (item.allocatedCartons || []).length;
      await allocateCartonsToItem(item);
      if ((item.allocatedCartons || []).length !== before) poolChanged = true;
    }
    if (poolChanged) await savedOrder.save();

    // Deduct live stock immediately for REGULAR items only — pre-order
    // items have no real stock yet; their deduction now happens per-carton,
    // at the moment a scan actually claims one out of the shared pool (see
    // scanCarton), not eagerly at GRN time.
    if (regularItems.length > 0) {
      await adjustVariantStock(regularItems, -1);
    }

    // Notify: new order placed
    const distUser = await User.findById(savedOrder.distributorId)
      .select("email phone")
      .lean();
    notification.dispatch("ORDER_PLACED", {
      data: {
        Order: `#${savedOrder.orderNumber || savedOrder._id}`,
        Distributor: savedOrder.distributorName,
        "Total CTN": savedOrder.totalCartons,
        Amount: `₹${savedOrder.finalAmount || savedOrder.totalAmount}`,
      },
      distributorEmail: distUser?.email,
      distributorPhone: distUser?.phone,
      subject: `[Kore] New Order from ${savedOrder.distributorName}`,
    });

    return savedOrder;
  } catch (error) {
    console.error("[createOrder] Error:", error.name, error.message);
    if (error.errors)
      console.error(
        "[createOrder] Validation errors:",
        JSON.stringify(error.errors, null, 2)
      );
    throw new Error(`Failed to create order: ${error.message}`);
  }
};

const normalizePage = (page) => Math.max(parseInt(page, 10) || 1, 1);
const normalizeLimit = (limit) =>
  Math.min(Math.max(parseInt(limit, 10) || 10, 1), 2000);

const PREORDER_STATUSES = ["PRE_BOOKED", "CONFIRMED"];

const getOrdersByDistributor = async (
  distributorId,
  {
    page = 1,
    limit = 10,
    search = "",
    status = "",
    startDate,
    endDate,
    sortBy = "createdAt",
    sortDesc = "true",
    orderType = "",
  } = {}
) => {
  try {
    const p = normalizePage(page);
    const l = normalizeLimit(limit);
    const skip = (p - 1) * l;

    const q = { distributorId };
    if (orderType === "PREORDER") {
      // Pre-order specific query: only PRE_BOOKED and CONFIRMED
      q.orderType = "PREORDER";
      q.status = { $in: PREORDER_STATUSES };
    } else if (orderType === "ALL") {
      // Dashboard requests need both regular and preorder orders.
      // Leave status unrestricted so PRE_BOOKED/CONFIRMED are included.
    } else if (status) {
      q.status = status;
    } else {
      q.status = { $nin: PREORDER_STATUSES };
    }
    if (startDate || endDate) {
      q.createdAt = {};
      if (startDate) q.createdAt.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        q.createdAt.$lte = end;
      }
    }
    if (search) {
      const cleanSearch = search.startsWith("#") ? search.slice(1) : search;
      q.$or = [
        { orderNumber: { $regex: cleanSearch, $options: "i" } },
        { distributorName: { $regex: cleanSearch, $options: "i" } },
      ];
    }

    const sortObj = {
      [sortBy]: sortDesc === "true" || sortDesc === true ? -1 : 1,
    };

    // Base query without search/status for global stats sidebar
    // Use ObjectId cast so the aggregate $match works correctly (Mongoose find() auto-casts, aggregate() does not)
    const distObjId = new mongoose.Types.ObjectId(distributorId);
    const baseQ = {
      distributorId: distObjId,
      status: { $nin: [...PREORDER_STATUSES, "CANCELLED"] },
    };
    // "Has pre-orders" now means: an active order still carrying at least
    // one PREORDER-tagged item (awaiting its GRN) — not a dead order-level
    // status, since every order books immediately regardless of mix.
    const preOrderQ = {
      distributorId: distObjId,
      status: { $nin: ["RECEIVED", "CANCELLED"] },
      items: { $elemMatch: { bookingType: "PREORDER" } },
    };

    const [items, total, allStats, statusAgg, preOrderCount] =
      await Promise.all([
        Order.find(q)
          .sort(sortObj)
          .skip(skip)
          .limit(l)
          .populate({
            path: "distributorId",
            populate: { path: "distributorId" },
          })
          .lean(),
        Order.countDocuments(q),
        Order.aggregate([
          { $match: baseQ },
          {
            $group: {
              _id: null,
              totalSpent: {
                $sum: { $ifNull: ["$finalAmount", "$totalAmount"] },
              },
              totalPairs: { $sum: { $ifNull: ["$totalPairs", 0] } },
              totalPaid: {
                $sum: {
                  $cond: [
                    { $eq: ["$paymentStatus", "PAID"] },
                    { $ifNull: ["$finalAmount", "$totalAmount"] },
                    0,
                  ],
                },
              },
              activeOrders: {
                $sum: {
                  $cond: [
                    {
                      $in: [
                        "$status",
                        ["BOOKED", "PFD", "RFD", "PARTIAL"],
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
              total: { $sum: 1 },
              totalCartons: { $sum: { $ifNull: ["$totalCartons", 0] } },
            },
          },
        ]),
        // Match Admin Orders: summarize cartons by their actual lifecycle
        // pool, so PARTIAL orders are split instead of being assigned wholly
        // to their top-level order status.
        Order.aggregate([
          { $match: baseQ },
          {
            $project: {
              status: 1,
              totalCartons: { $ifNull: ["$totalCartons", 0] },
              trackingCount: { $size: { $ifNull: ["$cartonTracking", []] } },
              dispatched: {
                $size: {
                  $filter: {
                    input: { $ifNull: ["$cartonTracking", []] },
                    as: "carton",
                    cond: { $eq: ["$$carton.status", "DISPATCHED"] },
                  },
                },
              },
              inTransit: {
                $size: {
                  $filter: {
                    input: { $ifNull: ["$cartonTracking", []] },
                    as: "carton",
                    cond: { $eq: ["$$carton.status", "IN_TRANSIT"] },
                  },
                },
              },
              received: {
                $size: {
                  $filter: {
                    input: { $ifNull: ["$cartonTracking", []] },
                    as: "carton",
                    cond: { $eq: ["$$carton.status", "RECEIVED"] },
                  },
                },
              },
              fulfilledCartons: {
                $sum: {
                  $map: {
                    input: { $ifNull: ["$items", []] },
                    as: "item",
                    in: { $ifNull: ["$$item.fulfilledCartonCount", 0] },
                  },
                },
              },
            },
          },
          {
            $project: {
              BOOKED: {
                $cond: [
                  { $gt: ["$trackingCount", 0] },
                  { $max: [{ $subtract: ["$totalCartons", "$trackingCount"] }, 0] },
                  {
                    $cond: [
                      { $in: ["$status", ["PFD", "RFD", "RECEIVED"]] },
                      0,
                      { $max: [{ $subtract: ["$totalCartons", "$fulfilledCartons"] }, 0] },
                    ],
                  },
                ],
              },
              PFD: {
                $cond: [
                  { $gt: ["$trackingCount", 0] },
                  "$dispatched",
                  {
                    $cond: [
                      { $eq: ["$status", "PFD"] },
                      "$totalCartons",
                      {
                        $cond: [
                          { $in: ["$status", ["PENDING", "BOOKED", "PARTIAL"]] },
                          { $min: ["$fulfilledCartons", "$totalCartons"] },
                          0,
                        ],
                      },
                    ],
                  },
                ],
              },
              RFD: {
                $cond: [
                  { $gt: ["$trackingCount", 0] },
                  "$inTransit",
                  { $cond: [{ $eq: ["$status", "RFD"] }, "$totalCartons", 0] },
                ],
              },
              RECEIVED: {
                $cond: [
                  { $gt: ["$trackingCount", 0] },
                  "$received",
                  { $cond: [{ $eq: ["$status", "RECEIVED"] }, "$totalCartons", 0] },
                ],
              },
            },
          },
          {
            $group: {
              _id: null,
              BOOKED: { $sum: "$BOOKED" },
              PFD: { $sum: "$PFD" },
              RFD: { $sum: "$RFD" },
              RECEIVED: { $sum: "$RECEIVED" },
            },
          },
        ]),
        Order.countDocuments(preOrderQ),
      ]);

    const stats = allStats[0] || {
      totalSpent: 0,
      totalPairs: 0,
      totalPaid: 0,
      activeOrders: 0,
      total: 0,
      totalCartons: 0,
    };
    const lifecycleStats = statusAgg[0] || {};
    const statusCounts = {
      total: stats.totalCartons || 0,
      BOOKED: lifecycleStats.BOOKED || 0,
      PFD: lifecycleStats.PFD || 0,
      RFD: lifecycleStats.RFD || 0,
      RECEIVED: lifecycleStats.RECEIVED || 0,
    };
    const dispatchedCartons =
      statusCounts.PFD + statusCounts.RFD + statusCounts.RECEIVED;
    const remainingCartons = Math.max(
      0,
      statusCounts.total - dispatchedCartons
    );

    await attachLiveCartonAvailability(items);

    return {
      items,
      meta: {
        total,
        page: p,
        limit: l,
        totalPages: Math.ceil(total / l),
        stats: {
          totalSpent: stats.totalSpent,
          totalPairs: stats.totalPairs,
          totalPaid: stats.totalPaid || 0,
          activeOrders: stats.activeOrders,
          preOrderCount,
          dispatchedCartons,
          remainingCartons,
          statusCounts,
        },
      },
    };
  } catch (error) {
    throw new Error(`Failed to fetch orders: ${error.message}`);
  }
};

const getAllOrders = async ({
  page = 1,
  limit = 10,
  search = "",
  status = "",
  lifecycle = "",
  startDate,
  endDate,
  sortBy = "createdAt",
  sortDesc = "true",
  orderType = "",
} = {}) => {
  try {
    const p = normalizePage(page);
    const l = normalizeLimit(limit);
    const skip = (p - 1) * l;

    const q = {};
    // Sales Orders shows regular AND preorder orders together (tagged in the
    // UI) — no default status exclusion. Explicit status/orderType filters
    // (tab clicks) still narrow the list as before.
    if (status) q.status = status;
    if (lifecycle) {
      const legacyStatus = {
        DISPATCHED: "PFD",
        IN_TRANSIT: "RFD",
        RECEIVED: "RECEIVED",
      }[lifecycle];
      if (!legacyStatus) throw new Error("Invalid lifecycle filter");

      // Modern orders can have cartons in multiple lifecycle pools while the
      // order itself remains PARTIAL. Historical orders have no tracking, so
      // retain their legacy order-wide status as a fallback.
      q.$and = [
        {
          $or: [
            { "cartonTracking.status": lifecycle },
            {
              status: legacyStatus,
              $expr: {
                $eq: [{ $size: { $ifNull: ["$cartonTracking", []] } }, 0],
              },
            },
          ],
        },
      ];
    }
    if (orderType) q.orderType = orderType;
    if (startDate || endDate) {
      q.createdAt = {};
      if (startDate) q.createdAt.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        q.createdAt.$lte = end;
      }
    }
    if (search) {
      const cleanSearch = search.startsWith("#") ? search.slice(1) : search;
      q.$or = [
        { orderNumber: { $regex: cleanSearch, $options: "i" } },
        { distributorName: { $regex: cleanSearch, $options: "i" } },
      ];
    }

    const sortObj = {
      [sortBy]: sortDesc === "true" || sortDesc === true ? -1 : 1,
    };

    const [items, total, allStats] = await Promise.all([
      Order.find(q)
        .sort(sortObj)
        .skip(skip)
        .limit(l)
        .populate({
          path: "distributorId",
          populate: { path: "distributorId" },
        })
        .lean(),
      Order.countDocuments(q),
      Order.aggregate([
        { $match: q },
        {
          $group: {
            _id: null,
            totalSpent: { $sum: "$totalAmount" },
            activeOrders: {
              $sum: { $cond: [{ $ne: ["$status", "RECEIVED"] }, 1, 0] },
            },
          },
        },
      ]),
    ]);

    const stats = allStats[0] || { totalSpent: 0, activeOrders: 0 };

    await attachLiveCartonAvailability(items);

    return {
      items,
      meta: {
        total,
        page: p,
        limit: l,
        totalPages: Math.ceil(total / l),
        stats: {
          totalSpent: stats.totalSpent,
          activeOrders: stats.activeOrders,
        },
      },
    };
  } catch (error) {
    throw new Error(`Failed to fetch all orders: ${error.message}`);
  }
};

const updateOrderStatus = async (
  orderId,
  status,
  {
    billUrl = null,
    invoiceUrl = null,
    ewayBillUrl = null,
    transportBillUrl = null,
    receivingNoteUrl = null,
    receiverName = null,
    receiverMobile = null,
    deliveryAgentName = null,
    deliveryAgentMobile = null,
    deliveryNote = null,
    // Booking commitment fields
    expectedDispatchDate = null,
    bookingPriority = null,
    adminNote = null,
    stockStatus = null,
    // Dispatch fields — filled at BOOKED → PFD (CTN out-scan step)
    vehicleNo = null,
    lrNo = null,
    transporterName = null,
    eWayBillNo = null,
    driverName = null,
    driverMobile = null,
    grossWeightKg = null,
    outScannedCartons = null,
    itemDispatchCounts = null,
  } = {}
) => {
  try {
    const validStatuses = [
      "PRE_BOOKED",
      "CONFIRMED",
      "PENDING",
      "BOOKED",
      "PFD",
      "RFD",
      "RECEIVED",
      "PARTIAL",
      "CANCELLED",
    ];

    if (!validStatuses.includes(status)) {
      throw new Error("Invalid status");
    }

    const order = await Order.findById(orderId);
    if (!order) {
      throw new Error("Order not found");
    }
    const previousStatus = order.status;

    const updateData = { status };
    if (billUrl) updateData.billUrl = billUrl;
    if (invoiceUrl) updateData.invoiceUrl = invoiceUrl;
    if (ewayBillUrl) updateData.ewayBillUrl = ewayBillUrl;
    if (transportBillUrl) updateData.transportBillUrl = transportBillUrl;
    if (receivingNoteUrl) updateData.receivingNoteUrl = receivingNoteUrl;
    if (receiverName) updateData.receiverName = receiverName;
    if (receiverMobile) updateData.receiverMobile = receiverMobile;
    // Delivery agent — filled at OFD step
    if (deliveryAgentName) updateData.deliveryAgentName = deliveryAgentName;
    if (deliveryAgentMobile)
      updateData.deliveryAgentMobile = deliveryAgentMobile;
    if (deliveryNote) updateData.deliveryNote = deliveryNote;

    // Dispatch fields — saved when the warehouse finishes scanning
    // (BOOKED/PARTIAL → PFD/PARTIAL). Vehicle/transporter details are NOT
    // collected here anymore — those are captured one step later, when the
    // order moves PFD/PARTIAL → RFD (see block below), so scanning alone is
    // enough to flip the order to "Dispatched".
    if (status === "PFD" || (status === "PARTIAL" && ["BOOKED", "PARTIAL"].includes(order.status))) {
      if (outScannedCartons) updateData.outScannedCartons = outScannedCartons;
      updateData.dispatchedAt = new Date();

      // Update per-item fulfilledCartonCount and fulfilledSizeQuantities using the frontend-computed map.
      // fulfilledSizeQuantities MUST be set here — the live stock formula in getVariantStock subtracts
      // dispatched pairs from stock using this field. If it stays empty the order drops out of
      // blockedStockMap (no longer BOOKED) but nothing is subtracted from live stock, making stock appear to increase.
      if (itemDispatchCounts && Object.keys(itemDispatchCounts).length > 0) {
        for (const item of order.items) {
          if (item.bookingType === "PREORDER") continue;
          const key = item.variantId?.toString() || item.articleId?.toString();
          const dispatched = itemDispatchCounts[key] || 0;
          if (dispatched > 0) {
            item.fulfilledCartonCount = (item.fulfilledCartonCount || 0) + dispatched;

            // Derive size quantities proportional to cartons dispatched
            const orderedSizes = item.sizeQuantities
              ? (item.sizeQuantities instanceof Map
                  ? Object.fromEntries(item.sizeQuantities)
                  : Object.fromEntries(Object.entries(item.sizeQuantities)))
              : {};
            const ratio = dispatched / (item.cartonCount || 1);
            for (const [size, qty] of Object.entries(orderedSizes)) {
              const proportional = Math.round(Number(qty) * ratio);
              if (proportional > 0) {
                if (!item.fulfilledSizeQuantities) item.fulfilledSizeQuantities = new Map();
                const prev = item.fulfilledSizeQuantities instanceof Map
                  ? (item.fulfilledSizeQuantities.get(size) || 0)
                  : (item.fulfilledSizeQuantities[size] || 0);
                if (item.fulfilledSizeQuantities instanceof Map) {
                  item.fulfilledSizeQuantities.set(size, prev + proportional);
                } else {
                  item.fulfilledSizeQuantities[size] = prev + proportional;
                }
              }
            }
          }
        }
        updateData.items = order.items;
        order.markModified("items");
      }
    }

    // Transport/vehicle details — saved one step later, when the order
    // leaves the dispatch area (PFD/PARTIAL → RFD / "In Transit"). Split out
    // from the scan step above so warehouse scanning alone can flip the
    // order to "Dispatched" without needing vehicle info up front.
    if (status === "RFD" && ["PFD", "PARTIAL"].includes(order.status)) {
      if (vehicleNo) updateData.vehicleNo = vehicleNo;
      if (lrNo) updateData.lrNo = lrNo;
      if (transporterName) updateData.transporterName = transporterName;
      if (eWayBillNo) updateData.eWayBillNo = eWayBillNo;
      if (driverName) updateData.driverName = driverName;
      if (driverMobile) updateData.driverMobile = driverMobile;
      if (grossWeightKg) updateData.grossWeightKg = grossWeightKg;
    }

    // Booking commitment fields — saved when admin confirms (PENDING → BOOKED)
    if (status === "BOOKED") {
      if (expectedDispatchDate)
        updateData.expectedDispatchDate = new Date(expectedDispatchDate);
      if (bookingPriority) updateData.bookingPriority = bookingPriority;
      if (adminNote !== null) updateData.adminNote = adminNote;
      if (stockStatus) updateData.stockStatus = stockStatus;
    }

    // Deduct live stock the first time an order reaches BOOKED via this path.
    // A regular order already gets deducted at createOrder (initialStatus is
    // BOOKED from the start), so this only fires for released preorders —
    // those start PRE_BOOKED (skipped, not a commitment yet) then get
    // released to PENDING, and never pass through createOrder's BOOKED
    // branch. Without this they'd be confirmed/dispatched without ever
    // reducing sizeMap.qty.
    if (status === "BOOKED" && previousStatus === "PENDING") {
      await adjustVariantStock(order.items, -1);
      // Allocate pool codes to items that don't have them yet
      for (const item of order.items) {
        if (!(item.allocatedCartons || []).length) {
          await allocateCartonsToItem(item);
        }
      }
    }

    // Generate orderNumber when admin confirms (BOOKED) — keeps sequence clean
    if (status === "BOOKED" && !order.orderNumber) {
      try {
        const distUser = await User.findById(order.distributorId)
          .select("distributorId")
          .lean();
        let prefix = "OR";
        if (distUser?.distributorId) {
          const Distributor = require("../models/Distributor");
          const dist = await Distributor.findById(distUser.distributorId)
            .select("companyName")
            .lean();
          if (dist?.companyName) prefix = getCompanyPrefix(dist.companyName);
        }
        updateData.orderNumber = await generateNextOrderNumber(prefix);
      } catch (e) {
        updateData.orderNumber = await generateNextOrderNumber("OR");
      }
    }

    // Handle finalization when moving to RECEIVED
    if (status === "RECEIVED") {
      const currentBatchItems = [];
      let batchAmount = 0;
      let batchCartons = 0;
      let batchPairs = 0;
      let allFulfilled = true;

      // Build a map of cartons already recorded in previous fulfillment batches per item
      const prevBatchCartons = {};
      for (const batch of (order.fulfillmentHistory || [])) {
        for (const bItem of batch.items || []) {
          const key = bItem.variantId?.toString() || bItem.articleId?.toString();
          if (key) prevBatchCartons[key] = (prevBatchCartons[key] || 0) + (bItem.cartonCount || 0);
        }
      }

      for (const item of order.items) {
        // fulfilledCartonCount is cumulative (all dispatch cycles).
        // This batch should only record what's NEW since the last receive.
        const key = item.variantId?.toString() || item.articleId?.toString();
        const totalDispatched = item.fulfilledCartonCount || 0;
        const alreadyRecorded = prevBatchCartons[key] || 0;
        const dispatchedCartons = Math.max(0, totalDispatched - alreadyRecorded);

        if (dispatchedCartons > 0) {
          const ratio = dispatchedCartons / (item.cartonCount || 1);
          const dispatchedPairs = Math.round(item.pairCount * ratio);

          const orderedSizes = item.sizeQuantities
            ? Object.fromEntries(item.sizeQuantities)
            : {};

          // Proportional size quantities based on cartons dispatched
          const batchSizeQtys = {};
          for (const [size, qty] of Object.entries(orderedSizes)) {
            const proportional = Math.round(Number(qty) * ratio);
            if (proportional > 0) batchSizeQtys[size] = proportional;
          }

          currentBatchItems.push({
            variantId: item.variantId,
            articleId: item.articleId,
            cartonCount: dispatchedCartons,
            pairCount: dispatchedPairs,
            sizeQuantities: batchSizeQtys,
          });

          const perPairPrice = item.price / (item.pairCount || 1);
          batchAmount += dispatchedPairs * perPairPrice;
          batchCartons += dispatchedCartons;
          batchPairs += dispatchedPairs;
        }

        // allFulfilled is false if any item has less dispatched than ordered
        if ((item.fulfilledCartonCount || 0) < item.cartonCount) {
          allFulfilled = false;
        }
      }

      const batchNumber = (order.fulfillmentHistory?.length || 0) + 1;
      const historyEntry = {
        batchNumber,
        date: new Date(),
        items: currentBatchItems,
        totalAmount: batchAmount,
        totalCartons: batchCartons,
        totalPairs: batchPairs,
        billUrl: order.billUrl || billUrl,
        invoiceUrl: order.invoiceUrl || invoiceUrl,
        ewayBillUrl: order.ewayBillUrl || ewayBillUrl,
        transportBillUrl: order.transportBillUrl || transportBillUrl,
        receivingNoteUrl: receivingNoteUrl,
        receiverName: receiverName,
        receiverMobile: receiverMobile,
      };

      if (!order.fulfillmentHistory) order.fulfillmentHistory = [];
      order.fulfillmentHistory.push(historyEntry);

      // Determine final status
      updateData.status = allFulfilled ? "RECEIVED" : "PARTIAL";
      updateData.deliveredAt = new Date();
      updateData.items = order.items;
      updateData.fulfillmentHistory = order.fulfillmentHistory;
      order.markModified("items");
      order.markModified("fulfillmentHistory");

      // Clear current batch docs from main order fields after archive
      updateData.billUrl = null;
      updateData.invoiceUrl = null;
      updateData.ewayBillUrl = null;
      updateData.transportBillUrl = null;
      updateData.receivingNoteUrl = null;
    }

    // Restore live stock on cancellation — only the undispatched remainder
    // (ordered minus already-fulfilled), since dispatched pairs already left
    // the warehouse and aren't affected by cancelling the order. A still-
    // PREORDER item's un-fulfilled remainder was NEVER deducted in the first
    // place (deduction now only happens per-carton at actual scan time — see
    // scanCarton's shared-pool claim), so it must be excluded entirely here;
    // restoring it would double-count stock that's already sitting free.
    if (
      status === "CANCELLED" &&
      !["PRE_BOOKED", "PENDING", "CONFIRMED", "CANCELLED"].includes(previousStatus)
    ) {
      const restoreItems = (order.items || [])
        .filter((item) => item.bookingType !== "PREORDER")
        .map((item) => {
        const ordered = item.sizeQuantities instanceof Map
          ? Object.fromEntries(item.sizeQuantities)
          : (item.sizeQuantities || {});
        const fulfilled = item.fulfilledSizeQuantities instanceof Map
          ? Object.fromEntries(item.fulfilledSizeQuantities)
          : (item.fulfilledSizeQuantities || {});
        const remaining = {};
        Object.entries(ordered).forEach(([size, qty]) => {
          const left = Number(qty || 0) - Number(fulfilled[size] || 0);
          if (left > 0) remaining[size] = left;
        });
        return { variantId: item.variantId, sizeQuantities: remaining };
      });
      await adjustVariantStock(restoreItems, 1);

      // Return unscanned allocated cartons back to the pool (prepend to keep low serials first)
      const scannedCodes = new Set((order.cartonTracking || []).map(c => c.code));
      for (const item of order.items) {
        if (!(item.allocatedCartons || []).length || !item.variantId) continue;
        const toReturn = item.allocatedCartons.filter(c => !scannedCodes.has(c));
        if (!toReturn.length) continue;
        const variantCatalog = await MasterCatalog.findOne({ "variants._id": item.variantId });
        const variantDoc = variantCatalog?.variants.id(item.variantId);
        if (!variantDoc) continue;
        variantDoc.availableCartons = [...toReturn, ...(variantDoc.availableCartons || [])];
        variantCatalog.markModified("variants");
        await variantCatalog.save();
      }
    }

    // Apply updates to the order object
    Object.assign(order, updateData);

    // Save the document (this persists items array changes as well)
    await order.save();

    // Re-populate for consistency
    const updatedOrder = await Order.findById(orderId).populate({
      path: "distributorId",
      populate: { path: "distributorId" },
    });

    // ── Fire notification based on new status ──────────────────────────
    const distUser = await User.findById(order.distributorId)
      .select("email phone")
      .lean();
    const notifData = {
      "Order #": updatedOrder.orderNumber || String(orderId),
      Distributor: updatedOrder.distributorName,
      "Total CTN": updatedOrder.totalCartons,
      Amount: `₹${updatedOrder.finalAmount || updatedOrder.totalAmount}`,
    };
    const notifOpts = {
      data: notifData,
      distributorEmail: distUser?.email,
      distributorPhone: distUser?.phone,
    };

    const statusEventMap = {
      BOOKED: "ORDER_BOOKED",
      PFD: "ORDER_DISPATCHED",
      RFD: "ORDER_IN_TRANSIT",
      OFD: "ORDER_OUT_FOR_DELIVERY",
      RECEIVED: "ORDER_DELIVERED",
    };
    const notifEvent = statusEventMap[status];
    if (notifEvent) {
      if (status === "OFD" && deliveryAgentName) {
        notifData["Delivery Agent"] = deliveryAgentName;
        if (deliveryAgentMobile)
          notifData["Agent Mobile"] = deliveryAgentMobile;
      }
      notification.dispatch(notifEvent, notifOpts);
    }

    return updatedOrder;
  } catch (error) {
    throw new Error(`Failed to update order status: ${error.message}`);
  }
};

// ── Per-carton dispatch lifecycle ─────────────────────────────────────────
// No fixed "batch" object is created at scan time — every scanned carton is
// tracked individually (order.cartonTracking) and immediately visible in the
// Dispatched pool. Transport and Receive each act on a user-chosen SUBSET of
// that pool (however many cartons are selected at submit time), recorded as
// their own transitShipments / fulfillmentHistory entry — so a single order
// can have several shipments and several receipt confirmations over time.

// One carton per call — see the frontend for why (frozen barcode baseline;
// syncing per scan means the "remaining" denominator used to derive labels
// like SKU-CT0002 doesn't shift mid-session).
const scanCarton = async (orderId, { cartonCode, itemKey }) => {
  try {
    if (!cartonCode || !itemKey) throw new Error("cartonCode and itemKey are required");

    const order = await Order.findById(orderId);
    if (!order) throw new Error("Order not found");
    if (!["BOOKED", "PARTIAL"].includes(order.status)) {
      throw new Error(`Cannot scan cartons for an order in ${order.status} status`);
    }
    if ((order.cartonTracking || []).some((c) => c.code === cartonCode)) {
      throw new Error(`Carton ${cartonCode} already scanned`);
    }

    const item = order.items.find(
      (i) => (i.variantId?.toString() || i.articleId?.toString()) === itemKey
    );
    if (!item) throw new Error("Item not found on this order");

    if (item.bookingType === "PREORDER") {
      // Shared-pool model: every waiting pre-order for this variant sees the
      // SAME live carton pool (no per-order exclusive reservation anymore —
      // see promotePreOrderItems) — whichever order's operator scans a
      // specific carton first is the one who actually gets it. The atomic
      // findOneAndUpdate below is what enforces that: it only succeeds if
      // `cartonCode` is still sitting in the shared pool at this instant, so
      // a losing concurrent scan of the same barcode fails cleanly instead
      // of double-dispatching the same physical carton.
      const variantCatalog = await MasterCatalog.findOne({ "variants._id": item.variantId }).select("variants");
      const variantDoc = variantCatalog?.variants?.id(item.variantId);
      const livePoolCount = (variantDoc?.availableCartons || []).length;
      const reservedCartons = computeReservedCartons(item, livePoolCount);
      const remaining = reservedCartons - (item.fulfilledCartonCount || 0);
      if (remaining <= 0) {
        throw new Error("No stock has arrived yet for this pre-order item (pending GRN)");
      }

      // Mirror a REGULAR item's booking-time deduction — this carton's pairs
      // genuinely leave the shared/available pool the moment it's claimed.
      // Clamped at the size's current qty so a pre-existing drift between
      // sizeMap.qty and availableCartons (e.g. stale/corrupted order data)
      // can't push live stock negative.
      const orderedSizesForClaim = item.sizeQuantities instanceof Map
        ? Object.fromEntries(item.sizeQuantities)
        : (item.sizeQuantities || {});
      const incOps = {};
      Object.entries(orderedSizesForClaim).forEach(([size, qty]) => {
        const perCarton = Math.round(Number(qty || 0) / (item.cartonCount || 1));
        const currentQty = Number(variantDoc?.sizeMap?.get(size)?.qty || 0);
        const deduct = Math.min(perCarton, Math.max(0, currentQty));
        if (deduct > 0) incOps[`variants.$.sizeMap.${size}.qty`] = -deduct;
      });

      const claimed = await MasterCatalog.findOneAndUpdate(
        { variants: { $elemMatch: { _id: item.variantId, availableCartons: cartonCode } } },
        {
          $pull: { "variants.$.availableCartons": cartonCode },
          ...(Object.keys(incOps).length ? { $inc: incOps } : {}),
        }
      );
      if (!claimed) {
        throw new Error(
          `Carton ${cartonCode} is no longer available — it may already be allocated to another order. Please scan a different carton.`
        );
      }
    } else {
      // REGULAR item — validate against this order's pre-allocated carton codes.
      // If allocatedCartons is empty (legacy/GRN orders), allow any code freely.
      if ((item.allocatedCartons || []).length > 0) {
        if (!item.allocatedCartons.includes(cartonCode)) {
          const alreadyScanned = new Set((order.cartonTracking || []).map(c => c.code));
          const nextCode = item.allocatedCartons.find(c => !alreadyScanned.has(c));
          throw new Error(
            nextCode
              ? `Scan ${nextCode} next — ${cartonCode} is not allocated to this order`
              : "No cartons available for this order"
          );
        }
      }

      const reservedCartons = computeReservedCartons(item);
      const remaining = reservedCartons - (item.fulfilledCartonCount || 0);
      if (remaining <= 0) {
        throw new Error("All cartons for this item are already scanned");
      }
    }

    // Distribute this single carton across sizes proportionally — same
    // ratio-based math the old batch dispatch used, just recomputed fresh
    // per carton (before/after deltas telescope to the exact right total
    // regardless of how many separate calls this happens across).
    const orderedSizes = item.sizeQuantities instanceof Map
      ? Object.fromEntries(item.sizeQuantities)
      : (item.sizeQuantities || {});
    const ratioBefore = (item.fulfilledCartonCount || 0) / (item.cartonCount || 1);
    item.fulfilledCartonCount = (item.fulfilledCartonCount || 0) + 1;
    const ratioAfter = item.fulfilledCartonCount / (item.cartonCount || 1);
    Object.entries(orderedSizes).forEach(([size, qty]) => {
      const before = Math.round(Number(qty) * ratioBefore);
      const after = Math.round(Number(qty) * ratioAfter);
      const delta = after - before;
      if (delta <= 0) return;
      if (!item.fulfilledSizeQuantities) item.fulfilledSizeQuantities = new Map();
      const prev = item.fulfilledSizeQuantities instanceof Map
        ? (item.fulfilledSizeQuantities.get(size) || 0)
        : (item.fulfilledSizeQuantities[size] || 0);
      if (item.fulfilledSizeQuantities instanceof Map) item.fulfilledSizeQuantities.set(size, prev + delta);
      else item.fulfilledSizeQuantities[size] = prev + delta;
    });

    // Fully scanned — settle the item as REGULAR now that every carton has
    // genuinely, physically been claimed (not merely "backed on paper").
    if (item.bookingType === "PREORDER" && item.fulfilledCartonCount >= (item.cartonCount || 0)) {
      item.bookingType = "REGULAR";
    }
    order.markModified("items");

    if (!order.cartonTracking) order.cartonTracking = [];
    const isFirstScan = order.cartonTracking.length === 0;
    order.cartonTracking.push({ code: cartonCode, itemKey, status: "DISPATCHED", dispatchedAt: new Date() });
    order.markModified("cartonTracking");

    if (order.status === "BOOKED") order.status = "PARTIAL";
    if (!order.dispatchedAt) order.dispatchedAt = new Date();

    await order.save();
    const updatedOrder = await Order.findById(orderId).populate({
      path: "distributorId",
      populate: { path: "distributorId" },
    }).lean();
    await attachLiveCartonAvailability(updatedOrder);

    if (isFirstScan) {
      const distUser = await User.findById(order.distributorId).select("email phone").lean();
      notification.dispatch("ORDER_DISPATCHED", {
        data: {
          "Order #": updatedOrder.orderNumber || String(orderId),
          Distributor: updatedOrder.distributorName,
        },
        distributorEmail: distUser?.email,
        distributorPhone: distUser?.phone,
      });
    }

    return updatedOrder;
  } catch (error) {
    throw new Error(`Failed to scan carton: ${error.message}`);
  }
};

// Moves a user-selected subset of currently-Dispatched cartons to In Transit,
// recording one transitShipments entry for exactly that selection.
const submitTransit = async (orderId, {
  cartonCodes, vehicleNo, lrNo, transporterName, eWayBillNo,
  driverName, driverMobile, grossWeightKg, invoiceUrl, ewayBillUrl, transportBillUrl,
}) => {
  try {
    if (!Array.isArray(cartonCodes) || cartonCodes.length === 0) {
      throw new Error("Select at least one carton");
    }
    const order = await Order.findById(orderId);
    if (!order) throw new Error("Order not found");

    const trackingByCode = new Map((order.cartonTracking || []).map((c) => [c.code, c]));
    for (const code of cartonCodes) {
      const entry = trackingByCode.get(code);
      if (!entry) throw new Error(`Carton ${code} not found on this order`);
      if (entry.status !== "DISPATCHED") throw new Error(`Carton ${code} is not in Dispatched status`);
    }

    if (!order.transitShipments) order.transitShipments = [];
    order.transitShipments.push({
      cartonCodes, vehicleNo, lrNo, transporterName, eWayBillNo,
      driverName, driverMobile, grossWeightKg, invoiceUrl, ewayBillUrl, transportBillUrl,
      createdAt: new Date(),
    });
    const newShipmentId = order.transitShipments[order.transitShipments.length - 1]._id;

    cartonCodes.forEach((code) => {
      const entry = trackingByCode.get(code);
      entry.status = "IN_TRANSIT";
      entry.transitShipmentId = newShipmentId;
    });
    order.markModified("cartonTracking");
    order.markModified("transitShipments");

    await order.save();
    const updatedOrder = await Order.findById(orderId).populate({
      path: "distributorId",
      populate: { path: "distributorId" },
    });

    const distUser = await User.findById(order.distributorId).select("email phone").lean();
    notification.dispatch("ORDER_IN_TRANSIT", {
      data: {
        "Order #": updatedOrder.orderNumber || String(orderId),
        Distributor: updatedOrder.distributorName,
        Cartons: cartonCodes.length,
      },
      distributorEmail: distUser?.email,
      distributorPhone: distUser?.phone,
    });

    return updatedOrder;
  } catch (error) {
    throw new Error(`Failed to submit transit details: ${error.message}`);
  }
};

// Moves a user-selected subset of currently-In-Transit cartons to Received,
// recording one fulfillmentHistory entry for exactly that selection. Order
// status only flips to RECEIVED once every carton across every item has
// reached Received — otherwise it stays PARTIAL, however many separate
// receive submissions that takes.
const receiveCartons = async (orderId, { cartonCodes, receiverName, receiverMobile, receivingNoteUrl }) => {
  try {
    if (!Array.isArray(cartonCodes) || cartonCodes.length === 0) {
      throw new Error("Select at least one carton");
    }
    if (!receiverName || !receiverMobile) {
      throw new Error("Receiver name and mobile are required");
    }
    const order = await Order.findById(orderId);
    if (!order) throw new Error("Order not found");

    const trackingByCode = new Map((order.cartonTracking || []).map((c) => [c.code, c]));
    for (const code of cartonCodes) {
      const entry = trackingByCode.get(code);
      if (!entry) throw new Error(`Carton ${code} not found on this order`);
      if (entry.status !== "IN_TRANSIT") throw new Error(`Carton ${code} is not In Transit`);
    }

    const countsByItem = {};
    cartonCodes.forEach((code) => {
      const entry = trackingByCode.get(code);
      countsByItem[entry.itemKey] = (countsByItem[entry.itemKey] || 0) + 1;
    });

    const historyItems = [];
    let totalAmount = 0, totalCartons = 0, totalPairs = 0;
    Object.entries(countsByItem).forEach(([itemKey, count]) => {
      const item = order.items.find(
        (i) => (i.variantId?.toString() || i.articleId?.toString()) === itemKey
      );
      if (!item) return;
      const ratio = count / (item.cartonCount || 1);
      const pairCount = Math.round((item.pairCount || 0) * ratio);
      const sizeQuantities = {};
      const orderedSizes = item.sizeQuantities instanceof Map
        ? Object.fromEntries(item.sizeQuantities)
        : (item.sizeQuantities || {});
      Object.entries(orderedSizes).forEach(([size, qty]) => {
        const proportional = Math.round(Number(qty) * ratio);
        if (proportional > 0) sizeQuantities[size] = proportional;
      });
      historyItems.push({
        variantId: item.variantId, articleId: item.articleId,
        cartonCount: count, pairCount, sizeQuantities,
      });
      const perPairPrice = item.price / (item.pairCount || 1);
      totalAmount += pairCount * perPairPrice;
      totalCartons += count;
      totalPairs += pairCount;
    });

    if (!order.fulfillmentHistory) order.fulfillmentHistory = [];
    const batchNumber = order.fulfillmentHistory.length + 1;
    order.fulfillmentHistory.push({
      batchNumber, date: new Date(), cartonCodes, items: historyItems,
      totalAmount, totalCartons, totalPairs, receiverName, receiverMobile, receivingNoteUrl,
    });

    cartonCodes.forEach((code) => {
      trackingByCode.get(code).status = "RECEIVED";
    });
    order.markModified("cartonTracking");
    order.markModified("fulfillmentHistory");

    const totalExpectedCartons = order.items.reduce((s, i) => s + (i.cartonCount || 0), 0);
    const totalReceivedCartons = order.cartonTracking.filter((c) => c.status === "RECEIVED").length;
    const allReceived = totalExpectedCartons > 0 && totalReceivedCartons >= totalExpectedCartons;
    if (allReceived) {
      order.status = "RECEIVED";
      order.deliveredAt = new Date();
    } else {
      order.status = "PARTIAL";
    }

    await order.save();
    const updatedOrder = await Order.findById(orderId).populate({
      path: "distributorId",
      populate: { path: "distributorId" },
    });

    if (allReceived) {
      const distUser = await User.findById(order.distributorId).select("email phone").lean();
      notification.dispatch("ORDER_DELIVERED", {
        data: {
          "Order #": updatedOrder.orderNumber || String(orderId),
          Distributor: updatedOrder.distributorName,
        },
        distributorEmail: distUser?.email,
        distributorPhone: distUser?.phone,
      });
    }

    return updatedOrder;
  } catch (error) {
    throw new Error(`Failed to receive cartons: ${error.message}`);
  }
};

const processReturn = async (orderId, returnData) => {
  try {
    const { items: returnItems, reason, batchNumber } = returnData;
    const order = await Order.findById(orderId);
    if (!order) throw new Error("Order not found");

    const validStatuses = ["RECEIVED", "PARTIAL"];
    if (!validStatuses.includes(order.status)) {
      throw new Error("Only orders with delivered items can be returned");
    }

    const processedItems = [];
    let totalCartons = 0;
    let totalPairs = 0;

    for (const retItem of returnItems) {
      const { variantId, cartons } = retItem;
      const orderItem = order.items.find(
        (item) => item.variantId.toString() === variantId.toString()
      );
      if (!orderItem)
        throw new Error(`Item ${variantId} not found in this order`);

      // Find the specific batch if provided
      let targetBatch = null;
      if (batchNumber) {
        targetBatch = order.fulfillmentHistory.find(
          (b) => b.batchNumber === Number(batchNumber)
        );
        if (!targetBatch)
          throw new Error(`Batch #${batchNumber} not found in order history`);

        // Update batch-level returned count safely
        const updatedItems = targetBatch.items.map((bi) => {
          if (bi.variantId.toString() === variantId.toString()) {
            return {
              ...bi.toObject(),
              returnedCartonCount: (bi.returnedCartonCount || 0) + cartons,
            };
          }
          return bi;
        });
        targetBatch.items = updatedItems;
      }

      // Proportional calculation for size restoration (based on this return's carton count)
      const ratio = cartons / (orderItem.cartonCount || 1);
      const originalSizes = orderItem.sizeQuantities
        ? Object.fromEntries(orderItem.sizeQuantities)
        : {};

      const catalogItem = await MasterCatalog.findById(orderItem.articleId);
      if (!catalogItem) throw new Error("Article not found in catalog");

      const variant = catalogItem.variants.id(variantId);
      if (!variant) throw new Error("Variant not found in catalog");

      const returnSizeQuantities = {};
      let itemPairs = 0;

      if (variant.sizeMap) {
        for (const [size, qty] of Object.entries(originalSizes)) {
          const qtyToReturn = Math.round(qty * ratio);
          if (qtyToReturn > 0) {
            returnSizeQuantities[size] = qtyToReturn;
            itemPairs += qtyToReturn;

            if (variant.sizeMap.has(size)) {
              const cell = variant.sizeMap.get(size);
              cell.qty = (cell.qty || 0) + qtyToReturn;
              variant.sizeMap.set(size, cell);
            }
          }
        }
        catalogItem.markModified("variants");
        await catalogItem.save();
      }

      // Update Order-level counts
      orderItem.returnedCartonCount =
        (orderItem.returnedCartonCount || 0) + cartons;
      orderItem.returnedPairCount =
        (orderItem.returnedPairCount || 0) + itemPairs;

      // OPTIONAL: "Remove from fulfilled" as requested
      orderItem.fulfilledCartonCount = Math.max(
        0,
        (orderItem.fulfilledCartonCount || 0) - cartons
      );
      orderItem.fulfilledPairCount = Math.max(
        0,
        (orderItem.fulfilledPairCount || 0) - itemPairs
      );

      processedItems.push({
        variantId: orderItem.variantId,
        articleId: orderItem.articleId,
        cartonCount: cartons,
        pairCount: itemPairs,
        sizeQuantities: returnSizeQuantities,
      });

      totalCartons += cartons;
      totalPairs += itemPairs;
    }

    // Record the Return Document
    const returnNumber = await generateNextReturnNumber();
    const newReturn = new Return({
      returnNumber,
      orderId,
      orderNumber: order.orderNumber,
      distributorId: order.distributorId,
      distributorName: order.distributorName,
      items: processedItems,
      totalCartons,
      totalPairs,
      reason,
      batchNumber, // Store which batch this return belongs to
    });

    // Finalize order updates
    if (order.status === "RECEIVED") {
      order.status = "PARTIAL"; // Revert to partial if items are returned
    }
    order.markModified("items");
    order.markModified("fulfillmentHistory");
    await order.save();

    await newReturn.save();

    activityLog.createLog({
      action: "RETURN_PROCESSED",
      entityType: "ORDER",
      entityId: String(orderId),
      description: `Return ${returnNumber}: ${totalCartons} carton(s) / ${totalPairs} pairs returned from order ${
        order.orderNumber
      } (${order.distributorName})${reason ? ` — ${reason}` : ""}`,
      metadata: {
        returnId: String(newReturn._id),
        returnNumber,
        orderId: String(orderId),
        orderNumber: order.orderNumber,
        totalCartons,
        totalPairs,
        reason,
      },
    });

    return newReturn;
  } catch (error) {
    throw new Error(`Failed to process return: ${error.message}`);
  }
};

const getReturnHistory = async ({ page = 1, limit = 10, search = "" } = {}) => {
  try {
    const skip = (page - 1) * limit;
    const query = {};
    if (search) {
      query.$or = [
        { returnNumber: { $regex: search, $options: "i" } },
        { distributorName: { $regex: search, $options: "i" } },
        { orderNumber: { $regex: search, $options: "i" } },
      ];
    }

    const [items, total] = await Promise.all([
      Return.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Return.countDocuments(query),
    ]);

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  } catch (error) {
    throw new Error(`Failed to fetch return history: ${error.message}`);
  }
};

// ── Delete order (only PENDING / PRE_BOOKED) ─────────────────────────────
const deleteOrder = async (orderId, requesterId, requesterRole) => {
  const order = await Order.findById(orderId);
  if (!order) throw new Error("Order not found");

  const canDelete = ["PENDING", "PRE_BOOKED"].includes(order.status);
  if (!canDelete)
    throw new Error("Only PENDING or PRE_BOOKED orders can be deleted");

  // Distributors can only delete their own orders
  if (
    requesterRole === "distributor" &&
    String(order.distributorId) !== String(requesterId)
  ) {
    throw new Error("Not authorized to delete this order");
  }

  await Order.findByIdAndDelete(orderId);
  return order;
};

// ── Edit order items (only PENDING / PRE_BOOKED) ─────────────────────────
const editOrder = async (orderId, requesterId, requesterRole, { items }) => {
  const order = await Order.findById(orderId);
  if (!order) throw new Error("Order not found");

  const canEdit = ["PENDING", "PRE_BOOKED"].includes(order.status);
  if (!canEdit)
    throw new Error("Only PENDING or PRE_BOOKED orders can be edited");

  if (
    requesterRole === "distributor" &&
    String(order.distributorId) !== String(requesterId)
  ) {
    throw new Error("Not authorized to edit this order");
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new Error("At least one item required");
  }

  const totalCartons = items.reduce((s, i) => s + (i.cartonCount || 0), 0);
  const totalPairs = items.reduce((s, i) => s + (i.pairCount || 0), 0);
  const totalAmount = items.reduce((s, i) => s + (i.price || 0), 0);
  const discountAmount = order.discountPercentage
    ? Math.round(((totalAmount * order.discountPercentage) / 100) * 100) / 100
    : order.discountAmount || 0;
  const finalAmount = totalAmount - discountAmount;
  const gstRate = order.gstRate || 0;
  const gstAmount =
    gstRate > 0
      ? Math.round(((finalAmount * gstRate) / 100) * 100) / 100
      : order.gstAmount || 0;

  order.items = items;
  order.totalCartons = totalCartons;
  order.totalPairs = totalPairs;
  order.totalAmount = totalAmount;
  order.discountAmount = discountAmount;
  order.finalAmount = finalAmount;
  order.gstAmount = gstAmount;
  await order.save();
  return order;
};

// ── Notify pre-orders when their variant's stock changes (GRN arrival) ────
// Called by grn.service after a GRN lands stock for `variantIds`. Under the
// shared-pool model (see computeReservedCartons / attachLiveCartonAvailability
// / scanCarton), no order gets an exclusive claim here anymore — every order
// with a still-PREORDER item for one of these variants sees the SAME live
// carton pool, computed fresh on every read, and whichever operator scans a
// specific carton first is the one who actually gets it. So this function no
// longer mutates anything; its only job is to find who needs their Scan
// screen refreshed (the caller emits a socket update per returned order).
const promotePreOrderItems = async (variantIds) => {
  const idStrs = [...new Set((variantIds || []).map(String))];
  if (!idStrs.length) return [];

  const orders = await Order.find({
    status: { $nin: ["RECEIVED", "CANCELLED"] },
    items: { $elemMatch: { variantId: { $in: idStrs }, bookingType: "PREORDER" } },
  }).populate({ path: "distributorId", populate: { path: "distributorId" } });

  return orders;
};

// ── MRP / price propagation to PENDING + PRE_BOOKED orders ───────────────
// Called when admin updates an article's selling price — propagates to PENDING + PRE_BOOKED orders
// BOOKED and beyond are locked (no changes allowed after admin confirms)
const propagatePriceUpdate = async (articleId, newPricePerPair) => {
  if (!newPricePerPair || newPricePerPair <= 0) return;

  const { emitOrderUpdate } = require("../socket");

  const orders = await Order.find({
    status: { $in: ["PENDING", "PRE_BOOKED"] },
    "items.articleId": articleId,
  });

  for (const order of orders) {
    let changed = false;
    order.items.forEach((item) => {
      if (String(item.articleId) === String(articleId)) {
        item.price = newPricePerPair * item.pairCount;
        changed = true;
      }
    });
    if (changed) {
      order.totalAmount = order.items.reduce((s, i) => s + i.price, 0);
      const disc = order.discountPercentage
        ? Math.round(
            ((order.totalAmount * order.discountPercentage) / 100) * 100
          ) / 100
        : order.discountAmount || 0;
      order.discountAmount = disc;
      order.finalAmount = order.totalAmount - disc;
      // Only recalculate gstAmount if this order has a gstRate stored
      if ((order.gstRate || 0) > 0) {
        order.gstAmount =
          Math.round(((order.finalAmount * order.gstRate) / 100) * 100) / 100;
      }
      order.markModified("items");
      await order.save();
      // Push live update to all connected clients
      emitOrderUpdate(order);
    }
  }
};

const getOrderStats = async () => {
  const [stats] = await Order.aggregate([
    // The operational flow begins only after an order leaves the pre-order
    // queue; cancelled demand is deliberately excluded from Active CTN.
    { $match: { status: { $nin: [...PREORDER_STATUSES, "CANCELLED"] } } },
    {
      $project: {
        status: 1,
        totalCartons: { $ifNull: ["$totalCartons", 0] },
        trackingCount: { $size: { $ifNull: ["$cartonTracking", []] } },
        dispatched: {
          $size: {
            $filter: {
              input: { $ifNull: ["$cartonTracking", []] },
              as: "carton",
              cond: { $eq: ["$$carton.status", "DISPATCHED"] },
            },
          },
        },
        inTransit: {
          $size: {
            $filter: {
              input: { $ifNull: ["$cartonTracking", []] },
              as: "carton",
              cond: { $eq: ["$$carton.status", "IN_TRANSIT"] },
            },
          },
        },
        received: {
          $size: {
            $filter: {
              input: { $ifNull: ["$cartonTracking", []] },
              as: "carton",
              cond: { $eq: ["$$carton.status", "RECEIVED"] },
            },
          },
        },
        // Some historical PARTIAL orders predate cartonTracking. Their known
        // fulfilled cartons are treated as dispatched; the remainder stays
        // pending so every active carton is represented exactly once.
        fulfilledCartons: {
          $sum: {
            $map: {
              input: { $ifNull: ["$items", []] },
              as: "item",
              in: { $ifNull: ["$$item.fulfilledCartonCount", 0] },
            },
          },
        },
      },
    },
    {
      $project: {
        totalCartons: 1,
        BOOKED: {
          $cond: [
            { $gt: ["$trackingCount", 0] },
            { $max: [{ $subtract: ["$totalCartons", "$trackingCount"] }, 0] },
            {
              $cond: [
                { $in: ["$status", ["PFD", "RFD", "RECEIVED"]] },
                0,
                { $max: [{ $subtract: ["$totalCartons", "$fulfilledCartons"] }, 0] },
              ],
            },
          ],
        },
        PFD: {
          $cond: [
            { $gt: ["$trackingCount", 0] },
            "$dispatched",
            {
              $cond: [
                { $eq: ["$status", "PFD"] },
                "$totalCartons",
                {
                  $cond: [
                    { $in: ["$status", ["PENDING", "BOOKED", "PARTIAL"]] },
                    { $min: ["$fulfilledCartons", "$totalCartons"] },
                    0,
                  ],
                },
              ],
            },
          ],
        },
        RFD: {
          $cond: [
            { $gt: ["$trackingCount", 0] },
            "$inTransit",
            { $cond: [{ $eq: ["$status", "RFD"] }, "$totalCartons", 0] },
          ],
        },
        RECEIVED: {
          $cond: [
            { $gt: ["$trackingCount", 0] },
            "$received",
            { $cond: [{ $eq: ["$status", "RECEIVED"] }, "$totalCartons", 0] },
          ],
        },
      },
    },
    {
      $group: {
        _id: null,
        totalCartons: { $sum: "$totalCartons" },
        BOOKED: { $sum: "$BOOKED" },
        PFD: { $sum: "$PFD" },
        RFD: { $sum: "$RFD" },
        RECEIVED: { $sum: "$RECEIVED" },
      },
    },
  ]);

  return {
    totalCartons: stats?.totalCartons || 0,
    BOOKED: stats?.BOOKED || 0,
    PFD: stats?.PFD || 0,
    RFD: stats?.RFD || 0,
    RECEIVED: stats?.RECEIVED || 0,
  };
};

/** Full-catalog (non-paginated) metrics for admin dashboard cards */
const getDashboardMetrics = async ({ startDate, endDate } = {}) => {
  const match = { status: { $nin: PREORDER_STATUSES } };

  // `date` is stored as YYYY-MM-DD string — lexicographic range works
  if (startDate || endDate) {
    match.date = {};
    if (startDate) match.date.$gte = String(startDate).slice(0, 10);
    if (endDate) match.date.$lte = String(endDate).slice(0, 10);
  }

  const [row] = await Order.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalRevenue: {
          $sum: {
            $ifNull: ["$finalAmount", { $ifNull: ["$totalAmount", 0] }],
          },
        },
        ordersPlaced: { $sum: 1 },
        distributorIds: { $addToSet: "$distributorId" },
      },
    },
    {
      $project: {
        _id: 0,
        totalRevenue: 1,
        ordersPlaced: 1,
        activeParties: { $size: "$distributorIds" },
      },
    },
  ]);

  return {
    totalRevenue: Math.round(Number(row?.totalRevenue) || 0),
    ordersPlaced: Number(row?.ordersPlaced) || 0,
    activeParties: Number(row?.activeParties) || 0,
  };
};

// One-time safe backfill for orders created before productSnapshot existed.
// It only uses an exact articleId + variantId match; missing historical
// variants are reported, never guessed or remapped.
const backfillLegacyProductSnapshots = async ({ apply = false } = {}) => {
  const orders = await Order.find({ "items.productSnapshot": { $exists: false } })
    .select("orderNumber items")
    .sort({ createdAt: 1 });

  const articleIds = [
    ...new Set(
      orders.flatMap((order) => (order.items || [])
        .filter((item) => !item.productSnapshot && item.articleId)
        .map((item) => String(item.articleId)))
    ),
  ];
  const catalogs = articleIds.length
    ? await MasterCatalog.find({ _id: { $in: articleIds } })
        .select("articleName primaryImage colorMedia variants")
        .lean()
    : [];
  const catalogById = new Map(catalogs.map((catalog) => [String(catalog._id), catalog]));

  let legacyItems = 0;
  let eligibleItems = 0;
  let savedOrders = 0;
  const unresolvedItems = [];

  for (const order of orders) {
    let changed = false;
    (order.items || []).forEach((item, itemIndex) => {
      if (item.productSnapshot) return;
      legacyItems += 1;

      const catalog = item.articleId && catalogById.get(String(item.articleId));
      const variant = catalog?.variants?.find((value) => String(value._id) === String(item.variantId));
      if (!catalog || !variant) {
        if (unresolvedItems.length < 100) {
          unresolvedItems.push({
            orderNumber: order.orderNumber || String(order._id),
            itemIndex,
            articleId: item.articleId ? String(item.articleId) : null,
            variantId: item.variantId ? String(item.variantId) : null,
            reason: !catalog ? "Article no longer exists" : "Variant no longer belongs to this article",
          });
        }
        return;
      }

      eligibleItems += 1;
      if (apply) {
        item.productSnapshot = buildProductSnapshot(catalog, variant);
        changed = true;
      }
    });

    if (apply && changed) {
      await order.save();
      savedOrders += 1;
    }
  }

  return {
    mode: apply ? "applied" : "dry-run",
    ordersScanned: orders.length,
    legacyItems,
    eligibleItems,
    unresolvedItems: legacyItems - eligibleItems,
    savedOrders,
    unresolvedItemSamples: unresolvedItems,
  };
};

module.exports = {
  createOrder,
  getOrdersByDistributor,
  getAllOrders,
  updateOrderStatus,
  scanCarton,
  submitTransit,
  receiveCartons,
  processReturn,
  getReturnHistory,
  deleteOrder,
  editOrder,
  promotePreOrderItems,
  propagatePriceUpdate,
  getOrderStats,
  getDashboardMetrics,
  backfillLegacyProductSnapshots,
  attachLiveCartonAvailability,
  backfillRegularCartonAllocations,
};
