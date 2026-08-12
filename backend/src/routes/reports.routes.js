const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const { getStockReport, getDispatchReport, getReturnReport } = require("../controllers/reports.controller");

router.use(auth);
router.use(role(["admin", "superadmin", "accountant"]));

router.get("/stock",    getStockReport);
router.get("/dispatch", getDispatchReport);
router.get("/return",   getReturnReport);

module.exports = router;
