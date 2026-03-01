const express = require("express");
const db = require("../db");
const authorize = require("../middleware/authMiddleware");
const upload = require("../middleware/upload");
const router = express.Router();

// GET /api/clubs — all clubs (public)
router.get("/", (req, res) => {
  db.query("SELECT * FROM clubs", (err, result) => {
    if (err) return res.status(500).json({ message: "Server error" });
    res.json(result);
  });
});

// GET /api/clubs/my-clubs — clubs joined by logged-in student
router.get("/my-clubs", authorize(["STUDENT"]), (req, res) => {
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

// GET /api/clubs/:id/members — member count
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

// GET /api/clubs/:id/events — upcoming events for a club
router.get("/:id/events", (req, res) => {
  db.query(
    `SELECT events.*, clubs.club_name AS club, clubs.club_logo
     FROM events
     LEFT JOIN clubs ON events.club_id = clubs.club_id
     WHERE events.club_id = ? AND events.date >= CURDATE()
     ORDER BY events.date ASC`,
    [req.params.id],
    (err, results) => {
      if (err) return res.status(500).json({ message: "Server error" });
      res.json(results);
    }
  );
});

// POST /api/clubs/:id/join — join a club
router.post("/:id/join", authorize(["STUDENT"]), (req, res) => {
  const clubId = req.params.id;
  db.query(
    "INSERT IGNORE INTO club_members (student_id, club_id) VALUES (?, ?)",
    [req.user.id, clubId],
    (err) => {
      if (err) return res.status(500).json({ message: "Server error" });
      res.json({ message: "Joined club successfully" });
    }
  );
});

// DELETE /api/clubs/:id/leave — leave a club
router.delete("/:id/leave", authorize(["STUDENT"]), (req, res) => {
  const clubId = req.params.id;
  db.query(
    "DELETE FROM club_members WHERE student_id = ? AND club_id = ?",
    [req.user.id, clubId],
    (err) => {
      if (err) return res.status(500).json({ message: "Server error" });
      res.json({ message: "Left club successfully" });
    }
  );
});

// POST /api/clubs/:id/upload-logo — upload club logo (admin only)
router.post("/:id/upload-logo", authorize(["ADMIN"]), upload.single("logo"), (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No file uploaded" });

  const logoPath = `uploads/logos/${req.file.filename}`;
  db.query(
    "UPDATE clubs SET club_logo = ? WHERE club_id = ?",
    [logoPath, req.params.id],
    (err) => {
      if (err) return res.status(500).json({ message: "DB update failed" });
      res.json({ message: "Logo uploaded successfully", path: logoPath });
    }
  );
});

// GET /api/clubs/:id — single club details (keep this LAST)
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