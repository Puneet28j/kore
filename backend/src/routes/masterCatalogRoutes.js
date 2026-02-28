const router = require("express").Router();
const { upload } = require("../middleware/upload");
const ctrl = require("../controllers/masterCatalogController");

// multipart support
const catalogUpload = upload.fields([
  { name: "primaryImage", maxCount: 1 },
  { name: "secondaryImages", maxCount: 10 },
]);

router.post("/", catalogUpload, ctrl.createMasterCatalog);
router.get("/", ctrl.getMasterCatalogList);
router.get("/:id", ctrl.getMasterCatalogById);
router.put("/:id", catalogUpload, ctrl.updateMasterCatalog);
router.delete("/:id", ctrl.deleteMasterCatalog);

module.exports = router;