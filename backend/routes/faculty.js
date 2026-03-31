
const express   = require("express");
const router    = express.Router();
const db        = require("../db");
const authorize = require("../middleware/authMiddleware");
const bcrypt    = require("bcrypt");




const ROLE = {
  HOD:                 1,
  STAFF:               2,
  STAFF_ADVISOR:       3,
  FACULTY_COORDINATOR: 4,
  DEAN:                5,
  HALL_COORDINATOR:    6,
};



const HALL_COORDINATOR_EXCLUDED_ROLES = new Set([
  ROLE.HOD,
  ROLE.STAFF,
  ROLE.STAFF_ADVISOR,
  ROLE.FACULTY_COORDINATOR,
  ROLE.DEAN,
]);
















async function resolveFaculty(facultyId) {
  const [rows] = await db.promise().query(
    `SELECT
       f.id,
       f.role_id,
       r.role_name,
       GROUP_CONCAT(v.id ORDER BY v.id) AS venue_ids
     FROM faculty f
     LEFT JOIN roles  r ON r.id                   = f.role_id
     LEFT JOIN venues v ON v.coordinator_faculty_id = f.id
     WHERE f.id = ? AND f.deleted_at IS NULL
     GROUP BY f.id, f.role_id, r.role_name`,
    [facultyId]
  );

  if (!rows.length) return null;

  const row            = rows[0];
  const managedVenueIds = row.venue_ids
    ? row.venue_ids.split(",").map(Number)
    : [];

  const isHallCoordinator =
    !HALL_COORDINATOR_EXCLUDED_ROLES.has(row.role_id) &&
    managedVenueIds.length > 0;

  return {
    id:               row.id,
    role_id:          row.role_id,
    role_name:        row.role_name,
    managedVenueIds,
    isHallCoordinator,
  };
}






function facultyOnly(req, res, next) {
  if (req.user?.role !== "FACULTY") {
    return res.status(403).json({ message: "Faculty access only." });
  }
  next();
}




async function loadFacultyContext(req, res, next) {
  try {
    const faculty = await resolveFaculty(req.user.id);
    if (!faculty) {
      return res.status(404).json({ message: "Faculty record not found." });
    }
    req.faculty = faculty;           
    next();
  } catch (err) {
    console.error("[loadFacultyContext] error:", err);
    res.status(500).json({ message: "Server error", detail: err.message });
  }
}



function hallCoordinatorOnly(req, res, next) {
  if (!req.faculty?.isHallCoordinator) {
    return res.status(403).json({
      message: "Hall management is restricted to assigned Hall Coordinators only.",
    });
  }
  next();
}












/**
 * Approve a faculty-level proposal (submitted → faculty_approved).
 * All faculty roles may call this; the resulting status is always
 * 'faculty_approved' to keep the workflow consistent.
 * (The old "direct approval" shortcut for non-FC roles has been removed —
 *  it bypassed hall-coordinator review and broke the workflow.)
 *
 * @param {number} eventId
 * @param {number} facultyId   — req.user.id (must own the club)
 * @param {number} roleId      — req.faculty.role_id
 * @param {string|null} remark
 */
async function approveFacultyProposal(eventId, facultyId, roleId, remark) {
  
  const [check] = await db.promise().query(
    `SELECT e.id FROM events e
     JOIN clubs c ON c.club_id = e.club_id
     WHERE e.id = ? AND c.faculty_id = ? AND LOWER(TRIM(e.status)) = 'submitted'`,
    [eventId, facultyId]
  );
  if (!check.length) {
    const err = new Error(
      "Proposal not found, not assigned to your club, or not in 'submitted' state."
    );
    err.statusCode = 404;
    throw err;
  }

  
  
  await db.promise().query(
    `UPDATE events e
     JOIN clubs c ON c.club_id = e.club_id
     SET e.status               = 'faculty_approved',
         e.remark               = COALESCE(?, e.remark),
         e.faculty_approved_by  = ?,
         e.faculty_approved_at  = NOW()
     WHERE e.id = ? AND c.faculty_id = ?`,
    [remark || null, facultyId, eventId, facultyId]
  );
}

