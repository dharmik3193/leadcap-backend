const axios = require("axios");

/**
 * GET /webhook
 * Facebook uses this once to verify your webhook.
 */
exports.verifyWebhook = (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (
        mode === "subscribe" &&
        token === process.env.FB_VERIFY_TOKEN
    ) {
        console.log("✅ Facebook Webhook Verified");
        return res.status(200).send(challenge);
    }

    return res.sendStatus(403);
};

/**
 * POST /webhook
 * Facebook sends every new lead here.
 */
exports.receiveWebhook = async (req, res) => {

    try {

        console.log("📩 New Webhook");

        console.log(
            JSON.stringify(req.body, null, 2)
        );

        res.sendStatus(200);

    } catch (err) {

        console.log(err.message);

        res.sendStatus(500);

    }

};