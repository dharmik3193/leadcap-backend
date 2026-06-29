// database.js
const mysql = require('mysql2/promise');
require('dotenv').config();

let pool;

const initializeDatabase = async () => {
  try {
    pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'meta_leads',
      port: process.env.DB_PORT || 3306,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });

    // Test connection
    const connection = await pool.getConnection();
    console.log('✓ Database connected successfully');
    connection.release();

    return pool;
  } catch (error) {
    console.error('✗ Database connection failed:', error.message);
    process.exit(1);
  }
};

const getConnection = async () => {
  if (!pool) {
    await initializeDatabase();
  }
  return await pool.getConnection();
};

const query = async (sql, values = []) => {
  const connection = await getConnection();
  try {
    const [results] = await connection.query(sql, values);
    return results;
  } finally {
    connection.release();
  }
};

const saveLead = async (leadData) => {
  const {
    meta_lead_id,
    form_id,
    first_name,
    last_name,
    email,
    phone,
    address,
    city,
    state,
    zip_code,
    country,
    company,
    full_data,
  } = leadData;

  const sql = `
    INSERT INTO leads 
    (meta_lead_id, form_id, first_name, last_name, email, phone, address, city, state, zip_code, country, company, full_data)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE 
    updated_at = CURRENT_TIMESTAMP
  `;

  const values = [
    meta_lead_id,
    form_id,
    first_name || null,
    last_name || null,
    email || null,
    phone || null,
    address || null,
    city || null,
    state || null,
    zip_code || null,
    country || null,
    company || null,
    JSON.stringify(full_data) || null,
  ];

  return await query(sql, values);
};

const getAllLeads = async (limit = 100, offset = 0) => {
  const sql = `
    SELECT * FROM leads 
    ORDER BY created_at DESC 
    LIMIT ? OFFSET ?
  `;
  return await query(sql, [limit, offset]);
};

const getLeadById = async (id) => {
  const sql = 'SELECT * FROM leads WHERE id = ?';
  const results = await query(sql, [id]);
  return results[0] || null;
};

const getLeadByMetaId = async (meta_lead_id) => {
  const sql = 'SELECT * FROM leads WHERE meta_lead_id = ?';
  const results = await query(sql, [meta_lead_id]);
  return results[0] || null;
};

const getLeadCount = async () => {
  const sql = 'SELECT COUNT(*) as count FROM leads';
  const results = await query(sql);
  return results[0].count;
};

const searchLeads = async (searchTerm) => {
  const sql = `
    SELECT * FROM leads 
    WHERE email LIKE ? OR phone LIKE ? OR first_name LIKE ? OR last_name LIKE ?
    ORDER BY created_at DESC
    LIMIT 50
  `;
  const searchPattern = `%${searchTerm}%`;
  return await query(sql, [searchPattern, searchPattern, searchPattern, searchPattern]);
};

module.exports = {
  initializeDatabase,
  getConnection,
  query,
  saveLead,
  getAllLeads,
  getLeadById,
  getLeadByMetaId,
  getLeadCount,
  searchLeads,
};