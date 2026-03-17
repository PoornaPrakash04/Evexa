//db.js
require("dotenv").config();
const mysql = require("mysql2");

const db = mysql.createConnection({
  host:           process.env.DB_HOST     || "localhost",
  user:           process.env.DB_USER     || "root",
  password:       process.env.DB_PASSWORD || "Poorna@123",
  database:       process.env.DB_NAME     || "evexa",
  port:           3306,
  connectTimeout: 10000,
});

db.connect((err) => {
  if (err) {
    console.error("❌ MySQL connection error:", err.message);
    process.exit(1);
  }
  console.log("✅ MySQL Connected to", process.env.DB_NAME || "evexa");
});

// Standard callback-style query (used by most routes)
// ALSO supports await via the promise property
module.exports = db;
module.exports.promise = () => db.promise();