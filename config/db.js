const mysql = require("mysql2/promise");
require("dotenv").config();

console.log({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
});

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

(async () => {
  try {
    const conn = await pool.getConnection();
    console.log("✅ Database Connected");
    conn.release();
  } catch (err) {
    console.error("❌ DB Error:", err.code);
    console.error(err.message);
  }
})();

module.exports = pool;