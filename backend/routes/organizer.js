// routes/organizer.js
const express  = require("express");
const bcrypt   = require("bcrypt");
const router   = express.Router();
const db       = require("../db");
const authorize = require("../middleware/authMiddleware");

// ── Guard: organizer-only ────────────────────────────────────
function organizerOnly(req, res, next) {
  if (req.user?.role !== "ORGANIZER") {
    return res.status(403).json({ message: "Organizer access only." });
  }
  next();
}

// ── GET /api/organizer/me ─────────────────────────────────────
router.get("/me", authorize(), organizerOnly, (req, res) => {
  db.query(
    "SELECT id, name, email, club, phone, roll_no, admission_no, class FROM organizers WHERE id = ?",
    [req.user.id],
    (err, result) => {
      if (err)            return res.status(500).json({ message: "Server error", detail: err.message });
      if (!result.length) return res.status(404).json({ message: "Organizer not found" });
      res.json({ ...result[0], role: "ORGANIZER" });
    }
  );
});

// ── PUT /api/organizer/profile ────────────────────────────────
router.put("/profile", authorize(), organizerOnly, (req, res) => {
  const { name, email, phone } = req.body;
  if (!name || !email) {
    return res.status(400).json({ message: "Name and email are required." });
  }

  db.query(
    "UPDATE organizers SET name = ?, email = ?, phone = ? WHERE id = ?",
    [name, email, phone || null, req.user.id],
    (err, result) => {
      if (err) {
        if (err.code === "ER_DUP_ENTRY") {
          return res.status(409).json({ message: "Email is already in use." });
        }
        return res.status(500).json({ message: "Server error", detail: err.message });
      }
      if (!result.affectedRows) return res.status(404).json({ message: "Organizer not found" });
      res.json({ message: "Profile updated successfully" });
    }
  );
});

// ── PUT /api/organizer/change-password ────────────────────────
router.put("/change-password", authorize(), organizerOnly, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: "Both current and new passwords are required." });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ message: "New password must be at least 8 characters." });
  }

  db.query(
    "SELECT password FROM organizers WHERE id = ?",
    [req.user.id],
    async (err, result) => {
      if (err || !result.length) return res.status(500).json({ message: "Server error" });

      const match = await bcrypt.compare(currentPassword, result[0].password);
      if (!match) return res.status(401).json({ message: "Current password is incorrect." });

      try {
        const hashed = await bcrypt.hash(newPassword, 10);
        db.query(
          "UPDATE organizers SET password = ? WHERE id = ?",
          [hashed, req.user.id],
          (err2) => {
            if (err2) return res.status(500).json({ message: "Server error" });
            res.json({ message: "Password updated successfully" });
          }
        );
      } catch (hashErr) {
        console.error("bcrypt error:", hashErr);
        res.status(500).json({ message: "Server error" });
      }
    }
  );
});

// ── GET /api/organizer/dashboard ─────────────────────────────
// Summary stats for the organizer's dashboard
router.get("/dashboard", authorize(), organizerOnly, (req, res) => {
  const organizerId = req.user.id;

  const sql = `
    SELECT
      (SELECT COUNT(*) FROM events WHERE organizer_id = ?)                          AS total_events,
      (SELECT COUNT(*) FROM events WHERE organizer_id = ? AND status = 'Approved')  AS approved_events,
      (SELECT COUNT(*) FROM events WHERE organizer_id = ? AND status = 'Draft')     AS draft_events,
      (SELECT COUNT(*) FROM events WHERE organizer_id = ? AND status = 'Rejected')  AS rejected_events,
      (SELECT COUNT(*)
       FROM registrations r
       JOIN events e ON e.id = r.event_id
       WHERE e.organizer_id = ?)                                                     AS total_registrations,
      (SELECT COUNT(*)
       FROM issues i
       JOIN events e ON e.id = i.event_id
       WHERE e.organizer_id = ? AND i.status = 'open')                              AS open_issues
  `;

  db.query(
    sql,
    [organizerId, organizerId, organizerId, organizerId, organizerId, organizerId],
    (err, result) => {
      if (err) {
        console.error("GET /organizer/dashboard error:", err);
        return res.status(500).json({ message: "Server error", detail: err.message });
      }
      res.json(result[0]);
    }
  );
});

module.exports = router;