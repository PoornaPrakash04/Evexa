const mysql = require("mysql2");

const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "Poorna@123", // put password if you have one
  database: "evexa"
});

db.connect((err) => {
  if (err) {
    console.error("❌ MySQL connection error:", err.message);
    process.exit(1); // STOP server if DB fails
  }
  console.log("✅ MySQL Connected");
});

module.exports = db;
