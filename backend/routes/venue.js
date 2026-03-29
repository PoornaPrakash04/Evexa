const express = require("express");
const db = require("../db");
const auth = require("../middleware/authMiddleware");

const router = express.Router();
const multer = require("multer");
const path   = require("path");

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename:    (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });
// Generate hourly slots
function generateSlots() {
  const slots = [];
  for (let hour = 8; hour < 21; hour++) {
    const start = `${hour.toString().padStart(2, "0")}:00:00`;
    const end = `${(hour + 1).toString().padStart(2, "0")}:00:00`;
    slots.push({ start, end });
  }
  return slots;
}

// GET available slots
router.get("/slots", auth(["ORGANIZER"]), (req, res) => {
  const { venue_name, date } = req.query;
  
  console.log("Slots request:", venue_name, date); // DEBUG

  if (!venue_name || !date)
    return res.status(400).json({ message: "Venue and date required" });

  const allSlots = generateSlots();

  db.query(
    `SELECT TIME_FORMAT(vb.time, '%H:%i:%s') as start_time
     FROM venue_bookings vb
     JOIN venues v ON vb.venue_id = v.id
     WHERE v.name = ? 
     AND vb.date = ? 
     AND vb.status != 'Rejected'`,
    [venue_name, date],
    (err, results) => {
      if (err) {
        console.error("Slots query error:", err); // DEBUG
        return res.status(500).json({ message: err.message });
      }

      console.log("Booked slots:", results); // DEBUG

      const booked = results.map(r => r.start_time);

      const slotStatus = allSlots.map(slot => ({
        start: slot.start,
        end: slot.end,
        available: !booked.includes(slot.start)
      }));

      res.json(slotStatus);
    }
  );
});
// GET all venues from venues table
router.get("/", auth(["ORGANIZER", "STUDENT", "FACULTY"]), (req, res) => {

  db.query("SELECT id, name, capacity, location FROM venues", (err, results) => {
    if (err) return res.status(500).json(err);
    res.json(results);
  });
});
// Book slot

router.post("/bookings", auth(["ORGANIZER"]), upload.single("support_doc"), (req, res) => {
  console.log("BOOKING BODY:", req.body); 
  const { venue_name, event_id, date, slot_start, slot_end, purpose } = req.body;

  if (!venue_name || !date || !slot_start || !slot_end) {
    return res.status(400).json({ message: "venue_name, date, slot_start and slot_end are required." });
  }

  db.query("SELECT id FROM venues WHERE name = ?", [venue_name], (err, results) => {
    if (err || !results.length)
      return res.status(400).json({ message: "Venue not found" });

    const venue_id = results[0].id;

    db.query(
  `INSERT INTO venue_bookings (event_id, venue_id, date, time, slot_end, status, purpose, organizer_id)
   VALUES (?, ?, ?, ?, ?, 'Pending', ?, ?)`,
  [event_id || null, venue_id, date, slot_start, slot_end || null, purpose || null, req.user.id],
  (err) => {
    if (err) {
      console.error("Booking insert error:", err);
      return res.status(400).json({ message: "Booking failed", error: err.message });
    }
    res.json({ message: "Venue booked successfully" });
  }
);
  });
});
router.get("/calendar", auth(["ORGANIZER", "STUDENT", "FACULTY"]), (req, res) => {
  const { venue_name, year, month } = req.query;
  
  console.log("Calendar request:", venue_name, year, month); // DEBUG
  
  const paddedMonth = month.toString().padStart(2, "0");
  const startDate = `${year}-${paddedMonth}-01`;
  // Compute the real last day of the month instead of hardcoding 31
  const lastDay = new Date(Number(year), Number(month), 0).getDate();
  const endDate = `${year}-${paddedMonth}-${lastDay.toString().padStart(2, "0")}`;

  db.query(
    `SELECT DAY(vb.date) as day,
     DAY(vb.date) AS day,
     MAX(CASE
       WHEN vb.status = 'Approved'         THEN 3
       WHEN vb.status = 'Faculty Approved' THEN 2
       WHEN vb.status = 'Pending'          THEN 1
       ELSE 0
     END) AS priority
     FROM venue_bookings vb
     JOIN venues v ON vb.venue_id = v.id
     WHERE v.name = ?
     AND vb.date BETWEEN ? AND ?
     AND vb.status IN ('Approved', 'Faculty Approved', 'Pending')
     GROUP BY DAY(vb.date)`,
    [venue_name, startDate, endDate],
    (err, results) => {
      if (err) {
        console.error("Calendar query error:", err); // DEBUG
        return res.status(500).json({ message: err.message });
      }
      console.log("Calendar results:", results); // DEBUG
      // Map priority back to a human-readable status string
      const mapped = results.map(r => ({
        day: r.day,
        status: r.priority >= 3 ? "booked"
              : r.priority === 2 ? "faculty-approved"
              : "pending"
      }));
      res.json(mapped);
    }
  );
});
// GET organizer's own bookings
router.get("/bookings/mine", auth(["ORGANIZER"]), (req, res) => {
  db.query(
    `SELECT vb.id, v.name AS venue_name, vb.date, vb.time AS slot_start, vb.slot_end, vb.status,
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

// DELETE (cancel) a booking
router.delete("/bookings/:id", auth(["ORGANIZER"]), (req, res) => {
  db.query(
    "DELETE FROM venue_bookings WHERE id = ? AND organizer_id = ? AND status = 'Pending'",
    [req.params.id, req.user.id],
    (err, result) => {
      if (err) return res.status(500).json({ message: err.message });
      if (!result.affectedRows) return res.status(404).json({ message: "Booking not found or already approved." });
      res.json({ message: "Booking cancelled" });
    }
  );
});
// Hall coordinator approves/rejects a venue booking
router.put("/bookings/:id/status", auth(["HALL_COORDINATOR"]), (req, res) => {
  const { status } = req.body; // "Approved" or "Rejected"

  if (!["Approved", "Rejected"].includes(status)) {
    return res.status(400).json({ message: "Invalid status." });
  }

  // Get the booking to find the linked event
  db.query(
    "SELECT * FROM venue_bookings WHERE id = ?",
    [req.params.id],
    (err, results) => {
      if (err || !results.length) {
        return res.status(404).json({ message: "Booking not found." });
      }

      const booking = results[0];

      // Only allow action on Faculty Approved bookings
      if (booking.status !== "Faculty Approved") {
        return res.status(400).json({ message: "Booking must be Faculty Approved first." });
      }

      // Update venue booking status
      db.query(
        "UPDATE venue_bookings SET status = ? WHERE id = ?",
        [status, req.params.id],
        (err2) => {
          if (err2) return res.status(500).json({ message: "Server error" });

          // If hall coordinator approved, mark the event as fully Approved
          if (status === "Approved" && booking.event_id) {
            db.query(
              "UPDATE events SET status = 'Approved' WHERE id = ? AND status = 'Faculty Approved'",
              [booking.event_id],
              (err3) => {
                if (err3) console.error("Event approval error:", err3);
              }
            );
          }

          // If rejected, push event back to Pending so organizer knows
          if (status === "Rejected" && booking.event_id) {
            db.query(
              "UPDATE events SET status = 'Pending' WHERE id = ?",
              [booking.event_id],
              (err3) => {
                if (err3) console.error("Event revert error:", err3);
              }
            );
          }

          res.json({ message: `Venue booking ${status}.` });
        }
      );
    }
  );
});
module.exports = router;