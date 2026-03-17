const express = require("express");
const db = require("../db");
const authorize = require("../middleware/authMiddleware");
const upload = require("../middleware/upload");
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  }
});

const router = express.Router();

// ── Create event ──────────────────────────────────────
router.post("/", authorize(), upload.single("poster"), (req, res) => {
  const { title, type, description, date, time, capacity, registration_fee, venue } = req.body;
  const poster = req.file ? req.file.filename : null;
  const club_id = req.user.club_id;  // ✅ fixed

  db.query(
    `INSERT INTO events 
    (title, type, description, date, time, capacity, registration_fee, venue, club_id, status, organizer_id, poster) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Draft', ?, ?)`,
    [title, type, description, date, time, capacity, registration_fee || 0, venue, club_id, req.user.id, poster],
    (err, result) => {
      if (err) {
        console.error("DB Insert Error:", err);
        return res.status(500).json({ message: "Server error", error: err.message });
      }
      res.json({ message: "Event created", eventId: result.insertId });
    }
  );
});

// ── Get organizer's own events ────────────────────────
router.get("/my", authorize(), (req, res) => {
  db.query(
    `SELECT events.*, clubs.club_name AS club, clubs.club_logo 
 FROM events 
 LEFT JOIN clubs ON events.club_id = clubs.club_id
 WHERE events.organizer_id = ? ORDER BY events.date DESC`,
    [req.user.id],
    (err, result) => {
      if (err) return res.status(500).json({ message: "Server error" });
      res.json(result);
    }
  );
});

// ── Get all events ────────────────────────────────────
router.get("/all", authorize(), (req, res) => {
  db.query(
    `SELECT 
        e.*, 
        c.club_name AS club,
        c.club_logo
     FROM events e
     LEFT JOIN clubs c 
       ON e.club_id = c.club_id
     ORDER BY e.date DESC`,
    (err, result) => {
      if (err) return res.status(500).json({ message: "Server error" });
      res.json(result);
    }
  );
});

// ── Get organizer issues (for organizer dashboard) ────
// ⚠️ MUST be before /:id routes
router.get("/issues", authorize(), (req, res) => {
  console.log("GET /issues hit | organizer id:", req.user.id);
  db.query(
    `SELECT i.*, e.title as event_title, s.name as student_name, s.roll_no
     FROM issues i
     JOIN events e ON e.id = i.event_id
     JOIN students s ON s.id = i.student_id
     WHERE e.organizer_id = ?
     ORDER BY i.created_at DESC`,
    [req.user.id],
    (err, results) => {
      if (err) {
        console.error("GET /issues DB error:", err);
        return res.status(500).json({ message: "Server error" });
      }
      res.json(results);
    }
  );
});

// ── Get student's own issues ──────────────────────────
// ⚠️ MUST be before /:id routes
router.get("/my-issues", authorize(), (req, res) => {
  console.log("GET /my-issues hit | student id:", req.user.id, "| role:", req.user.role);
  db.query(
    `SELECT i.*, e.title as event_title, e.date as event_date
     FROM issues i
     JOIN events e ON e.id = i.event_id
     WHERE i.student_id = ?
     ORDER BY i.created_at DESC`,
    [req.user.id],
    (err, results) => {
      if (err) {
        console.error("GET /my-issues DB error:", err);
        return res.status(500).json({ message: "Server error" });
      }
      console.log("GET /my-issues found:", results.length, "issues");
      res.json(results);
    }
  );
});

// ── Update issue status ───────────────────────────────
// ⚠️ MUST be before /:id routes
router.put("/issues/:id", authorize(), (req, res) => {
  const { status } = req.body;
  console.log("PUT /issues/:id | id:", req.params.id, "| status:", status);
  db.query(
    "UPDATE issues SET status = ? WHERE id = ?",
    [status, req.params.id],
    (err) => {
      if (err) {
        console.error("PUT /issues/:id DB error:", err);
        return res.status(500).json({ message: "Server error" });
      }
      res.json({ message: "Issue updated" });
    }
  );
});

