require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');
const axios = require('axios');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const companyRoutes = require('./routes/companyRoutes');
const webhookRoutes = require('./routes/webhookRoutes');

const app = express();
app.use(express.json());
app.use(cors());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/auth', authRoutes);
app.use('/api/company', companyRoutes);
app.use('/api/webhook', webhookRoutes);
// Database Connection Pool
// const db = mysql.createPool({
//     host: process.env.DB_HOST,
//     user: process.env.DB_USER,
//     password: process.env.DB_PASSWORD,
//     database: process.env.DB_NAME,
//     waitForConnections: true,
//     connectionLimit: 10,
//     queueLimit: 0
// });

// Initialize Database Table
// Ensure database initialization errors don't kill the entire Node process
// async function initDb() {
//     try {
//         await db.query(`
//             CREATE TABLE IF NOT EXISTS leads (
//                 id INT AUTO_INCREMENT PRIMARY KEY,
//                 lead_id VARCHAR(100) UNIQUE,
//                 form_id VARCHAR(100),
//                 form_fields JSON,
//                 created_time VARCHAR(50),
//                 received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
//             )
//         `);
//         console.log("Database table 'leads' is ready.");
//     } catch (error) {
//         // CRITICAL: Log the error but DO NOT let the app crash. 
//         // This keeps Express alive to handle HTTP requests.
//         console.error("Database connection failed on startup, but server will stay alive:", error.message);
//     }
// }
// initDb();

// Helper function to query Meta API and save to SQL
// HELPER FUNCTION: Completely Dynamic Meta API Fetcher
// async function fetchAndSaveLead(leadId, formId, createdTime) {
//     try {
//         const url = `https://graph.facebook.com/v19.0/${leadId}?access_token=${process.env.META_PAGE_ACCESS_TOKEN}`;
//         const response = await axios.get(url);
//         const fieldData = response.data.field_data;

//         // Dynamic Key-Value Map to store ANY custom form field
//         let dynamicFields = {};

//         if (fieldData) {
//             fieldData.forEach(field => {
//                 // Example: field.name = "what_is_your_preferred_time", field.values[0] = "Evening"
//                 dynamicFields[field.name] = field.values[0];
//             });
//         }

//         // Convert the object into a JSON string for MySQL storage
//         const fieldsJsonString = JSON.stringify(dynamicFields);

//         // SQL updates: Inserts or updates the JSON payload dynamically
//         const sql = `INSERT INTO leads (lead_id, form_id, form_fields, created_time) 
//                      VALUES (?, ?, ?, ?) 
//                      ON DUPLICATE KEY UPDATE form_fields = VALUES(form_fields)`;

//         await db.query(sql, [leadId, formId, fieldsJsonString, createdTime]);
//         console.log(`Successfully saved dynamic lead ${leadId} to the database.`);

//     } catch (error) {
//         console.error(`Error processing lead ${leadId}:`, error.response ? error.response.data : error.message);
//     }
// }

// 1. META WEBHOOK VERIFICATION (GET Request)
// Meta calls this once when you set up the webhook to verify you own the URL
// app.get('/meta/:companyId', webhookController.verifyWebhook)
// app.get('/api/webhook', (req, res) => {
//     const mode = req.query['hub.mode'];
//     const token = req.query['hub.verify_token'];
//     const challenge = req.query['hub.challenge'];

//     if (mode && token) {
//         if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
//             console.log('Webhook verified successfully!');
//             return res.status(200).send(challenge);
//         } else {
//             return res.sendStatus(403);
//         }
//     }
// });

// 2. META WEBHOOK RECEIVER (POST Request)
// Meta sends real-time lead alerts here
// REPLACE your current app.post('/api/webhook') block with this safer version:
// app.post('/api/webhook', (req, res) => {
//     const body = req.body;

//     // 1. Tell Meta IMMEDIATELY that we got it (Fixes webhooks.delivery.rejected)
//     res.status(200).send('EVENT_RECEIVED');

