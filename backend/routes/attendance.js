// routes/attendance.js
const express = require("express");
const router = express.Router();
const db = require("../db");
const authorize = require("../middleware/authMiddleware");

router.post("/register", authorize(["STUDENT"]), (req, res) => {
  const { event_id } = req.body;
  const student_id = req.user.id;

  db.query(
    "SELECT id FROM registrations WHERE student_id = ? AND event_id = ?",
    [student_id, event_id],
    (err, existing) => {
      if (err) return res.status(500).json({ message: "Server error" });
      if (existing.length > 0) return res.status(400).json({ message: "Already registered" });

      db.query(
        "INSERT INTO registrations (student_id, event_id, registered_at) VALUES (?, ?, NOW())",
        [student_id, event_id],
        (err2, result) => {
          if (err2) return res.status(500).json({ message: "Registration failed" });

          // ✅ Increment registered_count in events table
          db.query(
            "UPDATE events SET registered_count = registered_count + 1 WHERE id = ?",
            [event_id],
            (err3) => {
              if (err3) console.error("Count update failed:", err3);
              // Still return success even if count update fails
              res.json({ message: "Registered successfully", id: result.insertId });
            }
          );
        }
      );
    }
  );
});

// GET /api/attendance/my-registrations — get student's registered events
router.get("/my-registrations", authorize(["STUDENT"]), (req, res) => {
  db.query(
    `SELECT r.id, r.registered_at, e.id as event_id,
            e.title as event_title, e.date, e.time, e.venue, e.club
     FROM registrations r
     JOIN events e ON r.event_id = e.id
     WHERE r.student_id = ?
     ORDER BY r.registered_at DESC`,
    [req.user.id],
    (err, results) => {
      if (err) return res.status(500).json({ message: "Server error" });
      res.json(results);
    }
  );
});

// GET /api/attendance/upcoming
router.get("/upcoming", authorize(["STUDENT"]), (req, res) => {
  db.query(
    `SELECT r.id, r.registered_at, e.id as event_id,
            e.title as event_title, e.date, e.time, e.venue, e.club
     FROM registrations r
     JOIN events e ON r.event_id = e.id
     WHERE r.student_id = ? AND e.date > CURDATE()
     ORDER BY e.date ASC`,
    [req.user.id],
    (err, results) => {
      if (err) return res.status(500).json({ message: "Server error" });
      res.json(results);
    }
  );
});

module.exports = router;