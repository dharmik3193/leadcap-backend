const db = require('../config/db');
const bcrypt = require('bcryptjs');



// =======================================================
// 1. MASTER ADMIN: Fetch All Companies with Manager Details
// =======================================================
exports.getCompaniesList = async (req, res) => {
    try {
        // SQL JOIN Query: Companies, unke Managers, aur Meta Configs ko ek sath laane ke liye
        const query = `
            SELECT 
                c.id, 
                c.company_name, 
                c.created_at,
                u.name AS manager_name,
                u.email AS manager_email,
                mc.pixel_id,
                c.status AS company_status,
                c.company_logo_url AS company_logo,
                c.created_at AS onboarded_at,
                mc.page_access_token,
                mc.verify_token
            FROM companies c
            LEFT JOIN users u ON c.id = u.company_id AND u.role = 'manager'
            LEFT JOIN meta_configs mc ON c.id = mc.company_id
            ORDER BY c.created_at DESC
        `;

        const [companies] = await db.query(query);
        console.log(companies);
        res.json(companies);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// =======================================================
// 2. MASTER ADMIN: Fetch Dashboard Metrics Summary
// =======================================================
exports.getMetricsSummary = async (req, res) => {
    try {
        // Run multiple counts parallelly for better performance
        const [companyCountRows] = await db.query('SELECT COUNT(*) AS total FROM companies');
        const [leadCountRows] = await db.query('SELECT COUNT(*) AS total FROM meta_leads');

        // Fetch last 5 onboarded companies for the dashboard preview table
        const queryRecent = `
            SELECT c.id, c.company_name, c.created_at,
            CASE WHEN mc.pixel_id IS NOT NULL THEN 'Active' ELSE 'Pending Config' END as status
            FROM companies c
            LEFT JOIN meta_configs mc ON c.id = mc.company_id
            ORDER BY c.created_at DESC LIMIT 5
        `;
        const [recentCompanies] = await db.query(queryRecent);

        res.json({
            companiesCount: companyCountRows[0].total,
            totalLeads: leadCountRows[0].total,
            recentCompanies: recentCompanies
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// =======================================================
// 3. MASTER ADMIN & MANAGER: Create Company & Manager (Existing Code)
// =======================================================
exports.createCompany = async (req, res) => {
    const { companyName, managerName, managerEmail, managerPassword } = req.body;
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const [companyResult] = await connection.query('INSERT INTO companies (company_name) VALUES (?)', [companyName]);
        const newCompanyId = companyResult.insertId;

        await connection.query('INSERT INTO meta_configs (company_id) VALUES (?)', [newCompanyId]);

        const passwordHash = await bcrypt.hash(managerPassword, 10);
        await connection.query(
            "INSERT INTO users (company_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, 'manager')",
            [newCompanyId, managerName, managerEmail, passwordHash]
        );

        await connection.commit();
        res.json({ message: `Company '${companyName}' successfully onboarded.` });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
};

// Master Admin creates a company and its manager
exports.createCompany = async (req, res) => {
    const { companyName, managerName, managerEmail, managerPassword } = req.body;
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const [companyResult] = await connection.query('INSERT INTO companies (company_name) VALUES (?)', [companyName]);
        const newCompanyId = companyResult.insertId;

        await connection.query('INSERT INTO meta_configs (company_id) VALUES (?)', [newCompanyId]);

        const passwordHash = await bcrypt.hash(managerPassword, 10);
        await connection.query(
            "INSERT INTO users (company_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, 'manager')",
            [newCompanyId, managerName, managerEmail, passwordHash]
        );

        await connection.commit();
        res.json({ message: `Company '${companyName}' successfully onboarding with its Manager.` });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
};

// Manager creates employees
exports.createEmployee = async (req, res) => {
    const { name, email, password } = req.body;
    const companyId = req.user.company_id;
    try {
        const passwordHash = await bcrypt.hash(password, 10);
        await db.query(
            "INSERT INTO users (company_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, 'employee')",
            [companyId, name, email, passwordHash]
        );
        res.json({ message: `Employee '${name}' successfully added.` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.getMetaConfig = async (req, res) => {
    // Agar login karne wala admin hai toh query params se companyId aayegi, agar manager hai toh uske session/JWT se aayegi
    const companyId = req.user.role === 'admin' ? req.query.companyId : req.user.company_id;
    console.log(req.query);


    if (!companyId) return res.status(400).json({ message: 'Company ID missing' });

    try {
        const [rows] = await db.query(
            'SELECT page_access_token, pixel_id, verify_token FROM meta_configs WHERE company_id = ?',
            [companyId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Meta configuration not found for this company.' });
        }

        res.json(rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};


exports.updateMetaConfig = async (req, res) => {
    const companyId = req.user.role === 'admin' ? req.body.companyId : req.user.company_id;
    const { pageAccessToken, pixelId, verifyToken } = req.body;

    if (!companyId) return res.status(400).json({ message: 'Company ID missing' });

    try {
        // ON DUPLICATE KEY UPDATE use kar rahe hain taaki agar row na ho toh INSERT ho jaye, nahi toh UPDATE ho jaye
        const query = `
            INSERT INTO meta_configs (company_id, page_access_token, pixel_id, verify_token)
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE 
                page_access_token = VALUES(page_access_token),
                pixel_id = VALUES(pixel_id),
                verify_token = VALUES(verify_token)
        `;

        await db.query(query, [companyId, pageAccessToken, pixelId, verifyToken]);
        res.json({ message: 'Meta configurations successfully updated!' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};


exports.getManagerDashboardData = async (req, res) => {
    const companyId = req.user.company_id; // Token metadata extraction

    try {
        // 1. Fetch all users belonging to this specific company having role 'employee'
        const [employees] = await db.query(
            "SELECT id, name, email, role,status, created_at FROM users WHERE company_id = ? AND role = 'employee'",
            [companyId]
        );

        // 2. Fetch aggregate sum of incoming target leads allocated to this tenant
        const [leadCountRows] = await db.query(
            "SELECT COUNT(*) AS total FROM meta_leads WHERE company_id = ?",
            [companyId]
        );

        res.json({
            employees: employees,
            totalLeads: leadCountRows[0].total
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};



// =======================================================
// 1. MASTER ADMIN ACTION: Toggle Company Status
// =======================================================
exports.toggleCompanyStatus = async (req, res) => {
    const { companyId, status } = req.body; // status: 'active' ya 'suspended'
    try {
        await db.query('UPDATE companies SET status = ? WHERE id = ?', [status, companyId]);
        res.json({ message: `Company environment status updated to ${status} successfully.` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// =======================================================
// 2. COMPANY MANAGER ACTION: Toggle Internal Employee Status
// =======================================================
exports.toggleEmployeeStatus = async (req, res) => {
    const { employeeId, status } = req.body;
    const companyId = req.user.company_id; // Manager's company environment isolation

    try {
        // Enforce boundary logic security wrapper
        await db.query('UPDATE users SET status = ? WHERE id = ? AND company_id = ?', [status, employeeId, companyId]);
        res.json({ message: `Employee workspace operational capability updated to ${status}.` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};


exports.getCompanyPipelines = async (req, res) => {
    const companyId = req.user.company_id;

    try {
        // Query to fetch all leads along with assigned agent's name (if any)
        const query = `
            SELECT 
                l.id, 
                l.lead_name, 
                l.lead_email, 
                l.lead_phone, 
                l.status, 
                l.created_at,
                u.name AS assigned_agent_name,
                l.assigned_to
            FROM meta_leads l
            LEFT JOIN users u ON l.assigned_to = u.id
            WHERE l.company_id = ?
            ORDER BY l.created_at DESC
        `;

        const [leads] = await db.query(query, [companyId]);
        res.json(leads);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// =======================================================
// COMPANY MANAGER: Allocate Lead to Specific Agent
// =======================================================
exports.allocateLeadAgent = async (req, res) => {
    const { leadId, agentId } = req.body;
    const companyId = req.user.company_id; // Secure context verification

    try {
        // Security check: Lead or Agent dono isi manager ki company ke hone chahiye
        await db.query(
            "UPDATE meta_leads SET assigned_to = ?, status = 'allocated' WHERE id = ? AND company_id = ?",
            [agentId, leadId, companyId]
        );

        res.json({ message: 'Lead successfully routed to designated sales agent.' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// =======================================================
// EMPLOYEE API: Fetch Leads Assigned Specifically To Token User
// =======================================================
exports.getEmployeeLeads = async (req, res) => {
    const userId = req.user.id; // From decoded authentication token layer
    const companyId = req.user.company_id;

    try {
        const query = `
            SELECT id, form_name, lead_name, lead_email, lead_phone, custom_fields_json, status, created_at 
            FROM meta_leads 
            WHERE company_id = ? AND assigned_to = ?
            ORDER BY created_at DESC
        `;
        const [leads] = await db.query(query, [companyId, userId]);
        res.json(leads);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// =======================================================
// EMPLOYEE API: Update Prospecting Pipeline Milestone State
// =======================================================
exports.updateLeadStatus = async (req, res) => {
    const { leadId, status, next_followup_date, last_interaction_notes } = req.body;
    const userId = req.user.id;
    const companyId = req.user.company_id;

    try {
        // 1. Get current data before updating to check if notes or dates actually changed
        const [currentLead] = await db.query(
            "SELECT status, next_followup_date, last_interaction_notes FROM meta_leads WHERE id = ? AND company_id = ?",
            [leadId, companyId]
        );

        if (currentLead.length === 0) {
            return res.status(404).json({ error: "Lead target scope not found." });
        }

        // 2. Build Dynamic Update Statement for main table
        let updateFields = [];
        let queryParams = [];

        if (status) { updateFields.push("status = ?"); queryParams.push(status); }
        if (next_followup_date !== undefined) { updateFields.push("next_followup_date = ?"); queryParams.push(next_followup_date || null); }
        if (last_interaction_notes !== undefined) { updateFields.push("last_interaction_notes = ?"); queryParams.push(last_interaction_notes || null); }

        if (updateFields.length > 0) {
            queryParams.push(leadId, companyId, userId);
            await db.query(
                `UPDATE meta_leads SET ${updateFields.join(", ")} WHERE id = ? AND company_id = ? AND assigned_to = ?`,
                queryParams
            );
        }

        // 3. If there are new notes or date adjustments, log it into sequence history tracker
        if (last_interaction_notes && last_interaction_notes !== currentLead[0].last_interaction_notes) {

            const rawIST = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
            const istTimestamp = new Date(rawIST); // Corrected localized Javascript Object Mapping

            await db.query(
                "INSERT INTO lead_followup_logs (lead_id, agent_id, notes, followup_date, created_at) VALUES (?, ?, ?, ?, ?)",
                [leadId, userId, last_interaction_notes, next_followup_date || null, istTimestamp]
            );
        }

        return res.json({ message: 'CRM Pipeline metrics and logs synchronized successfully.' });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};

// ====================================================================
// FETCH TIMELINE ENDPOINT: Retrieve Sequence Logs for Modal
// ====================================================================
exports.getFollowupSequence = async (req, res) => {
    const { leadId } = req.params;
    const companyId = req.user.company_id;

    try {
        const query = `
            SELECT f.*, u.name as agent_name 
            FROM lead_followup_logs f
            JOIN users u ON f.agent_id = u.id
            JOIN meta_leads l ON f.lead_id = l.id
            WHERE f.lead_id = ? AND l.company_id = ?
            ORDER BY f.created_at DESC
        `;
        const [logs] = await db.query(query, [leadId, companyId]);
        res.json(logs);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};


// =======================================================
// FETCH LEADS: Role Based Visibility Isolation
// =======================================================
exports.getLeadsDashboard = async (req, res) => {
    const { role, id: userId, company_id: companyId } = req.user;

    try {
        let query = '';
        let queryParams = [];

        if (role === 'admin') {
            query = `
                SELECT l.*, c.company_name, u.name as assigned_agent_name 
                FROM meta_leads l
                JOIN companies c ON l.company_id = c.id
                LEFT JOIN users u ON l.assigned_to = u.id
                ORDER BY l.created_at DESC
            `;
        }
        else if (role === 'manager') {
            query = `
                SELECT l.*, u.name as assigned_agent_name 
                FROM meta_leads l
                LEFT JOIN users u ON l.assigned_to = u.id
                WHERE l.company_id = ?
                ORDER BY l.created_at DESC
            `;
            queryParams = [companyId];
        }
        else if (role === 'employee') {
            query = `
                SELECT l.*, '' as assigned_agent_name 
                FROM meta_leads l
                WHERE l.company_id = ? AND l.assigned_to = ?
                ORDER BY l.created_at DESC
            `;
            queryParams = [companyId, userId];
        }

        const [leads] = await db.query(query, queryParams);

        // Ensure standard clean array response even if zero rows found
        return res.status(200).json(Array.isArray(leads) ? leads : []);
    } catch (error) {
        return res.status(500).json({ error: error.message, leads: [] });
    }
};