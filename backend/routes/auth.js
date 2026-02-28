const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const db = require("../db");
const authorize = require("../middleware/authMiddleware");
const multer = require("multer");
const path = require("path");

const storage = multer.diskStorage({
  destination: "uploads/avatars/",
  filename: (req, file, cb) => {
    cb(null, `student_${req.user.id}${path.extname(file.originalname)}`);
  }
});
const upload = multer({ storage });
const router = express.Router();

router.post("/login", async (req, res) => {
  const { admission_no, password } = req.body;

  if (!admission_no || !password) {
    return res.status(400).json({ message: "Admission number and password are required." });
  }
  
  db.query(
    "SELECT * FROM organizers WHERE admission_no = ?",
    [admission_no],
    async (err, result) => {
      if (err) return res.status(500).json({ message: "Server error" });
      if (result.length === 0) return res.status(401).json({ message: "Organizer not found" });

      const organizer = result[0];
      const match = await bcrypt.compare(password, organizer.password);
      if (!match) return res.status(401).json({ message: "Invalid password" });

      const token = jwt.sign(
        { id: organizer.id, role: "ORGANIZER", club: organizer.club },
        process.env.JWT_SECRET,
        { expiresIn: "1d" }
      );

      res.json({ token });
    }
  );
});

router.post("/avatar", authorize(), upload.single("avatar"), (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No file uploaded" });

  const avatarUrl = `/uploads/avatars/${req.file.filename}`;

  db.query("UPDATE students SET avatar = ? WHERE id = ?", [avatarUrl, req.user.id], (err) => {
    if (err) return res.status(500).json({ message: "Server error" });
    res.json({ avatarUrl });
  });
});
// POST /api/auth/student-login
router.post("/student-login", async (req, res) => {
  const { admission_no, password } = req.body;
   console.log("Student login body:", req.body);

  if (!admission_no || !password) {
    return res.status(400).json({ message: "Admission number and password are required." });
  }

  db.query(
    "SELECT * FROM students WHERE admission_no = ?",
    [admission_no],
    async (err, result) => {
      console.log("DB result:", result);   
      if (err) return res.status(500).json({ message: "Server error" });
      if (result.length === 0) return res.status(401).json({ message: "Student not found" });

      const student = result[0];
      const match = await bcrypt.compare(password, student.password);
       console.log("Password match:", match); 
      if (!match) return res.status(401).json({ message: "Invalid password" });

      const token = jwt.sign(
        { id: student.id, role: "STUDENT" },
        process.env.JWT_SECRET,
        { expiresIn: "1d" }
      );

      res.json({ token });
    }
  );
});

router.get("/me", authorize(), (req, res) => {
  const { id, role } = req.user;

  if (role === "STUDENT") {
    db.query(
  "SELECT id, name, email, roll_no, admission_no, class, department, phone, avatar FROM students WHERE id = ?",
  [id],
  (err, result) => {
    if (err) return res.status(500).json({ message: "Server error" });
    if (result.length === 0) return res.status(404).json({ message: "Student not found" });
    res.json({ ...result[0], role: "STUDENT" });
  }
);
  } else {
    // your existing organizer query unchanged
    db.query(
      "SELECT id, name, email, club, phone, roll_no, admission_no, class FROM organizers WHERE id = ?",
      [id],
      (err, result) => {
        if (err) return res.status(500).json({ message: "Server error" });
        if (result.length === 0) return res.status(404).json({ message: "Organizer not found" });
        res.json({ ...result[0], role: "ORGANIZER" });
      }
    );
  }
});

// POST /api/auth/student-register
router.post("/student-register", async (req, res) => {
  const { name, email, password, roll_no, admission_no, class: cls, phone } = req.body;

  const hashed = await bcrypt.hash(password, 10);

  db.query(
    "INSERT INTO students (name, email, password, roll_no, admission_no, class, phone) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [name, email, hashed, roll_no, admission_no, cls, phone],
    (err, result) => {
      if (err) return res.status(500).json({ message: "Email already exists or DB error" });
      res.json({ message: "Student registered successfully" });
    }
  );
});// PUT /api/user/profile  — update name, email, phone
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

// PUT /api/user/change-password
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
// POST /api/auth/faculty-login
router.post("/faculty-login", async (req, res) => {
  console.log("Faculty login body:", req.body); 
  const { faculty_no, password } = req.body;

  if (!faculty_no || !password) {
    return res.status(400).json({ message: "Faculty ID and password are required." });
  }

  db.query(
    "SELECT * FROM faculty WHERE faculty_no = ?",
    [faculty_no],
    async (err, result) => {
      if (err) return res.status(500).json({ message: "Server error" });
      if (result.length === 0) return res.status(401).json({ message: "Faculty not found" });

      const faculty = result[0];
      const match = await bcrypt.compare(password, faculty.password);
      if (!match) return res.status(401).json({ message: "Invalid password" });

      const token = jwt.sign(
        { id: faculty.id, role: "FACULTY", faculty_no: faculty.faculty_no },
        process.env.JWT_SECRET,
        { expiresIn: "1d" }
      );

      res.json({ token });
    }
  );
});

module.exports = router;

