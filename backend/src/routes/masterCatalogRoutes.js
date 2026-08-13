const router = require("express").Router();
const { upload, compressImages } = require("../middlewares/upload");
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

router.post("/", maybeUpload, compressImages, ctrl.createMasterCatalog);
router.get("/", ctrl.getMasterCatalogList);
// Must be registered before /:id so "stock-totals" is not treated as an id
router.get("/stock-totals", ctrl.getStockTotals);
router.get("/booked-map", ctrl.getBookedMap);
// Stock aggregation — also before /:id
router.get("/variants/:variantId/stock", ctrl.getVariantStock);
router.post("/variants/:variantId/reset-stock", ctrl.resetVariantStock);
router.post("/variants/:variantId/stock-movement", ctrl.stockMovement);
router.get("/variants/:variantId/available-cartons", ctrl.getAvailableCartons);
router.get("/variants/:variantId/carton-counter", ctrl.getCartonCounter);
router.patch("/variants/:variantId/sku", ctrl.updateVariantSku);

router.get("/:id", ctrl.getMasterCatalogById);
router.put("/:id", maybeUpload, compressImages, ctrl.updateMasterCatalog);

router.patch("/:id/toggle-status", ctrl.toggleMasterCatalogStatus);
router.delete("/:id", ctrl.deleteMasterCatalog);

module.exports = router;