const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const db = require("../db");
const authorize = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/login", async (req, res) => {
  console.log("Login request received");
  console.log("Email:", req.body.email);

  const { email, password } = req.body;

  db.query(
    "SELECT * FROM organizers WHERE email = ?",
    [email],
    async (err, result) => {

      console.log("DB result:", result);

      if (err) {
        console.log("DB error:", err);
        return res.status(500).json({ message: "Server error" });
      }

      if (result.length === 0) {
        console.log("Organizer not found");
        return res.status(401).json({ message: "Organizer not found" });
      }

      const organizer = result[0];

      const match = await bcrypt.compare(password, organizer.password);
      console.log("Password match:", match);

      if (!match)
        return res.status(401).json({ message: "Invalid password" });

      const token = jwt.sign(
  { id: organizer.id, role: "ORGANIZER", club: organizer.club }, // ✅ add club
  process.env.JWT_SECRET,
  { expiresIn: "1d" }
);

      res.json({ token });
    }
  );
});


router.get("/me", authorize(), (req, res) => {
  console.log("=== /me request, user id:", req.user.id);
  
  db.query(
    "SELECT id, name, email, club, phone, roll_no, admission_no, class FROM organizers WHERE id = ?",
    [req.user.id],
    (err, result) => {
      if (err) {
        console.error("❌ DB error:", err);
        return res.status(500).json({ message: "Server error" });
      }
      
      if (result.length === 0) {
        console.log("❌ Organizer not found");
        return res.status(404).json({ message: "Organizer not found" });
      }

      console.log("✅ Returning organizer:", result[0]);
      res.json(result[0]);
    }
  );
});

module.exports = router;