/**
 * Reject a faculty-level proposal (submitted → rejected).
 *
 * @param {number} eventId
 * @param {number} facultyId
 * @param {string|null} remark
 */
async function rejectFacultyProposal(eventId, facultyId, remark) {
  const [check] = await db.promise().query(
    `SELECT e.id FROM events e
     JOIN clubs c ON c.club_id = e.club_id
     WHERE e.id = ? AND c.faculty_id = ? AND LOWER(TRIM(e.status)) = 'submitted'`,
    [eventId, facultyId]
  );
  if (!check.length) {
    const err = new Error(
      "Proposal not found, not assigned to your club, or not in 'submitted' state."
    );
    err.statusCode = 404;
    throw err;
  }

  await db.promise().query(
    `UPDATE events e
     JOIN clubs c ON c.club_id = e.club_id
     SET e.status = 'rejected',
         e.remark = COALESCE(?, e.remark)
     WHERE e.id = ? AND c.faculty_id = ?`,
    [remark || null, eventId, facultyId]
  );
}




router.get("/me", authorize(), facultyOnly, loadFacultyContext, async (req, res) => {
  try {
    const [result] = await db.promise().query(
      `SELECT f.id, f.faculty_no, f.name, f.email, f.department, f.phone_no,
              f.role_id, r.role_name
       FROM faculty f
       LEFT JOIN roles r ON r.id = f.role_id
       WHERE f.id = ? AND f.deleted_at IS NULL`,
      [req.user.id]
    );
    if (!result.length) return res.status(404).json({ message: "Faculty not found" });

    
    res.json({
      ...result[0],
      role:               "FACULTY",
      is_hall_coordinator: req.faculty.isHallCoordinator,
    });
  } catch (err) {
    console.error("GET /faculty/me error:", err);
    res.status(500).json({ message: "Server error", detail: err.message });
  }
});




