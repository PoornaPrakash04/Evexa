const express = require("express");
const db = require("../db");
const auth = require("../middleware/authMiddleware");
const verifyToken = require("../middleware/verifyToken");

const router = express.Router();

// Create event
router.post("/", auth, (req, res) => {
  const { title, date, capacity } = req.body;

  db.query(
    "INSERT INTO events (title, date, capacity, status, organizer_id) VALUES (?, ?, ?, 'Draft', ?)",
    [title, date, capacity, req.user.id],
    (err) => {
      if (err) return res.status(500).json({ message: "Server error" });
      res.json({ message: "Event created" });
    }
  );
});

// Approve event
router.put("/:id/approve", auth, (req, res) => {
  db.query(
    "UPDATE events SET status='Approved' WHERE id=?",
    [req.params.id],
    () => res.json({ message: "Event approved" })
  );
});
router.get("/my", verifyToken, (req, res) => {
  db.query(
    "SELECT * FROM events WHERE organizer_id = ?",
    [req.user.id],
    (err, result) => {
      if (err) return res.status(500).json({ message: "Server error" });
      res.json(result);
    }
  );
});
// Get all approved events (for students)
router.get("/", (req, res) => {
  db.query(
    "SELECT * FROM events WHERE status = 'Approved'",
    (err, result) => {
      if (err) return res.status(500).json({ message: "Server error" });
      res.json(result);
    }
  );
});

module.exports = router;
