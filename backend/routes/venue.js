const express = require("express");
const db      = require("../db");
const authorize = require("../middleware/authMiddleware");
const multer  = require("multer");
const path    = require("path");

const router = express.Router();

/**
 * Role-normalising auth wrapper.
 * The JWT may store role as "faculty", "FACULTY", or a numeric id.
 * This wrapper upper-cases req.user.role before the real middleware sees it,
 * so the allow-list check always works regardless of how the token was issued.
 */
function auth(roles) {
  const upper = roles.map(r => r.toUpperCase());
  return [
    (req, res, next) => {
      if (req.user && req.user.role) {
        req.user.role = String(req.user.role).toUpperCase();
      }
      next();
    },
    authorize(upper),
  ];
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename:    (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname)),
});
const upload = multer({ storage });

/** Generate hourly slots 06:00 – 22:00 */
function generateSlots() {
  const slots = [];
  for (let hour = 6; hour < 22; hour++) {
    slots.push({
      start: `${String(hour).padStart(2, "0")}:00:00`,
      end:   `${String(hour + 1).padStart(2, "0")}:00:00`,
    });
  }
  return slots;
}

/**
 * Resolve a venue_id from a source object (req.query or req.body).
 * Accepts venue_id (preferred) or venue_name (fallback DB lookup).
 * Calls cb(err, venue_id).
 */
function resolveVenueId(source, cb) {
  if (source.venue_id) {
    const id = Number(source.venue_id);
    if (!id) return cb(new Error("Invalid venue_id"));
    return cb(null, id);
  }
  if (source.venue_name) {
    db.query(
      "SELECT id FROM venues WHERE name = ? LIMIT 1",
      [source.venue_name],
      (err, rows) => {
        if (err)          return cb(err);
        if (!rows.length) return cb(new Error("Venue not found"));
        cb(null, rows[0].id);
      }
    );
    return;
  }
  cb(new Error("venue_id or venue_name required"));
}

/* ─────────────────────────────────────────
   GET /venues
   Returns all venues (id, name, capacity, location, status)
   Used by frontend to populate sidebar + filter dropdowns.
   FIX: now includes `id` so the frontend can send venue_id in bookings.
───────────────────────────────────────── */
router.get("/", auth(["ORGANIZER", "STUDENT", "FACULTY", "HALL_COORDINATOR"]), (req, res) => {
  db.query(
    "SELECT id, name, capacity, location, status FROM venues",
    (err, results) => {
      if (err) return res.status(500).json({ message: err.message });
      res.json(results);
    }
  );
});

/* ─────────────────────────────────────────
   GET /venues/slots
   Returns available/booked hourly slots for a venue+date.
   Accepts venue_id or venue_name query param.
───────────────────────────────────────── */
router.get("/slots", auth(["ORGANIZER", "FACULTY", "HALL_COORDINATOR"]), (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ message: "date required" });

  resolveVenueId(req.query, (err, venueId) => {
    if (err) return res.status(400).json({ message: err.message });

    // FIX: check venue_availability first — if coordinator marked this day
    // unavailable, return all slots as blocked immediately.
    db.query(
      "SELECT status FROM venue_availability WHERE venue_id = ? AND date = ?",
      [venueId, date],
      (err, avail) => {
        if (err) return res.status(500).json({ message: err.message });

        if (avail.length && avail[0].status === "unavailable") {
          return res.json(
            generateSlots().map(slot => ({ ...slot, available: false }))
          );
        }

        // Day is not blocked — check individual slot conflicts from bookings
        db.query(
          `SELECT TIME_FORMAT(time, '%H:%i:%s') AS start_time
           FROM venue_bookings
           WHERE venue_id = ?
             AND date = ?
             AND status != 'rejected'`,
          [venueId, date],
          (err, results) => {
            if (err) return res.status(500).json({ message: err.message });

            const booked     = results.map(r => r.start_time);
            const slotStatus = generateSlots().map(slot => ({
              start:     slot.start,
              end:       slot.end,
              available: !booked.includes(slot.start),
            }));

            res.json(slotStatus);
          }
        );
      }
    );
  });
});

