const mongoose = require("mongoose");
const Order = require("../models/Order");
const User = require("../models/User");
const MasterCatalog = require("../models/MasterCatalog");
const Return = require("../models/Return");
const activityLog = require("./activityLog.service");
const notification = require("./notification.service");

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

    // Credit limit validation — skip for pre-orders (not confirmed yet)
    const isPreOrder = orderData.orderType === "PREORDER";
    if (!isPreOrder) {
      if (creditLimit === 0) {
        throw new Error(
          "You have no credit limit to book an order. Please contact administrator."
        );
      }
      const pendingOrders = await Order.aggregate([
        {
          $match: {
            distributorId: distributor._id,
            status: {
              $nin: ["RECEIVED", "CANCELLED", "PRE_BOOKED", "CONFIRMED"],
            },
          },
        },
        {
          $group: {
            _id: null,
            totalPending: {
              $sum: { $ifNull: ["$finalAmount", "$totalAmount"] },
            },
          },
        },
      ]);
      const pendingValue = pendingOrders[0]?.totalPending || 0;
      if (pendingValue + finalAmount > creditLimit) {
        const available = creditLimit - pendingValue;
        throw new Error(
          `Credit limit exceeded. Available credit: ₹${
            available > 0 ? available.toLocaleString() : 0
          }. Required: ₹${finalAmount.toLocaleString()}`
        );
      }
    }

    // Use provided date or fallback to today
    const orderDate = date || new Date().toISOString().split("T")[0];

    const orderType = orderData.orderType || "REGULAR";
    const initialStatus = orderType === "PREORDER" ? "PRE_BOOKED" : "BOOKED";

    // Sanitize items: ensure articleId/variantId are valid ObjectId strings
    const sanitizedItems = (items || []).map((item) => {
      const sanitized = { ...item };
      // If variantId is not a valid 24-char hex ObjectId, strip it
      if (
        sanitized.variantId &&
        !mongoose.Types.ObjectId.isValid(sanitized.variantId)
      ) {
        delete sanitized.variantId;
      }
      // Ensure numeric fields are valid numbers
      sanitized.cartonCount = Number(sanitized.cartonCount) || 0;
      sanitized.pairCount = Number(sanitized.pairCount) || 0;
      sanitized.price = Number(sanitized.price) || 0;
      return sanitized;
    });

    // Generate order number immediately for BOOKED orders
    let orderNumber;
    if (initialStatus === "BOOKED") {
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
    }

    const order = new Order({
      orderType,
      distributorId,
      distributorName: distrName,
      date: orderDate,
      status: initialStatus,
      ...(orderNumber ? { orderNumber } : {}),
      items: sanitizedItems,
      totalAmount: Number(totalAmount) || 0,
      totalCartons: Number(totalCartons) || 0,
      totalPairs: Number(totalPairs) || 0,
      discountPercentage,
      discountAmount,
      finalAmount: isNaN(finalAmount) ? 0 : finalAmount,
      gstRate,
      gstAmount: isNaN(gstAmount) ? 0 : gstAmount,
    });

    const savedOrder = await order.save();

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
    const baseQ = { distributorId: distObjId, status: { $nin: PREORDER_STATUSES } };
    const preOrderQ = { distributorId: distObjId, status: { $in: PREORDER_STATUSES } };

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
        Order.aggregate([
          { $match: baseQ },
          { $group: { _id: "$status", count: { $sum: 1 }, cartons: { $sum: "$totalCartons" } } },
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
    const statusCounts = { total: stats.totalCartons || 0 };
    for (const s of statusAgg) statusCounts[s._id] = s.cartons || 0;

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
  startDate,
  endDate,
  sortBy = "createdAt",
  sortDesc = "true",
} = {}) => {
  try {
    const p = normalizePage(page);
    const l = normalizeLimit(limit);
    const skip = (p - 1) * l;

    const q = {};
    if (status) q.status = status;
    else q.status = { $nin: PREORDER_STATUSES };
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

    // Dispatch fields — saved when dispatching (BOOKED/PARTIAL → PFD/PARTIAL)
    if (status === "PFD" || (status === "PARTIAL" && ["BOOKED", "PARTIAL"].includes(order.status))) {
      if (vehicleNo) updateData.vehicleNo = vehicleNo;
      if (lrNo) updateData.lrNo = lrNo;
      if (transporterName) updateData.transporterName = transporterName;
      if (eWayBillNo) updateData.eWayBillNo = eWayBillNo;
      if (driverName) updateData.driverName = driverName;
      if (driverMobile) updateData.driverMobile = driverMobile;
      if (grossWeightKg) updateData.grossWeightKg = grossWeightKg;
      if (outScannedCartons) updateData.outScannedCartons = outScannedCartons;
      updateData.dispatchedAt = new Date();

      // Update per-item fulfilledCartonCount and fulfilledSizeQuantities using the frontend-computed map.
      // fulfilledSizeQuantities MUST be set here — the live stock formula in getVariantStock subtracts
      // dispatched pairs from stock using this field. If it stays empty the order drops out of
      // blockedStockMap (no longer BOOKED) but nothing is subtracted from live stock, making stock appear to increase.
      if (itemDispatchCounts && Object.keys(itemDispatchCounts).length > 0) {
        for (const item of order.items) {
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

    // Booking commitment fields — saved when admin confirms (PENDING → BOOKED)
    if (status === "BOOKED") {
      if (expectedDispatchDate)
        updateData.expectedDispatchDate = new Date(expectedDispatchDate);
      if (bookingPriority) updateData.bookingPriority = bookingPriority;
      if (adminNote !== null) updateData.adminNote = adminNote;
      if (stockStatus) updateData.stockStatus = stockStatus;
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

// ── Pre-order: get all PRE_BOOKED / CONFIRMED ─────────────────────────────
const getPreOrders = async ({
  page = 1,
  limit = 20,
  search = "",
  status = "",
} = {}) => {
  const q = { orderType: "PREORDER" };
  if (status) q.status = status;
  else q.status = { $in: ["PRE_BOOKED", "CONFIRMED"] };
  if (search)
    q.$or = [
      { orderNumber: { $regex: search, $options: "i" } },
      { distributorName: { $regex: search, $options: "i" } },
    ];

  const total = await Order.countDocuments(q);
  const items = await Order.find(q)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  return {
    items,
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
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
  const result = await Order.aggregate([
    { $match: { status: { $nin: PREORDER_STATUSES } } },
    {
      $facet: {
        byStatus: [{ $group: { _id: "$status", count: { $sum: 1 }, cartons: { $sum: "$totalCartons" } } }],
        byType: [{ $group: { _id: "$orderType", count: { $sum: 1 } } }],
        urgent: [
          {
            $match: {
              bookingPriority: "URGENT",
              status: { $nin: ["RECEIVED", "CANCELLED"] },
            },
          },
          { $count: "count" },
        ],
      },
    },
  ]);

  const stats = { total: 0, totalCartons: 0, urgent: 0 };
  const statusCounts = result[0]?.byStatus || [];
  for (const s of statusCounts) {
    stats[s._id] = s.cartons || 0;
    stats[`${s._id}_orders`] = s.count;
    if (!["CANCELLED"].includes(s._id)) {
      stats.total += s.count;
      stats.totalCartons += s.cartons || 0;
    }
  }
  stats.urgent = result[0]?.urgent?.[0]?.count || 0;
  return stats;
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

module.exports = {
  createOrder,
  getOrdersByDistributor,
  getAllOrders,
  updateOrderStatus,
  processReturn,
  getReturnHistory,
  deleteOrder,
  editOrder,
  getPreOrders,
  propagatePriceUpdate,
  getOrderStats,
  getDashboardMetrics,
};