router.put("/me", authorize(), facultyOnly, async (req, res) => {
  const { name, email, department, phone_no, current_password, new_password } = req.body;

  if (!name || !email || !department || !phone_no) {
    return res.status(400).json({ message: "name, email, department and phone_no are required." });
  }

  try {
    if (current_password || new_password) {
      if (!current_password || !new_password) {
        return res.status(400).json({
          message: "Both current_password and new_password are required to change password.",
        });
      }
      if (new_password.length < 6) {
        return res.status(400).json({ message: "New password must be at least 6 characters." });
      }
      const [rows] = await db.promise().query(
        "SELECT password FROM faculty WHERE id = ? AND deleted_at IS NULL",
        [req.user.id]
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





router.get("/proposals", authorize(), facultyOnly, (req, res) => {
  const sql = `
    SELECT
      e.id,
      e.title,
      e.description,
      e.venue,
      e.date                    AS event_date,
      e.time                    AS event_time,
      e.capacity,
      e.registration_fee,
      e.category,
      e.type,
      e.status,
      e.remark,
      e.poster                  AS document_url,
      e.created_at,
      e.faculty_approved_by,
      e.faculty_approved_at,
      c.club_name               AS club,
      c.club_id,
      o.name                    AS organizer
    FROM events e
    LEFT JOIN clubs      c ON c.club_id = e.club_id
    LEFT JOIN organizers o ON o.id      = e.organizer_id
    WHERE c.faculty_id = ?
      AND LOWER(TRIM(e.status)) = 'submitted'
    ORDER BY e.created_at DESC
  `;
  db.query(sql, [req.user.id], (err, result) => {
    if (err) {
      console.error("GET /faculty/proposals error:", err);
      return res.status(500).json({ message: "Server error", detail: err.message });
    }
    res.json(result);
  });
});







async function handleFacultyApprove(req, res) {
  const { remark } = req.body || {};
  try {
    await approveFacultyProposal(req.params.id, req.user.id, req.faculty.role_id, remark);
    res.json({ message: "Proposal forwarded to Hall Coordinator for venue confirmation." });
  } catch (err) {
    const status = err.statusCode || 500;
    console.error(`PATCH approve error [event ${req.params.id}]:`, err.message);
    res.status(status).json({ message: err.message });
  }
}

router.patch("/proposals/:id/approve", authorize(), facultyOnly, loadFacultyContext, handleFacultyApprove);
router.patch("/events/:id/approve",    authorize(), facultyOnly, loadFacultyContext, handleFacultyApprove);







async function handleFacultyReject(req, res) {
  const { remark } = req.body || {};
  try {
    await rejectFacultyProposal(req.params.id, req.user.id, remark);
    res.json({ message: "Proposal rejected." });
  } catch (err) {
    const status = err.statusCode || 500;
    console.error(`PATCH reject error [event ${req.params.id}]:`, err.message);
    res.status(status).json({ message: err.message });
  }
}

router.patch("/proposals/:id/reject", authorize(), facultyOnly, handleFacultyReject);
router.patch("/events/:id/reject",    authorize(), facultyOnly, handleFacultyReject);












const hallChain = [authorize(), facultyOnly, loadFacultyContext, hallCoordinatorOnly];





router.get("/hall/proposals", ...hallChain, async (req, res) => {
  const venueIds = req.faculty.managedVenueIds;
  
  const placeholders = venueIds.map(() => "?").join(",");

  const sql = `
    SELECT
      e.id,
      e.title,
      e.description,
      e.venue,
      e.date                  AS event_date,
      e.time                  AS event_time,
      e.capacity,
      e.registration_fee,
      e.category,
      e.type,
      e.status,
      e.remark,
      e.hall_status,
      e.hall_remark,
      e.poster                AS document_url,
      e.created_at,
      e.faculty_approved_by,
      e.faculty_approved_at,
      c.club_name             AS club,
      c.club_id,
      o.name                  AS organizer,
      fac.name                AS faculty_approver_name,
      vb.venue_id             AS matched_venue_id
    FROM events e
    LEFT JOIN clubs        c   ON c.club_id  = e.club_id
    LEFT JOIN organizers   o   ON o.id       = e.organizer_id
    LEFT JOIN faculty      fac ON fac.id     = e.faculty_approved_by
    -- Join on venue_bookings so we match by venue ID, not venue name string
    LEFT JOIN venue_bookings vb
           ON vb.event_id = e.id
          AND vb.venue_id IN (${placeholders})
    WHERE LOWER(TRIM(e.status)) = 'faculty_approved'
      AND vb.venue_id IS NOT NULL
    ORDER BY e.created_at DESC
  `;

  db.query(sql, venueIds, (err, result) => {
    if (err) {
      console.error("GET /faculty/hall/proposals error:", err);
      return res.status(500).json({ message: "Server error", detail: err.message });
    }
    res.json(result);
  });
});





router.patch("/hall/proposals/:id/approve", ...hallChain, async (req, res) => {
  const { remark } = req.body || {};
  const venueIds    = req.faculty.managedVenueIds;
  const placeholders = venueIds.map(() => "?").join(",");

  try {
    
    const [check] = await db.promise().query(
      `SELECT e.id FROM events e
       JOIN venue_bookings vb ON vb.event_id = e.id AND vb.venue_id IN (${placeholders})
       WHERE e.id = ? AND LOWER(TRIM(e.status)) = 'faculty_approved'`,
      [...venueIds, req.params.id]
    );
    if (!check.length) {
      return res.status(404).json({
        message: "Event not found, venue not under your management, or not in 'faculty_approved' state.",
      });
    }

    await db.promise().query(
      `UPDATE events
       SET status           = 'hall_approved',
           hall_status      = 'approved',
           hall_remark      = COALESCE(?, hall_remark),
           hall_approved_by = ?,
           hall_approved_at = NOW()
       WHERE id = ? AND LOWER(TRIM(status)) = 'faculty_approved'`,
      [remark || null, req.user.id, req.params.id]
    );

    res.json({ message: "Event fully approved by Hall Coordinator — venue confirmed." });
  } catch (err) {
    console.error("PATCH /faculty/hall/proposals/:id/approve error:", err);
    res.status(500).json({ message: "Server error", detail: err.message });
  }
});





router.patch("/hall/proposals/:id/reject", ...hallChain, async (req, res) => {
  const { remark } = req.body || {};
  if (!remark) {
    return res.status(400).json({ message: "A remark is required when rejecting a proposal." });
  }

  const venueIds     = req.faculty.managedVenueIds;
  const placeholders = venueIds.map(() => "?").join(",");

  try {
    const [check] = await db.promise().query(
      `SELECT e.id FROM events e
       JOIN venue_bookings vb ON vb.event_id = e.id AND vb.venue_id IN (${placeholders})
       WHERE e.id = ? AND LOWER(TRIM(e.status)) = 'faculty_approved'`,
      [...venueIds, req.params.id]
    );
    if (!check.length) {
      return res.status(404).json({
        message: "Event not found, venue not under your management, or not in 'faculty_approved' state.",
      });
    }

    await db.promise().query(
      `UPDATE events
       SET status      = 'rejected',
           hall_status = 'rejected',
           hall_remark = ?
       WHERE id = ? AND LOWER(TRIM(status)) = 'faculty_approved'`,
      [remark, req.params.id]
    );

    res.json({ message: "Proposal rejected by Hall Coordinator." });
  } catch (err) {
    console.error("PATCH /faculty/hall/proposals/:id/reject error:", err);
    res.status(500).json({ message: "Server error", detail: err.message });
  }
});




router.get("/hall/venues", ...hallChain, (req, res) => {
  db.query(
    "SELECT id, name, capacity, status, coordinator_note FROM venues WHERE coordinator_faculty_id = ?",
    [req.user.id],
    (err, result) => {
      if (err) return res.status(500).json({ message: "Server error", detail: err.message });
      res.json(result);
    }
  );
});




router.patch("/hall/venues/:id/availability", ...hallChain, async (req, res) => {
  const { status, note, date } = req.body || {};

  if (!status) {
    return res.status(400).json({ message: "status is required." });
  }
  const allowed = ["available", "unavailable", "maintenance"];
  if (!allowed.includes(status.toLowerCase())) {
    return res.status(400).json({ message: `status must be one of: ${allowed.join(", ")}` });
  }

  
  
  const venueId = Number(req.params.id);
  if (!req.faculty.managedVenueIds.includes(venueId)) {
    return res.status(403).json({ message: "Venue not under your management." });
  }

  try {
    if (date) {
      await db.promise().query(
        `INSERT INTO venue_availability (venue_id, date, status, note, updated_by)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           status     = VALUES(status),
           note       = VALUES(note),
           updated_by = VALUES(updated_by)`,
        [venueId, date, status.toLowerCase(), note || null, req.user.id]
      );
    } else {
      await db.promise().query(
        "UPDATE venues SET status = ?, coordinator_note = ? WHERE id = ? AND coordinator_faculty_id = ?",
        [status.toLowerCase(), note || null, venueId, req.user.id]
      );
    }

    res.json({ message: "Venue availability updated successfully." });
  } catch (err) {
    console.error("PATCH /faculty/hall/venues/:id/availability error:", err);
    res.status(500).json({ message: "Server error", detail: err.message });
  }
});




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




router.get("/registrations", authorize(), facultyOnly, (req, res) => {
  const sql = `
    SELECT
      r.id, r.student_id, r.event_id,
      r.registered_at,
      e.title     AS event_title,
      e.date      AS event_date,
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

module.exports = router;