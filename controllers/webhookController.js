const { getLeadById } = require("../services/facebook.service");
const mapLead = require("../utils/mapLead");
const { saveLead } = require("../services/lead.service");

/**
 * Verify Facebook Webhook
 */
const verifyWebhook = (req, res) => {
    try {

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

        console.log("❌ Facebook Webhook Verification Failed");

        return res.sendStatus(403);

    } catch (error) {

        console.error(error);

        return res.sendStatus(500);

    }
};

/**
 * Receive Facebook Lead Webhook
 */
const receiveWebhook = async (req, res) => {

    try {
        

        console.log("==================================");
        console.log("📥 FACEBOOK WEBHOOK RECEIVED");
        console.log("==================================");

        console.log(JSON.stringify(req.body, null, 2));

        const entries = req.body.entry || [];

        for (const entry of entries) {

            const changes = entry.changes || [];

            for (const change of changes) {

                if (change.field !== "leadgen") continue;

                const leadgenId = change.value.leadgen_id;
                const pageId = change.value.page_id;
                const formId = change.value.form_id;

                console.log("Lead ID :", leadgenId);

                // Fetch complete lead from Facebook
                const facebookLead = await getLeadById(leadgenId);

                console.log("✅ Lead fetched from Facebook");

                // Map Facebook field_data
                const lead = mapLead(facebookLead);

                // Additional Information
                lead.lead_id = facebookLead.id;
                lead.page_id = pageId;
                lead.form_id = formId;
                lead.created_time = facebookLead.created_time;

                // Save raw Facebook response
                lead.raw_data = JSON.stringify(facebookLead);

                // Save into MySQL
                const result = await saveLead(lead);

                if (result.duplicate) {

                    console.log("⚠️ Duplicate Lead Ignored");

                } else {

                    console.log("✅ Lead Saved Successfully");

                }

            }

        }

        return res.sendStatus(200);

    } catch (error) {

        console.log("==================================");
        console.log("❌ WEBHOOK ERROR");
        console.log("==================================");

        if (error.response) {

            console.error(error.response.data);

        } else {

            console.error(error.message);

        }

        return res.sendStatus(500);

    }

};

module.exports = {
    verifyWebhook,
    receiveWebhook
};