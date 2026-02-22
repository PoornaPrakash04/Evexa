//events.js
const express = require("express");
const db = require("../db");
const authorize = require("../middleware/authMiddleware");
const upload = require("../middleware/upload");
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "Poorna@gmail.com",     
    pass: "poorna@123"    
  }
});

const router = express.Router();

// ── Create event ──────────────────────────────────────
router.post("/", authorize(), upload.single("poster"), (req, res) => {
  const { title, type, description, date, time, capacity, registration_fee, venue } = req.body;
  const poster = req.file ? req.file.filename : null;
  const club = req.user.club;

  db.query(
    `INSERT INTO events 
    (title, type, description, date, time, capacity, registration_fee, venue, club, status, organizer_id, poster) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Draft', ?, ?)`,
    [title, type, description, date, time, capacity, registration_fee || 0, venue, club, req.user.id, poster],
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
    "SELECT * FROM events WHERE organizer_id = ? ORDER BY date DESC",
    [req.user.id],
    (err, result) => {
      if (err) return res.status(500).json({ message: "Server error" });
      res.json(result);
    }
  );
});

// ── Get all events (admin) ────────────────────────────
router.get("/all", authorize(), (req, res) => {
  console.log("📋 Getting all events");
  db.query("SELECT * FROM events ORDER BY date DESC", (err, result) => {
    if (err) {
      console.error("Error fetching all events:", err);
      return res.status(500).json({ message: "Server error" });
    }
    console.log(`✅ Found ${result.length} total events`);
    res.json(result);
  });
});

// ── Get approved events (students) ───────────────────
router.get("/", (req, res) => {
  db.query(
    "SELECT * FROM events WHERE status = 'Approved' ORDER BY date DESC",
    (err, result) => {
      if (err) return res.status(500).json({ message: "Server error" });
      res.json(result);
    }
  );
});

// ── Approve event ─────────────────────────────────────
router.put("/:id/approve", authorize(), (req, res) => {
  db.query(
    "UPDATE events SET status='Approved' WHERE id=?",
    [req.params.id],
    () => res.json({ message: "Event approved" })
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
// ⚠️ Must be BEFORE /:id route
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
// ⚠️ Must be BEFORE /:id route
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
        "INSERT INTO issues (student_id, event_id, message, created_at) VALUES (?, ?, ?, NOW())",
        [req.user.id, eventId, message],
        (err2) => {
          if (err2) {
            console.error("Issue insert error:", err2);
            return res.status(500).json({ message: "Server error" });
          }

          transporter.sendMail({
            from: "EVEXA <your@gmail.com>",
            to: organizer_email,
            subject: `New Issue Raised – ${title}`,
            html: `
              <h3>Hi ${organizer_name},</h3>
              <p>A student has raised an issue for your event <strong>${title}</strong>:</p>
              <blockquote>${message}</blockquote>
              <p>From: ${req.user.name} (${req.user.email})</p>
              <p>Please resolve it via the EVEXA dashboard.</p>
            `
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
      if (err) {
        console.error("DB error:", err);
        return res.status(500).json({ message: "Server error" });
      }
      if (result.affectedRows === 0)
        return res.status(404).json({ message: "Event not found or unauthorized" });
      res.json({ message: "Event deleted" });
    }
  );
});

// ── Get single event ──────────────────────────────────
// ⚠️ Always keep this LAST among /:id routes
router.get("/:id", (req, res) => {
  db.query(
    "SELECT * FROM events WHERE id = ? AND status = 'Approved'",
    [req.params.id],
    (err, result) => {
      if (err) return res.status(500).json({ message: "Server error" });
      if (!result.length) return res.status(404).json({ message: "Event not found" });
      res.json(result[0]);
    }
  );
});

module.exports = router;