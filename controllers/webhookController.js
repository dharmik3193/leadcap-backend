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

                        // 2. Fetch Form Name from Meta API

                        let formName = 'Unknown Form';
                        try {
                            // Pro-Tip: Using v20.0 or higher ensures long-term API compliance
                            const formRes = await fetch(`https://graph.facebook.com/v20.0/${formId}?fields=name&access_token=${pageAccessToken}`);
                            const formData = await formRes.json();

                            console.log("=> Meta Form API Raw Response:", formData); // Yeh debug log open rakhein!

                            if (formData && formData.name) {
                                formName = formData.name;
                            } else if (formData && formData.error) {
                                console.error(`=> Meta Graph API Refused Form Name Access: ${formData.error.message} (Code: ${formData.error.code})`);
                            }
                        } catch (e) {
                            console.error("=> Network/Fetch Error fetching Form Name:", e.bind);
                        }

                        // let formName = 'Unknown Form';
                        // try {
                        //     const formRes = await fetch(`https://graph.facebook.com/v18.0/${formId}?fields=name&access_token=${pageAccessToken}`);
                        //     const formData = await formRes.json();
                        //     if (formData.name) formName = formData.name;
                        // } catch (e) { console.error("Error fetching Form Name:", e); }

                        // 3. Fetch Full Lead Details
                        const graphApiUrl = `https://graph.facebook.com/v18.0/${metaLeadId}?access_token=${pageAccessToken}`;
                        const response = await fetch(graphApiUrl);
                        const metaLeadDetails = await response.json();

                        if (metaLeadDetails.error) {
                            console.error("Meta API details fetch error:", metaLeadDetails.error);
                            continue;
                        }

                        // 4. Extract Default and Custom Fields
                        let name = 'Meta Lead';
                        let email = '';
                        let phone = '';
                        let customFields = {};

                        if (metaLeadDetails.field_data) {
                            metaLeadDetails.field_data.forEach(field => {
                                const fieldName = field.name;
                                const fieldValue = field.values ? field.values[0] : '';

                                if (fieldName === 'full_name' || fieldName === 'name') name = fieldValue;
                                else if (fieldName === 'email') email = fieldValue;
                                else if (fieldName === 'phone_number' || fieldName === 'phone') phone = fieldValue;
                                else {
                                    customFields[fieldName] = fieldValue;
                                }
                            });
                        }

                        // 5. Save/Sync into DB - Dynamic query safely structured without tracking trailing semicolon
                        const customFieldsString = JSON.stringify(customFields);
                        const insertQuery = `
                            INSERT INTO meta_leads (company_id, form_name, lead_name, lead_email, lead_phone, custom_fields_json, meta_lead_id)
                            VALUES (?, ?, ?, ?, ?, ?, ?)
                            ON DUPLICATE KEY UPDATE 
                                form_name = VALUES(form_name), 
                                lead_name = VALUES(lead_name),
                                lead_email = VALUES(lead_email),
                                lead_phone = VALUES(lead_phone),
                                custom_fields_json = VALUES(custom_fields_json)
                        `;

                        // 1. Get a dedicated connection from the pool to enforce execution
                        const connection = await db.getConnection();

                        try {
                            // 2. Begin explicit transaction stream
                            await connection.beginTransaction();

                            const [result] = await connection.query(insertQuery, [
                                companyId,
                                formName,
                                name,
                                email,
                                phone,
                                customFieldsString,
                                metaLeadId
                            ]);

                            // 3. FORCE COMMIT: This pushes the data directly from buffer storage to tables permanently
                            await connection.commit();

                            console.log(`=> DB Explicitly Committed. Affected Rows: ${result.affectedRows} | Lead ID: ${metaLeadId}`);

                        } catch (dbError) {
                            // Rollback if something goes out of sync
                            await connection.rollback();
                            console.error("Database Transaction Error, rolling back:", dbError.message);
                        } finally {
                            // Release the block connection back to pool safely
                            connection.release();
                        }
                    }
                }
            }
        }
    } catch (error) {
        console.error("Error processing Meta Webhook:", error.message);
    }
};