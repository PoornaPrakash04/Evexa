
const express  = require("express");
const bcrypt   = require("bcrypt");
const router   = express.Router();
const db       = require("../db");
const authorize = require("../middleware/authMiddleware");
const multer   = require("multer");
const path     = require("path");
const fs       = require("fs");


const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = path.join(__dirname, "uploads/avatars");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, `student_${req.user.id}_${Date.now()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, 
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed."));
    }
    cb(null, true);
  }
});


router.get("/my-registrations", authorize(["STUDENT"]), (req, res) => {
  db.query(
    "SELECT * FROM registrations WHERE student_id = ?",
    [req.user.id],
    (err, result) => {
      if (err) return res.status(500).json({ message: "Server error" });
      res.json(result);
    }
  );
});


router.put("/profile", authorize(["STUDENT"]), (req, res) => {
  const { name, phone } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ message: "Name is required." });
  }

  db.query(
    "UPDATE students SET name = ?, phone = ? WHERE id = ?",
    [name.trim(), phone || null, req.user.id],
    (err, result) => {
      if (err) {
        console.error("PUT /student/profile error:", err);
        return res.status(500).json({ message: "Server error", detail: err.message });
      }
      if (!result.affectedRows) {
        return res.status(404).json({ message: "Student not found." });
      }
      res.json({ message: "Profile updated successfully" });
    }
  );
});


router.put("/change-password", authorize(["STUDENT"]), async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: "Both current and new passwords are required." });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ message: "New password must be at least 8 characters." });
  }

  db.query(
    "SELECT password FROM students WHERE id = ?",
    [req.user.id],
    async (err, result) => {
      if (err || !result.length) {
        return res.status(500).json({ message: "Server error" });
      }

      const match = await bcrypt.compare(currentPassword, result[0].password);
      if (!match) {
        return res.status(401).json({ message: "Current password is incorrect." });
      }

      try {
        const hashed = await bcrypt.hash(newPassword, 10);
        db.query(
          "UPDATE students SET password = ? WHERE id = ?",
          [hashed, req.user.id],
          (err2) => {
            if (err2) return res.status(500).json({ message: "Server error" });
            res.json({ message: "Password updated successfully" });
          }
        );
      } catch (hashErr) {
        console.error("bcrypt error:", hashErr);
        res.status(500).json({ message: "Server error" });
      }
    }
  );
});


router.post("/avatar", authorize(["STUDENT"]), upload.single("avatar"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded." });
  }

  const avatarPath = `/uploads/avatars/${req.file.filename}`;

  db.query(
    "UPDATE students SET avatar = ? WHERE id = ?",
    [avatarPath, req.user.id],
    (err, result) => {
      if (err) {
        console.error("POST /student/avatar error:", err);
        return res.status(500).json({ message: "Server error", detail: err.message });
      }
      if (!result.affectedRows) {
        return res.status(404).json({ message: "Student not found." });
      }
      res.json({ message: "Avatar updated successfully", avatar: avatarPath });
    }
  );
});

router.get("/notifications", authorize(["STUDENT"]), (req, res) => {
  const userId = req.user.id;

  
  db.query(
    `SELECT r.registered_at, e.title, e.date
     FROM registrations r
     JOIN events e ON r.event_id = e.id
     WHERE r.student_id = ?
     ORDER BY r.registered_at DESC`,
    [userId],
    (err, results) => {
      if (err) {
        console.error("Notifications error:", err);
        return res.status(500).json({ message: "Server error" });
      }

      const now = new Date();

      const data = {
        history: [],
        schedule: [],
        requests: []
      };

      results.forEach(r => {
        const eventDate = new Date(r.date);

        
        data.history.push({
          text: `You registered for "${r.title}"`,
          time: new Date(r.registered_at).toLocaleString()
        });

        
        if (eventDate > now) {
          data.schedule.push({
            text: `"${r.title}" is coming up`,
            time: eventDate.toLocaleDateString()
          });
        }
      });

      res.json(data);
    }
  );
});
module.exports = router;