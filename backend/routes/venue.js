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

  if (!venue_name || !date)
    return res.status(400).json({ message: "Venue and date required" });

  const allSlots = generateSlots();

  db.query(
    "SELECT start_time FROM venue_bookings WHERE venue_name=? AND booking_date=?",
    [venue_name, date],
    (err, results) => {
      if (err) return res.status(500).json(err);

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

// Book slot
router.post("/book", auth(["ORGANIZER"]), (req, res) => {
  const { venue_name, event_id, date, start_time, end_time } = req.body;

  db.query(
    `INSERT INTO venue_bookings 
     (venue_name, event_id, booking_date, start_time, end_time, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      venue_name,
      event_id,
      date,
      start_time,
      end_time,
      req.user.id
    ],
    (err) => {
      if (err) {
        return res.status(400).json({
          message: "Slot already booked or invalid",
          error: err.message
        });
      }

      res.json({ message: "Venue booked successfully" });
    }
  );
});

module.exports = router;
router.get("/calendar", auth(["ORGANIZER"]), (req, res) => {
  const { venue_name, year, month } = req.query;

  const startDate = `${year}-${month}-01`;
  const endDate = `${year}-${month}-31`;

  db.query(
    `SELECT booking_date, COUNT(*) as total
     FROM venue_bookings
     WHERE venue_name=? 
     AND booking_date BETWEEN ? AND ?
     GROUP BY booking_date`,
    [venue_name, startDate, endDate],
    (err, results) => {
      if (err) return res.status(500).json(err);

      const fullyBooked = results
        .filter(r => r.total >= 13) // 8AM–9PM = 13 slots
        .map(r => r.booking_date);

      res.json(fullyBooked);
    }
  );
});
