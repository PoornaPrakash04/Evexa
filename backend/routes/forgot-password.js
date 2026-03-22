// routes/forgot-password.js

const express    = require("express");
const bcrypt     = require("bcrypt");
const nodemailer = require("nodemailer");
const db         = require("../db");
const router     = express.Router();

// ── In-memory OTP store: { email: { otp, expiresAt, role, table, userId, idCol } }
const otpStore = {};

// ── Nodemailer transporter ───────────────────────────────────
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ── Helper: find user by email across all tables ─────────────
function findUserByEmail(email, callback) {
  const tables = [
    { table: "students",   role: "STUDENT",   idCol: "id"       },
    { table: "organizers", role: "ORGANIZER", idCol: "id"       },
    { table: "faculty",    role: "FACULTY",   idCol: "id"       },
    { table: "admin",      role: "ADMIN",     idCol: "admin_id" },
  ];

  let index = 0;

  function next() {
    if (index >= tables.length) return callback(null, null);
    const { table, role, idCol } = tables[index++];
    db.query(
      `SELECT ${idCol} AS id, email FROM ${table} WHERE email = ? LIMIT 1`,
      [email],
      (err, rows) => {
        if (err)         return callback(err);
        if (rows.length) return callback(null, { ...rows[0], role, table, idCol });
        next();
      }
    );
  }

  next();
}

// ── Generate 6-digit OTP ─────────────────────────────────────
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ════════════════════════════════════════════════════════════
//  POST /api/forgot-password/send-otp
//  Body: { email }
// ════════════════════════════════════════════════════════════
router.post("/send-otp", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: "Email is required." });

  findUserByEmail(email, async (err, user) => {
    if (err)   return res.status(500).json({ message: "Server error.", detail: err.message });
    if (!user) return res.status(404).json({ message: "No account found with this email." });

    const otp       = generateOTP();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    otpStore[email] = {
      otp,
      expiresAt,
      role:   user.role,
      table:  user.table,
      idCol:  user.idCol,
      userId: user.id,
    };

    const mailOptions = {
      from: `"EVEXA" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "EVEXA — Password Reset OTP",
      html: `
        <div style="font-family:Poppins,sans-serif;max-width:480px;margin:auto;padding:40px 32px;background:#fff;border-radius:16px;box-shadow:0 8px 30px rgba(0,0,0,0.08);">
          <h2 style="margin:0 0 8px;font-size:22px;color:#222;">Password Reset</h2>
          <p style="color:#777;font-size:14px;margin:0 0 28px;">Use the OTP below to reset your EVEXA password. It expires in <strong>10 minutes</strong>.</p>
          <div style="text-align:center;margin:0 0 28px;">
            <span style="display:inline-block;padding:16px 40px;background:linear-gradient(135deg,#11998e,#38ef7d);border-radius:12px;font-size:32px;font-weight:700;letter-spacing:10px;color:#fff;">${otp}</span>
          </div>
          <p style="color:#aaa;font-size:12px;text-align:center;">If you didn't request this, you can safely ignore this email.</p>
        </div>
      `,
    };

    try {
      await transporter.sendMail(mailOptions);
      res.json({ success: true, message: "OTP sent to your email." });
    } catch (mailErr) {
      console.error("Mail error:", mailErr.message);
      res.status(500).json({ message: "Failed to send OTP email. Please try again.", detail: mailErr.message });
    }
  });
});

// ════════════════════════════════════════════════════════════
//  POST /api/forgot-password/verify-otp
//  Body: { email, otp }
// ════════════════════════════════════════════════════════════
router.post("/verify-otp", (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return res.status(400).json({ message: "Email and OTP are required." });

  const record = otpStore[email];
  if (!record)                       return res.status(400).json({ message: "No OTP requested for this email." });
  if (Date.now() > record.expiresAt) return res.status(400).json({ message: "OTP has expired. Please request a new one." });
  if (record.otp !== otp)            return res.status(400).json({ message: "Incorrect OTP." });

  res.json({ success: true, message: "OTP verified." });
});

// ════════════════════════════════════════════════════════════
//  POST /api/forgot-password/reset
//  Body: { email, otp, newPassword }
// ════════════════════════════════════════════════════════════
router.post("/reset", async (req, res) => {
  const { email, otp, newPassword } = req.body;
  if (!email || !otp || !newPassword)
    return res.status(400).json({ message: "Email, OTP, and new password are required." });

  const record = otpStore[email];
  if (!record)                       return res.status(400).json({ message: "No OTP requested for this email." });
  if (Date.now() > record.expiresAt) return res.status(400).json({ message: "OTP has expired. Please request a new one." });
  if (record.otp !== otp)            return res.status(400).json({ message: "Incorrect OTP." });
  if (newPassword.length < 8)        return res.status(400).json({ message: "Password must be at least 8 characters." });

  try {
    const hashed = await bcrypt.hash(newPassword, 10);
    db.query(
      `UPDATE ${record.table} SET password = ? WHERE ${record.idCol} = ?`,
      [hashed, record.userId],
      (err) => {
        if (err) return res.status(500).json({ message: "Server error.", detail: err.message });
        delete otpStore[email];
        res.json({ success: true, message: "Password reset successfully." });
      }
    );
  } catch (err) {
    console.error("bcrypt error:", err);
    res.status(500).json({ message: "Server error." });
  }
});

module.exports = router;