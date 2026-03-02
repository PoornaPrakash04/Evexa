const express   = require("express");
const QRCode    = require("qrcode");
const db        = require("../db");
const authorize = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/generate", authorize(), async (req, res) => {
  try {
    const { event_id } = req.body;
    const student_id   = req.user.id;

    // ✅ Use .promise() for async/await with mysql2
    const [students] = await db.promise().query(
      "SELECT id, name, email, roll_no, department, class FROM students WHERE id = ?",
      [student_id]
    );
    if (!students.length)
      return res.status(404).json({ message: "Student not found" });

    const student = students[0];

    const [events] = await db.promise().query(
  `SELECT e.id, e.title, e.date, e.time, e.venue, e.type,
          c.club_name AS club
   FROM events e
   LEFT JOIN clubs c ON c.club_id = e.club_id
   WHERE e.id = ?`,
  [event_id]
);
    if (!events.length)
      return res.status(404).json({ message: "Event not found" });

    const event     = events[0];
    const ticket_id = `EVX-${student_id}-${event_id}-${Date.now()}`;

    const ticketData = JSON.stringify({
      ticket_id,
      student: {
        id:         student.id,
        name:       student.name,
        email:      student.email,
        roll_no:    student.roll_no,
        department: student.department,
        class:      student.class,
      },
      event: {
        id:    event.id,
        title: event.title,
        date:  event.date,
        time:  event.time,
        venue: event.venue,
        club:  event.club,
      },
      issued_at: new Date().toISOString(),
    });

    const qr = await QRCode.toDataURL(ticketData, {
      errorCorrectionLevel: "H",
      width: 300,
      margin: 2,
      color: { dark: "#6d5efc", light: "#ffffff" },
    });

    res.json({ qr, student, event, ticket_id });

  } catch (err) {
    console.error("TICKET ERROR:", err.message);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;