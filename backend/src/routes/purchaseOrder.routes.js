const router = require("express").Router();
const ctrl = require("../controllers/purchaseOrderController");

router.get("/next-number", ctrl.getNextPONumber);

router.post("/", ctrl.createPO);
router.get("/", ctrl.listPOs);
router.get("/:id", ctrl.getPOById);
router.put("/:id", ctrl.updatePO);
router.delete("/:id", ctrl.deletePO);

module.exports = router;