// events.js
const express    = require("express");
const db         = require("../db");
const authorize  = require("../middleware/authMiddleware");
const upload     = require("../middleware/upload");
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const router = express.Router();

// ─────────────────────────────────────────────────────────────
//  HELPER — admin bypass check
// ─────────────────────────────────────────────────────────────
const isAdmin = (req) => req.user?.role === "admin";

// ─────────────────────────────────────────────────────────────
//  ⚠️  STATIC / NAMED ROUTES  — must come BEFORE  /:id  routes
// ─────────────────────────────────────────────────────────────

// ── Create event ──────────────────────────────────────────────
router.post("/", authorize(), upload.single("poster"), (req, res) => {
  const title            = (req.body.title || req.body.name || "").trim();
  const { type, description, date, time, capacity, registration_fee, venue, category, academic_year } = req.body;
  const club_id          = req.body.club_id || req.user.club_id || null;
  const organizer_label  = req.body.organizer || null;
  const poster           = req.file ? req.file.filename : null;

  if (!title) return res.status(400).json({ message: "Event title is required." });

  db.query(
    `INSERT INTO events 
      (title, type, description, date, time, capacity, registration_fee,
       venue, club_id, status, organizer_id, organizer_label, poster, category, academic_year)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Draft', ?, ?, ?, ?, ?)`,
    [
      title, type || null, description || null, date, time || null,
      capacity || null, registration_fee || 0, venue || null,
      club_id, req.user.id, organizer_label, poster,
      category || null, academic_year || null,
    ],
    (err, result) => {
      if (err) {
        console.error("DB Insert Error:", err);
        return res.status(500).json({ message: "Server error", error: err.message });
      }
      res.json({ message: "Event created", eventId: result.insertId });
    }
  );
});

// ── Bulk approve ──────────────────────────────────────────────
router.post("/bulk-approve", authorize(), (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || !ids.length)
    return res.status(400).json({ message: "No event IDs provided." });

  db.query(
    "UPDATE events SET status = 'Approved' WHERE id IN (?)",
    [ids],
    (err) => {
      if (err) {
        console.error("Bulk approve error:", err);
        return res.status(500).json({ message: "Server error" });
      }
      res.json({ message: `${ids.length} event(s) approved.` });
    }
  );
});

// ── Bulk delete ───────────────────────────────────────────────
router.post("/bulk-delete", authorize(), (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || !ids.length)
    return res.status(400).json({ message: "No event IDs provided." });

  db.query(
    "DELETE FROM events WHERE id IN (?)",
    [ids],
    (err) => {
      if (err) {
        console.error("Bulk delete error:", err);
        return res.status(500).json({ message: "Server error" });
      }
      res.json({ message: `${ids.length} event(s) deleted.` });
    }
  );
});

// ── Get organizer's own events ────────────────────────────────
router.get("/my", authorize(), (req, res) => {
  db.query(
    `SELECT e.*, c.club_name AS club, c.club_logo
     FROM events e
     LEFT JOIN clubs c ON e.club_id = c.club_id
     WHERE e.organizer_id = ?
     ORDER BY e.date DESC`,
    [req.user.id],
    (err, result) => {
      if (err) return res.status(500).json({ message: "Server error" });
      res.json(result);
    }
  );
});

// ── Get all events — FIXED: includes live participant count
//    and organizer_email so the admin Message button works
// ─────────────────────────────────────────────────────────────
router.get("/all", authorize(), (req, res) => {
  db.query(
    `SELECT
       e.*,
       c.club_name                               AS club,
       c.club_logo,
       o.email                                   AS organizer_email,
       o.name                                    AS organizer_name,
       (SELECT COUNT(*)
        FROM registrations r
        WHERE r.event_id = e.id)                 AS participants
     FROM events e
     LEFT JOIN clubs      c ON c.club_id      = e.club_id
     LEFT JOIN organizers o ON o.id           = e.organizer_id
     ORDER BY e.date DESC`,
    (err, result) => {
      if (err) {
        console.error("GET /all error:", err);
        return res.status(500).json({ message: "Server error", error: err.message });
      }
      res.json(result);
    }
  );
});

// ── Get organizer issues (organizer dashboard) ────────────────
router.get("/issues", authorize(), (req, res) => {
  console.log("GET /issues | organizer id:", req.user.id);
  db.query(
    `SELECT i.*, e.title AS event_title, s.name AS student_name, s.roll_no
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

// ── Get student's own issues ──────────────────────────────────
router.get("/my-issues", authorize(), (req, res) => {
  console.log("GET /my-issues | student id:", req.user.id, "| role:", req.user.role);
  db.query(
    `SELECT i.*, e.title AS event_title, e.date AS event_date
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
      res.json(results);
    }
  );
});

// ── Get approved events (students / public) ───────────────────
router.get("/", (req, res) => {
  db.query(
    `SELECT e.*, c.club_name AS club, c.club_logo
     FROM events e
     LEFT JOIN clubs c ON e.club_id = c.club_id
     WHERE e.status IN ('Approved', 'Completed')
     ORDER BY e.date DESC`,
    (err, result) => {
      if (err) return res.status(500).json({ message: "Server error" });
      res.json(result);
    }
  );
});

// ─────────────────────────────────────────────────────────────
//  DYNAMIC  /:id  ROUTES  — keep these AFTER all named routes
// ─────────────────────────────────────────────────────────────

// ── Approve event ─────────────────────────────────────────────
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

// ── Reject event ──────────────────────────────────────────────
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

