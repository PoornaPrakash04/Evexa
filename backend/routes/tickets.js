const express   = require("express");
const QRCode    = require("qrcode");
const crypto    = require("crypto");
const db        = require("../db");
const authorize = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/generate", authorize(), async (req, res) => {
  try {
    const { event_id } = req.body;
    const student_id = req.user.id;

    if (!event_id) return res.status(400).json({ message: "event_id required" });

    // ✅ Check student
    const [students] = await db.promise().query(
      "SELECT id, name, email, roll_no, department, class FROM students WHERE id=?",
      [student_id]
    );
    if (!students.length) return res.status(404).json({ message: "Student not found" });
    const student = students[0];

    // ✅ Check event
    const [events] = await db.promise().query(
      `SELECT e.id, e.title, e.date, e.time, e.venue, e.type,
              c.club_name AS club
       FROM events e
       LEFT JOIN clubs c ON c.club_id = e.club_id
       WHERE e.id = ?`,
      [event_id]
    );
    if (!events.length) return res.status(404).json({ message: "Event not found" });
    const event = events[0];

    // ✅ Must be registered first (since you already have registrations table)
    const [regs] = await db.promise().query(
      "SELECT id, ticket_id, qr_token FROM registrations WHERE student_id=? AND event_id=?",
      [student_id, event_id]
    );
    if (!regs.length) {
      return res.status(400).json({ message: "You are not registered for this event" });
    }

    const reg = regs[0];

    // ✅ Generate once, reuse later
    const ticket_id = reg.ticket_id || `EVX-${student_id}-${event_id}-${Date.now()}`;
    const qr_token  = reg.qr_token  || crypto.randomBytes(32).toString("hex");

    await db.promise().query(
      "UPDATE registrations SET ticket_id=?, qr_token=?, issued_at=NOW() WHERE id=?",
      [ticket_id, qr_token, reg.id]
    );

    // ✅ QR payload (no PII)
    const payload = JSON.stringify({ t: qr_token });

    const qr = await QRCode.toDataURL(payload, {
      errorCorrectionLevel: "H",
      width: 300,
      margin: 2,
      color: { dark: "#6d5efc", light: "#ffffff" },
    });

    res.json({ qr, ticket_id, student, event });

  } catch (err) {
    console.error("TICKET ERROR:", err);
    res.status(500).json({ message: err.message });
  }
});
router.post("/verify", authorize(), async (req, res) => {
  try {
    const organizerId = req.user?.id;
    const { qr_token } = req.body;

    if (!qr_token) return res.status(400).json({ message: "qr_token required" });

    const [rows] = await db.promise().query(
      `SELECT r.id AS registration_id, r.checked_in, r.checked_in_at, r.ticket_id,
              s.name, s.roll_no, s.department, s.class,
              e.id AS event_id, e.title AS event_title, e.organizer_id
       FROM registrations r
       JOIN students s ON s.id = r.student_id
       JOIN events e ON e.id = r.event_id
       WHERE r.qr_token = ?`,
      [qr_token]
    );

    if (!rows.length) return res.status(404).json({ message: "Invalid ticket" });

    const t = rows[0];

    // ✅ Only the organizer of that event can verify
    if (t.organizer_id !== organizerId) {
      return res.status(403).json({ message: "Not allowed to verify this event" });
    }

    if (t.checked_in) {
      return res.json({
        ok: true,
        status: "ALREADY_USED",
        ticket_id: t.ticket_id,
        name: t.name,
        roll_no: t.roll_no,
        checked_in_at: t.checked_in_at,
      });
    }

    await db.promise().query(
      "UPDATE registrations SET checked_in=1, checked_in_at=NOW() WHERE id=?",
      [t.registration_id]
    );

    return res.json({
      ok: true,
      status: "VALID",
      ticket_id: t.ticket_id,
      name: t.name,
      roll_no: t.roll_no,
      department: t.department,
      class: t.class,
      event_title: t.event_title,
    });

  } catch (err) {
    console.error("VERIFY ERROR:", err);
    res.status(500).json({ message: err.message });
  }
});
module.exports = router;