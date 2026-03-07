const router = require("express").Router();
const ctrl = require("../controllers/purchaseOrderController");

router.get("/next-number", ctrl.getNextPONumber);

// ✅ bill routes
router.get("/bills", ctrl.listBills);
router.get("/bills/:id", ctrl.getBillById);
router.patch("/:id/bill/approve", ctrl.approveBill);
router.patch("/:id/bill/reject", ctrl.rejectBill);

// PO routes
router.post("/", ctrl.createPO);
router.get("/", ctrl.listPOs);
router.get("/:id", ctrl.getPOById);
router.put("/:id", ctrl.updatePO);
router.delete("/:id", ctrl.deletePO);

module.exports = router;