const express = require("express");
const db = require("../db");
const authorize = require("../middleware/authMiddleware");

const router = express.Router();

// ✅ GET /api/registrations/count/:eventId
router.get("/count/:eventId", authorize(), (req, res) => {
  const eventId = Number(req.params.eventId);
  if (!eventId) return res.status(400).json({ message: "Invalid event id" });

  db.query(
    "SELECT COUNT(*) AS count FROM registrations WHERE event_id = ?",
    [eventId],
    (err, rows) => {
      if (err) {
        console.error("❌ count error:", err);
        return res.status(500).json({ message: "Count failed", error: err.message });
      }
      res.json({ count: rows?.[0]?.count || 0 });
    }
  );
});

// ✅ GET /api/registrations/my
// Organizer sees registrations ONLY for events they created (organizer_id)
router.get("/my", authorize(), (req, res) => {
  const organizerId = req.user?.id;
  if (!organizerId) return res.status(401).json({ message: "No organizer id in token" });

  const sql = `
    SELECT
      r.id,
      COALESCE(s.name, 'Unknown Student') AS name,
      e.title AS event_title,
      r.registered_at,
      'Registered' AS status
    FROM registrations r
    JOIN events e ON e.id = r.event_id
    LEFT JOIN students s ON s.id = r.student_id
    WHERE e.organizer_id = ?
    ORDER BY r.registered_at DESC
  `;

  db.query(sql, [organizerId], (err, rows) => {
    if (err) {
      console.error("❌ registrations/my error:", err);
      return res.status(500).json({ message: "Failed to load registrations", error: err.message });
    }
    res.json(rows || []);
  });
});
// ✅ GET /api/registrations/event/:eventId
router.get("/event/:eventId", authorize(), (req, res) => {
  const eventId = Number(req.params.eventId);
  if (!eventId) return res.status(400).json({ message: "Invalid event id" });

  const sql = `
    SELECT
      r.id,
      COALESCE(s.name, 'Unknown Student') AS name,
      r.registered_at,
      'Registered' AS status
    FROM registrations r
    LEFT JOIN students s ON s.id = r.student_id
    WHERE r.event_id = ?
    ORDER BY r.registered_at DESC
  `;

  db.query(sql, [eventId], (err, rows) => {
    if (err) {
      console.error("❌ registrations/event error:", err);
      return res.status(500).json({ message: "Failed to load event registrations", error: err.message });
    }
    res.json(rows || []);
  });
});

// ✅ GET /api/registrations  (global)
router.get("/", authorize(), (req, res) => {
  const sql = `
    SELECT
      r.id,
      COALESCE(s.name, 'Unknown Student') AS name,
      COALESCE(e.title, 'Unknown Event') AS event_title,
      r.registered_at,
      'Registered' AS status
    FROM registrations r
    LEFT JOIN students s ON s.id = r.student_id
    LEFT JOIN events e ON e.id = r.event_id
    ORDER BY r.registered_at DESC
  `;

  db.query(sql, (err, rows) => {
    if (err) {
      console.error("❌ registrations fetch error:", err);
      return res.status(500).json({ message: "Failed to load registrations", error: err.message });
    }
    res.json(rows || []);
  });
});

module.exports = router;