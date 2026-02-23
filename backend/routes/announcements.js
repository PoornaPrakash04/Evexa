const express = require("express");
const db = require("../db");
const authorize = require("../middleware/authMiddleware");

const router = express.Router();

// Get all announcements for organizer's club
router.get("/", authorize(), (req, res) => {
  console.log("=== Fetching announcements ===");
  
  // Get organizer's club first
  db.query(
    "SELECT club FROM organizers WHERE id = ?",
    [req.user.id],
    (err, orgResult) => {
      if (err) {
        console.error("DB error:", err);
        return res.status(500).json({ message: "Server error" });
      }
      
      const club = orgResult[0]?.club;
      
      // Fetch announcements for this club
      db.query(
        "SELECT * FROM announcements WHERE club = ? ORDER BY created_at DESC",
        [club],
        (err, results) => {
          if (err) {
            console.error("DB error:", err);
            return res.status(500).json({ message: "Server error" });
          }
          
          console.log("✅ Found", results.length, "announcements");
          res.json(results);
        }
      );
    }
  );
});

// Create new announcement
router.post("/", authorize(), (req, res) => {
  const { title, message, type } = req.body;
  
  // Get organizer's club
  db.query(
    "SELECT club FROM organizers WHERE id = ?",
    [req.user.id],
    (err, orgResult) => {
      if (err) {
        return res.status(500).json({ message: "Server error" });
      }
      
      const club = orgResult[0]?.club;
      
      db.query(
        "INSERT INTO announcements (title, message, club, type, status, created_by) VALUES (?, ?, ?, ?, 'Published', ?)",
        [title, message, club, type, req.user.id],
        (err, result) => {
          if (err) {
            console.error("DB error:", err);
            return res.status(500).json({ message: "Server error" });
          }
          
          res.json({ 
            message: "Announcement created", 
            id: result.insertId 
          });
        }
      );
    }
  );
});
router.put("/:id", authorize(), (req, res) => {
  const { id } = req.params;
  const { title, message, type } = req.body;

  db.query(
    "UPDATE announcements SET title = ?, message = ?, type = ? WHERE id = ?",
    [title, message, type, id],
    (err, result) => {
      if (err) {
        console.error("DB error:", err);
        return res.status(500).json({ message: "Server error" });
      }
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "Announcement not found" });
      }
      res.json({ message: "Announcement updated" });
    }
  );
});

// Delete announcement
router.delete("/:id", authorize(), (req, res) => {
  const { id } = req.params;
  
  db.query(
    "DELETE FROM announcements WHERE id = ? AND created_by = ?",
    [id, req.user.id],
    (err, result) => {
      if (err) {
        return res.status(500).json({ message: "Server error" });
      }
      
      res.json({ message: "Announcement deleted" });
    }
  );
});

module.exports = router;