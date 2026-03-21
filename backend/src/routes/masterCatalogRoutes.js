const router = require("express").Router();
const { upload } = require("../middlewares/upload");
const ctrl = require("../controllers/masterCatalogController");

// ✅ dynamic fields allow:
// images_Red, images_Black, images_White ...
const catalogUpload = upload.any();

const maybeUpload = (req, res, next) => {
  const ct = req.headers["content-type"] || "";
  if (ct.includes("multipart/form-data")) {
    return catalogUpload(req, res, next);
  }
  return next();
};

router.post("/", maybeUpload, ctrl.createMasterCatalog);
router.get("/", ctrl.getMasterCatalogList);
router.get("/:id", ctrl.getMasterCatalogById);
router.put("/:id", maybeUpload, ctrl.updateMasterCatalog);

router.patch("/:id/toggle-status", ctrl.toggleMasterCatalogStatus);
router.delete("/:id", ctrl.deleteMasterCatalog);

// Stock aggregation
router.get("/variants/:variantId/stock", ctrl.getVariantStock);

module.exports = router;