const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const db = require("../db");
const verifyToken = require("../middleware/authMiddleware");
const router = express.Router();

router.post("/login", (req, res) => {
  const { email, password } = req.body;

  db.query(
    "SELECT * FROM organizers WHERE email = ?",
    [email],
    async (err, result) => {
      if (err)
        return res.status(500).json({ message: "Server error" });

      if (result.length === 0)
        return res.status(401).json({ message: "Organizer not found" });

      const organizer = result[0];

      const match = await bcrypt.compare(password, organizer.password);

      if (!match)
        return res.status(401).json({ message: "Invalid password" });

      const token = jwt.sign(
        { id: organizer.id, role: "ORGANIZER" },
        "secretkey",
        { expiresIn: "1d" }
      );

      res.json({
        token,
        organizer: {
          id: organizer.id,
          name: organizer.name,
          email: organizer.email,
          club: organizer.club,
          phone: organizer.phone
        }
      });
    }
  );
});

// Get logged-in organizer details
router.get("/me", verifyToken, (req, res) => {
  const organizerId = req.user.id;

  db.query(
    "SELECT id, name, email, club, phone FROM organizers WHERE id = ?",
    [organizerId],
    (err, result) => {
      if (err) return res.status(500).json(err);
      if (result.length === 0)
        return res.status(404).json({ message: "Organizer not found" });

      res.json(result[0]);
    }
  );
});


module.exports = router;
const authMiddleware = require("../middleware/authMiddleware");

router.get("/me", authMiddleware, (req, res) => {
  const userId = req.user.id;

  db.query(
    "SELECT id, name, email, role FROM organizers WHERE id = ?",
    [userId],
    (err, result) => {
      if (err) return res.status(500).json(err);
      if (result.length === 0)
        return res.status(404).json({ message: "User not found" });

      res.json(result[0]);
    }
  );
});

router.get("/me", verifyToken, (req, res) => {
  const organizerId = req.user.id;

  db.query(
    "SELECT id, name, email, club, phone FROM organizers WHERE id = ?",
    [organizerId],
    (err, result) => {
      if (err) return res.status(500).json(err);
      if (result.length === 0)
        return res.status(404).json({ message: "Organizer not found" });

      res.json(result[0]);
    }
  );
});

