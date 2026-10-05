const dotenv = require("dotenv");
dotenv.config();
module.exports = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 3000),
  jwtSecret: process.env.JWT_SECRET || "master_portal_secret_key",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "12h",
  db: {
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "portal_db",
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
  },
  meta: {
    graphApiVersion: process.env.META_GRAPH_API_VERSION || "v25.0",
    apiTimeoutMs: Number(process.env.META_API_TIMEOUT_MS || 10000),
  },
  corsOrigin: process.env.CORS_ORIGIN || "*",
};
