const express = require("express");
const db = require("../db");
const auth = require("../middleware/authMiddleware");

const router = express.Router();

// Create event
router.post("/", auth(["ORGANIZER"]), (req, res) => {
  const { title, date, capacity } = req.body;

  db.query(
    "INSERT INTO events (title, date, capacity, status) VALUES (?, ?, ?, 'Draft')",
    [title, date, capacity],
    () => res.json({ message: "Event created" })
  );
});

// Approve event
router.put("/:id/approve", auth(["FACULTY"]), (req, res) => {
  db.query(
    "UPDATE events SET status='Approved' WHERE id=?",
    [req.params.id],
    () => res.json({ message: "Event approved" })
  );
});

module.exports = router;

