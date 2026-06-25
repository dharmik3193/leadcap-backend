const express = require("express");

const router = express.Router();

const {
    getAllLeads
} = require("../controllers/leadController");

router.get("/", getAllLeads);

module.exports = router;