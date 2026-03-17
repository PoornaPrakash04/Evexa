//auth.js

const express = require("express");
const bcrypt  = require("bcrypt");
const jwt     = require("jsonwebtoken");
const db      = require("../db");
const authorize = require("../middleware/authMiddleware");
const multer  = require("multer");
const path    = require("path");

const storage = multer.diskStorage({
  destination: "uploads/avatars/",
  filename: (req, file, cb) => {
    cb(null, `student_${req.user.id}${path.extname(file.originalname)}`);
  }
});
const upload = multer({ storage });
const router = express.Router();

// ── Organizer login ──────────────────────────────────────────
router.post("/login", async (req, res) => {
  const { admission_no, password } = req.body;
  if (!admission_no || !password)
    return res.status(400).json({ message: "Admission number and password are required." });

  db.query("SELECT * FROM organizers WHERE admission_no = ?", [admission_no], async (err, result) => {
    if (err)            return res.status(500).json({ message: "Server error" });
    if (!result.length) return res.status(401).json({ message: "Organizer not found" });

    const organizer = result[0];
    const match = await bcrypt.compare(password, organizer.password);
    if (!match) return res.status(401).json({ message: "Invalid password" });

    const token = jwt.sign(
      { id: organizer.id, role: "ORGANIZER", club: organizer.club },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );
    res.json({ token });
  });
});

// ── Student login ────────────────────────────────────────────
router.post("/student-login", async (req, res) => {
  const { admission_no, password } = req.body;

  if (!admission_no || !password)
    return res.status(400).json({ message: "Admission number and password are required." });

  db.query("SELECT * FROM students WHERE admission_no = ?", [admission_no], async (err, result) => {
    if (err)            return res.status(500).json({ message: "Server error" });
    if (!result.length) return res.status(401).json({ message: "Student not found" });

    const student = result[0];
    const match = await bcrypt.compare(password, student.password);
    if (!match) return res.status(401).json({ message: "Invalid password" });

    const token = jwt.sign(
      { id: student.id, role: "STUDENT" },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );
    res.json({ token });
  });
});

// ── Faculty login ────────────────────────────────────────────
router.post("/faculty-login", async (req, res) => {
  const { faculty_no, password } = req.body;
  if (!faculty_no || !password)
    return res.status(400).json({ message: "Faculty ID and password are required." });

  db.query("SELECT * FROM faculty WHERE faculty_no = ?", [faculty_no], async (err, result) => {
    if (err)            return res.status(500).json({ message: "Server error" });
    if (!result.length) return res.status(401).json({ message: "Faculty not found" });

    const faculty = result[0];
    const match = await bcrypt.compare(password, faculty.password);
    if (!match) return res.status(401).json({ message: "Invalid password" });

    const token = jwt.sign(
      { id: faculty.id, role: "FACULTY", faculty_no: faculty.faculty_no },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );
    res.json({ token });
  });
});

// ── /me — works for STUDENT | FACULTY | ORGANIZER ───────────
router.get("/me", authorize(), (req, res) => {
  const { id, role } = req.user;

  if (role === "STUDENT") {
    db.query(
      "SELECT id, name, email, roll_no, admission_no, class, department, phone, avatar FROM students WHERE id = ?",
      [id],
      (err, result) => {
        if (err)            return res.status(500).json({ message: "Server error" });
        if (!result.length) return res.status(404).json({ message: "Student not found" });
        res.json({ ...result[0], role: "STUDENT" });
      }
    );

  } else if (role === "FACULTY") {
    db.query(
      "SELECT id, faculty_no, name, email, department, phone_no FROM faculty WHERE id = ?",
      [id],
      (err, result) => {
        if (err)            return res.status(500).json({ message: "Server error" });
        if (!result.length) return res.status(404).json({ message: "Faculty not found" });
        res.json({ ...result[0], role: "FACULTY" });
      }
    );

  } else {
    // ORGANIZER
    db.query(
      "SELECT id, name, email, club, phone, roll_no, admission_no, class FROM organizers WHERE id = ?",
      [id],
      (err, result) => {
        if (err)            return res.status(500).json({ message: "Server error" });
        if (!result.length) return res.status(404).json({ message: "Organizer not found" });
        res.json({ ...result[0], role: "ORGANIZER" });
      }
    );
  }
});

