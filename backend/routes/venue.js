const express = require("express");
const db = require("../db");
const auth = require("../middleware/authMiddleware");

const router = express.Router();

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
router.get("/", auth(["ORGANIZER"]), (req, res) => {
  db.query("SELECT id, name, capacity, location FROM venues", (err, results) => {
    if (err) return res.status(500).json(err);
    res.json(results);
  });
});
// Book slot
router.post("/book", auth(["ORGANIZER"]), (req, res) => {
  const { venue_name, event_id, date, time } = req.body;

  db.query("SELECT id FROM venues WHERE name = ?", [venue_name], (err, results) => {
    if (err || !results.length)
      return res.status(400).json({ message: "Venue not found" });

    const venue_id = results[0].id;

    db.query(
      `INSERT INTO venue_bookings (event_id, venue_id, date, time, status)
       VALUES (?, ?, ?, ?, 'Pending')`,
      [event_id, venue_id, date, time],
      (err) => {
        if (err) return res.status(400).json({ message: "Booking failed", error: err.message });
        res.json({ message: "Venue booked successfully" });
      }
    );
  });
});

router.get("/calendar", auth(["ORGANIZER"]), (req, res) => {
  const { venue_name, year, month } = req.query;
  
  console.log("Calendar request:", venue_name, year, month); // DEBUG
  
  const paddedMonth = month.toString().padStart(2, "0");
  const startDate = `${year}-${paddedMonth}-01`;
  const endDate = `${year}-${paddedMonth}-31`;

  db.query(
    `SELECT DAY(vb.date) as day,
     CASE 
       WHEN vb.status = 'Approved' THEN 'booked'
       WHEN vb.status = 'Pending' THEN 'pending'
     END as status
     FROM venue_bookings vb
     JOIN venues v ON vb.venue_id = v.id
     WHERE v.name = ?
     AND vb.date BETWEEN ? AND ?
     AND vb.status IN ('Approved', 'Pending')`,
    [venue_name, startDate, endDate],
    (err, results) => {
      if (err) {
        console.error("Calendar query error:", err); // DEBUG
        return res.status(500).json({ message: err.message });
      }
      console.log("Calendar results:", results); // DEBUG
      res.json(results);
    }
  );
});
module.exports = router;