const jwt = require('jsonwebtoken');
const db = require('../config/db');
const JWT_SECRET = process.env.JWT_SECRET || 'master_portal_secret_key';

// Check if user is logged in
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ message: 'Access Denied: Token Missing' });

    jwt.verify(token, JWT_SECRET, async (err, decodedUser) => {
        if (err) return res.status(403).json({ message: 'Session Expired or Invalid' });
        
        try {
            // Live status cross-verification schema loop
            const [userRows] = await db.query('SELECT status, company_id FROM users WHERE id = ?', [decodedUser.id]);
            if (userRows.length === 0 || userRows[0].status === 'suspended') {
                return res.status(403).json({ message: 'Access Restricted: This profile account is currently suspended.' });
            }

            // Agar user employee/manager hai, toh uski company ka account status bhi check karein
            if (userRows[0].company_id) {
                const [compRows] = await db.query('SELECT status FROM companies WHERE id = ?', [userRows[0].company_id]);
                if (compRows.length > 0 && compRows[0].status === 'suspended') {
                    return res.status(403).json({ message: 'Access Restricted: Your parent company organization environment is suspended.' });
                }
            }

            req.user = { ...decodedUser, company_id: userRows[0].company_id }; 
            next();
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
};

// Role restrictions
const requireRoles = (...allowedRoles) => {
    return (req, res, next) => {
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ message: `Forbidden: Restricted to ${allowedRoles.join(' or ')}` });
        }
        next();
    };
};

module.exports = { authenticateToken, requireRoles };