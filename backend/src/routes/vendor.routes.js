const router = require("express").Router();
const ctrl = require("../controllers/vendorController");

router.post("/", ctrl.createVendor);
router.get("/", ctrl.getVendorList);
router.get("/:id", ctrl.getVendorById);
router.put("/:id", ctrl.updateVendor);

// ✅ active / inactive toggle
router.patch("/:id/toggle-status", ctrl.toggleVendorStatus);

router.delete("/:id", ctrl.deleteVendor);

module.exports = router;