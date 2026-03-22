const express  = require("express");
const router   = express.Router();
const db       = require("../db");
const authorize = require("../middleware/authMiddleware");

function facultyOnly(req, res, next) {
  if (req.user?.role !== "FACULTY") {
    return res.status(403).json({ message: "Faculty access only." });
  }
  next();
}

// GET /api/faculty/me
router.get("/me", authorize(), facultyOnly, (req, res) => {
  db.query(
    "SELECT id, faculty_no, name, email, department, phone_no FROM faculty WHERE id = ?",
    [req.user.id],
    (err, result) => {
      if (err)            return res.status(500).json({ message: "Server error", detail: err.message });
      if (!result.length) return res.status(404).json({ message: "Faculty not found" });
      res.json({ ...result[0], role: "FACULTY" });
    }
  );
});
// GET /api/faculty/proposals
// Uses club_name (not name) to match your clubs table schema
router.get("/proposals", authorize(), facultyOnly, (req, res) => {
  const sql = `
    SELECT
      ep.id,
      ep.title,
      ep.description,
      ep.objectives,
      ep.venue,
      ep.date              AS event_date,
      ep.capacity,
      ep.registration_fee,
      ep.category,
      ep.status,
      ep.document_url,
      ep.created_at,
      c.club_name          AS club,
      c.club_id,
      o.name               AS organizer
    FROM event_proposals ep
    LEFT JOIN clubs      c ON c.club_id = ep.club_id
    LEFT JOIN organizers o ON o.id      = ep.organizer_id
    WHERE c.faculty_id = ?
    ORDER BY ep.created_at DESC
  `;
  db.query(sql, [req.user.id], (err, result) => {
    if (err) {
      console.error("GET /faculty/proposals error:", err);
      return res.status(500).json({ message: "Server error", detail: err.message });
    }
    res.json(result);
  });
});

// PATCH /api/faculty/proposals/:id/approve
router.patch("/proposals/:id/approve", authorize(), facultyOnly, (req, res) => {
  db.query(
    "UPDATE event_proposals SET status = 'approved', reviewed_by = ?, reviewed_at = NOW() WHERE id = ?",
    [req.user.id, req.params.id],
    (err, result) => {
      if (err)                  return res.status(500).json({ message: "Server error", detail: err.message });
      if (!result.affectedRows) return res.status(404).json({ message: "Proposal not found" });
      res.json({ message: "Proposal approved" });
    }
  );
});

// PATCH /api/faculty/proposals/:id/reject
router.patch("/proposals/:id/reject", authorize(), facultyOnly, (req, res) => {
  db.query(
    "UPDATE event_proposals SET status = 'rejected', reviewed_by = ?, reviewed_at = NOW() WHERE id = ?",
    [req.user.id, req.params.id],
    (err, result) => {
      if (err)                  return res.status(500).json({ message: "Server error", detail: err.message });
      if (!result.affectedRows) return res.status(404).json({ message: "Proposal not found" });
      res.json({ message: "Proposal rejected" });
    }
  );
});

// GET /api/faculty/certificates
router.get("/certificates", authorize(), facultyOnly, (req, res) => {
  const sql = `
    SELECT
      cr.id,
      cr.status                     AS certificate_status,
      cr.created_at,
      s.name                        AS student_name,
      s.roll_no,
      e.title                       AS event_title,
      e.date                        AS event_date,
      c.club_name                   AS club,
      COALESCE(att.attended, 0)     AS attended
    FROM certificate_requests cr
    JOIN students  s   ON s.id       = cr.student_id
    JOIN events    e   ON e.id       = cr.event_id
    JOIN clubs     c   ON c.club_id  = e.club_id
    LEFT JOIN attendance att
           ON att.student_id = cr.student_id
          AND att.event_id   = cr.event_id
    WHERE c.faculty_id = ?
    ORDER BY cr.created_at DESC
  `;
  db.query(sql, [req.user.id], (err, result) => {
    if (err) {
      console.error("GET /faculty/certificates error:", err);
      return res.status(500).json({ message: "Server error", detail: err.message });
    }
    res.json(result);
  });
});

// PATCH /api/faculty/certificates/:id/approve
router.patch("/certificates/:id/approve", authorize(), facultyOnly, (req, res) => {
  db.query(
    "UPDATE certificate_requests SET status = 'approved', reviewed_by = ?, reviewed_at = NOW() WHERE id = ?",
    [req.user.id, req.params.id],
    (err, result) => {
      if (err)                  return res.status(500).json({ message: "Server error", detail: err.message });
      if (!result.affectedRows) return res.status(404).json({ message: "Certificate not found" });
      res.json({ message: "Certificate approved" });
    }
  );
});

// PATCH /api/faculty/certificates/:id/reject
router.patch("/certificates/:id/reject", authorize(), facultyOnly, (req, res) => {
  db.query(
    "UPDATE certificate_requests SET status = 'rejected', reviewed_by = ?, reviewed_at = NOW() WHERE id = ?",
    [req.user.id, req.params.id],
    (err, result) => {
      if (err)                  return res.status(500).json({ message: "Server error", detail: err.message });
      if (!result.affectedRows) return res.status(404).json({ message: "Certificate not found" });
      res.json({ message: "Certificate rejected" });
    }
  );
});

// GET /api/faculty/feedback
router.get("/feedback", authorize(), facultyOnly, (req, res) => {
  const sql = `
    SELECT
      f.id,
      f.rating,
      f.comment,
      f.created_at,
      s.name        AS student_name,
      e.title       AS event_title,
      c.club_name   AS club
    FROM feedback f
    JOIN students s  ON s.id      = f.student_id
    JOIN events   e  ON e.id      = f.event_id
    JOIN clubs    c  ON c.club_id = e.club_id
    WHERE c.faculty_id = ?
    ORDER BY f.created_at DESC
  `;
  db.query(sql, [req.user.id], (err, result) => {
    if (err) {
      console.error("GET /faculty/feedback error:", err);
      return res.status(500).json({ message: "Server error", detail: err.message });
    }
    res.json(result);
  });
});


// GET /api/faculty/events/:id/participants
// Any faculty can download participants for any event
router.get("/events/:id/participants", authorize(), facultyOnly, (req, res) => {
  const sql = `
    SELECT
      s.name,
      s.email,
      s.department,
      s.phone
    FROM registrations r
    JOIN students s ON s.id = r.student_id
    WHERE r.event_id = ?
    ORDER BY s.name ASC
  `;
  db.query(sql, [req.params.id], (err, result) => {
    if (err) {
      console.error("GET /faculty/events/:id/participants error:", err);
      return res.status(500).json({ message: "Server error", detail: err.message });
    }
    res.json(result);
  });
});

module.exports = router;