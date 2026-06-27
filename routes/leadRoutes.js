const express = require("express");

const router = express.Router();

const {

    getAllLeads,

    getLeadById,

    updateStatus,

    updateNotes,

    deleteLead

} = require("../controllers/leadController");

router.get("/", getAllLeads);

router.get("/:id", getLeadById);

router.put("/:id/status", updateStatus);

router.put("/:id/notes", updateNotes);

router.delete("/:id", deleteLead);

module.exports = router;