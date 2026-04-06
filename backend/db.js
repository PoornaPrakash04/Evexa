require("dotenv").config();
const mysql = require("mysql2");

const pool = mysql.createPool({
  host:             process.env.DB_HOST     || "localhost",
  user:             process.env.DB_USER     || "root",
  password:         process.env.DB_PASSWORD || "Poorna@123",
  database:         process.env.DB_NAME     || "evexa",
  port:             3306,
  connectTimeout:   10000,
  dateStrings:      true,
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
});

// Test connection on startup
pool.getConnection((err, conn) => {
  if (err) {
    console.error("❌ MySQL connection error:", err.message);
    process.exit(1);
  }
  console.log("✅ MySQL Connected to", process.env.DB_NAME || "evexa");
  conn.release();
});

module.exports = pool;