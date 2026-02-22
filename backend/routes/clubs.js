const express = require("express");
const db = require("../db");
const authorize = require("../middleware/authMiddleware");
const router = express.Router();

// GET /api/clubs — all clubs (public)
router.get("/", (req, res) => {
  db.query("SELECT * FROM clubs", (err, result) => {
    if (err) return res.status(500).json({ message: "Server error" });
    res.json(result);
  });
});

// GET /api/clubs/my-clubs — clubs joined by logged-in student
router.get("/my-clubs", authorize(), (req, res) => {
  db.query(
    `SELECT c.* FROM clubs c
     JOIN club_members cm ON c.club_id = cm.club_id
     WHERE cm.student_id = ?`,
    [req.user.id],
    (err, result) => {
      if (err) return res.status(500).json({ message: "Server error" });
      res.json(result);
    }
  );
});

// POST /api/clubs/join — join a club
router.post("/join", authorize(), (req, res) => {
  const { club_id } = req.body;
  db.query(
    "INSERT IGNORE INTO club_members (student_id, club_id) VALUES (?, ?)",
    [req.user.id, club_id],
    (err) => {
      if (err) return res.status(500).json({ message: "Server error" });
      res.json({ message: "Joined club successfully" });
    }
  );
});
router.get("/:id/members", (req, res) => {
  db.query(
    "SELECT COUNT(*) AS count FROM club_members WHERE club_id = ?",
    [req.params.id],
    (err, result) => {
      if (err) return res.status(500).json({ message: "Server error" });
      res.json({ count: result[0].count });
    }
  );
});

// GET /api/clubs/:id — single club details
router.get("/:id", (req, res) => {
  db.query(
    "SELECT * FROM clubs WHERE club_id = ?",
    [req.params.id],
    (err, result) => {
      if (err) return res.status(500).json({ message: "Server error" });
      if (!result.length) return res.status(404).json({ message: "Club not found" });
      res.json(result[0]);
    }
  );
});
module.exports = router;