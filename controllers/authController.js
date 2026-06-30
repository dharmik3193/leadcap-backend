const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'master_portal_secret_key';

exports.login = async (req, res) => {
    const { email, password } = req.body;
    try {
        const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        if (rows.length === 0) return res.status(400).json({ message: 'Invalid Credentials' });

        const user = rows[0];
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) return res.status(400).json({ message: 'Invalid Credentials' });

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role, company_id: user.company_id }, 
            JWT_SECRET, 
            { expiresIn: '12h' }
        );

        res.json({
            message: 'Login successful',
            token,
            user: { id: user.id, name: user.name, role: user.role, profilePic: user.profile_pic_url }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};