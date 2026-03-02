const express  = require("express");
const db       = require("../db");
const authorize = require("../middleware/authMiddleware");
const upload   = require("../middleware/upload");
const router   = express.Router();

// GET /api/clubs — all clubs (public)
router.get("/", (req, res) => {
  db.query("SELECT * FROM clubs", (err, result) => {
    if (err) return res.status(500).json({ message: "Server error" });
    res.json(result);
  });
});

// GET /api/clubs/my-clubs
// STUDENT  → clubs the student has joined
// FACULTY  → clubs where this faculty is incharge
router.get("/my-clubs", authorize(), (req, res) => {
  if (req.user.role === "FACULTY") {
    // Return clubs where faculty_id matches logged-in faculty
    db.query(
      `SELECT
         c.club_id   AS id,
         c.club_name AS name,
         c.category,
         c.club_logo AS logo,
         c.status,
         COUNT(DISTINCT cm.student_id) AS member_count
       FROM clubs c
       LEFT JOIN club_members cm ON cm.club_id = c.club_id
       WHERE c.faculty_id = ?
       GROUP BY c.club_id`,
      [req.user.id],
      (err, result) => {
        if (err) {
          console.error("GET /clubs/my-clubs (faculty) error:", err);
          return res.status(500).json({ message: "Server error", detail: err.message });
        }
        res.json(result);
      }
    );
  } else if (req.user.role === "STUDENT") {
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
  } else {
    res.status(403).json({ message: "Access denied" });
  }
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

// POST /api/clubs/:id/join
router.post("/:id/join", authorize(["STUDENT"]), (req, res) => {
  db.query(
    "INSERT IGNORE INTO club_members (student_id, club_id) VALUES (?, ?)",
    [req.user.id, req.params.id],
    (err) => {
      if (err) return res.status(500).json({ message: "Server error" });
      res.json({ message: "Joined club successfully" });
    }
  );
});

// DELETE /api/clubs/:id/leave
router.delete("/:id/leave", authorize(["STUDENT"]), (req, res) => {
  db.query(
    "DELETE FROM club_members WHERE student_id = ? AND club_id = ?",
    [req.user.id, req.params.id],
    (err) => {
      if (err) return res.status(500).json({ message: "Server error" });
      res.json({ message: "Left club successfully" });
    }
  );
});

// POST /api/clubs/:id/upload-logo
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

// GET /api/clubs/:id — single club (keep LAST)
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