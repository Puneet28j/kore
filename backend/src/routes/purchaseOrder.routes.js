const router = require("express").Router();
const ctrl = require("../controllers/purchaseOrderController");
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");

router.use(auth);

// Bill routes
router.get("/bills",              role(["admin", "superadmin", "accountant", "manager", "supervisor"]), ctrl.listBills);
router.get("/bills/:id",          role(["admin", "superadmin", "accountant", "manager", "supervisor"]), ctrl.getBillById);
router.patch("/:id/bill/approve", role(["admin", "superadmin"]), ctrl.approveBill);
router.patch("/:id/bill/reject",  role(["admin", "superadmin"]), ctrl.rejectBill);

// PO routes
router.post("/",    role(["admin", "superadmin"]), ctrl.createPO);
router.get("/",     role(["admin", "superadmin", "accountant", "manager", "supervisor"]), ctrl.listPOs);
router.get("/:id",  role(["admin", "superadmin", "accountant", "manager", "supervisor"]), ctrl.getPOById);
router.put("/:id",  role(["admin", "superadmin"]), ctrl.updatePO);
router.delete("/:id", role(["admin", "superadmin"]), ctrl.deletePO);

module.exports = router;
