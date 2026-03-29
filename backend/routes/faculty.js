// faculty.js
const express   = require("express");
const router    = express.Router();
const db        = require("../db");
const authorize = require("../middleware/authMiddleware");
const bcrypt    = require("bcrypt");

// ─────────────────────────────────────────────────────────────────────────────
// ROLE CONSTANTS  (matches your `roles` table)
// ─────────────────────────────────────────────────────────────────────────────
const ROLE = {
  HOD:                 1,
  STAFF:               2,
  STAFF_ADVISOR:       3,
  FACULTY_COORDINATOR: 4,
  DEAN:                5,
};

function facultyOnly(req, res, next) {
  if (req.user?.role !== "FACULTY") {
    return res.status(403).json({ message: "Faculty access only." });
  }
  next();
}

// Helper: get the logged-in faculty's role_id
async function getFacultyRoleId(facultyId) {
  const [rows] = await db.promise().query(
    "SELECT role_id FROM faculty WHERE id = ?", [facultyId]
  );
  return rows[0]?.role_id ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/faculty/me
// ─────────────────────────────────────────────────────────────────────────────
router.get("/me", authorize(), facultyOnly, (req, res) => {
  db.query(
    `SELECT f.id, f.faculty_no, f.name, f.email, f.department, f.phone_no,
            f.role_id, r.role_name
     FROM faculty f
     LEFT JOIN roles r ON r.id = f.role_id
     WHERE f.id = ?`,
    [req.user.id],
    (err, result) => {
      if (err)            return res.status(500).json({ message: "Server error", detail: err.message });
      if (!result.length) return res.status(404).json({ message: "Faculty not found" });
      res.json({ ...result[0], role: "FACULTY" });
    }
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/faculty/me
// ─────────────────────────────────────────────────────────────────────────────
router.put("/me", authorize(), facultyOnly, async (req, res) => {
  const { name, email, department, phone_no, current_password, new_password } = req.body;

  if (!name || !email || !department || !phone_no) {
    return res.status(400).json({ message: "name, email, department and phone_no are required." });
  }

  try {
    if (current_password || new_password) {
      if (!current_password || !new_password) {
        return res.status(400).json({ message: "Both current_password and new_password are required to change password." });
      }
      if (new_password.length < 6) {
        return res.status(400).json({ message: "New password must be at least 6 characters." });
      }
      const [rows] = await db.promise().query(
        "SELECT password FROM faculty WHERE id = ?", [req.user.id]
      );
      if (!rows.length) return res.status(404).json({ message: "Faculty not found" });
      const match = await bcrypt.compare(current_password, rows[0].password);
      if (!match) return res.status(401).json({ message: "Current password is incorrect." });
      const hashed = await bcrypt.hash(new_password, 10);
      await db.promise().query(
        "UPDATE faculty SET name = ?, email = ?, department = ?, phone_no = ?, password = ? WHERE id = ?",
        [name, email, department, phone_no, hashed, req.user.id]
      );
    } else {
      await db.promise().query(
        "UPDATE faculty SET name = ?, email = ?, department = ?, phone_no = ? WHERE id = ?",
        [name, email, department, phone_no, req.user.id]
      );
    }
    res.json({ message: "Profile updated successfully." });
  } catch (err) {
    console.error("PUT /faculty/me error:", err);
    res.status(500).json({ message: "Server error", detail: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/faculty/proposals
// ─────────────────────────────────────────────────────────────────────────────
// • Faculty Coordinator (role_id = 4): sees only 'Pending' proposals for
//   clubs they are incharge of. Approving forwards to Hall Coordinator.
// • Other roles: original behaviour — all proposals for their clubs.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/proposals", authorize(), facultyOnly, async (req, res) => {
  try {
    const roleId = await getFacultyRoleId(req.user.id);

    // Faculty Coordinator: only show proposals still waiting for their review
    const statusFilter = roleId === ROLE.FACULTY_COORDINATOR
      ? "AND LOWER(e.status) = 'pending'"
      : "";

    const sql = `
      SELECT
        e.id,
        e.title,
        e.description,
        e.venue,
        e.date              AS event_date,
        e.time              AS event_time,
        e.capacity,
        e.registration_fee,
        e.category,
        e.type,
        e.status,
        e.remark,
        e.poster            AS document_url,
        e.created_at,
        c.club_name         AS club,
        c.club_id,
        o.name              AS organizer
      FROM events e
      LEFT JOIN clubs      c ON c.club_id = e.club_id
      LEFT JOIN organizers o ON o.id      = e.organizer_id
      WHERE c.faculty_id = ?
        ${statusFilter}
      ORDER BY e.created_at DESC
    `;

    db.query(sql, [req.user.id], (err, result) => {
      if (err) {
        console.error("GET /faculty/proposals error:", err);
        return res.status(500).json({ message: "Server error", detail: err.message });
      }
      res.json(result);
    });
  } catch (err) {
    console.error("GET /faculty/proposals error:", err);
    res.status(500).json({ message: "Server error", detail: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/faculty/proposals/:id/approve
// Faculty Coordinator: sets status = 'faculty_approved' (forwards to hall)
// Other roles:        sets status = 'Approved'
// ─────────────────────────────────────────────────────────────────────────────
router.patch("/proposals/:id/approve", authorize(), facultyOnly, async (req, res) => {
  const { remark } = req.body || {};
  try {
    const roleId    = await getFacultyRoleId(req.user.id);
    const newStatus = roleId === ROLE.FACULTY_COORDINATOR ? "faculty_approved" : "Approved";

    const sql = remark
      ? `UPDATE events e JOIN clubs c ON c.club_id = e.club_id
         SET e.status = ?, e.remark = ?
         WHERE e.id = ? AND c.faculty_id = ?`
      : `UPDATE events e JOIN clubs c ON c.club_id = e.club_id
         SET e.status = ?
         WHERE e.id = ? AND c.faculty_id = ?`;

    const params = remark
      ? [newStatus, remark, req.params.id, req.user.id]
      : [newStatus, req.params.id, req.user.id];

    db.query(sql, params, (err, result) => {
      if (err)                  return res.status(500).json({ message: "Server error", detail: err.message });
      if (!result.affectedRows) return res.status(404).json({ message: "Event not found or not assigned to your club." });
      res.json({
        message: roleId === ROLE.FACULTY_COORDINATOR
          ? "Proposal forwarded to Hall Coordinator for venue confirmation"
          : "Event approved"
      });
    });
  } catch (err) {
    res.status(500).json({ message: "Server error", detail: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/faculty/proposals/:id/reject
// ─────────────────────────────────────────────────────────────────────────────
router.patch("/proposals/:id/reject", authorize(), facultyOnly, (req, res) => {
  const { remark } = req.body || {};
  const sql = remark
    ? `UPDATE events e JOIN clubs c ON c.club_id = e.club_id
       SET e.status = 'Rejected', e.remark = ?
       WHERE e.id = ? AND c.faculty_id = ?`
    : `UPDATE events e JOIN clubs c ON c.club_id = e.club_id
       SET e.status = 'Rejected'
       WHERE e.id = ? AND c.faculty_id = ?`;
  const params = remark
    ? [remark, req.params.id, req.user.id]
    : [req.params.id, req.user.id];

  db.query(sql, params, (err, result) => {
    if (err)                  return res.status(500).json({ message: "Server error", detail: err.message });
    if (!result.affectedRows) return res.status(404).json({ message: "Event not found or not assigned to your club." });
    res.json({ message: "Event rejected" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/faculty/events/:id/approve  (alias for event-source items)
// ─────────────────────────────────────────────────────────────────────────────
router.patch("/events/:id/approve", authorize(), facultyOnly, async (req, res) => {
  const { remark } = req.body || {};
  try {
    const roleId    = await getFacultyRoleId(req.user.id);
    const newStatus = roleId === ROLE.FACULTY_COORDINATOR ? "faculty_approved" : "Approved";

    const sql = remark
      ? `UPDATE events e JOIN clubs c ON c.club_id = e.club_id
         SET e.status = ?, e.remark = ?
         WHERE e.id = ? AND c.faculty_id = ?`
      : `UPDATE events e JOIN clubs c ON c.club_id = e.club_id
         SET e.status = ?
         WHERE e.id = ? AND c.faculty_id = ?`;

    const params = remark
      ? [newStatus, remark, req.params.id, req.user.id]
      : [newStatus, req.params.id, req.user.id];

    db.query(sql, params, (err, result) => {
      if (err)                  return res.status(500).json({ message: "Server error", detail: err.message });
      if (!result.affectedRows) return res.status(404).json({ message: "Event not found or not assigned to your club." });
      res.json({
        message: roleId === ROLE.FACULTY_COORDINATOR
          ? "Proposal forwarded to Hall Coordinator for venue confirmation"
          : "Event approved"
      });
    });
  } catch (err) {
    res.status(500).json({ message: "Server error", detail: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/faculty/events/:id/reject
// ─────────────────────────────────────────────────────────────────────────────
router.patch("/events/:id/reject", authorize(), facultyOnly, (req, res) => {
  const { remark } = req.body || {};
  const sql = remark
    ? `UPDATE events e JOIN clubs c ON c.club_id = e.club_id
       SET e.status = 'Rejected', e.remark = ?
       WHERE e.id = ? AND c.faculty_id = ?`
    : `UPDATE events e JOIN clubs c ON c.club_id = e.club_id
       SET e.status = 'Rejected'
       WHERE e.id = ? AND c.faculty_id = ?`;
  const params = remark
    ? [remark, req.params.id, req.user.id]
    : [req.params.id, req.user.id];

  db.query(sql, params, (err, result) => {
    if (err)                  return res.status(500).json({ message: "Server error", detail: err.message });
    if (!result.affectedRows) return res.status(404).json({ message: "Event not found or not assigned to your club." });
    res.json({ message: "Event rejected" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
//  HALL COORDINATOR ROUTES
//  Hall Coordinators manage specific venues.  The `venues` table must have a
//  `coordinator_faculty_id` column pointing to the faculty record.
//  They see proposals only AFTER the Faculty Coordinator has forwarded them
//  (status = 'faculty_approved') and only for venues they manage.
// ══════════════════════════════════════════════════════════════════════════════
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/faculty/hall/proposals
// Returns faculty_approved events whose venue is managed by this coordinator.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/hall/proposals", authorize(), facultyOnly, async (req, res) => {
  try {
    const [myVenues] = await db.promise().query(
      "SELECT id, name FROM venues WHERE coordinator_faculty_id = ?",
      [req.user.id]
    );

    if (!myVenues.length) return res.json([]);

    const venueNames    = myVenues.map(v => v.name);
    const placeholders  = venueNames.map(() => "?").join(",");

    const sql = `
      SELECT
        e.id,
        e.title,
        e.description,
        e.venue,
        e.date              AS event_date,
        e.time              AS event_time,
        e.capacity,
        e.registration_fee,
        e.category,
        e.type,
        e.status,
        e.remark,
        e.hall_status,
        e.hall_remark,
        e.poster            AS document_url,
        e.created_at,
        c.club_name         AS club,
        c.club_id,
        o.name              AS organizer
      FROM events e
      LEFT JOIN clubs      c ON c.club_id = e.club_id
      LEFT JOIN organizers o ON o.id      = e.organizer_id
      WHERE LOWER(e.status) = 'faculty_approved'
        AND e.venue IN (${placeholders})
      ORDER BY e.created_at DESC
    `;

    db.query(sql, venueNames, (err, result) => {
      if (err) {
        console.error("GET /faculty/hall/proposals error:", err);
        return res.status(500).json({ message: "Server error", detail: err.message });
      }
      res.json(result);
    });
  } catch (err) {
    console.error("GET /faculty/hall/proposals error:", err);
    res.status(500).json({ message: "Server error", detail: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/faculty/hall/proposals/:id/approve
// Hall Coordinator approves → status = 'Approved'
// ─────────────────────────────────────────────────────────────────────────────
router.patch("/hall/proposals/:id/approve", authorize(), facultyOnly, async (req, res) => {
  const { remark } = req.body || {};
  try {
    const [myVenues] = await db.promise().query(
      "SELECT name FROM venues WHERE coordinator_faculty_id = ?",
      [req.user.id]
    );
    if (!myVenues.length) {
      return res.status(403).json({ message: "You are not assigned as coordinator for any venue." });
    }

    const venueNames   = myVenues.map(v => v.name);
    const placeholders = venueNames.map(() => "?").join(",");

    const sql = remark
      ? `UPDATE events SET status = 'Approved', hall_status = 'approved', hall_remark = ?
         WHERE id = ? AND venue IN (${placeholders}) AND LOWER(status) = 'faculty_approved'`
      : `UPDATE events SET status = 'Approved', hall_status = 'approved'
         WHERE id = ? AND venue IN (${placeholders}) AND LOWER(status) = 'faculty_approved'`;

    const params = remark
      ? [remark, req.params.id, ...venueNames]
      : [req.params.id, ...venueNames];

    db.query(sql, params, (err, result) => {
      if (err)                  return res.status(500).json({ message: "Server error", detail: err.message });
      if (!result.affectedRows) return res.status(404).json({ message: "Event not found or venue not under your management." });
      res.json({ message: "Event approved by Hall Coordinator — venue confirmed." });
    });
  } catch (err) {
    res.status(500).json({ message: "Server error", detail: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/faculty/hall/proposals/:id/reject
// Hall Coordinator rejects → status = 'Rejected' (remark required)
// ─────────────────────────────────────────────────────────────────────────────
router.patch("/hall/proposals/:id/reject", authorize(), facultyOnly, async (req, res) => {
  const { remark } = req.body || {};
  if (!remark) {
    return res.status(400).json({ message: "A remark is required when rejecting a proposal." });
  }
  try {
    const [myVenues] = await db.promise().query(
      "SELECT name FROM venues WHERE coordinator_faculty_id = ?",
      [req.user.id]
    );
    if (!myVenues.length) {
      return res.status(403).json({ message: "You are not assigned as coordinator for any venue." });
    }

    const venueNames   = myVenues.map(v => v.name);
    const placeholders = venueNames.map(() => "?").join(",");

    const sql = `
      UPDATE events
      SET status = 'Rejected', hall_status = 'rejected', hall_remark = ?
      WHERE id = ? AND venue IN (${placeholders}) AND LOWER(status) = 'faculty_approved'
    `;
    db.query(sql, [remark, req.params.id, ...venueNames], (err, result) => {
      if (err)                  return res.status(500).json({ message: "Server error", detail: err.message });
      if (!result.affectedRows) return res.status(404).json({ message: "Event not found or venue not under your management." });
      res.json({ message: "Event rejected by Hall Coordinator." });
    });
  } catch (err) {
    res.status(500).json({ message: "Server error", detail: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/faculty/hall/venues
// Returns all venues managed by the currently logged-in hall coordinator.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/hall/venues", authorize(), facultyOnly, (req, res) => {
  db.query(
    "SELECT id, name, capacity, status, description, coordinator_note FROM venues WHERE coordinator_faculty_id = ?",
    [req.user.id],
    (err, result) => {
      if (err) return res.status(500).json({ message: "Server error", detail: err.message });
      res.json(result);
    }
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/faculty/hall/venues/:id/availability
// Hall Coordinator updates a venue's availability.
// Body: { status: 'available'|'unavailable'|'maintenance', note?: string, date?: 'YYYY-MM-DD' }
// • If `date` is provided, writes to venue_availability (date-specific override).
// • Otherwise, updates the general venue status column.
// ─────────────────────────────────────────────────────────────────────────────
router.patch("/hall/venues/:id/availability", authorize(), facultyOnly, async (req, res) => {
  const { status, note, date } = req.body || {};

  if (!status) {
    return res.status(400).json({ message: "status is required." });
  }
  const allowed = ["available", "unavailable", "maintenance"];
  if (!allowed.includes(status.toLowerCase())) {
    return res.status(400).json({ message: `status must be one of: ${allowed.join(", ")}` });
  }

  try {
    // Confirm this venue belongs to this coordinator
    const [rows] = await db.promise().query(
      "SELECT id FROM venues WHERE id = ? AND coordinator_faculty_id = ?",
      [req.params.id, req.user.id]
    );
    if (!rows.length) {
      return res.status(403).json({ message: "Venue not under your management." });
    }

    if (date) {
      // Date-specific availability — upsert into venue_availability table
      // Table DDL expected:
      //   CREATE TABLE venue_availability (
      //     id INT AUTO_INCREMENT PRIMARY KEY,
      //     venue_id INT NOT NULL,
      //     date DATE NOT NULL,
      //     status ENUM('available','unavailable','maintenance') NOT NULL,
      //     note TEXT,
      //     updated_by INT,
      //     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      //     UNIQUE KEY uniq_venue_date (venue_id, date)
      //   );
      await db.promise().query(
        `INSERT INTO venue_availability (venue_id, date, status, note, updated_by)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           status     = VALUES(status),
           note       = VALUES(note),
           updated_by = VALUES(updated_by)`,
        [req.params.id, date, status.toLowerCase(), note || null, req.user.id]
      );
    } else {
      // General status update
      await db.promise().query(
        "UPDATE venues SET status = ?, coordinator_note = ? WHERE id = ? AND coordinator_faculty_id = ?",
        [status.toLowerCase(), note || null, req.params.id, req.user.id]
      );
    }

    res.json({ message: "Venue availability updated successfully." });
  } catch (err) {
    console.error("PATCH /faculty/hall/venues/:id/availability error:", err);
    res.status(500).json({ message: "Server error", detail: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/faculty/certificates
// ─────────────────────────────────────────────────────────────────────────────
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
    FROM certificates cr
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

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/faculty/certificates/:id/approve
// ─────────────────────────────────────────────────────────────────────────────
router.patch("/certificates/:id/approve", authorize(), facultyOnly, (req, res) => {
  db.query(
    "UPDATE certificates SET status = 'approved', reviewed_by = ?, reviewed_at = NOW() WHERE id = ?",
    [req.user.id, req.params.id],
    (err, result) => {
      if (err)                  return res.status(500).json({ message: "Server error", detail: err.message });
      if (!result.affectedRows) return res.status(404).json({ message: "Certificate not found" });
      res.json({ message: "Certificate approved" });
    }
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/faculty/certificates/:id/reject
// ─────────────────────────────────────────────────────────────────────────────
router.patch("/certificates/:id/reject", authorize(), facultyOnly, (req, res) => {
  db.query(
    "UPDATE certificates SET status = 'rejected', reviewed_by = ?, reviewed_at = NOW() WHERE id = ?",
    [req.user.id, req.params.id],
    (err, result) => {
      if (err)                  return res.status(500).json({ message: "Server error", detail: err.message });
      if (!result.affectedRows) return res.status(404).json({ message: "Certificate not found" });
      res.json({ message: "Certificate rejected" });
    }
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/faculty/feedback
// ─────────────────────────────────────────────────────────────────────────────
router.get("/feedback", authorize(), facultyOnly, (req, res) => {
  const sql = `
    SELECT
      f.feedback_id       AS id,
      f.rating,
      f.message           AS comment,
      f.feedback_date     AS created_at,
      f.subject,
      s.name              AS student_name,
      e.title             AS event_title,
      c.club_name         AS club
    FROM feedback f
    JOIN students s  ON s.id      = f.user_id
    JOIN events   e  ON e.id      = f.event_id
    JOIN clubs    c  ON c.club_id = e.club_id
    WHERE c.faculty_id = ?
    ORDER BY f.feedback_date DESC
  `;
  db.query(sql, [req.user.id], (err, result) => {
    if (err) {
      console.error("GET /faculty/feedback error:", err);
      return res.status(500).json({ message: "Server error", detail: err.message });
    }
    res.json(result);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/faculty/events/:id/participants
// ─────────────────────────────────────────────────────────────────────────────
router.get("/events/:id/participants", authorize(), facultyOnly, (req, res) => {
  const sql = `
    SELECT s.name, s.email, s.department, s.phone_no, s.phone
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

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/faculty/registrations
// ─────────────────────────────────────────────────────────────────────────────
router.get("/registrations", authorize(), facultyOnly, (req, res) => {
  const sql = `
    SELECT
      r.id, r.student_id, r.event_id,
      r.created_at AS registered_at,
      e.title  AS event_title,
      e.date   AS event_date,
      c.club_name AS club
    FROM registrations r
    JOIN events e ON e.id      = r.event_id
    JOIN clubs  c ON c.club_id = e.club_id
    WHERE c.faculty_id = ?
    ORDER BY e.date DESC
  `;
  db.query(sql, [req.user.id], (err, result) => {
    if (err) {
      console.error("GET /faculty/registrations error:", err);
      return res.status(500).json({ message: "Server error", detail: err.message });
    }
    res.json(result);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/faculty/registrations/count/:eventId
// NOTE: Must be declared BEFORE /registrations (Express matches in order).
// ─────────────────────────────────────────────────────────────────────────────
router.get("/registrations/count/:eventId", authorize(), facultyOnly, (req, res) => {
  db.query(
    "SELECT COUNT(*) AS count FROM registrations WHERE event_id = ?",
    [req.params.eventId],
    (err, result) => {
      if (err) {
        console.error("GET /faculty/registrations/count/:eventId error:", err);
        return res.status(500).json({ message: "Server error", detail: err.message });
      }
      res.json({ count: result[0]?.count ?? 0 });
    }
  );
});

module.exports = router;