/* ─────────────────────────────────────────
   GET /venues/calendar
   Returns per-day booking status for a venue+month.
   Accepts venue_id or venue_name query param.
───────────────────────────────────────── */
router.get("/calendar", auth(["ORGANIZER", "STUDENT", "FACULTY", "HALL_COORDINATOR"]), (req, res) => {
  const { year, month } = req.query;
  if (!year || !month) return res.status(400).json({ message: "year and month required" });

  resolveVenueId(req.query, (err, venueId) => {
    if (err) return res.status(400).json({ message: err.message });

    const paddedMonth = String(month).padStart(2, "0");
    const startDate   = `${year}-${paddedMonth}-01`;
    const lastDay     = new Date(Number(year), Number(month), 0).getDate();
    const endDate     = `${year}-${paddedMonth}-${String(lastDay).padStart(2, "0")}`;

    // FIX: fetch venue_availability overrides first, then merge with booking statuses.
    // Days marked unavailable by coordinator always show as "booked" on the calendar.
    db.query(
      `SELECT DAY(date) AS day
       FROM venue_availability
       WHERE venue_id = ?
         AND date BETWEEN ? AND ?
         AND status = 'unavailable'`,
      [venueId, startDate, endDate],
      (err, unavailRows) => {
        if (err) return res.status(500).json({ message: err.message });

        const unavailDays = new Set(unavailRows.map(r => r.day));

        db.query(
          `SELECT
             DAY(date) AS day,
             MAX(CASE
               WHEN status = 'hall_approved'    THEN 3
               WHEN status = 'faculty_approved' THEN 2
               WHEN status = 'pending'          THEN 1
               ELSE 0
             END) AS priority
           FROM venue_bookings
           WHERE venue_id = ?
             AND date BETWEEN ? AND ?
             AND status IN ('hall_approved', 'faculty_approved', 'pending')
           GROUP BY DAY(date)`,
          [venueId, startDate, endDate],
          (err, results) => {
            if (err) return res.status(500).json({ message: err.message });

            const mapped = results.map(r => ({
              day:    r.day,
              status: r.priority >= 3 ? "booked"
                    : r.priority === 2 ? "faculty-approved"
                    : "pending",
            }));

            // Merge: unavailability overrides any booking status for that day
            unavailDays.forEach(day => {
              const existing = mapped.find(r => r.day === day);
              if (existing) existing.status = "booked";
              else mapped.push({ day, status: "booked" });
            });

            res.json(mapped);
          }
        );
      }
    );
  });
});

/* ─────────────────────────────────────────
   GET /venues/bookings/mine
   Returns all bookings made by the logged-in organizer.
───────────────────────────────────────── */
router.get("/bookings/mine", auth(["ORGANIZER", "FACULTY", "HALL_COORDINATOR"]), (req, res) => {
  const isFaculty = req.user.role === "FACULTY";

  /* Faculty bookings are stored with organizer_id = req.user.id too,
     but we also support a dedicated faculty_id column if present.
     We query by organizer_id for both roles (faculty uses same field). */
  db.query(
    `SELECT vb.id, v.id AS venue_id, v.name AS venue_name,
            vb.date, vb.time AS slot_start,
            COALESCE(vb.slot_end, ADDTIME(vb.time, '01:00:00')) AS slot_end,
            vb.status,
            e.title AS event_title
     FROM venue_bookings vb
     JOIN venues v ON v.id = vb.venue_id
     LEFT JOIN events e ON e.id = vb.event_id
     WHERE vb.organizer_id = ?
     ORDER BY vb.date DESC`,
    [req.user.id],
    (err, results) => {
      if (err) return res.status(500).json({ message: err.message });
      res.json(results);
    }
  );
});

