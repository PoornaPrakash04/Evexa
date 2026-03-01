//student, only for fetching their own registrations, no modifications allowed
const express = require("express");
const router = express.Router();
const db = require("../db");
const authorize = require("../middleware/authMiddleware");

// Only the logged-in student can see their own registrations
router.get("/my-registrations", authorize(["STUDENT"]), (req, res) => {
  db.query(
    "SELECT * FROM registrations WHERE student_id = ?",
    [req.user.id],
    (err, result) => {
      if (err) return res.status(500).json({ message: "Server error" });
      res.json(result);
    }
  );
});

// Only the logged-in student can see their own registrations
router.get("/my-registrations", authorize(["STUDENT"]), (req, res) => {
  db.query(
    "SELECT * FROM registrations WHERE student_id = ?",
    [req.user.id],
    (err, result) => {
      if (err) return res.status(500).json({ message: "Server error" });
      res.json(result);
    }
  );
});

module.exports = router;