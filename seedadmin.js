const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function createMasterAdmin() {
    // Database connection initialize karein
    const db = await mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'portal_db'
    });

    // Admin Details (Aap inhe change kar sakte hain)
    const adminName = "Master Admin";
    const adminEmail = "dharmik@gmail.com"; // Isse aap login karenge
    const adminPassword = "dharmik123"; // Aapka strong password

    try {
        console.log('🔄 Password hash kiya jaa raha hai...');
        const passwordHash = await bcrypt.hash(adminPassword, 10);
        console.log(passwordHash);
        

        console.log('🔄 Database me Admin entry check ho rahi hai...');
        const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [adminEmail]);

        if (existing.length > 0) {
            console.log('⚠️ Master Admin is email id se pehle se hi registered hai!');
            process.exit(0);
        }

        // Database me Master Admin insert karein (company_id: NULL, role: 'admin')
        await db.query(
            "INSERT INTO users (company_id, name, email, password_hash, role) VALUES (NULL, ?, ?, ?, 'admin')",
            [adminName, adminEmail, passwordHash]
        );

        console.log('✅ Success: Master Admin account successfully register ho gaya hai!');
        console.log(`📧 Email: ${adminEmail}`);
        console.log(`🔑 Password: ${adminPassword}`);

    } catch (error) {
        console.error('❌ Error creating Master Admin:', error.message);
    } finally {
        process.exit(0);
    }
}

createMasterAdmin();