/* ─────────────────────────────────────────
   POST /venues/bookings
   Create a new venue booking request.
   Accepts ORGANIZER or FACULTY role.
   Stores the requester's id in organizer_id (shared column for both roles).

   Body fields:
     venue_id    – preferred (integer)
     venue_name  – fallback (string), resolved via DB lookup
     event_id    – optional
     date        – YYYY-MM-DD
     slot_start  – HH:MM:SS
     slot_end    – HH:MM:SS
     purpose     – optional text
     support_doc – optional file upload
───────────────────────────────────────── */
router.post("/bookings", auth(["ORGANIZER", "FACULTY", "HALL_COORDINATOR"]), upload.single("support_doc"), (req, res) => {
  const { event_id, date, slot_start, slot_end, purpose } = req.body;

  if (!date || !slot_start || !slot_end) {
    return res.status(400).json({ message: "date, slot_start, and slot_end are required." });
  }

  resolveVenueId(req.body, (resolveErr, vId) => {
    if (resolveErr) {
      return res.status(400).json({ message: resolveErr.message });
    }

    db.getConnection((connErr, connection) => {
      if (connErr) return res.status(500).json({ message: "Connection error." });

      connection.query("SELECT id FROM venues WHERE id = ?", [vId], (err, rows) => {
        if (err || !rows.length) {
          connection.release();
          return res.status(err ? 500 : 400).json({
            message: err ? err.message : "Venue not found.",
          });
        }

        connection.beginTransaction(txErr => {
          if (txErr) {
            connection.release();
            return res.status(500).json({ message: "Transaction error." });
          }

          // Check venue_availability — if coordinator blocked this day, reject immediately
          connection.query(
            "SELECT status FROM venue_availability WHERE venue_id = ? AND date = ?",
            [vId, date],
            (err, avail) => {
              if (err) {
                return connection.rollback(() => {
                  connection.release();
                  res.status(500).json({ message: err.message });
                });
              }

              if (avail.length && avail[0].status === "unavailable") {
                return connection.rollback(() => {
                  connection.release();
                  res.status(409).json({ message: "This venue is marked unavailable on that date." });
                });
              }

              // Check for conflicting slot booking
              connection.query(
                `SELECT id FROM venue_bookings
                 WHERE venue_id = ?
                   AND date = ?
                   AND time = ?
                   AND status != 'rejected'
                 FOR UPDATE`,
                [vId, date, slot_start],
                (err, conflicts) => {
                  if (err) {
                    return connection.rollback(() => {
                      connection.release();
                      res.status(500).json({ message: err.message });
                    });
                  }

                  if (conflicts.length > 0) {
                    return connection.rollback(() => {
                      connection.release();
                      res.status(409).json({
                        message: "This slot is already booked. Please choose another.",
                      });
                    });
                  }

                  // Insert — organizer_id holds the requester id for both ORGANIZER and FACULTY
                  connection.query(
                    `INSERT INTO venue_bookings
                       (event_id, venue_id, date, time, slot_end, status, purpose, organizer_id)
                     VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
                    [event_id || null, vId, date, slot_start, slot_end, purpose || null, req.user.id],
                    (err) => {
                      if (err) {
                        return connection.rollback(() => {
                          connection.release();
                          res.status(400).json({
                            message: "Booking failed.",
                            error: err.message,
                          });
                        });
                      }

                      connection.commit(commitErr => {
                        connection.release();
                        if (commitErr) {
                          return res.status(500).json({ message: "Commit failed." });
                        }
                        res.json({ message: "Venue booked successfully." });
                      });
                    }
                  );
                }
              );
            }
          );
        });
      });
    });
  });
});

/* ─────────────────────────────────────────
   DELETE /venues/bookings/:id
   Cancel a booking (organizer only).
   Allows cancellation of pending, faculty_approved, and hall_approved bookings.
   If the booking had a linked event, reverts its status back to 'submitted'
   so it re-enters the approval queue for a new venue booking.
───────────────────────────────────────── */
router.delete("/bookings/:id", auth(["ORGANIZER", "FACULTY", "HALL_COORDINATOR"]), (req, res) => {
  const cancellableStatuses = ["pending", "faculty_approved", "hall_approved"];

  // First fetch the booking to check ownership and get event_id for cascade
  db.query(
    "SELECT * FROM venue_bookings WHERE id = ? AND organizer_id = ?",
    [req.params.id, req.user.id],
    (err, rows) => {
      if (err)          return res.status(500).json({ message: err.message });
      if (!rows.length) return res.status(404).json({ message: "Booking not found." });

      const booking = rows[0];

      if (!cancellableStatuses.includes(booking.status)) {
        return res.status(400).json({
          message: `Cannot cancel a booking with status '${booking.status}'.`,
        });
      }

      db.query(
        "DELETE FROM venue_bookings WHERE id = ?",
        [req.params.id],
        (err2, result) => {
          if (err2) return res.status(500).json({ message: err2.message });
          if (!result.affectedRows)
            return res.status(404).json({ message: "Booking not found." });

          // If there was a linked event, revert it to 'submitted' so the organizer
          // can assign a new venue and re-enter the approval chain.
          if (booking.event_id) {
            db.query(
              "UPDATE events SET status = 'submitted' WHERE id = ?",
              [booking.event_id],
              (err3) => { if (err3) console.error("Event revert error:", err3); }
            );
          }

          res.json({ message: "Booking cancelled." });
        }
      );
    }
  );
});

/* ─────────────────────────────────────────
   PUT /venues/bookings/:id/status
   Hall coordinator approves or rejects a faculty-approved booking.
───────────────────────────────────────── */
router.put("/bookings/:id/status", auth(["HALL_COORDINATOR"]), (req, res) => {
  const { status } = req.body;

  if (!["hall_approved", "rejected"].includes(status)) {
    return res.status(400).json({
      message: "Invalid status. Use 'hall_approved' or 'rejected'.",
    });
  }

  db.query(
    "SELECT * FROM venue_bookings WHERE id = ?",
    [req.params.id],
    (err, results) => {
      if (err || !results.length)
        return res.status(404).json({ message: "Booking not found." });

      const booking = results[0];

      if (booking.status !== "faculty_approved") {
        return res.status(400).json({
          message: "Booking must be faculty_approved before hall approval.",
        });
      }

      db.query(
        "UPDATE venue_bookings SET status = ? WHERE id = ?",
        [status, req.params.id],
        (err2) => {
          if (err2) return res.status(500).json({ message: "Server error." });

          if (status === "hall_approved" && booking.event_id) {
            db.query(
              "UPDATE events SET status = 'hall_approved' WHERE id = ? AND status = 'faculty_approved'",
              [booking.event_id],
              (err3) => { if (err3) console.error("Event approval error:", err3); }
            );
          }

          if (status === "rejected" && booking.event_id) {
            db.query(
              "UPDATE events SET status = 'submitted' WHERE id = ?",
              [booking.event_id],
              (err3) => { if (err3) console.error("Event revert error:", err3); }
            );
          }

          res.json({ message: `Venue booking ${status}.` });
        }
      );
    }
  );
});

module.exports = router;