//     // 2. Process the lead data asynchronously in the background
//     if (body.object === 'page') {
//         body.entry.forEach(entry => {
//             if (entry.changes) {
//                 entry.changes.forEach(async (change) => {
//                     if (change.field === 'leadgen') {
//                         const leadId = change.value.leadgen_id;
//                         const formId = change.value.form_id;
//                         const createdTime = change.value.created_time;

//                         console.log(`Processing Lead ID asynchronously: ${leadId}`);
//                         await fetchAndSaveLead(leadId, formId, createdTime).catch(err => {
//                             console.error("Background processing error:", err.message);
//                         });
//                     }
//                 });
//             }
//         });
//     }
// });



// 3. FRONTEND API ENDPOINT (GET Request)
// Use this endpoint to view/display leads on your custom frontend website
// REPLACE your current app.get('/api/leads') with this:
// app.get('/api/leads', async (req, res) => {
//     let connection;
//     try {
//         connection = await db.getConnection();
//         const [rows] = await connection.query('SELECT * FROM leads ORDER BY id DESC');
//         connection.release();

//         const formattedRows = rows.map(row => ({
//             ...row,
//             // अगर डेटाबेस JSON को स्ट्रिंग बनाकर दे रहा है, तो उसे यहीं ठीक कर लें
//             form_fields: typeof row.form_fields === 'string' ? JSON.parse(row.form_fields) : row.form_fields
//         }));

//         return res.status(200).json({
//             success: true,
//             count: formattedRows.length,
//             data: formattedRows
//         });
//     } catch (error) {
//         if (connection) connection.release();
//         return res.status(500).json({ success: false, error: error.message });
//     }
// });

// 🌟 NEW: Update Lead Status Endpoint
// app.post('/api/update-status', async (req, res) => {
//     const { lead_id, status } = req.body;
    
//     if (!lead_id || !status) {
//         return res.status(400).json({ success: false, error: "Missing lead_id or status" });
//     }

//     let connection;
//     try {
//         connection = await db.getConnection();
//         await connection.query('UPDATE leads SET status = ? WHERE lead_id = ?', [status, lead_id]);
//         connection.release();


//         let metaCustomStage = status; 
        
//         // फेसबुक CAPI के लिए पेलोड तैयार करें
//         const metaCapiPayload = {
//             data: [
//                 {
//                     event_name: "Lead", // फेसबुक लीड इवेंट ट्रैकिंग
//                     event_time: Math.floor(Date.now() / 1000),
//                     action_source: "system_generated",
//                     user_data: {
//                         // लीड आईडी भेजना सबसे जरूरी है ताकि फेसबुक मैच कर सके
//                         lead_id: lead_id 
//                     },
//                     custom_data: {
//                         lead_status: metaCustomStage, // 'Interested', 'Closed / Won' आदि
//                         crm_status: status
//                     }
//                 }
//             ]
//         };

//         // आपके उसी Permanent System User Token का इस्तेमाल करके फेसबुक को डेटा पोस्ट करना
//         const pixelId = process.env.META_PIXEL_ID; // आपके फेसबुक पिक्सेल या डेटासेट की ID
//         const metaToken = process.env.META_PAGE_ACCESS_TOKEN;

//         if (pixelId && metaToken) {
//             await axios.post(
//                 `https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${metaToken}`,
//                 metaCapiPayload
//             ).then(() => {
//                 console.log(`Meta CAPI: Successfully synced status '${status}' for lead ${lead_id}`);
//             }).catch(metaErr => {
//                 console.error("Meta CAPI Sync Error Details:", metaErr.response ? metaErr.response.data : metaErr.message);
//             });
//         }

//         return res.status(200).json({ success: true, message: "Status updated successfully" });
//     } catch (error) {
//         if (connection) connection.release();
//         return res.status(500).json({ success: false, error: error.message });
//     }
// });

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Backend server running on port ${PORT}`);
});