const router = require("express").Router();
const { upload } = require("../middlewares/upload");
const ctrl = require("../controllers/masterCatalogController");

const catalogUpload = upload.fields([
  { name: "primaryImage", maxCount: 1 },
  { name: "secondaryImages", maxCount: 10 },
]);

// ✅ JSON requests me multer run nahi hoga
const maybeUpload = (req, res, next) => {
  const ct = req.headers["content-type"] || "";
  if (ct.includes("multipart/form-data")) return catalogUpload(req, res, next);
  return next();
};

router.post("/", maybeUpload, ctrl.createMasterCatalog);
router.get("/", ctrl.getMasterCatalogList);
router.get("/:id", ctrl.getMasterCatalogById);
router.put("/:id", maybeUpload, ctrl.updateMasterCatalog);
router.delete("/:id", ctrl.deleteMasterCatalog);

module.exports = router;