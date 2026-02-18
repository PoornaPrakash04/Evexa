const express = require("express");
const db = require("../db");
const authorize = require("../middleware/authMiddleware");

const router = express.Router();

// Get all execom members
router.get("/", authorize(), (req, res) => {
  db.query(
    "SELECT * FROM execom ORDER BY position",
    (err, result) => {
      if (err) {
        console.error("Error fetching execom:", err);
        return res.status(500).json({ message: "Server error" });
      }
      res.json(result);
    }
  );
});

// Get execom members by club
router.get("/club/:club", authorize(), (req, res) => {
  db.query(
    "SELECT * FROM execom WHERE club = ? ORDER BY position",
    [req.params.club],
    (err, result) => {
      if (err) {
        console.error("Error fetching execom:", err);
        return res.status(500).json({ message: "Server error" });
      }
      res.json(result);
    }
  );
});

// Add execom member
router.post("/", authorize(), (req, res) => {
  const { name, position, class: className, club, email, phone } = req.body;
  
  db.query(
    "INSERT INTO execom (name, position, class, club, email, phone) VALUES (?, ?, ?, ?, ?, ?)",
    [name, position, className, club, email, phone],
    (err, result) => {
      if (err) {
        console.error("Error adding execom:", err);
        return res.status(500).json({ message: "Server error" });
      }
      res.json({ message: "Execom member added", id: result.insertId });
    }
  );
});

// Delete execom member
router.delete("/:id", authorize(), (req, res) => {
  db.query(
    "DELETE FROM execom WHERE id = ?",
    [req.params.id],
    (err, result) => {
      if (err) {
        console.error("Error deleting execom:", err);
        return res.status(500).json({ message: "Server error" });
      }
      res.json({ message: "Execom member deleted" });
    }
  );
});

module.exports = router;