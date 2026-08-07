const OrderService = require("../services/order.service");
const Order = require("../models/Order");
const { emitOrderUpdate, emitReturnCreated } = require("../socket");
const activityLog = require("../services/activityLog.service");

const { deleteOrder, editOrder, getPreOrders, propagatePriceUpdate } = require("../services/order.service");

const createOrder = async (req, res) => {
  try {
    const distributorId = req.user.id; // Extracted from JWT middleware
    const orderData = req.body;

    const order = await OrderService.createOrder(distributorId, orderData);
    
    emitOrderUpdate(order);

    activityLog.createLog({
      action: "ORDER_CREATED",
      entityType: "ORDER",
      entityId: String(order._id),
      description: `Order #${order.orderNumber || order._id} placed by ${req.user?.name || "distributor"}`,
      metadata: { status: order.status, totalAmount: order.totalAmount },
      user: req.user,
    });

    res.status(201).json({
      success: true,
      message: "Order created successfully",
      data: order,
    });
  } catch (error) {
    console.error("Error creating order:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to create order",
    });
  }
};

const getDistributorOrders = async (req, res) => {
  try {
    const distributorId = req.user.id; // Extracted from JWT
    const { page, limit, q, status, startDate, endDate, sortBy, sortDesc, orderType } = req.query;
    const result = await OrderService.getOrdersByDistributor(distributorId, { page, limit, search: q, status, startDate, endDate, sortBy, sortDesc, orderType });

    res.status(200).json({
      success: true,
      message: "Orders fetched successfully",
      data: result.items,
      meta: result.meta,
    });
  } catch (error) {
    console.error("Error fetching distributor orders:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch orders",
    });
  }
};

const getAllOrders = async (req, res) => {
  try {
    const { page, limit, q, status, startDate, endDate, sortBy, sortDesc } = req.query;
    const result = await OrderService.getAllOrders({ page, limit, search: q, status, startDate, endDate, sortBy, sortDesc });

    res.status(200).json({
      success: true,
      message: "All orders fetched successfully",
      data: result.items,
      meta: result.meta,
    });
  } catch (error) {
    console.error("Error fetching all orders:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch orders",
    });
  }
};

const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, receiverName, receiverMobile, deliveryAgentName, deliveryAgentMobile, deliveryNote,
          expectedDispatchDate, bookingPriority, adminNote, stockStatus,
          vehicleNo, lrNo, transporterName, eWayBillNo, driverName, driverMobile, grossWeightKg, outScannedCartons, itemDispatchCounts } = req.body;

    const docs = {};
    if (req.files) {
      if (req.files.invoice) docs.invoiceUrl = `/uploads/bills/${req.files.invoice[0].filename}`;
      if (req.files.ewayBill) docs.ewayBillUrl = `/uploads/bills/${req.files.ewayBill[0].filename}`;
      if (req.files.transportBill) docs.transportBillUrl = `/uploads/bills/${req.files.transportBill[0].filename}`;
      if (req.files.receivingNote) docs.receivingNoteUrl = `/uploads/bills/${req.files.receivingNote[0].filename}`;
      if (req.files.bill) docs.billUrl = `/uploads/bills/${req.files.bill[0].filename}`;
    }

    const updatedOrder = await OrderService.updateOrderStatus(id, status, {
      ...docs,
      receiverName,
      receiverMobile,
      deliveryAgentName,
      deliveryAgentMobile,
      deliveryNote,
      expectedDispatchDate: expectedDispatchDate || null,
      bookingPriority: bookingPriority || null,
      adminNote: adminNote !== undefined ? adminNote : null,
      stockStatus: stockStatus || null,
      vehicleNo: vehicleNo || null,
      lrNo: lrNo || null,
      transporterName: transporterName || null,
      eWayBillNo: eWayBillNo || null,
      driverName: driverName || null,
      driverMobile: driverMobile || null,
      grossWeightKg: grossWeightKg ? Number(grossWeightKg) : null,
      outScannedCartons: outScannedCartons ? JSON.parse(outScannedCartons) : null,
      itemDispatchCounts: itemDispatchCounts ? JSON.parse(itemDispatchCounts) : null,
    });

    emitOrderUpdate(updatedOrder);

    activityLog.createLog({
      action: "ORDER_STATUS_UPDATED",
      entityType: "ORDER",
      entityId: String(id),
      description: `Order #${updatedOrder.orderNumber || id} status updated to ${status} by ${req.user?.name || "admin"}`,
      metadata: { newStatus: status },
      user: req.user,
    });

    res.status(200).json({
      success: true,
      message: "Order status updated successfully",
      data: updatedOrder,
    });
  } catch (error) {
    console.error("Error updating order status:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to update order status",
    });
  }
};

