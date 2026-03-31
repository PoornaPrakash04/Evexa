
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




const isAdmin   = (req) => (req.user?.role || "").toUpperCase() === "ADMIN";
const isFaculty = (req) => (req.user?.role || "").toUpperCase() === "FACULTY";
const isHall    = (req) => (req.user?.role || "").toUpperCase() === "HALL";

/**
 * STATUS TRANSITION MAP
 * Defines which role can move an event from one status to another.
 *
 *   submitted       ──[FACULTY]──►  faculty_approved  |  rejected
 *   faculty_approved──[HALL]────►  hall_approved     |  rejected
 *   hall_approved   ──[ORGANIZER/ADMIN]──► published
 */
const STATUS_TRANSITIONS = {
  
  submitted: {
    faculty_approved: ["FACULTY", "ADMIN"],
    rejected:         ["FACULTY", "ADMIN"],
  },
  faculty_approved: {
    hall_approved: ["HALL", "ADMIN"],
    rejected:      ["HALL", "ADMIN"],
  },
  hall_approved: {
    published: ["ORGANIZER", "ADMIN"],
    rejected:  ["HALL", "ADMIN"],
  },
};

/**
 * Validate whether a role may perform a given status transition.
 * Returns { ok: true } or { ok: false, reason: string }
 */
function validateTransition(currentStatus, nextStatus, role) {
  const upperRole = (role || "").toUpperCase();
  const fromMap   = STATUS_TRANSITIONS[currentStatus];

  if (!fromMap) {
    return { ok: false, reason: `Event status '${currentStatus}' cannot be changed.` };
  }
  if (!(nextStatus in fromMap)) {
    return {
      ok: false,
      reason: `Cannot transition from '${currentStatus}' to '${nextStatus}'.`,
    };
  }
  if (!fromMap[nextStatus].includes(upperRole)) {
    return {
      ok: false,
      reason: `Role '${upperRole}' is not permitted to set status '${nextStatus}'.`,
    };
  }
  return { ok: true };
}

/**
 * Core status-update logic (extracted from routes so it can be reused).
 * Performs the DB update, updates linked venue_bookings when appropriate,
 * and resolves/rejects a promise.
 */
function applyStatusChange(eventId, currentStatus, nextStatus, role) {
  return new Promise((resolve, reject) => {
    const check = validateTransition(currentStatus, nextStatus, role);
    if (!check.ok) return reject({ status: 400, message: check.reason });

    db.query(
      "UPDATE events SET status = ? WHERE id = ?",
      [nextStatus, eventId],
      (err, result) => {
        if (err)                  return reject({ status: 500, message: "Server error", error: err.message });
        if (!result.affectedRows) return reject({ status: 404, message: "Event not found." });

        
        if (nextStatus === "faculty_approved") {
          db.query(
            `UPDATE venue_bookings SET status = 'faculty_approved'
             WHERE event_id = ? AND status = 'pending'`,
            [eventId],
            (e) => { if (e) console.error("Venue booking sync error:", e); }
          );
        } else if (nextStatus === "hall_approved") {
          db.query(
            `UPDATE venue_bookings SET status = 'hall_approved'
             WHERE event_id = ? AND status = 'faculty_approved'`,
            [eventId],
            (e) => { if (e) console.error("Venue booking sync error:", e); }
          );
        }

        resolve({ message: `Event status updated to '${nextStatus}'.` });
      }
    );
  });
}






