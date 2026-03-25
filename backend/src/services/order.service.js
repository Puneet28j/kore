const Order = require("../models/Order");
const User = require("../models/User");
const MasterCatalog = require("../models/MasterCatalog");

const generateNextOrderNumber = async () => {
  const lastOrder = await Order.findOne()
    .sort({ createdAt: -1 })
    .select("orderNumber")
    .lean();

  if (!lastOrder || !lastOrder.orderNumber) {
    return "OR-00001";
  }

  const lastNum = lastOrder.orderNumber.match(/OR-(\d+)/)?.[1];
  const next = (lastNum ? parseInt(lastNum, 10) : 0) + 1;

  return `OR-${String(next).padStart(5, "0")}`;
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

    let discountPercentage = 0;
    let creditLimit = 0;
    if (distributor.distributorId) {
      const Distributor = require("../models/Distributor");
      const distProfile = await Distributor.findById(distributor.distributorId).lean();
      if (distProfile) {
        discountPercentage = distProfile.discountPercentage || 0;
        creditLimit = typeof distProfile.creditLimit === 'number' ? distProfile.creditLimit : 0;
      }
    }

    const discountAmount = (totalAmount * discountPercentage) / 100;
    const finalAmount = totalAmount - discountAmount;

    // Strict credit limit validation
    if (creditLimit === 0) {
      throw new Error("You have no credit limit to book an order. Please contact administrator.");
    }
    
    const pendingOrders = await Order.aggregate([
      { $match: { distributorId: distributor._id, status: { $ne: "DELIVERED" } } },
      { $group: { _id: null, totalPending: { $sum: { $ifNull: ["$finalAmount", "$totalAmount"] } } } }
    ]);
    const pendingValue = pendingOrders[0]?.totalPending || 0;
    
    if (pendingValue + finalAmount > creditLimit) {
      const available = creditLimit - pendingValue;
      throw new Error(`Credit limit exceeded. Available credit: ₹${available > 0 ? available.toLocaleString() : 0}. Required: ₹${finalAmount.toLocaleString()}`);
    }

    // Use provided date or fallback to today
    const orderDate =
      date || new Date().toISOString().split("T")[0];

    const orderNumber = await generateNextOrderNumber();

    const order = new Order({
      orderNumber,
      distributorId,
      distributorName: distrName,
      date: orderDate,
      status: "BOOKED",
      items,
      totalAmount,
      totalCartons,
      totalPairs,
      discountPercentage,
      discountAmount,
      finalAmount,
    });

    const savedOrder = await order.save();
    return savedOrder;
  } catch (error) {
    throw new Error(`Failed to create order: ${error.message}`);
  }
};

const normalizePage = (page) => Math.max(parseInt(page, 10) || 1, 1);
const normalizeLimit = (limit) => Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);

const getOrdersByDistributor = async (distributorId, { page = 1, limit = 10, search = "", status = "" } = {}) => {
  try {
    const p = normalizePage(page);
    const l = normalizeLimit(limit);
    const skip = (p - 1) * l;

    const q = { distributorId };
    if (status) q.status = status;
    if (search) {
      const cleanSearch = search.startsWith('#') ? search.slice(1) : search;
      q.$or = [
        { orderNumber: { $regex: cleanSearch, $options: "i" } },
        { distributorName: { $regex: cleanSearch, $options: "i" } },
      ];
    }

    const [items, total, allStats] = await Promise.all([
      Order.find(q).sort({ createdAt: -1 }).skip(skip).limit(l).lean(),
      Order.countDocuments(q),
      Order.aggregate([
        { $match: q },
        {
          $group: {
            _id: null,
            totalSpent: { $sum: "$totalAmount" },
            activeOrders: {
              $sum: { $cond: [{ $ne: ["$status", "DELIVERED"] }, 1, 0] },
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
    throw new Error(`Failed to fetch orders: ${error.message}`);
  }
};

const getAllOrders = async ({ page = 1, limit = 10, search = "", status = "" } = {}) => {
  try {
    const p = normalizePage(page);
    const l = normalizeLimit(limit);
    const skip = (p - 1) * l;

    const q = {};
    if (status) q.status = status;
    if (search) {
      const cleanSearch = search.startsWith('#') ? search.slice(1) : search;
      q.$or = [
        { orderNumber: { $regex: cleanSearch, $options: "i" } },
        { distributorName: { $regex: cleanSearch, $options: "i" } },
      ];
    }

    const [items, total, allStats] = await Promise.all([
      Order.find(q).sort({ createdAt: -1 }).skip(skip).limit(l).lean(),
      Order.countDocuments(q),
      Order.aggregate([
        { $match: q },
        {
          $group: {
            _id: null,
            totalSpent: { $sum: "$totalAmount" },
            activeOrders: {
              $sum: { $cond: [{ $ne: ["$status", "DELIVERED"] }, 1, 0] },
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

const updateOrderStatus = async (orderId, status) => {
  try {
    const validStatuses = [
      "BOOKED",
      "PENDING",
      "READY_FOR_DISPATCH",
      "DISPATCHED",
      "DELIVERED",
    ];

    if (!validStatuses.includes(status)) {
      throw new Error("Invalid status");
    }

    const order = await Order.findByIdAndUpdate(
      orderId,
      { $set: { status } },
      { returnDocument: 'after' }
    );

    if (!order) {
      throw new Error("Order not found");
    }

    return order;
  } catch (error) {
    throw new Error(`Failed to update order status: ${error.message}`);
  }
};

module.exports = {
  createOrder,
  getOrdersByDistributor,
  getAllOrders,
  updateOrderStatus,
};
