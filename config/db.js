const mysql = require("mysql2/promise");
const env = require("./env");
module.exports = mysql.createPool({
  host: env.db.host, user: env.db.user, password: env.db.password,
  database: env.db.database, waitForConnections: true,
  connectionLimit: env.db.connectionLimit, queueLimit: 0, charset: "utf8mb4",
});
