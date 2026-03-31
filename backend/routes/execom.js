const express = require("express");
const db = require("../db");
const authorize = require("../middleware/authMiddleware");

const router = express.Router();


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


router.post("/", authorize(), (req, res) => {
  const { name, position, class: className, email, phone } = req.body;
  if (!name || !position) return res.status(400).json({ message: "Name and position are required" });

  db.query("SELECT club FROM organizers WHERE id = ?", [req.user.id], (err, orgResult) => {
    if (err) {
      console.error("POST /execom club lookup error:", err);
      return res.status(500).json({ message: "Server error" });
    }
    if (!orgResult.length) return res.status(403).json({ message: "Organizer not found" });
    const organizerClub = orgResult[0].club;

    db.query(
      "INSERT INTO execom (name, position, class, club, email, phone) VALUES (?, ?, ?, ?, ?, ?)",
      [name, position, className || "", organizerClub, email || null, phone || null],
      (err2, result) => {
        if (err2) {
          console.error("POST /execom INSERT error:", err2.message);
          return res.status(500).json({ message: "Server error", detail: err2.message });
        }
        res.json({ message: "Execom member added", id: result.insertId });
      }
    );
  });
});

router.put("/:id", authorize(), (req, res) => {
  const id = Number(req.params.id);
  const { name, position, class: className, email, phone } = req.body;

  if (!id) return res.status(400).json({ message: "Invalid ID" });
  if (!name || !position) return res.status(400).json({ message: "Name and position are required" });

  db.query("SELECT club FROM organizers WHERE id = ?", [req.user.id], (err, orgResult) => {
    if (err) return res.status(500).json({ message: "Server error" });
    if (!orgResult.length) return res.status(403).json({ message: "Organizer not found" });
    const organizerClub = orgResult[0].club;

    db.query(
      `UPDATE execom SET name=?, position=?, class=?, email=?, phone=? WHERE id=? AND club=?`,
      [name, position, className || "", email || null, phone || null, id, organizerClub],
      (err2, result) => {
        if (err2) return res.status(500).json({ message: "Server error" });
        if (result.affectedRows === 0)
          return res.status(404).json({ message: "Member not found in your club" });
        res.json({ message: "Execom member updated" });
      }
    );
  });
});


router.delete("/:id", authorize(), (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid ID" });

  db.query("SELECT club FROM organizers WHERE id = ?", [req.user.id], (err, orgResult) => {
    if (err) return res.status(500).json({ message: "Server error" });
    if (!orgResult.length) return res.status(403).json({ message: "Organizer not found" });
    const organizerClub = orgResult[0].club;

    db.query(
      "DELETE FROM execom WHERE id=? AND club=?",
      [id, organizerClub],
      (err2, result) => {
        if (err2) return res.status(500).json({ message: "Server error" });
        if (result.affectedRows === 0)
          return res.status(404).json({ message: "Member not found in your club" });
        res.json({ message: "Execom member deleted" });
      }
    );
  });
});

module.exports = router;