// ════════════════════════════════════════════════════════════
//  DUPLICATE-CHECK ENDPOINTS
// ════════════════════════════════════════════════════════════

// ── Check student admission number ──────────────────────────
router.post("/check-admission", (req, res) => {
  const { admission_no } = req.body;
  if (!admission_no)
    return res.status(400).json({ exists: false, message: "admission_no is required." });

  db.query(
    "SELECT id FROM students WHERE admission_no = ? LIMIT 1",
    [admission_no],
    (err, rows) => {
      if (err) return res.status(500).json({ exists: false, message: "Server error." });
      return res.json({ exists: rows.length > 0 });
    }
  );
});

// ── Check organizer admission number ────────────────────────
router.post("/check-organizer-admission", (req, res) => {
  const { admission_no } = req.body;
  if (!admission_no)
    return res.status(400).json({ exists: false, message: "admission_no is required." });

  db.query(
    "SELECT id FROM organizers WHERE admission_no = ? LIMIT 1",
    [admission_no],
    (err, rows) => {
      if (err) return res.status(500).json({ exists: false, message: "Server error." });
      return res.json({ exists: rows.length > 0 });
    }
  );
});

// ── Check faculty ID ─────────────────────────────────────────
router.post("/check-faculty-id", (req, res) => {
  const { faculty_no } = req.body;
  if (!faculty_no)
    return res.status(400).json({ exists: false, message: "faculty_no is required." });

  db.query(
    "SELECT id FROM faculty WHERE faculty_no = ? LIMIT 1",
    [faculty_no],
    (err, rows) => {
      if (err) return res.status(500).json({ exists: false, message: "Server error." });
      return res.json({ exists: rows.length > 0 });
    }
  );
});

// ════════════════════════════════════════════════════════════
//  REGISTER ENDPOINTS
// ════════════════════════════════════════════════════════════

// ── Student register ─────────────────────────────────────────
router.post("/student-register", (req, res) => {
  const { name, email, password, roll_no, admission_no, class: cls, department, phone } = req.body;

  if (!name || !email || !password || !roll_no || !admission_no || !cls || !department)
    return res.status(400).json({ message: "All required fields must be filled." });

  db.query(
    "SELECT id FROM students WHERE admission_no = ? LIMIT 1",
    [admission_no],
    async (err, rows) => {
      if (err) return res.status(500).json({ message: "Server error" });
      if (rows.length > 0)
        return res.status(409).json({ message: "A student with this admission number is already registered." });

      try {
        const hashed = await bcrypt.hash(password, 10);
        db.query(
          "INSERT INTO students (name, email, password, roll_no, admission_no, class, department, phone) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          [name, email, hashed, roll_no, admission_no, cls, department, phone || null],
          (insertErr) => {
            if (insertErr) {
              if (insertErr.code === "ER_DUP_ENTRY")
                return res.status(409).json({ message: "Email or Roll No. is already in use." });
              return res.status(500).json({ message: "Server error" });
            }
            res.status(201).json({ success: true, message: "Student registered successfully" });
          }
        );
      } catch (hashErr) {
        console.error("bcrypt error:", hashErr);
        res.status(500).json({ message: "Server error" });
      }
    }
  );
});

