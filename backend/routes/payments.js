const express  = require("express");
const crypto   = require("crypto");
const Razorpay = require("razorpay");

const router = express.Router();

// ── Razorpay client ───────────────────────────────────
const razorpay = new Razorpay({
  key_id:     process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ── Helper: fetch event fee from DB ──────────────────
// Replace pool.query with however your project queries the DB
async function getEventFee(eventId) {
  const { rows } = await pool.query(
    "SELECT id, title, registration_fee FROM events WHERE id = $1",
    [eventId]
  );
  return rows[0] || null;
}

// ─────────────────────────────────────────────────────
// POST /payments/create-order
// Called before opening the Razorpay checkout popup.
// Creates a Razorpay order and stores a pending payment record.
// ─────────────────────────────────────────────────────
router.post("/create-order", async (req, res) => {
  const { event_id } = req.body;
  const student = req.student; // set by your auth middleware

  if (!event_id) {
    return res.status(400).json({ message: "event_id is required." });
  }

  try {
    // 1. Get event details
    const event = await getEventFee(event_id);
    if (!event) {
      return res.status(404).json({ message: "Event not found." });
    }

    const fee = Number(event.registration_fee);
    if (!fee || fee <= 0) {
      return res.status(400).json({ message: "This event is free. No payment required." });
    }

    // 2. Check if student already paid / registered (prevent duplicate orders)
    const { rows: existing } = await pool.query(
      `SELECT id FROM payments
       WHERE student_id = $1 AND event_id = $2 AND status = 'paid'`,
      [student.id, event_id]
    );
    if (existing.length > 0) {
      return res.status(400).json({ message: "You have already paid for this event." });
    }

    // 3. Create Razorpay order
    //    amount is in paise (multiply ₹ by 100)
    const order = await razorpay.orders.create({
      amount:          Math.round(fee * 100),
      currency:        "INR",
      receipt:         `evexa_ev${event_id}_st${student.id}`,
      notes: {
        event_id:    String(event_id),
        student_id:  String(student.id),
        event_title: event.title,
      },
    });

    // 4. Store pending payment in DB
    await pool.query(
      `INSERT INTO payments
         (student_id, event_id, razorpay_order_id, amount, currency, status, created_at)
       VALUES ($1, $2, $3, $4, $5, 'pending', NOW())
       ON CONFLICT (razorpay_order_id) DO NOTHING`,
      [student.id, event_id, order.id, fee, "INR"]
    );

    // 5. Return everything the frontend needs
    return res.json({
      order_id:        order.id,
      amount:          order.amount,       // in paise
      currency:        order.currency,
      key_id:          process.env.RAZORPAY_KEY_ID,
      student_name:    student.name    || "",
      student_email:   student.email   || "",
      student_contact: student.contact || student.phone || "",
    });

  } catch (err) {
    console.error("create-order error:", err);
    return res.status(500).json({ message: "Could not create payment order. Please try again." });
  }
});

// ─────────────────────────────────────────────────────
// POST /payments/verify
// Called by the frontend after Razorpay reports a successful payment.
// Verifies the HMAC signature, marks payment as paid.
// The attendance/register endpoint is called separately by the frontend
// (so the existing registration flow is unchanged).
// ─────────────────────────────────────────────────────
router.post("/verify", async (req, res) => {
  const {
    event_id,
    razorpay_payment_id,
    razorpay_order_id,
    razorpay_signature,
  } = req.body;

  const student = req.student;

  if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature || !event_id) {
    return res.status(400).json({ message: "Missing payment details." });
  }

  try {
    // 1. Verify HMAC-SHA256 signature
    //    Razorpay signs:  order_id + "|" + payment_id
    const body      = razorpay_order_id + "|" + razorpay_payment_id;
    const expected  = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expected !== razorpay_signature) {
      console.warn(`Signature mismatch for order ${razorpay_order_id}`);
      return res.status(400).json({ message: "Payment verification failed. Invalid signature." });
    }

    // 2. Make sure this order belongs to THIS student + event (prevent spoofing)
    const { rows } = await pool.query(
      `SELECT id FROM payments
       WHERE razorpay_order_id = $1
         AND student_id        = $2
         AND event_id          = $3`,
      [razorpay_order_id, student.id, event_id]
    );

    if (rows.length === 0) {
      return res.status(403).json({ message: "Order not found or does not belong to you." });
    }

    // 3. Mark as paid
    await pool.query(
      `UPDATE payments
       SET status              = 'paid',
           razorpay_payment_id = $1,
           razorpay_signature  = $2,
           paid_at             = NOW()
       WHERE razorpay_order_id = $3
         AND student_id        = $4`,
      [razorpay_payment_id, razorpay_signature, razorpay_order_id, student.id]
    );

    return res.json({ message: "Payment verified successfully." });

  } catch (err) {
    console.error("verify error:", err);
    return res.status(500).json({ message: "Server error during payment verification." });
  }
});

// ─────────────────────────────────────────────────────
// GET /payments/my-payments
// Optional: lets students see their payment history
// ─────────────────────────────────────────────────────
router.get("/my-payments", async (req, res) => {
  const student = req.student;
  try {
    const { rows } = await pool.query(
      `SELECT p.id, p.event_id, e.title AS event_title,
              p.amount, p.currency, p.status,
              p.razorpay_payment_id, p.paid_at, p.created_at
       FROM payments p
       JOIN events e ON e.id = p.event_id
       WHERE p.student_id = $1
       ORDER BY p.created_at DESC`,
      [student.id]
    );
    return res.json(rows);
  } catch (err) {
    console.error("my-payments error:", err);
    return res.status(500).json({ message: "Server error." });
  }
});

module.exports = router;

// ─────────────────────────────────────────────────────
// SQL — run this once to create the payments table
// ─────────────────────────────────────────────────────
//
// CREATE TABLE IF NOT EXISTS payments (
//   id                   SERIAL PRIMARY KEY,
//   student_id           INTEGER NOT NULL REFERENCES students(id),
//   event_id             INTEGER NOT NULL REFERENCES events(id),
//   razorpay_order_id    VARCHAR(64) NOT NULL UNIQUE,
//   razorpay_payment_id  VARCHAR(64),
//   razorpay_signature   TEXT,
//   amount               NUMERIC(10,2) NOT NULL,
//   currency             VARCHAR(8)  NOT NULL DEFAULT 'INR',
//   status               VARCHAR(16) NOT NULL DEFAULT 'pending',
//                        -- 'pending' | 'paid' | 'failed'
//   paid_at              TIMESTAMPTZ,
//   created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
// );
//
// CREATE INDEX ON payments (student_id, event_id);
// CREATE INDEX ON payments (razorpay_order_id);