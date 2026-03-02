const express  = require("express");
const db       = require("../db");
const authorize = require("../middleware/authMiddleware");
const router   = express.Router();

// ── GET /api/announcements/faculty ───────────────────────────
// Returns announcements for clubs this faculty is incharge of
// Must be BEFORE "/:id" routes
router.get("/faculty", authorize(), (req, res) => {
  if (req.user.role !== "FACULTY") {
    return res.status(403).json({ message: "Faculty access only." });
  }

  // Get club names this faculty is incharge of, then fetch their announcements
  db.query(
    `SELECT a.id, a.title, a.message, a.type, a.created_at,
            a.club, a.status
     FROM announcements a
     INNER JOIN clubs c ON c.club_name = a.club
     WHERE c.faculty_id = ?
       AND a.status = 'Published'
     ORDER BY a.created_at DESC
     LIMIT 30`,
    [req.user.id],
    (err, results) => {
      if (err) {
        console.error("GET /announcements/faculty error:", err);
        return res.status(500).json({ message: "Server error", detail: err.message });
      }
      res.json(results);
    }
  );
});

// ── GET /api/announcements/my-posts ──────────────────────────
// Returns announcements posted by the logged-in faculty
router.get("/my-posts", authorize(), (req, res) => {
  if (req.user.role !== "FACULTY") {
    return res.status(403).json({ message: "Faculty access only." });
  }

  db.query(
    `SELECT id, title, message, type, club, created_at
     FROM announcements
     WHERE created_by = ?
     ORDER BY created_at DESC`,
    [req.user.id],
    (err, results) => {
      if (err) {
        console.error("GET /announcements/my-posts error:", err);
        return res.status(500).json({ message: "Server error", detail: err.message });
      }
      res.json(results);
    }
  );
});

// ── GET /api/announcements/student ───────────────────────────
// (your existing student route — unchanged)
router.get("/student", authorize(), (req, res) => {
  db.query(
    `SELECT a.id, a.title, a.message, a.club, a.type, a.created_at
     FROM announcements a
     INNER JOIN clubs c ON c.club_name = a.club
     INNER JOIN club_members cm ON cm.club_id = c.club_id
     WHERE cm.student_id = ?
       AND a.status = 'Published'
       AND a.is_archived = 0
     ORDER BY a.created_at DESC
     LIMIT 50`,
    [req.user.id],
    (err, results) => {
      if (err) {
        console.error("Student announcements error:", err);
        return res.status(500).json({ message: "Server error" });
      }
      res.json(results);
    }
  );
});

// ── GET /api/announcements — organizer's club announcements ──
// (your existing organizer route — unchanged)
router.get("/", authorize(), (req, res) => {
  console.log("=== Fetching announcements ===");
  db.query(
    "SELECT club FROM organizers WHERE id = ?",
    [req.user.id],
    (err, orgResult) => {
      if (err) return res.status(500).json({ message: "Server error" });
      const club = orgResult[0]?.club;
      db.query(
        "SELECT * FROM announcements WHERE club = ? ORDER BY created_at DESC",
        [club],
        (err, results) => {
          if (err) return res.status(500).json({ message: "Server error" });
          console.log("✅ Found", results.length, "announcements");
          res.json(results);
        }
      );
    }
  );
});

// ── POST /api/announcements ───────────────────────────────────
// Works for both ORGANIZER (existing) and FACULTY (new)
router.post("/", authorize(), (req, res) => {
  const { title, message, type } = req.body;
  if (!title || !message) {
    return res.status(400).json({ message: "Title and message are required." });
  }

  if (req.user.role === "FACULTY") {
    // Faculty posts directly — get their first incharge club name
    db.query(
      "SELECT club_name FROM clubs WHERE faculty_id = ? LIMIT 1",
      [req.user.id],
      (err, clubResult) => {
        if (err) return res.status(500).json({ message: "Server error", detail: err.message });
        const club = clubResult[0]?.club_name || "Faculty";
        db.query(
          "INSERT INTO announcements (title, message, club, type, status, created_by) VALUES (?, ?, ?, ?, 'Published', ?)",
          [title, message, club, type || "General", req.user.id],
          (err, result) => {
            if (err) {
              console.error("POST /announcements (faculty) error:", err);
              return res.status(500).json({ message: "Server error", detail: err.message });
            }
            res.json({ message: "Announcement posted", id: result.insertId });
          }
        );
      }
    );
  } else {
    // Organizer — existing behaviour unchanged
    db.query(
      "SELECT club FROM organizers WHERE id = ?",
      [req.user.id],
      (err, orgResult) => {
        if (err) return res.status(500).json({ message: "Server error" });
        const club = orgResult[0]?.club;
        db.query(
          "INSERT INTO announcements (title, message, club, type, status, created_by) VALUES (?, ?, ?, ?, 'Published', ?)",
          [title, message, club, type, req.user.id],
          (err, result) => {
            if (err) return res.status(500).json({ message: "Server error" });
            res.json({ message: "Announcement created", id: result.insertId });
          }
        );
      }
    );
  }
});

// ── PUT /api/announcements/:id ────────────────────────────────
router.put("/:id", authorize(), (req, res) => {
  const { title, message, type } = req.body;
  db.query(
    "UPDATE announcements SET title = ?, message = ?, type = ? WHERE id = ?",
    [title, message, type, req.params.id],
    (err, result) => {
      if (err) return res.status(500).json({ message: "Server error" });
      if (!result.affectedRows) return res.status(404).json({ message: "Announcement not found" });
      res.json({ message: "Announcement updated" });
    }
  );
});

// ── DELETE /api/announcements/:id ────────────────────────────
router.delete("/:id", authorize(), (req, res) => {
  db.query(
    "DELETE FROM announcements WHERE id = ? AND created_by = ?",
    [req.params.id, req.user.id],
    (err) => {
      if (err) return res.status(500).json({ message: "Server error" });
      res.json({ message: "Announcement deleted" });
    }
  );
});

module.exports = router;