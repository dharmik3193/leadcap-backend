const db = require('../config/db');

// =======================================================
// 1. WEBHOOK VERIFICATION (Meta App Setup Ke Waqt Kaam Aayega)
// =======================================================
exports.verifyWebhook = async (req, res) => {
    const { companyId } = req.params;
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    try {
        // DB se us company ka actual verify_token nikalein jo admin ne set kiya tha
        const [config] = await db.query('SELECT verify_token FROM meta_configs WHERE company_id = ?', [companyId]);

        if (config.length > 0 && mode === 'subscribe' && token === config[0].verify_token) {
            console.log(`=> Webhook Verified for Company ID: ${companyId}`);
            return res.status(200).send(challenge);
        } else {
            return res.status(403).json({ message: 'Verification failed. Token mismatch.' });
        }
    } catch (error) {
        return res.status(500).send(error.message);
    }
};


// =======================================================
// 2. RECEIVE LIVE META LEADS (POST Request From Meta)
// =======================================================
exports.receiveMetaLead = async (req, res) => {
    const { companyId } = req.params;
    const body = req.body;

    res.status(200).send('EVENT_RECEIVED'); // Immediate response to Meta

    try {
        if (body.object === 'page') {
            for (const entry of body.entry) {
                for (const change of entry.changes) {
                    if (change.field === 'leadgen') {
                        const leadgenData = change.value;
                        const metaLeadId = leadgenData.leadgen_id;
                        const formId = leadgenData.form_id;

                        // 1. Fetch Company's Access Token
                        const [config] = await db.query('SELECT page_access_token FROM meta_configs WHERE company_id = ?', [companyId]);
                        if (config.length === 0) continue;
                        const pageAccessToken = config[0].page_access_token;

                        // 2. Fetch Form Name from Meta API paraleloneously
                        let formName = 'Unknown Form';
                        try {
                            const formRes = await fetch(`https://graph.facebook.com/v18.0/${formId}?fields=name&access_token=${pageAccessToken}`);
                            const formData = await formRes.json();
                            if (formData.name) formName = formData.name;
                        } catch (e) { console.error("Error fetching Form Name:", e); }

                        // 3. Fetch Full Lead Details
                        const graphApiUrl = `https://graph.facebook.com/v18.0/${metaLeadId}?access_token=${pageAccessToken}`;
                        const response = await fetch(graphApiUrl);
                        const metaLeadDetails = await response.json();

                        if (metaLeadDetails.error) continue;

                        // 4. Extract Default and Custom Fields
                        let name = 'Meta Lead';
                        let email = '';
                        let phone = '';
                        let customFields = {}; // K-V pairs map karne ke liye

                        if (metaLeadDetails.field_data) {
                            metaLeadDetails.field_data.forEach(field => {
                                const fieldName = field.name;
                                const fieldValue = field.values ? field.values[0] : '';

                                if (fieldName === 'full_name' || fieldName === 'name') name = fieldValue;
                                else if (fieldName === 'email') email = fieldValue;
                                else if (fieldName === 'phone_number' || fieldName === 'phone') phone = fieldValue;
                                else {
                                    // Baki saare dynamic questions custom fields json object me jayenge
                                    customFields[fieldName] = fieldValue;
                                }
                            });
                        }

                        // 5. Save/Sync into DB with Form Name & JSON payload
                        const insertQuery = `
                            INSERT INTO meta_leads (company_id, form_name, lead_name, lead_email, lead_phone, custom_fields_json, meta_lead_id)
                            VALUES (?, ?, ?, ?, ?, ?, ?)
                            ON DUPLICATE KEY UPDATE form_name=VALUES(form_name), custom_fields_json=VALUES(custom_fields_json);
                        `;
                        
                        await db.query(insertQuery, [
                            companyId, 
                            formName, 
                            name, 
                            email, 
                            phone, 
                            JSON.stringify(customFields), 
                            metaLeadId
                        ]);
                        console.log(`=> Lead Synced with custom data for Form [${formName}]`);
                    }
                }
            }
        }
    } catch (error) {
        console.error("Error processing Meta Webhook:", error.message);
    }
};