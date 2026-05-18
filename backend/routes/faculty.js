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




router.get("/me", authorize(["FACULTY"]), facultyOnly, loadFacultyContext, async (req, res) => {
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




router.put("/me", authorize(["FACULTY"]), facultyOnly, async (req, res) => {
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





router.get("/proposals", authorize(["FACULTY"]), facultyOnly, (req, res) => {
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

router.patch("/proposals/:id/approve", authorize(["FACULTY"]), facultyOnly, loadFacultyContext, handleFacultyApprove);
router.patch("/events/:id/approve",    authorize(["FACULTY"]), facultyOnly, loadFacultyContext, handleFacultyApprove);







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

router.patch("/proposals/:id/reject", authorize(["FACULTY"]), facultyOnly, handleFacultyReject);
router.patch("/events/:id/reject",    authorize(["FACULTY"]), facultyOnly, handleFacultyReject);












const hallChain = [authorize(["FACULTY"]), facultyOnly, loadFacultyContext, hallCoordinatorOnly];





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



/* ══════════════════════════════════════════════════════════
   HOD — Classroom management
   HODs are excluded from the Hall Coordinator workflow by design,
   but they are assigned venues (classrooms) via coordinator_faculty_id.
   These dedicated routes give the HOD portal visibility into those
   classrooms and the pending booking requests against them.
   ══════════════════════════════════════════════════════════ */

function hodOnly(req, res, next) {
  if (req.faculty?.role_id !== ROLE.HOD) {
    return res.status(403).json({ message: "HOD access only." });
  }
  next();
}

/**
 * GET /faculty/hod/classrooms
 * Returns every venue (classroom) whose coordinator_faculty_id matches
 * the logged-in HOD.  Mirrors GET /faculty/hall/venues for Hall Coordinators.
 */
router.get(
  "/hod/classrooms",
  authorize(["FACULTY"]), facultyOnly, loadFacultyContext, hodOnly,
  (req, res) => {
    db.query(
      `SELECT id, name, capacity, location, status, coordinator_note
       FROM venues
       WHERE coordinator_faculty_id = ?`,
      [req.user.id],
      (err, result) => {
        if (err) return res.status(500).json({ message: "Server error", detail: err.message });
        res.json(result);
      }
    );
  }
);

/**
 * GET /faculty/hod/classroom-requests
 * Returns pending venue_bookings for classrooms managed by this HOD.
 * "Pending" here means the booking has not yet been confirmed or rejected
 * (status = 'pending' | 'faculty_approved').
 */
router.get(
  "/hod/classroom-requests",
  authorize(["FACULTY"]), facultyOnly, loadFacultyContext, hodOnly,
  async (req, res) => {
    try {
      // Collect the IDs of all classrooms this HOD coordinates
      const [venueRows] = await db.promise().query(
        `SELECT id FROM venues WHERE coordinator_faculty_id = ?`,
        [req.user.id]
      );

      if (!venueRows.length) return res.json([]);

      const venueIds     = venueRows.map(v => v.id);
      const placeholders = venueIds.map(() => "?").join(",");

      const [rows] = await db.promise().query(
        `SELECT
           vb.id,
           vb.date           AS event_date,
           vb.time           AS event_time,
           vb.slot_end,
           vb.status,
           vb.purpose,
           vb.event_id,
           v.name            AS venue,
           v.name            AS classroom,
           v.capacity,
           e.title,
           e.category,
           e.registration_fee,
           e.description,
           COALESCE(c.club_name, e.organizer_id) AS club,
           o.name            AS organizer
         FROM venue_bookings vb
         JOIN   venues      v  ON v.id  = vb.venue_id
         LEFT JOIN events   e  ON e.id  = vb.event_id
         LEFT JOIN clubs    c  ON c.club_id = e.club_id
         LEFT JOIN organizers o ON o.id = vb.organizer_id
         WHERE vb.venue_id IN (${placeholders})
           AND vb.status NOT IN ('rejected', 'hall_approved')
         ORDER BY vb.date ASC`,
        venueIds
      );

      res.json(rows);
    } catch (err) {
      console.error("GET /faculty/hod/classroom-requests error:", err);
      res.status(500).json({ message: "Server error", detail: err.message });
    }
  }
);

/**
 * PATCH /faculty/hod/classroom-requests/:id/approve
 * HOD confirms a classroom booking (sets status → 'hall_approved').
 */
router.patch(
  "/hod/classroom-requests/:id/approve",
  authorize(["FACULTY"]), facultyOnly, loadFacultyContext, hodOnly,
  async (req, res) => {
    const { remark } = req.body || {};
    try {
      // Ensure the booking belongs to one of this HOD's classrooms
      const [venueRows] = await db.promise().query(
        `SELECT id FROM venues WHERE coordinator_faculty_id = ?`,
        [req.user.id]
      );
      if (!venueRows.length) {
        return res.status(403).json({ message: "No classrooms assigned to you." });
      }

      const venueIds     = venueRows.map(v => v.id);
      const placeholders = venueIds.map(() => "?").join(",");

      const [check] = await db.promise().query(
        `SELECT id, event_id FROM venue_bookings
         WHERE id = ? AND venue_id IN (${placeholders}) AND status != 'rejected'`,
        [req.params.id, ...venueIds]
      );
      if (!check.length) {
        return res.status(404).json({
          message: "Booking not found or not under your classrooms.",
        });
      }

      await db.promise().query(
        `UPDATE venue_bookings
         SET status = 'hall_approved', updated_at = NOW()
         WHERE id = ?`,
        [req.params.id]
      );

      // Mirror the approval onto the linked event if present
      if (check[0].event_id) {
        await db.promise().query(
          `UPDATE events
           SET status           = 'hall_approved',
               hall_status      = 'approved',
               hall_remark      = COALESCE(?, hall_remark),
               hall_approved_by = ?,
               hall_approved_at = NOW()
           WHERE id = ? AND LOWER(TRIM(status)) IN ('submitted', 'faculty_approved', 'pending')`,
          [remark || null, req.user.id, check[0].event_id]
        );
      }

      res.json({ message: "Classroom booking confirmed by HOD." });
    } catch (err) {
      console.error("PATCH /faculty/hod/classroom-requests/:id/approve error:", err);
      res.status(500).json({ message: "Server error", detail: err.message });
    }
  }
);

/**
 * PATCH /faculty/hod/classroom-requests/:id/reject
 * HOD rejects a classroom booking (sets status → 'rejected').
 * A remark is required.
 */
router.patch(
  "/hod/classroom-requests/:id/reject",
  authorize(["FACULTY"]), facultyOnly, loadFacultyContext, hodOnly,
  async (req, res) => {
    const { remark } = req.body || {};
    if (!remark) {
      return res.status(400).json({ message: "A remark is required when rejecting." });
    }

    try {
      const [venueRows] = await db.promise().query(
        `SELECT id FROM venues WHERE coordinator_faculty_id = ?`,
        [req.user.id]
      );
      if (!venueRows.length) {
        return res.status(403).json({ message: "No classrooms assigned to you." });
      }

      const venueIds     = venueRows.map(v => v.id);
      const placeholders = venueIds.map(() => "?").join(",");

      const [check] = await db.promise().query(
        `SELECT id, event_id FROM venue_bookings
         WHERE id = ? AND venue_id IN (${placeholders}) AND status != 'rejected'`,
        [req.params.id, ...venueIds]
      );
      if (!check.length) {
        return res.status(404).json({
          message: "Booking not found or not under your classrooms.",
        });
      }

      await db.promise().query(
        `UPDATE venue_bookings SET status = 'rejected', updated_at = NOW() WHERE id = ?`,
        [req.params.id]
      );

      if (check[0].event_id) {
        await db.promise().query(
          `UPDATE events
           SET status      = 'submitted',
               hall_status = 'rejected',
               hall_remark = ?
           WHERE id = ?`,
          [remark, check[0].event_id]
        );
      }

      res.json({ message: "Classroom booking rejected by HOD." });
    } catch (err) {
      console.error("PATCH /faculty/hod/classroom-requests/:id/reject error:", err);
      res.status(500).json({ message: "Server error", detail: err.message });
    }
  }
);

/**
 * PATCH /faculty/hod/classrooms/:id/availability
 * HOD updates the status/note of one of their assigned classrooms.
 * Mirrors PATCH /faculty/hall/venues/:id/availability.
 */
router.patch(
  "/hod/classrooms/:id/availability",
  authorize(["FACULTY"]), facultyOnly, loadFacultyContext, hodOnly,
  async (req, res) => {
    const { status, note, date } = req.body || {};

    if (!status) return res.status(400).json({ message: "status is required." });
    const allowed = ["available", "unavailable", "maintenance"];
    if (!allowed.includes(status.toLowerCase())) {
      return res.status(400).json({ message: `status must be one of: ${allowed.join(", ")}` });
    }

    const venueId = Number(req.params.id);

    try {
      // Confirm this classroom belongs to the HOD
      const [ownerCheck] = await db.promise().query(
        `SELECT id FROM venues WHERE id = ? AND coordinator_faculty_id = ?`,
        [venueId, req.user.id]
      );
      if (!ownerCheck.length) {
        return res.status(403).json({ message: "Classroom not assigned to you." });
      }

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
          `UPDATE venues SET status = ?, coordinator_note = ?
           WHERE id = ? AND coordinator_faculty_id = ?`,
          [status.toLowerCase(), note || null, venueId, req.user.id]
        );
      }

      res.json({ message: "Classroom availability updated successfully." });
    } catch (err) {
      console.error("PATCH /faculty/hod/classrooms/:id/availability error:", err);
      res.status(500).json({ message: "Server error", detail: err.message });
    }
  }
);




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




router.get("/certificates", authorize(["FACULTY"]), facultyOnly, (req, res) => {
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




router.patch("/certificates/:id/approve", authorize(["FACULTY"]), facultyOnly, (req, res) => {
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




router.patch("/certificates/:id/reject", authorize(["FACULTY"]), facultyOnly, (req, res) => {
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




router.get("/feedback", authorize(["FACULTY"]), facultyOnly, (req, res) => {
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





router.get("/registrations/count/:eventId", authorize(["FACULTY"]), facultyOnly, (req, res) => {
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




router.get("/registrations", authorize(["FACULTY"]), facultyOnly, (req, res) => {
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




router.get("/events/:id/participants", authorize(["FACULTY"]), facultyOnly, (req, res) => {
  const sql = `
    SELECT
      s.name,
      s.roll_no,
      s.admission_no,
      s.email,
      s.class,
      s.department,
      s.phone,
      r.registered_at
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

/* ══════════════════════════════════════════════════════════
   STAFF ADVISOR — Student Management
   Role check: role_id === ROLE.STAFF_ADVISOR (3)
   Students are resolved via the `advisor_classes` table which
   maps a staff advisor (faculty.id) to one or more class strings
   (e.g. "S6 IT A").  If that table does not exist the fallback
   resolves by matching faculty.department against students.department.
   ══════════════════════════════════════════════════════════ */

function staffAdvisorOnly(req, res, next) {
  if (req.user?.role !== "FACULTY") {
    return res.status(403).json({ message: "Faculty access only." });
  }
  next();
}

/**
 * Build the WHERE clause that limits rows to students advised by
 * the current staff advisor.  We try the advisor_classes table
 * first; if it has no rows for this advisor we fall back to
 * matching on department (so the UI always has data to show).
 */
async function advisorStudentFilter(facultyId) {
  // 1. Try advisor_classes join
  try {
    const [classes] = await db.promise().query(
      `SELECT class_name FROM advisor_classes WHERE faculty_id = ?`,
      [facultyId]
    );
    if (classes.length) {
      const names = classes.map(r => r.class_name);
      const ph    = names.map(() => "?").join(",");
      return { clause: `s.class IN (${ph})`, params: names };
    }
  } catch (_) {
    // advisor_classes table may not exist — fall through
  }

  // 2. Fallback: match department of the advisor
  const [fac] = await db.promise().query(
    `SELECT department FROM faculty WHERE id = ? AND deleted_at IS NULL`,
    [facultyId]
  );
  if (fac.length && fac[0].department) {
    return { clause: `s.department = ?`, params: [fac[0].department] };
  }

  // 3. Last resort: return all students (admin-like view)
  return { clause: "1=1", params: [] };
}

/* ── GET /faculty/advisor/students ── */
router.get("/advisor/students", authorize(["FACULTY"]), staffAdvisorOnly, async (req, res) => {
  try {
    const { clause, params } = await advisorStudentFilter(req.user.id);
    const sql = `
      SELECT
        s.id,
        s.name,
        s.email,
        s.roll_no,
        s.class,
        s.department,
        s.phone         AS phone,
        s.admission_no,
        s.avatar
      FROM students s
      WHERE ${clause}
        AND s.deleted_at IS NULL
      ORDER BY s.name ASC
    `;
    const [rows] = await db.promise().query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error("GET /faculty/advisor/students error:", err);
    res.status(500).json({ message: "Server error", detail: err.message });
  }
});

/* ── PUT /faculty/advisor/students/:id ── */
router.put("/advisor/students/:id", authorize(["FACULTY"]), staffAdvisorOnly, async (req, res) => {
  const { roll_no, admission_no, name, email, class: cls, department, phone } = req.body;
  if (!name || !email) {
    return res.status(400).json({ message: "name and email are required." });
  }
  try {
    const { clause, params } = await advisorStudentFilter(req.user.id);
    // Confirm the student belongs to this advisor before updating
    const [check] = await db.promise().query(
      `SELECT id FROM students s WHERE s.id = ? AND s.deleted_at IS NULL AND (${clause})`,
      [req.params.id, ...params]
    );
    if (!check.length) {
      return res.status(404).json({ message: "Student not found or not in your assigned classes." });
    }
    await db.promise().query(
      `UPDATE students
       SET roll_no = ?, admission_no = ?, name = ?, email = ?,
           class = ?, department = ?, phone = ?
       WHERE id = ?`,
      [roll_no || null, admission_no || null, name, email,
       cls || null, department || null, phone || null, req.params.id]
    );
    res.json({ message: "Student updated successfully." });
  } catch (err) {
    console.error("PUT /faculty/advisor/students/:id error:", err);
    res.status(500).json({ message: "Server error", detail: err.message });
  }
});

/* ── DELETE /faculty/advisor/students/:id ── */
router.delete("/advisor/students/:id", authorize(["FACULTY"]), staffAdvisorOnly, async (req, res) => {
  try {
    const { clause, params } = await advisorStudentFilter(req.user.id);
    const [check] = await db.promise().query(
      `SELECT id FROM students s WHERE s.id = ? AND s.deleted_at IS NULL AND (${clause})`,
      [req.params.id, ...params]
    );
    if (!check.length) {
      return res.status(404).json({ message: "Student not found or not in your assigned classes." });
    }
    // Soft-delete
    await db.promise().query(
      `UPDATE students SET deleted_at = NOW() WHERE id = ?`,
      [req.params.id]
    );
    res.json({ message: "Student removed." });
  } catch (err) {
    console.error("DELETE /faculty/advisor/students/:id error:", err);
    res.status(500).json({ message: "Server error", detail: err.message });
  }
});

/* ── POST /faculty/advisor/students (bulk upsert from upload) ── */
router.post("/advisor/students", authorize(["FACULTY"]), staffAdvisorOnly, async (req, res) => {
  // Accept plain array OR { students: [...], skip_duplicates: bool }
  let students, skipDuplicates;
  if (Array.isArray(req.body)) {
    students = req.body;
    skipDuplicates = false;
  } else {
    students = req.body.students || [];
    skipDuplicates = !!req.body.skip_duplicates;
  }

  if (!Array.isArray(students) || !students.length) {
    return res.status(400).json({ message: "Expected a non-empty array of students." });
  }

  let inserted = 0, updated = 0, errors = [];

  for (const s of students) {
    const { roll_no, admission_no, name, email, class: cls, department, phone } = s;
    if (!roll_no || !name || !email) {
      errors.push({ roll_no, reason: "Missing required fields (roll_no, name, email)" });
      continue;
    }
    try {
      const [existing] = await db.promise().query(
        `SELECT id FROM students WHERE roll_no = ? AND deleted_at IS NULL`,
        [roll_no]
      );
      if (existing.length) {
        if (!skipDuplicates) {
          await db.promise().query(
            `UPDATE students SET admission_no=?, name=?, email=?, class=?, department=?, phone=?
             WHERE roll_no = ? AND deleted_at IS NULL`,
            [admission_no||null, name, email, cls||null, department||null, phone||null, roll_no]
          );
          updated++;
        }
        // skipDuplicates=true → leave existing record untouched
      } else {
        const hashed = await bcrypt.hash(roll_no, 10);
        await db.promise().query(
          `INSERT INTO students (roll_no, admission_no, name, email, class, department, phone, password)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [roll_no, admission_no||null, name, email, cls||null, department||null, phone||null, hashed]
        );
        inserted++;
      }
    } catch (err) {
      errors.push({ roll_no, reason: err.message });
    }
  }

  res.json({ inserted, updated, errors });
});

/* ══════════════════════════════════════════════════════════
   STAFF ADVISOR — Announcements
   Stored in a generic `announcements` table.  We tag rows
   with posted_by = faculty.id so each advisor sees only their own.
   ══════════════════════════════════════════════════════════ */

/* ── GET /faculty/advisor/announcements ── */
router.get("/advisor/announcements", authorize(["FACULTY"]), staffAdvisorOnly, async (req, res) => {
  try {
    const [rows] = await db.promise().query(
      `SELECT id, title, body, type, created_at
       FROM announcements
       WHERE posted_by = ? AND deleted_at IS NULL
       ORDER BY created_at DESC
       LIMIT 50`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    // If the announcements table doesn't exist yet, return empty array gracefully
    console.error("GET /faculty/advisor/announcements error:", err);
    res.json([]);
  }
});

/* ── POST /faculty/advisor/announcements ── */
router.post("/advisor/announcements", authorize(["FACULTY"]), staffAdvisorOnly, async (req, res) => {
  const { title, body, type } = req.body || {};
  if (!title || !body) {
    return res.status(400).json({ message: "title and body are required." });
  }
  try {
    const [result] = await db.promise().query(
      `INSERT INTO announcements (title, body, type, posted_by, created_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [title, body, type || "General", req.user.id]
    );
    res.status(201).json({ id: result.insertId, message: "Announcement posted." });
  } catch (err) {
    console.error("POST /faculty/advisor/announcements error:", err);
    res.status(500).json({ message: "Server error", detail: err.message });
  }
});

/* ══════════════════════════════════════════════════════════
   VENUE BOOKING  (Staff Advisor / any Faculty can request a venue)
   POST /faculty/venues/book  — creates a venue_bookings row with
   status = 'pending' for the hall coordinator to approve.

   Body: venue_id, title, date, start_time (HH:MM or HH:MM:SS),
         end_time (HH:MM or HH:MM:SS), expected_participants, purpose
   ══════════════════════════════════════════════════════════ */

/** Normalise "HH:MM" → "HH:MM:00" so MySQL TIME columns are happy. */
function normaliseTime(t) {
  if (!t) return null;
  return /^\d{2}:\d{2}$/.test(t) ? `${t}:00` : t;
}

router.post("/venues/book", authorize(["FACULTY"]), facultyOnly, async (req, res) => {
  const {
    venue_id,
    title,                 // event / purpose title
    date,
    start_time,
    end_time,
    expected_participants,
    purpose,
  } = req.body || {};

  if (!venue_id || !title || !date || !start_time || !end_time) {
    return res.status(400).json({
      message: "venue_id, title, date, start_time, and end_time are required.",
    });
  }

  const slotStart = normaliseTime(start_time);
  const slotEnd   = normaliseTime(end_time);

  try {
    // 1. Verify the venue exists
    const [venueRows] = await db.promise().query(
      `SELECT id, name FROM venues WHERE id = ? LIMIT 1`,
      [venue_id]
    );
    if (!venueRows.length) {
      return res.status(404).json({ message: "Venue not found." });
    }

    // 2. Check for conflicting bookings on the same venue / date / start-slot
    //    (mirrors the check in venue.js so both code-paths stay consistent)
    const [conflicts] = await db.promise().query(
      `SELECT id FROM venue_bookings
       WHERE venue_id = ?
         AND date      = ?
         AND time      = ?
         AND status   != 'rejected'
       LIMIT 1`,
      [venue_id, date, slotStart]
    );
    if (conflicts.length) {
      return res.status(409).json({
        message: "This slot is already booked. Please choose a different time or venue.",
      });
    }

    // 3. Insert a lightweight event record so the hall-coordinator workflow
    //    can track it in the events table (status starts as 'pending').
    const [evResult] = await db.promise().query(
      `INSERT INTO events
         (title, description, venue, date, time, capacity, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', NOW())`,
      [
        title,
        purpose || null,
        venueRows[0].name,
        date,
        slotStart,
        expected_participants ? Number(expected_participants) : null,
      ]
    );
    const eventId = evResult.insertId;

    // 4. Create the venue_bookings row.
    //    Uses organizer_id to stay consistent with the venue.js schema.
    await db.promise().query(
      `INSERT INTO venue_bookings
         (event_id, venue_id, organizer_id, date, time, slot_end, purpose, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', NOW())`,
      [eventId, venue_id, req.user.id, date, slotStart, slotEnd, purpose || null]
    );

    res.status(201).json({
      message: `Venue "${venueRows[0].name}" booked for ${date}. Pending hall coordinator approval.`,
      event_id: eventId,
    });
  } catch (err) {
    console.error("POST /faculty/venues/book error:", err);
    res.status(500).json({ message: "Server error", detail: err.message });
  }
});

/* ══════════════════════════════════════════════════════════
   GET /faculty/venues/bookings/mine
   Returns all venue bookings made by the logged-in faculty member
   so the Staff Advisor dashboard can display booking history.
   ══════════════════════════════════════════════════════════ */
router.get("/venues/bookings/mine", authorize(["FACULTY"]), facultyOnly, async (req, res) => {
  try {
    const [rows] = await db.promise().query(
      `SELECT
         vb.id,
         v.id          AS venue_id,
         v.name        AS venue_name,
         vb.date,
         vb.time       AS slot_start,
         COALESCE(vb.slot_end, ADDTIME(vb.time, '01:00:00')) AS slot_end,
         vb.purpose,
         vb.status,
         e.title       AS event_title
       FROM venue_bookings vb
       JOIN   venues v ON v.id   = vb.venue_id
       LEFT JOIN events e ON e.id = vb.event_id
       WHERE vb.organizer_id = ?
       ORDER BY vb.date DESC, vb.time DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error("GET /faculty/venues/bookings/mine error:", err);
    res.status(500).json({ message: "Server error", detail: err.message });
  }
});

module.exports = router;