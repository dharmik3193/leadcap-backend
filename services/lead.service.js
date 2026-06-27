const pool = require("../config/db");

/**
 * Check if lead already exists
 */
const leadExists = async (leadId) => {

    const [rows] = await pool.query(
        "SELECT id FROM leads WHERE lead_id = ? LIMIT 1",
        [leadId]
    );

    return rows.length > 0;
};

/**
 * Save Facebook Lead
 */
const saveLead = async (lead) => {

    // Prevent duplicate insert
    const exists = await leadExists(lead.lead_id);

    if (exists) {
        console.log(`⚠️ Lead already exists : ${lead.lead_id}`);

        return {
            success: true,
            duplicate: true
        };
    }

    const [result] = await pool.query(
        `
        INSERT INTO leads
        (
            lead_id,
            page_id,
            form_id,
            full_name,
            phone,
            email,
            city,
            state,
            country,
            company,
            job_title,
            custom_fields,
            raw_data,
            created_time
        )
        VALUES
        (
            ?,?,?,?,?,?,?,?,?,?,?,?,?,?
        )
        `,
        [
            lead.lead_id,
            lead.page_id,
            lead.form_id,
            lead.full_name,
            lead.phone,
            lead.email,
            lead.city,
            lead.state,
            lead.country,
            lead.company,
            lead.job_title,
            JSON.stringify(lead.custom_fields),
            lead.raw_data,
            lead.created_time
        ]
    );

    console.log("✅ Lead Saved :", result.insertId);

    return {
        success: true,
        duplicate: false,
        insertId: result.insertId
    };

};

module.exports = {
    saveLead,
    leadExists
};