// ── General edit event (admin + organizer) ────────────────────
router.put("/:id", authorize(), (req, res) => {
  const title         = (req.body.title || req.body.name || "").trim();
  const { organizer, date, category, academic_year, status,
          type, description, time, capacity, venue } = req.body;

  const whereClause   = isAdmin(req)
    ? "WHERE id = ?"
    : "WHERE id = ? AND organizer_id = ?";
  const whereParams   = isAdmin(req)
    ? [req.params.id]
    : [req.params.id, req.user.id];

  db.query(
    `UPDATE events SET
       title          = COALESCE(NULLIF(?, ''), title),
       organizer_label= COALESCE(?, organizer_label),
       date           = COALESCE(NULLIF(?, ''), date),
       category       = COALESCE(NULLIF(?, ''), category),
       academic_year  = COALESCE(NULLIF(?, ''), academic_year),
       status         = COALESCE(NULLIF(?, ''), status),
       type           = COALESCE(NULLIF(?, ''), type),
       description    = COALESCE(NULLIF(?, ''), description),
       time           = COALESCE(NULLIF(?, ''), time),
       capacity       = COALESCE(NULLIF(?, ''), capacity),
       venue          = COALESCE(NULLIF(?, ''), venue)
     ${whereClause}`,
    [
      title, organizer || null,
      date || null, category || null, academic_year || null,
      status || null, type || null, description || null,
      time || null, capacity || null, venue || null,
      ...whereParams,
    ],
    (err, result) => {
      if (err) {
        console.error("Update event error:", err);
        return res.status(500).json({ message: "Server error", error: err.message });
      }
      if (result.affectedRows === 0)
        return res.status(404).json({ message: "Event not found or unauthorized." });
      res.json({ message: "Event updated" });
    }
  );
});

// ── Upload poster ─────────────────────────────────────────────
router.put("/:id/poster", authorize(), upload.single("poster"), (req, res) => {
  const poster = req.file ? req.file.filename : null;
  if (!poster) return res.status(400).json({ message: "No file uploaded." });

  db.query(
    "UPDATE events SET poster = ? WHERE id = ? AND organizer_id = ?",
    [poster, req.params.id, req.user.id],
    (err) => {
      if (err) return res.status(500).json({ message: "Upload failed" });
      res.json({ message: "Poster uploaded successfully" });
    }
  );
});

// ── Get organizer contact for an event ────────────────────────
router.get("/:id/organizer", (req, res) => {
  db.query(
    `SELECT o.name, o.email, o.phone
     FROM events e
     JOIN organizers o ON e.organizer_id = o.id
     WHERE e.id = ?`,
    [req.params.id],
    (err, result) => {
      if (err || !result.length)
        return res.status(404).json({ message: "Organizer not found" });
      res.json(result[0]);
    }
  );
});

// ── Submit issue for an event ─────────────────────────────────
router.post("/:id/issues", authorize(), (req, res) => {
  const { message } = req.body;
  const eventId = req.params.id;

  if (!message?.trim())
    return res.status(400).json({ message: "Issue message cannot be empty." });

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
            from:    `EVEXA <${process.env.EMAIL_USER}>`,
            to:      organizer_email,
            subject: `New Issue Raised – ${title}`,
            html: `
              <h3>Hi ${organizer_name},</h3>
              <p>A student has raised an issue for your event <strong>${title}</strong>:</p>
              <blockquote>${message}</blockquote>
              <p>Please resolve it via the EVEXA dashboard.</p>
            `,
          }, (mailErr) => {
            if (mailErr) console.warn("Email failed (non-fatal):", mailErr.message);
          });

          res.json({ message: "Issue submitted" });
        }
      );
    }
  );
});

// ── Update issue status ───────────────────────────────────────
router.put("/issues/:issueId", authorize(), (req, res) => {
  const { status } = req.body;
  console.log("PUT /issues/:issueId | id:", req.params.issueId, "| status:", status);
  db.query(
    "UPDATE issues SET status = ? WHERE id = ?",
    [status, req.params.issueId],
    (err) => {
      if (err) {
        console.error("PUT /issues/:issueId DB error:", err);
        return res.status(500).json({ message: "Server error" });
      }
      res.json({ message: "Issue updated" });
    }
  );
});

// ── Delete event ──────────────────────────────────────────────
router.delete("/:id", authorize(), (req, res) => {
  const query  = isAdmin(req)
    ? "DELETE FROM events WHERE id = ?"
    : "DELETE FROM events WHERE id = ? AND organizer_id = ?";
  const params = isAdmin(req)
    ? [req.params.id]
    : [req.params.id, req.user.id];

  db.query(query, params, (err, result) => {
    if (err) {
      console.error("Delete event error:", err);
      return res.status(500).json({ message: "Server error" });
    }
    if (result.affectedRows === 0)
      return res.status(404).json({ message: "Event not found or unauthorized." });
    res.json({ message: "Event deleted" });
  });
});

// ── Get single event ──────────────────────────────────────────
// ⚠️ Always keep LAST among all GET routes
router.get("/:id", (req, res) => {
  db.query(
    `SELECT e.*, c.club_name AS club, c.club_logo
     FROM events e
     LEFT JOIN clubs c ON e.club_id = c.club_id
     WHERE e.id = ? AND e.status = 'Approved'`,
    [req.params.id],
    (err, result) => {
      if (err) return res.status(500).json({ message: "Server error" });
      if (!result.length) return res.status(404).json({ message: "Event not found" });
      res.json(result[0]);
    }
  );
});

module.exports = router;