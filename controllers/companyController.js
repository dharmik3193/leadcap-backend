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
                mc.pixel_id
            FROM companies c
            LEFT JOIN users u ON c.id = u.company_id AND u.role = 'manager'
            LEFT JOIN meta_configs mc ON c.id = mc.company_id
            ORDER BY c.created_at DESC
        `;

        const [companies] = await db.query(query);
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