// ── Get approved events (students, public) ────────────
router.get("/", (req, res) => {
  db.query(
    `SELECT events.*, clubs.club_name AS club, clubs.club_logo 
     FROM events 
     LEFT JOIN clubs ON events.club_id = clubs.club_id
     WHERE events.status IN ('Approved', 'Completed') ORDER BY events.date DESC`,
    (err, result) => {
      if (err) return res.status(500).json({ message: "Server error" });
      res.json(result);
    }
  );
});

// ── Approve event ─────────────────────────────────────
router.put("/:id/approve", authorize(), (req, res) => {
  db.query(
    "UPDATE events SET status = 'Approved' WHERE id = ?",
    [req.params.id],
    (err) => {
      if (err) return res.status(500).json({ message: "Server error" });
      res.json({ message: "Event approved" });
    }
  );
});

// ── Reject event ──────────────────────────────────────
router.put("/:id/reject", authorize(), (req, res) => {
  db.query(
    "UPDATE events SET status = 'Rejected' WHERE id = ?",
    [req.params.id],
    (err) => {
      if (err) return res.status(500).json({ message: "Server error" });
      res.json({ message: "Event rejected" });
    }
  );
});

// ── Upload poster ─────────────────────────────────────
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

// ── Get organizer contact for an event ───────────────
router.get("/:id/organizer", (req, res) => {
  db.query(
    `SELECT o.name, o.email, o.phone 
     FROM events e 
     JOIN organizers o ON e.organizer_id = o.id 
     WHERE e.id = ?`,
    [req.params.id],
    (err, result) => {
      if (err || !result.length) return res.status(404).json({ message: "Not found" });
      res.json(result[0]);
    }
  );
});

// ── Submit issue for an event ─────────────────────────
router.post("/:id/issues", authorize(), (req, res) => {
  const { message } = req.body;
  const eventId = req.params.id;

  db.query(
    `SELECT e.title, o.email AS organizer_email, o.name AS organizer_name 
     FROM events e 
     JOIN organizers o ON e.organizer_id = o.id 
     WHERE e.id = ?`,
    [eventId],
    (err, result) => {
      if (err || !result.length) {
        console.error("Fetch organizer error:", err);
        return res.status(500).json({ message: "Server error" });
      }

      const { title, organizer_email, organizer_name } = result[0];

      db.query(
        "INSERT INTO issues (student_id, event_id, message) VALUES (?, ?, ?)",
        [req.user.id, eventId, message],
        (err2) => {
          if (err2) {
            console.error("Issue insert error:", err2);
            return res.status(500).json({ message: "Server error" });
          }

           transporter.sendMail({
            from: `EVEXA <${process.env.EMAIL_USER}>`,
            to: organizer_email,
            subject: `New Issue Raised – ${title}`,
            html: `
              <h3>Hi ${organizer_name},</h3>
              <p>A student has raised an issue for your event <strong>${title}</strong>:</p>
              <blockquote>${message}</blockquote>
              <p>Please resolve it via the EVEXA dashboard.</p>
            `
          }, (mailErr) => {
            if (mailErr) console.warn("Email failed (non-fatal):", mailErr.message);
          });

          res.json({ message: "Issue submitted" });
        }
      );
    }
  );
});

// ── Delete event ──────────────────────────────────────
router.delete("/:id", authorize(), (req, res) => {
  db.query(
    "DELETE FROM events WHERE id = ? AND organizer_id = ?",
    [req.params.id, req.user.id],
    (err, result) => {
      if (err) return res.status(500).json({ message: "Server error" });
      if (result.affectedRows === 0)
        return res.status(404).json({ message: "Event not found or unauthorized" });
      res.json({ message: "Event deleted" });
    }
  );
});

// ── Get single event ──────────────────────────────────
// ⚠️ Always keep LAST among all GET routes
router.get("/:id", (req, res) => {
  db.query(
    `SELECT events.*, clubs.club_name AS club, clubs.club_logo 
 FROM events 
 LEFT JOIN clubs ON events.club_id = clubs.club_id
 WHERE events.id = ? AND events.status = 'Approved'`,
    [req.params.id],
    (err, result) => {
      if (err) return res.status(500).json({ message: "Server error" });
      if (!result.length) return res.status(404).json({ message: "Event not found" });
      res.json(result[0]);
    }
  );
});

module.exports = router;