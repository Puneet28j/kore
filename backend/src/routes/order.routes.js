const express = require("express");
const router = express.Router();
const OrderController = require("../controllers/order.controller");
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");

// All order routes require authentication
router.use(auth);

// Distributor routes
router.post("/", role(["distributor"]), OrderController.createOrder);
router.get("/my-orders", role(["distributor"]), OrderController.getDistributorOrders);

// Admin routes
router.get("/", role(["admin", "superadmin"]), OrderController.getAllOrders);
router.patch("/:id/status", role(["admin", "superadmin"]), OrderController.updateOrderStatus);

module.exports = router;