// ── Organizer register ───────────────────────────────────────
router.post("/organizer-register", (req, res) => {
  const { name, email, password, roll_no, admission_no, class: cls, club, phone } = req.body;

  if (!name || !email || !password || !admission_no || !roll_no || !cls || !club)
    return res.status(400).json({ message: "All required fields must be filled." });

  db.query(
    "SELECT id FROM organizers WHERE admission_no = ? LIMIT 1",
    [admission_no],
    async (err, rows) => {
      if (err) return res.status(500).json({ message: "Server error" });
      if (rows.length > 0)
        return res.status(409).json({ message: "An organizer with this admission number is already registered." });

      try {
        const hashed = await bcrypt.hash(password, 10);
        db.query(
          "INSERT INTO organizers (name, email, password, roll_no, admission_no, class, club, phone) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          [name, email, hashed, roll_no, admission_no, cls, club, phone || null],
          (insertErr) => {
            if (insertErr) {
              if (insertErr.code === "ER_DUP_ENTRY")
                return res.status(409).json({ message: "Email is already in use." });
              return res.status(500).json({ message: "Server error" });
            }
            res.status(201).json({ success: true, message: "Organizer registered successfully" });
          }
        );
      } catch (hashErr) {
        console.error("bcrypt error:", hashErr);
        res.status(500).json({ message: "Server error" });
      }
    }
  );
});

// ── Faculty register ─────────────────────────────────────────
router.post("/faculty-register", (req, res) => {
  const { name, email, password, faculty_no, department, phone_no } = req.body;

  if (!name || !email || !password || !faculty_no || !department)
    return res.status(400).json({ message: "All required fields must be filled." });

  db.query(
    "SELECT id FROM faculty WHERE faculty_no = ? LIMIT 1",
    [faculty_no],
    async (err, rows) => {
      if (err) return res.status(500).json({ message: "Server error" });
      if (rows.length > 0)
        return res.status(409).json({ message: "A faculty member with this Faculty ID is already registered." });

      try {
        const hashed = await bcrypt.hash(password, 10);
        // role_id defaults to 1 (base faculty role) — adjust as needed
        db.query(
          "INSERT INTO faculty (faculty_no, name, email, password, department, phone_no, role_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [faculty_no, name, email, hashed, department, phone_no || null, 1],
          (insertErr) => {
            if (insertErr) {
              if (insertErr.code === "ER_DUP_ENTRY")
                return res.status(409).json({ message: "Email or Faculty ID is already in use." });
              return res.status(500).json({ message: "Server error" });
            }
            res.status(201).json({ success: true, message: "Faculty registered successfully" });
          }
        );
      } catch (hashErr) {
        console.error("bcrypt error:", hashErr);
        res.status(500).json({ message: "Server error" });
      }
    }
  );
});

// ════════════════════════════════════════════════════════════
//  STUDENT PROFILE ROUTES
// ════════════════════════════════════════════════════════════

// ── Avatar upload ────────────────────────────────────────────
router.post("/avatar", authorize(), upload.single("avatar"), (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No file uploaded" });
  const avatarUrl = `/uploads/avatars/${req.file.filename}`;
  db.query("UPDATE students SET avatar = ? WHERE id = ?", [avatarUrl, req.user.id], (err) => {
    if (err) return res.status(500).json({ message: "Server error" });
    res.json({ avatarUrl });
  });
});

// ── Update profile ───────────────────────────────────────────
router.put("/profile", authorize(), (req, res) => {
  const { name, email, phone } = req.body;
  db.query(
    "UPDATE students SET name = ?, email = ?, phone = ? WHERE id = ?",
    [name, email, phone, req.user.id],
    (err) => {
      if (err) return res.status(500).json({ message: "Server error" });
      res.json({ message: "Profile updated" });
    }
  );
});

// ── Change password ──────────────────────────────────────────
router.put("/change-password", authorize(), async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  db.query("SELECT password FROM students WHERE id = ?", [req.user.id], async (err, result) => {
    if (err || !result.length) return res.status(500).json({ message: "Server error" });
    const match = await bcrypt.compare(currentPassword, result[0].password);
    if (!match) return res.status(401).json({ message: "Current password is incorrect" });
    const hashed = await bcrypt.hash(newPassword, 10);
    db.query("UPDATE students SET password = ? WHERE id = ?", [hashed, req.user.id], (err2) => {
      if (err2) return res.status(500).json({ message: "Server error" });
      res.json({ message: "Password updated" });
    });
  });
});

module.exports = router;