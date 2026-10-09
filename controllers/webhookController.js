const db = require("../config/db");
const meta = require("../services/metaService");
const leads = require("../services/leadService");

exports.verifyWebhook = async (req, res, next) => {
  try {
    const config = await meta.getConfig(req.params.companyId);
    if (config && req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === config.verify_token)
      return res.status(200).send(req.query["hub.challenge"]);
    res.status(403).json({ message: "Verification failed. Token mismatch." });
  } catch (e) { next(e); }
};

exports.receiveMetaLead = async (req, res) => {
  const companyId = req.params.companyId;
  res.status(200).send("EVENT_RECEIVED");
  try {
    if (req.body?.object !== "page") return;
    const config = await meta.getConfig(companyId);
    if (!config?.page_access_token) return;
    for (const entry of req.body.entry || []) for (const change of entry.changes || []) {
      if (change.field !== "leadgen") continue;
      const v = change.value || {}, metaLeadId = v.leadgen_id, formId = v.form_id;
      if (!metaLeadId || !formId) continue;
      const formName = await meta.getFormName(formId, config.page_access_token);
      const details = await meta.getLeadDetails(metaLeadId, config.page_access_token);
      let name = "Meta Lead", email = "", phone = ""; const custom = {};
      for (const field of details.field_data || []) {
        const value = field.values?.[0] || "";
        if (field.name === "full_name" || field.name === "name") name = value;
        else if (field.name === "email") email = value;
        else if (field.name === "phone_number" || field.name === "phone") phone = value;
        else custom[field.name] = value;
      }
      const [insertResult] = await db.query(
        `INSERT INTO meta_leads
   (company_id, form_id, form_name, lead_name, lead_email,
    lead_phone, custom_fields_json, meta_lead_id, status)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'unallocated')
   ON DUPLICATE KEY UPDATE
     form_id = VALUES(form_id),
     form_name = VALUES(form_name),
     lead_name = VALUES(lead_name),
     lead_email = VALUES(lead_email),
     lead_phone = VALUES(lead_phone),
     custom_fields_json = VALUES(custom_fields_json)`,
        [
          companyId,
          String(formId),
          formName,
          name,
          email,
          phone,
          JSON.stringify(custom),
          metaLeadId,
        ]
      );

      if (insertResult.affectedRows === 1 && insertResult.insertId) {
        try {
          await leads.autoAssignLead({
            leadId: insertResult.insertId,
            companyId,
            formId: String(formId),
          });
        } catch (assignmentError) {
          console.error(
            "Auto-assignment failed:",
            assignmentError.message
          );
        }
      }
    }
  } catch (e) { console.error("Meta webhook processing failed:", e); }
};
