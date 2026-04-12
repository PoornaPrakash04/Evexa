const express = require("express");
const db = require("../db");
const authorize = require("../middleware/authMiddleware");

const router = express.Router();



/**
 * Parse and validate pagination query params.
 * Returns { limit, offset } or sends a 400 and returns null.
 */
function parsePagination(req, res, { defaultLimit = 20, maxLimit = 100 } = {}) {
  const page  = Math.max(1, parseInt(req.query.page)  || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(req.query.limit) || defaultLimit));
  return { limit, offset: (page - 1) * limit, page };
}





router.get("/count/:eventId", authorize(["organizer", "admin"]), (req, res) => {
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




router.get("/my", authorize(["organizer"]), (req, res) => {
  const organizerId = req.user?.id;
  if (!organizerId) return res.status(401).json({ message: "No organizer id in token" });

  const { limit, offset, page } = parsePagination(req, res);

  
  const conditions = ["e.organizer_id = ?"];
  const params     = [organizerId];

  if (req.query.search) {
    conditions.push("(s.name LIKE ? OR e.title LIKE ?)");
    const like = `%${req.query.search}%`;
    params.push(like, like);
  }
  if (req.query.from_date) {
    conditions.push("r.registered_at >= ?");
    params.push(req.query.from_date);
  }
  if (req.query.to_date) {
    conditions.push("r.registered_at <= ?");
    params.push(req.query.to_date);
  }

  const where = conditions.join(" AND ");

  
  const countSql = `
    SELECT COUNT(*) AS total
    FROM registrations r
    JOIN events e ON e.id = r.event_id
    LEFT JOIN students s ON s.id = r.student_id
    WHERE ${where}
  `;

  db.query(countSql, params, (err, countRows) => {
    if (err) {
      console.error("❌ registrations/my count error:", err);
      return res.status(500).json({ message: "Failed to count registrations", error: err.message });
    }

    const total = countRows?.[0]?.total || 0;

    const dataSql = `
      SELECT
        r.id,
        COALESCE(s.name, 'Unknown Student') AS name,
        e.title AS event_title,
        r.registered_at,
        'Registered' AS status
      FROM registrations r
      JOIN events e ON e.id = r.event_id
      LEFT JOIN students s ON s.id = r.student_id
      WHERE ${where}
      ORDER BY r.registered_at DESC
      LIMIT ? OFFSET ?
    `;

    db.query(dataSql, [...params, limit, offset], (err, rows) => {
      if (err) {
        console.error("❌ registrations/my error:", err);
        return res.status(500).json({ message: "Failed to load registrations", error: err.message });
      }

      res.json({
        data: rows || [],
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    });
  });
});




router.get("/event/:eventId", authorize(["organizer", "admin"]), (req, res) => {
  const eventId = Number(req.params.eventId);
  if (!eventId) return res.status(400).json({ message: "Invalid event id" });

  const organizerId = req.user?.id;
  const userRole    = req.user?.role;
  if (!organizerId) return res.status(401).json({ message: "No organizer id in token" });

  const { limit, offset, page } = parsePagination(req, res);

  
  
  const conditions = ["r.event_id = ?"];
  const params     = [eventId];

  if (userRole !== "admin") {
    // Allow any organizer within the same club to view registrations,
    // not just the one who created the event
    conditions.push("e.club_id = (SELECT club_id FROM organizers WHERE id = ?)");
    params.push(organizerId);
  }

  if (req.query.search) {
    conditions.push("(s.name LIKE ? OR s.email LIKE ?)");
    const like = `%${req.query.search}%`;
    params.push(like, like);
  }
  if (req.query.department) {
    conditions.push("s.department = ?");
    params.push(req.query.department);
  }
  if (req.query.class) {
    conditions.push("s.class = ?");
    params.push(req.query.class);
  }
  if (req.query.from_date) {
    conditions.push("r.registered_at >= ?");
    params.push(req.query.from_date);
  }
  if (req.query.to_date) {
    conditions.push("r.registered_at <= ?");
    params.push(req.query.to_date);
  }

  const where = conditions.join(" AND ");

  
  const countSql = `
    SELECT COUNT(*) AS total
    FROM registrations r
    JOIN events e ON e.id = r.event_id
    LEFT JOIN students s ON s.id = r.student_id
    WHERE ${where}
  `;

  db.query(countSql, params, (err, countRows) => {
    if (err) {
      console.error("❌ registrations/event count error:", err);
      return res.status(500).json({ message: "Failed to count event registrations", error: err.message });
    }

    const total = countRows?.[0]?.total || 0;

    const dataSql = `
      SELECT
        r.id,
        COALESCE(s.name, 'Unknown Student') AS name,
        s.email,
        s.phone,
        s.class,
        s.department,
        e.title AS event_title,
        r.registered_at,
        'Registered' AS status
      FROM registrations r
      JOIN events e ON e.id = r.event_id
      LEFT JOIN students s ON s.id = r.student_id
      WHERE ${where}
      ORDER BY r.registered_at DESC
      LIMIT ? OFFSET ?
    `;

    db.query(dataSql, [...params, limit, offset], (err, rows) => {
      if (err) {
        console.error("❌ registrations/event error:", err);
        return res.status(500).json({ message: "Failed to load event registrations", error: err.message });
      }

      res.json({
        data: rows || [],
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    });
  });
});



router.get("/", authorize(["admin"]), (req, res) => {
  const { limit, offset, page } = parsePagination(req, res);

  
  const conditions = [];
  const params     = [];

  if (req.query.search) {
    conditions.push("(s.name LIKE ? OR e.title LIKE ?)");
    const like = `%${req.query.search}%`;
    params.push(like, like);
  }
  if (req.query.from_date) {
    conditions.push("r.registered_at >= ?");
    params.push(req.query.from_date);
  }
  if (req.query.to_date) {
    conditions.push("r.registered_at <= ?");
    params.push(req.query.to_date);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const countSql = `
    SELECT COUNT(*) AS total
    FROM registrations r
    LEFT JOIN students s ON s.id = r.student_id
    LEFT JOIN events   e ON e.id = r.event_id
    ${where}
  `;

  db.query(countSql, params, (err, countRows) => {
    if (err) {
      console.error("❌ registrations count error:", err);
      return res.status(500).json({ message: "Failed to count registrations", error: err.message });
    }

    const total = countRows?.[0]?.total || 0;

    const dataSql = `
      SELECT
        r.id,
        COALESCE(s.name,  'Unknown Student') AS name,
        COALESCE(e.title, 'Unknown Event')   AS event_title,
        r.registered_at,
        'Registered' AS status
      FROM registrations r
      LEFT JOIN students s ON s.id = r.student_id
      LEFT JOIN events   e ON e.id = r.event_id
      ${where}
      ORDER BY r.registered_at DESC
      LIMIT ? OFFSET ?
    `;

    db.query(dataSql, [...params, limit, offset], (err, rows) => {
      if (err) {
        console.error("❌ registrations fetch error:", err);
        return res.status(500).json({ message: "Failed to load registrations", error: err.message });
      }

      res.json({
        data: rows || [],
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    });
  });
});

module.exports = router;