const processReturn = async (req, res) => {
  try {
    const { orderId, items, reason, batchNumber } = req.body;

    if (!orderId || !items || !Array.isArray(items)) {
      return res.status(400).json({
        success: false,
        message: "Order ID and an array of items are required",
      });
    }

    const returnDoc = await OrderService.processReturn(orderId, { items, reason, batchNumber });

    // Real-time: notify all clients about the new return
    emitReturnCreated(returnDoc);

    // Also emit updated order status
    const updatedOrder = await Order.findById(orderId).populate('distributorId');
    if (updatedOrder) {
      emitOrderUpdate(updatedOrder);
    }

    res.status(200).json({
      success: true,
      message: "Return processed successfully",
      data: returnDoc,
    });
  } catch (error) {
    console.error("Error processing return:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to process return",
    });
  }
};

const getReturnHistory = async (req, res) => {
  try {
    const { page, limit, q } = req.query;
    const result = await OrderService.getReturnHistory({
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 10,
      search: q
    });

    res.status(200).json({
      success: true,
      message: "Return history fetched successfully",
      data: result.items,
      meta: result.meta
    });
  } catch (error) {
    console.error("Error fetching return history:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch return history",
    });
  }
};

const getOverdueOrders = async (req, res) => {
  try {
    const Distributor = require("../models/Distributor");
    const User = require("../models/User");
    const isDistributor = req.user.role === "distributor";

    const query = {
      status: { $in: ["RECEIVED", "PARTIAL"] },
      paymentStatus: { $ne: "PAID" },
    };
    if (isDistributor) query.distributorId = req.user.id;

    const orders = await Order.find(query)
      .sort({ deliveredAt: 1, createdAt: 1 })
      .lean();

    if (!orders.length) {
      return res.json({ success: true, data: [], total: 0 });
    }

    // Resolve paymentTerms: Order.distributorId → User → Distributor.paymentTerms
    const uniqueUserIds = [...new Set(orders.map(o => String(o.distributorId)))];
    const users = await User.find({ _id: { $in: uniqueUserIds } }).select("distributorId").lean();
    const userToDistMap = {};
    users.forEach(u => { userToDistMap[String(u._id)] = u.distributorId ? String(u.distributorId) : null; });

    const distIds = Object.values(userToDistMap).filter(Boolean);
    const distributors = await Distributor.find({ _id: { $in: distIds } }).select("paymentTerms").lean();
    const distMap = {};
    distributors.forEach(d => { distMap[String(d._id)] = d; });

    const parsePaymentDays = (terms) => {
      if (!terms) return 30;
      const match = String(terms).match(/\d+/);
      return match ? parseInt(match[0], 10) : 30;
    };

    const now = Date.now();
    const result = orders.map(o => {
      const base = o.deliveredAt ? new Date(o.deliveredAt) : new Date(o.date || o.createdAt);
      const daysSince = Math.floor((now - base.getTime()) / (1000 * 60 * 60 * 24));

      const distId = userToDistMap[String(o.distributorId)];
      const dist = distId ? distMap[distId] : null;
      const paymentTerms = dist?.paymentTerms || "30 days";
      const paymentDays = parsePaymentDays(paymentTerms);
      const daysOverdue = daysSince - paymentDays;

      if (daysOverdue <= 0) return null;

      const urgency = daysOverdue > 30 ? "RED" : "YELLOW";
      return { ...o, daysSinceDelivery: daysSince, daysOverdue, paymentTerms, paymentDays, urgency };
    }).filter(Boolean);

    res.json({ success: true, data: result, total: result.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const markOrderPaid = async (req, res) => {
  try {
    const { id } = req.params;
    const { note } = req.body;
    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });
    order.paymentStatus = "PAID";
    order.paidAt = new Date();
    order.paidBy = req.user?.name || "admin";
    order.paymentNote = note || "";
    await order.save();

    activityLog.createLog({
      action: "PAYMENT_RECEIVED",
      entityType: "ORDER",
      entityId: String(id),
      description: `Payment received for order #${order.orderNumber} (${order.distributorName})${note ? ` — ${note}` : ""}`,
      metadata: { orderId: String(id), orderNumber: order.orderNumber, paidAt: order.paidAt },
      user: req.user,
    });

    emitOrderUpdate(order);
    res.json({ success: true, data: order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getOrderByIdCtrl = async (req, res) => {
  try {
    const { id } = req.params;
    const order = await Order.findById(id).populate("distributorId").lean();
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });

    // Distributors can only fetch their own orders
    if (req.user.role === "distributor") {
      const ownerId = String(order.distributorId?._id || order.distributorId);
      if (ownerId !== String(req.user.id)) {
        return res.status(403).json({ success: false, message: "Access denied" });
      }
    }

    res.json({ success: true, data: order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteOrderCtrl = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await deleteOrder(id, req.user.id, req.user.role);

    activityLog.createLog({
      action: "ORDER_DELETED",
      entityType: "ORDER",
      entityId: String(id),
      description: `Order #${deleted.orderNumber} deleted by ${req.user.name || req.user.role}`,
      metadata: { status: deleted.status, orderType: deleted.orderType },
      user: req.user,
    });

    res.json({ success: true, message: "Order deleted" });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const editOrderCtrl = async (req, res) => {
  try {
    const { id } = req.params;
    const { items } = req.body;
    const updated = await editOrder(id, req.user.id, req.user.role, { items });

    emitOrderUpdate(updated);

    activityLog.createLog({
      action: "ORDER_EDITED",
      entityType: "ORDER",
      entityId: String(id),
      description: `Order #${updated.orderNumber} edited by ${req.user.name || req.user.role}`,
      metadata: { totalAmount: updated.totalAmount, itemCount: updated.items.length },
      user: req.user,
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const getPreOrdersCtrl = async (req, res) => {
  try {
    const { page, limit, q, status } = req.query;
    const result = await getPreOrders({
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      search: q || "",
      status: status || "",
    });
    res.json({ success: true, data: result.items, meta: result.meta });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const releasePreOrderCtrl = async (req, res) => {
  try {
    const { id } = req.params;
    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });
    if (order.orderType !== "PREORDER") return res.status(400).json({ success: false, message: "Not a pre-order" });
    if (!["PRE_BOOKED", "CONFIRMED"].includes(order.status)) {
      return res.status(400).json({ success: false, message: "Can only release PRE_BOOKED or CONFIRMED pre-orders" });
    }

    // Convert to regular order pipeline
    order.orderType = "REGULAR";
    order.status    = "PENDING";
    await order.save();

    emitOrderUpdate(order);
    activityLog.createLog({
      action: "PREORDER_RELEASED",
      entityType: "ORDER",
      entityId: String(id),
      description: `Pre-order #${order.orderNumber} released to regular pipeline by ${req.user.name}`,
      user: req.user,
    });

    res.json({ success: true, data: order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getOrderStatsCtrl = async (req, res) => {
  try {
    const stats = await OrderService.getOrderStats();
    res.status(200).json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getDashboardMetricsCtrl = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const data = await OrderService.getDashboardMetrics({ startDate, endDate });
    res.status(200).json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  createOrder,
  getDistributorOrders,
  getAllOrders,
  getOrderByIdCtrl,
  updateOrderStatus,
  processReturn,
  getReturnHistory,
  getOverdueOrders,
  markOrderPaid,
  deleteOrderCtrl,
  editOrderCtrl,
  getPreOrdersCtrl,
  releasePreOrderCtrl,
  getOrderStatsCtrl,
  getDashboardMetricsCtrl,
};