router.post("/", authorize(), upload.single("poster"), (req, res) => {
  const title            = (req.body.title || req.body.name || "").trim();
  const { type, description, date, time, capacity, registration_fee, venue, category, academic_year } = req.body;
  const club_id_direct   = req.body.club_id || req.user.club_id || null;
  const club_name_raw    = req.body.club || null;
  const organizer_label  = req.body.organizer || null;
  const poster           = req.file ? req.file.filename : null;

  if (!title) return res.status(400).json({ message: "Event title is required." });

  
  function doInsert(resolved_club_id) {
    db.query(
      `INSERT INTO events
        (title, type, description, date, time, capacity, registration_fee,
         venue, club_id, status, organizer_id, organizer_label, poster, category, academic_year)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', ?, ?, ?, ?, ?)`,
      [
        title, type || null, description || null, date, time || null,
        capacity || null, registration_fee || 0, venue || null,
        resolved_club_id, req.user.id, organizer_label, poster,
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
  }

  if (club_id_direct) {
    doInsert(club_id_direct);
  } else if (club_name_raw) {
    db.query(
      "SELECT club_id FROM clubs WHERE club_name = ? LIMIT 1",
      [club_name_raw],
      (err, rows) => {
        doInsert((!err && rows.length) ? rows[0].club_id : null);
      }
    );
  } else {
    doInsert(null);
  }
});






router.post("/bulk-approve", authorize(), (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || !ids.length)
    return res.status(400).json({ message: "No event IDs provided." });

  const role = (req.user?.role || "").toUpperCase();

  
  let fromStatus, toStatus;
  if (role === "FACULTY") {
    fromStatus = "submitted";
    toStatus   = "faculty_approved";
  } else if (role === "HALL") {
    fromStatus = "faculty_approved";
    toStatus   = "hall_approved";
  } else if (role === "ADMIN") {
    
    fromStatus = req.body.from_status;
    toStatus   = req.body.to_status;
    if (!fromStatus || !toStatus) {
      return res.status(400).json({
        message: "Admin bulk-approve requires 'from_status' and 'to_status' in the request body.",
      });
    }
    const check = validateTransition(fromStatus, toStatus, "ADMIN");
    if (!check.ok) return res.status(400).json({ message: check.reason });
  } else {
    return res.status(403).json({ message: "You do not have permission to bulk-approve events." });
  }

  
  db.query(
    "UPDATE events SET status = ? WHERE id IN (?) AND status = ?",
    [toStatus, ids, fromStatus],
    (err, result) => {
      if (err) {
        console.error("Bulk approve error:", err);
        return res.status(500).json({ message: "Server error" });
      }
      res.json({
        message: `${result.affectedRows} of ${ids.length} event(s) moved to '${toStatus}'. ` +
                 `${ids.length - result.affectedRows} skipped (wrong current status).`,
      });
    }
  );
});


router.post("/bulk-delete", authorize(), (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || !ids.length)
    return res.status(400).json({ message: "No event IDs provided." });

  if (!isAdmin(req)) {
    return res.status(403).json({ message: "Admin access only." });
  }

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


router.get("/all", authorize(), (req, res) => {
  const role = (req.user?.role || "").toUpperCase();
  const statusClause =
    role === "ADMIN"
      ? ""
      : role === "FACULTY"
      ? "WHERE e.status IN ('hall_approved', 'faculty_approved', 'published', 'completed') AND e.deleted_at IS NULL"
      : "WHERE e.status IN ('hall_approved', 'published', 'completed') AND e.deleted_at IS NULL";

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
     ${statusClause}
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


router.get("/issues", authorize(), (req, res) => {
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


router.get("/my-issues", authorize(), (req, res) => {
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


router.get("/", (req, res) => {
  db.query(
    `SELECT e.*, c.club_name AS club, c.club_logo
     FROM events e
     LEFT JOIN clubs c ON e.club_id = c.club_id
     WHERE e.status IN ('hall_approved', 'published', 'completed')
     AND e.deleted_at IS NULL
     ORDER BY e.date DESC`,
    (err, result) => {
      if (err) return res.status(500).json({ message: "Server error" });
      res.json(result);
    }
  );
});

router.put("/:id/status", authorize(), (req, res) => {
  const { status: nextStatus } = req.body;
  const role                   = (req.user?.role || "").toUpperCase();

  if (!nextStatus)
    return res.status(400).json({ message: "A target 'status' is required." });

  
  db.query(
    "SELECT id, status FROM events WHERE id = ?",
    [req.params.id],
    (err, rows) => {
      if (err)         return res.status(500).json({ message: "Server error" });
      if (!rows.length) return res.status(404).json({ message: "Event not found." });

      const currentStatus = rows[0].status;

      applyStatusChange(req.params.id, currentStatus, nextStatus, role)
        .then((payload) => res.json(payload))
        .catch((e)      => res.status(e.status || 500).json({ message: e.message }));
    }
  );
});




router.put("/:id/reject", authorize(), (req, res) => {
  const role = (req.user?.role || "").toUpperCase();

  if (!["FACULTY", "HALL", "ADMIN"].includes(role)) {
    return res.status(403).json({ message: "You do not have permission to reject events." });
  }

  db.query(
    "SELECT id, status FROM events WHERE id = ?",
    [req.params.id],
    (err, rows) => {
      if (err)          return res.status(500).json({ message: "Server error" });
      if (!rows.length) return res.status(404).json({ message: "Event not found." });

      const currentStatus = rows[0].status;

      applyStatusChange(req.params.id, currentStatus, "rejected", role)
        .then((payload) => res.json(payload))
        .catch((e)      => res.status(e.status || 500).json({ message: e.message }));
    }
  );
});


router.put("/:id/publish", authorize(), (req, res) => {
  const role       = (req.user?.role || "").toUpperCase();
  const organizerId = req.user.id;

  db.query(
    "SELECT id, status, organizer_id FROM events WHERE id = ?",
    [req.params.id],
    (err, result) => {
      if (err)            return res.status(500).json({ message: "Server error" });
      if (!result.length) return res.status(404).json({ message: "Event not found." });

      const ev = result[0];

      
      if (role !== "ADMIN" && ev.organizer_id !== organizerId) {
        return res.status(403).json({ message: "You are not the organizer of this event." });
      }

      
      applyStatusChange(req.params.id, ev.status, "published", role === "ADMIN" ? "ADMIN" : "ORGANIZER")
        .then(() => res.json({ message: "Event published successfully! It is now visible in all portals." }))
        .catch((e) => {
          
          const hints = {
            submitted:        "It is still awaiting faculty approval.",
            faculty_approved: "It is awaiting hall coordinator approval.",
            rejected:         "It was rejected. Please edit and resubmit.",
            published:        "It is already published.",
          };
          const hint = hints[ev.status] || "";
          res.status(e.status || 400).json({ message: `${e.message} ${hint}`.trim() });
        });
    }
  );
});




router.put("/:id", authorize(), (req, res) => {
  const title = (req.body.title || req.body.name || "").trim();
  const { organizer, date, category, academic_year,
          type, description, time, capacity, venue } = req.body;

  
  if (req.body.status !== undefined && !isAdmin(req)) {
    return res.status(403).json({
      message: "Status cannot be changed via this endpoint. Use the dedicated approval/publish routes.",
    });
  }

  const whereClause = isAdmin(req) ? "WHERE id = ?" : "WHERE id = ? AND organizer_id = ?";
  const whereParams = isAdmin(req) ? [req.params.id] : [req.params.id, req.user.id];

  db.query(
    `UPDATE events SET
       title           = COALESCE(NULLIF(?, ''), title),
       organizer_label = COALESCE(?, organizer_label),
       date            = COALESCE(NULLIF(?, ''), date),
       category        = COALESCE(NULLIF(?, ''), category),
       academic_year   = COALESCE(NULLIF(?, ''), academic_year),
       type            = COALESCE(NULLIF(?, ''), type),
       description     = COALESCE(NULLIF(?, ''), description),
       time            = COALESCE(NULLIF(?, ''), time),
       capacity        = COALESCE(NULLIF(?, ''), capacity),
       venue           = COALESCE(NULLIF(?, ''), venue)
     ${whereClause}`,
    [
      title, organizer || null,
      date || null, category || null, academic_year || null,
      type || null, description || null,
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


router.post("/:id/issues", authorize(), (req, res) => {
  const { message } = req.body;
  const eventId     = req.params.id;

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


router.put("/issues/:issueId", authorize(), (req, res) => {
  const { status } = req.body;
  const allowedIssueStatuses = ["open", "in_progress", "resolved", "closed"];

  if (!allowedIssueStatuses.includes(status)) {
    return res.status(400).json({ message: `Invalid issue status. Allowed: ${allowedIssueStatuses.join(", ")}` });
  }

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



router.get("/:id", (req, res) => {
  db.query(
    `SELECT e.*, c.club_name AS club, c.club_logo
     FROM events e
     LEFT JOIN clubs c ON e.club_id = c.club_id
     WHERE e.id = ?`,
    [req.params.id],
    (err, result) => {
      if (err) return res.status(500).json({ message: "Server error" });
      if (!result.length) return res.status(404).json({ message: "Event not found" });
      res.json(result[0]);
    }
  );
});

module.exports = router;