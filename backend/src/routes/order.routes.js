const express = require("express");
const router = express.Router();
const OrderController = require("../controllers/order.controller");
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const { billUpload } = require("../middlewares/billUpload");

// All order routes require authentication
router.use(auth);

// Distributor routes
router.post("/", role(["distributor"]), OrderController.createOrder);
router.get("/my-orders", role(["distributor"]), OrderController.getDistributorOrders);

// Admin routes
router.get("/stats", role(["admin", "superadmin"]), OrderController.getOrderStatsCtrl);
router.get("/dashboard-metrics", role(["admin", "superadmin"]), OrderController.getDashboardMetricsCtrl);
router.get("/", role(["admin", "superadmin"]), OrderController.getAllOrders);

// Status update — admin can set any status, distributor can mark as RECEIVED with bill
router.patch(
  "/:id/status",
  role(["admin", "superadmin", "distributor"]),
  billUpload.fields([
    { name: "invoice", maxCount: 1 },
    { name: "ewayBill", maxCount: 1 },
    { name: "transportBill", maxCount: 1 },
    { name: "receivingNote", maxCount: 1 },
    { name: "bill", maxCount: 1 }, // backward compatibility
  ]),
  OrderController.updateOrderStatus
);

router.post(
  "/return",
  role(["admin", "superadmin"]),
  OrderController.processReturn
);

router.get(
  "/returns",
  role(["admin", "superadmin"]),
  OrderController.getReturnHistory
);

// Payment
router.get("/overdue", role(["admin", "superadmin", "distributor"]), OrderController.getOverdueOrders);
router.patch("/:id/mark-paid", role(["admin", "superadmin"]), OrderController.markOrderPaid);

// Pre-orders (admin)
router.get("/pre-orders", role(["admin", "superadmin", "manager", "supervisor", "accountant"]), OrderController.getPreOrdersCtrl);
router.patch("/:id/release", role(["admin", "superadmin"]), OrderController.releasePreOrderCtrl);

// Single order fetch (admin sees any, distributor sees own only)
router.get("/:id", role(["admin", "superadmin", "distributor", "manager", "supervisor", "accountant"]), OrderController.getOrderByIdCtrl);

// Edit / Delete (distributor own orders, or admin)
router.patch("/:id/edit", role(["distributor", "admin", "superadmin"]), OrderController.editOrderCtrl);
router.delete("/:id", role(["distributor", "admin", "superadmin"]), OrderController.deleteOrderCtrl);

module.exports = router;
