const express = require("express");

const router = express.Router();

const {
    verifyWebhook,
    receiveWebhook
} = require("../webhook/facebookWebhook");

router.get("/", verifyWebhook);

router.post("/", receiveWebhook);

module.exports = router;