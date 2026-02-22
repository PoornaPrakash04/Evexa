// ============================================================
//  routes/tickets.js  — NEW FILE
// ============================================================
const express  = require("express");
const QRCode   = require("qrcode");
const db       = require("../db");
const authorize = require("../middleware/authMiddleware");

const router = express.Router();

// POST /api/tickets/generate
router.post("/generate", authorize(), async (req, res) => {
  const { event_id }  = req.body;
  const student_id    = req.user.id;

  // Fetch student
  db.query(
    "SELECT id, name, email, roll_no, department, class FROM students WHERE id = ?",
    [student_id],
    async (err, sResult) => {
      if (err || !sResult.length)
        return res.status(500).json({ message: "Student not found" });

      const student = sResult[0];

      // Fetch event
      db.query(
        "SELECT id, title, date, time, venue, club FROM events WHERE id = ?",
        [event_id],
        async (err2, eResult) => {
          if (err2 || !eResult.length)
            return res.status(500).json({ message: "Event not found" });

          const event     = eResult[0];
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

          try {
            const qr = await QRCode.toDataURL(ticketData, {
              errorCorrectionLevel: "H",
              width: 300,
              margin: 2,
              color: { dark: "#6d5efc", light: "#ffffff" },
            });

            res.json({ qr, student, event, ticket_id });

          } catch (qrErr) {
            console.error("QR generation error:", qrErr);
            res.status(500).json({ message: "QR generation failed" });
          }
        }
      );
    }
  );
});

module.exports = router;