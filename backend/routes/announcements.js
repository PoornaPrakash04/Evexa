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
// Returns:
//   1. Announcements from clubs the student is a member of (organizer-posted)
//   2. Announcements posted by faculty in-charge of student's clubs
//   3. Announcements posted by admins (visible to all students)
router.get("/student", authorize(), (req, res) => {
  db.query(
    `SELECT DISTINCT a.id, a.title, a.message, a.club, a.type, a.created_at
     FROM announcements a
     WHERE a.status = 'Published'
       AND a.is_archived = 0
       AND (
         -- Club announcements: student is a member of that club
         a.club IN (
           SELECT c.club_name FROM clubs c
           INNER JOIN club_members cm ON cm.club_id = c.club_id
           WHERE cm.student_id = ?
         )
         OR
         -- Faculty announcements: faculty is in-charge of a club the student belongs to
         a.created_by IN (
           SELECT c.faculty_id FROM clubs c
           INNER JOIN club_members cm ON cm.club_id = c.club_id
           WHERE cm.student_id = ? AND c.faculty_id IS NOT NULL
         )
         OR
         -- Admin announcements: visible to all students
         a.created_by IN (
           SELECT id FROM admins
         )
       )
     ORDER BY a.created_at DESC
     LIMIT 50`,
    [req.user.id, req.user.id],
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
router.get("/", authorize(), (req, res) => {
  db.query(
    "SELECT club FROM organizers WHERE id = ?",
    [req.user.id],
    (err, orgResult) => {
      if (err) return res.status(500).json({ message: "Server error" });

      if (!orgResult.length) {
        return res.status(404).json({ message: "Organizer not found" });
      }

      const club = orgResult[0].club;

      db.query(
        "SELECT * FROM announcements WHERE club = ? ORDER BY created_at DESC",
        [club],
        (err, results) => {
          if (err) return res.status(500).json({ message: "Server error" });
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

  if (req.user.role === "FACULTY") {
    // Faculty: verify they own it via created_by
    db.query(
      `UPDATE announcements SET title = ?, message = ?, type = ?
       WHERE id = ? AND created_by = ?`,
      [title, message, type, req.params.id, req.user.id],
      (err, result) => {
        if (err) return res.status(500).json({ message: "Server error" });
        if (result.affectedRows === 0)
          return res.status(404).json({ message: "Not found or unauthorized" });
        res.json({ message: "Announcement updated" });
      }
    );
  } else {
    // Organizer: verify ownership by matching their club
    db.query(
      "SELECT club FROM organizers WHERE id = ?",
      [req.user.id],
      (err, orgResult) => {
        if (err) return res.status(500).json({ message: "Server error" });
        if (!orgResult.length) return res.status(404).json({ message: "Organizer not found" });
        const club = orgResult[0].club;
        db.query(
          `UPDATE announcements SET title = ?, message = ?, type = ?
           WHERE id = ? AND club = ?`,
          [title, message, type, req.params.id, club],
          (err2, result) => {
            if (err2) return res.status(500).json({ message: "Server error" });
            if (result.affectedRows === 0)
              return res.status(404).json({ message: "Not found or unauthorized" });
            res.json({ message: "Announcement updated" });
          }
        );
      }
    );
  }
});

// ── DELETE /api/announcements/:id ────────────────────────────
router.delete("/:id", authorize(), (req, res) => {
  if (req.user.role === "FACULTY") {
    // Faculty: verify they own it via created_by
    db.query(
      "DELETE FROM announcements WHERE id = ? AND created_by = ?",
      [req.params.id, req.user.id],
      (err, result) => {
        if (err) return res.status(500).json({ message: "Server error" });
        if (result.affectedRows === 0)
          return res.status(404).json({ message: "Not found or unauthorized" });
        res.json({ message: "Announcement deleted" });
      }
    );
  } else {
    // Organizer: verify ownership by matching their club
    db.query(
      "SELECT club FROM organizers WHERE id = ?",
      [req.user.id],
      (err, orgResult) => {
        if (err) return res.status(500).json({ message: "Server error" });
        if (!orgResult.length) return res.status(404).json({ message: "Organizer not found" });
        const club = orgResult[0].club;
        db.query(
          "DELETE FROM announcements WHERE id = ? AND club = ?",
          [req.params.id, club],
          (err2, result) => {
            if (err2) return res.status(500).json({ message: "Server error" });
            if (result.affectedRows === 0)
              return res.status(404).json({ message: "Not found or unauthorized" });
            res.json({ message: "Announcement deleted" });
          }
        );
      }
    );
  }
});

module.exports = router;