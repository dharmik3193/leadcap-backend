const pool = require("../config/db");

/**
 * GET ALL LEADS
 */
const getAllLeads = async (req, res) => {
    try {

        const [rows] = await pool.query(`
            SELECT *
            FROM leads
            ORDER BY created_time DESC
        `);

        res.json({
            success: true,
            total: rows.length,
            data: rows
        });

    } catch (err) {

        res.status(500).json({
            success: false,
            message: err.message
        });

    }
};

/**
 * GET SINGLE LEAD
 */
const getLeadById = async (req, res) => {

    try {

        const { id } = req.params;

        const [rows] = await pool.query(
            "SELECT * FROM leads WHERE id=?",
            [id]
        );

        if (rows.length === 0) {

            return res.status(404).json({
                success: false,
                message: "Lead not found"
            });

        }

        res.json({
            success: true,
            data: rows[0]
        });

    } catch (err) {

        res.status(500).json({
            success: false,
            message: err.message
        });

    }

};

/**
 * UPDATE STATUS
 */
const updateStatus = async (req, res) => {

    try {

        const { id } = req.params;

        const { status } = req.body;

        await pool.query(
            "UPDATE leads SET lead_status=? WHERE id=?",
            [status, id]
        );

        res.json({
            success: true,
            message: "Status Updated"
        });

    } catch (err) {

        res.status(500).json({
            success: false,
            message: err.message
        });

    }

};

/**
 * UPDATE NOTES
 */
const updateNotes = async (req, res) => {

    try {

        const { id } = req.params;

        const { notes } = req.body;

        await pool.query(
            "UPDATE leads SET notes=? WHERE id=?",
            [notes, id]
        );

        res.json({
            success: true,
            message: "Notes Updated"
        });

    } catch (err) {

        res.status(500).json({
            success: false,
            message: err.message
        });

    }

};

/**
 * DELETE LEAD
 */
const deleteLead = async (req, res) => {

    try {

        const { id } = req.params;

        await pool.query(
            "DELETE FROM leads WHERE id=?",
            [id]
        );

        res.json({
            success: true,
            message: "Lead Deleted"
        });

    } catch (err) {

        res.status(500).json({
            success: false,
            message: err.message
        });

    }

};

module.exports = {
    getAllLeads,
    getLeadById,
    updateStatus,
    updateNotes,
    deleteLead
};