// routes/attendance.js
const express   = require("express");
const router    = express.Router();
const db        = require("../db");
const authorize = require("../middleware/authMiddleware");

// POST /api/attendance/register
router.post("/register", authorize(["STUDENT"]), (req, res) => {
  const { event_id } = req.body;
  const student_id   = req.user.id;

  db.query(
    "SELECT id FROM registrations WHERE student_id = ? AND event_id = ?",
    [student_id, event_id],
    (err, existing) => {
      if (err) return res.status(500).json({ message: "Server error" });
      if (existing.length > 0)
        return res.status(400).json({ message: "Already registered" });

      db.query(
        "INSERT INTO registrations (student_id, event_id, registered_at) VALUES (?, ?, NOW())",
        [student_id, event_id],
        (err2, result) => {
          if (err2) return res.status(500).json({ message: "Registration failed" });
          db.query(
            "UPDATE events SET registered_count = registered_count + 1 WHERE id = ?",
            [event_id],
            (err3) => { if (err3) console.error("Count update failed:", err3); }
          );
          res.json({ message: "Registered successfully", id: result.insertId });
        }
      );
    }
  );
});

// GET /api/attendance/my-registrations
router.get("/my-registrations", authorize(["STUDENT"]), (req, res) => {
  const sql = `
    SELECT
      r.id,
      r.registered_at,
      e.id               AS event_id,
      e.title            AS event_title,
      e.date,
      e.time,
      e.venue,
      e.type,
      e.registration_fee,
      e.status,
      c.club_name             AS club
    FROM registrations r
    JOIN events e ON r.event_id = e.id
    LEFT JOIN clubs c ON e.club_id = c.club_id
    WHERE r.student_id = ?
    ORDER BY r.registered_at DESC
  `;

  db.query(sql, [req.user.id], (err, results) => {
    if (err) {
      console.error("my-registrations error:", err.sqlMessage || err.message);
      return res.status(500).json({
        message:    "Server error",
        sqlMessage: err.sqlMessage || err.message
      });
    }
    res.json(results);
  });
});

// GET /api/attendance/upcoming
router.get("/upcoming", authorize(["STUDENT"]), (req, res) => {
  const sql = `
    SELECT
      r.id,
      r.registered_at,
      e.id               AS event_id,
      e.title            AS event_title,
      e.date,
      e.time,
      e.venue,
      e.type,
      e.registration_fee,
      c.club_name             AS club
    FROM registrations r
    JOIN events e ON r.event_id = e.id
    LEFT JOIN clubs c ON e.club_id = c.club_id
    WHERE r.student_id = ? AND e.date > CURDATE()
    ORDER BY e.date ASC
  `;

  db.query(sql, [req.user.id], (err, results) => {
    if (err) {
      console.error("upcoming error:", err.sqlMessage || err.message);
      return res.status(500).json({ message: "Server error" });
    }
    res.json(results);
  });
});

module.exports = router;