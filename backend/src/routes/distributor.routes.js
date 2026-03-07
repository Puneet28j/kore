const router = require("express").Router();
const ctrl = require("../controllers/distributor.controller");

// add auth/role middleware here if needed
router.post("/", ctrl.createDistributor);
router.get("/", ctrl.listDistributors);
router.get("/:id", ctrl.getDistributorById);
router.put("/:id", ctrl.updateDistributor);
router.patch("/:id/toggle-status", ctrl.toggleDistributorStatus);
router.delete("/:id", ctrl.deleteDistributor);

module.exports = router;