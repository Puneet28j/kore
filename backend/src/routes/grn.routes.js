const express = require("express");
const router = express.Router();
const grn = require("../controllers/grn.controller");

// References (PO/CAT list)
router.get("/references", grn.listReferences);

// Draft GRN
router.post("/drafts", grn.createDraft);
router.get("/drafts/:draftId", grn.getDraft);

router.post("/drafts/:draftId/scan", grn.scanPair);
router.post("/drafts/:draftId/rescan-current", grn.rescanCurrent);
router.delete("/drafts/:draftId/cartons/:cartonBarcode", grn.removeCarton);

router.post("/drafts/:draftId/submit", grn.submitDraft);

// History + details
router.get("/history", grn.history);
router.get("/:grnId", grn.getGRNById);

module.exports = router;