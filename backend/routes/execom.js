const express = require("express");
const db = require("../db");
const authorize = require("../middleware/authMiddleware");

const router = express.Router();

/* ===============================
   GET ALL
================================= */
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

/* ===============================
   GET BY CLUB
================================= */
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

/* ===============================
   ADD MEMBER
================================= */
router.post("/", authorize(), (req, res) => {
  const organizerClub = req.user?.club;
  const { name, position, class: className, email, phone } = req.body;

  if (!organizerClub) return res.status(403).json({ message: "Organizer club not found" });
  if (!name || !position) return res.status(400).json({ message: "Name and position are required" });

  db.query(
    "INSERT INTO execom (name, position, class, club, email, phone) VALUES (?, ?, ?, ?, ?, ?)",
    [name, position, className || null, organizerClub, email || null, phone || null],
    (err, result) => {
      if (err) return res.status(500).json({ message: "Server error" });
      res.json({ message: "Execom member added", id: result.insertId });
    }
  );
});
/* ===============================
   UPDATE MEMBER  ✅ FIX
================================= */
router.put("/:id", authorize(), (req, res) => {
  const id = Number(req.params.id);
  const organizerClub = req.user?.club; // ✅ from token
  const { name, position, class: className, email, phone } = req.body;

  if (!id) return res.status(400).json({ message: "Invalid ID" });
  if (!organizerClub) return res.status(403).json({ message: "Organizer club not found" });
  if (!name || !position) return res.status(400).json({ message: "Name and position are required" });

  db.query(
    `UPDATE execom
     SET name=?, position=?, class=?, email=?, phone=?
     WHERE id=? AND club=?`,
    [name, position, className || null, email || null, phone || null, id, organizerClub],
    (err, result) => {
      if (err) return res.status(500).json({ message: "Server error" });
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "Member not found in your club" });
      }
      res.json({ message: "Execom member updated" });
    }
  );
});

/* ===============================
   DELETE MEMBER
================================= */
router.delete("/:id", authorize(), (req, res) => {
  const id = Number(req.params.id);
  const organizerClub = req.user?.club;

  if (!id) return res.status(400).json({ message: "Invalid ID" });
  if (!organizerClub) return res.status(403).json({ message: "Organizer club not found" });

  db.query(
    "DELETE FROM execom WHERE id=? AND club=?",
    [id, organizerClub],
    (err, result) => {
      if (err) return res.status(500).json({ message: "Server error" });
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "Member not found in your club" });
      }
      res.json({ message: "Execom member deleted" });
    }
  );
});

module.exports = router;