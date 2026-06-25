const pool = require("../config/db");

exports.getAllLeads = async (req, res) => {

    try {

        const [rows] = await pool.query(`
            SELECT *
            FROM leads
            ORDER BY synced_at DESC
        `);

        res.json({
            success: true,
            total: rows.length,
            data: rows
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

};