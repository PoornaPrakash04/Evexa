const express = require("express");
const db = require("../db");
const authorize = require("../middleware/authMiddleware");
const upload = require("../middleware/upload");

const router = express.Router();

// Create event
router.post("/", authorize(), upload.single("poster"), (req, res) => {
  const { title, date, capacity } = req.body;
  const poster = req.file ? req.file.filename : null;

  db.query(
    "INSERT INTO events (title, date, capacity, status, organizer_id, poster) VALUES (?, ?, ?, 'Draft', ?, ?)",
    [title, date, capacity, req.user.id, poster],
    (err) => {
      if (err) return res.status(500).json({ message: "Server error" });
      res.json({ message: "Event created" });
    }
  );
});


// Approve event
router.put("/:id/approve", authorize(), (req, res) => {
  db.query(
    "UPDATE events SET status='Approved' WHERE id=?",
    [req.params.id],
    () => res.json({ message: "Event approved" })
  );
});

// Get organizer's events
router.get("/my", authorize(), (req, res) => {
  db.query(
    "SELECT * FROM events WHERE organizer_id = ?",
    [req.user.id],
    (err, result) => {
      if (err) return res.status(500).json({ message: "Server error" });
      res.json(result);
    }
  );
});

// Get approved events (students)
router.get("/", (req, res) => {
  db.query(
    "SELECT * FROM events WHERE status = 'Approved' AND poster IS NOT NULL",
    (err, result) => {
      if (err) return res.status(500).json({ message: "Server error" });
      res.json(result);
    }
  );
});

router.put("/:id/poster", authorize(), upload.single("poster"), (req, res) => {

  const poster = req.file ? req.file.filename : null;

  db.query(
    "UPDATE events SET poster = ? WHERE id = ? AND organizer_id = ?",
    [poster, req.params.id, req.user.id],
    (err) => {
      if (err) return res.status(500).json({ message: "Upload failed" });
      res.json({ message: "Poster uploaded successfully" });
    }
  );
});


module.exports = router;
