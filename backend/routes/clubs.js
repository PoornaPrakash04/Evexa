const express  = require("express");
const db       = require("../db");
const authorize = require("../middleware/authMiddleware");
const upload   = require("../middleware/upload");
const router   = express.Router();

router.get("/", (req, res) => {
  db.query(
    `SELECT
       c.*,
       COUNT(DISTINCT cm.student_id) AS member_count,
       f.name AS faculty_name
     FROM clubs c
     LEFT JOIN club_members cm ON cm.club_id = c.club_id
     LEFT JOIN faculty f ON f.id = c.faculty_id
     WHERE c.deleted_at IS NULL
     GROUP BY c.club_id`,
    (err, result) => {
      if (err) return res.status(500).json({ message: "Server error" });
      res.json(result);
    }
  );
});




router.get("/my-clubs", authorize(), (req, res) => {
  if (req.user.role === "FACULTY") {
    // HOD (role_id=1) is not assigned as club faculty_id — clubs belong to faculty
    // coordinators. HOD portal needs all clubs visible, so detect HOD and skip the
    // faculty_id filter. Faculty coordinators still see only their assigned clubs.
    db.query(
      "SELECT role_id FROM faculty WHERE id = ? AND deleted_at IS NULL LIMIT 1",
      [req.user.id],
      (roleErr, roleRows) => {
        if (roleErr) {
          console.error("GET /clubs/my-clubs role check error:", roleErr);
          return res.status(500).json({ message: "Server error", detail: roleErr.message });
        }

        const HOD_ROLE_ID  = 1;
        const isHOD        = roleRows[0]?.role_id === HOD_ROLE_ID;
        const whereClause  = isHOD ? "" : "WHERE c.faculty_id = ?";
        const queryParams  = isHOD ? [] : [req.user.id];

        db.query(
          `SELECT
             c.club_id,
             c.club_id           AS id,
             c.club_name,
             c.club_name         AS name,
             c.club_category     AS category,
             c.club_logo         AS logo,
             c.short_description AS description,
             'Active'            AS status,
             f.name              AS faculty_name,
             COUNT(DISTINCT cm.student_id) AS member_count
           FROM clubs c
           LEFT JOIN club_members cm ON cm.club_id = c.club_id
           LEFT JOIN faculty f       ON f.id = c.faculty_id
           ${whereClause}
           GROUP BY c.club_id, c.club_name, c.club_category, c.club_logo, c.short_description, f.name`,
          queryParams,
          (err, result) => {
            if (err) {
              console.error("GET /clubs/my-clubs (faculty) error:", err);
              return res.status(500).json({ message: "Server error", detail: err.message });
            }
            res.json(result);
          }
        );
      }
    );
  } else if (req.user.role === "STUDENT") {
    db.query(
      `SELECT c.* FROM clubs c
       JOIN club_members cm ON c.club_id = cm.club_id
       WHERE cm.student_id = ?`,
      [req.user.id],
      (err, result) => {
        if (err) return res.status(500).json({ message: "Server error" });
        res.json(result);
      }
    );
  } else {
    res.status(403).json({ message: "Access denied" });
  }
});


router.get("/:id/members", (req, res) => {
  db.query(
    "SELECT COUNT(*) AS count FROM club_members WHERE club_id = ?",
    [req.params.id],
    (err, result) => {
      if (err) return res.status(500).json({ message: "Server error" });
      res.json({ count: result[0].count });
    }
  );
});


router.get("/:id/events", (req, res) => {
  db.query(
    `SELECT events.*, clubs.club_name AS club, clubs.club_logo
     FROM events
     LEFT JOIN clubs ON events.club_id = clubs.club_id
     WHERE events.club_id = ? AND events.date >= CURDATE()
     ORDER BY events.date ASC`,
    [req.params.id],
    (err, results) => {
      if (err) return res.status(500).json({ message: "Server error" });
      res.json(results);
    }
  );
});


router.post("/:id/join", authorize(["STUDENT"]), (req, res) => {
  db.query(
    "INSERT IGNORE INTO club_members (student_id, club_id) VALUES (?, ?)",
    [req.user.id, req.params.id],
    (err) => {
      if (err) return res.status(500).json({ message: "Server error" });
      res.json({ message: "Joined club successfully" });
    }
  );
});


router.delete("/:id/leave", authorize(["STUDENT"]), (req, res) => {
  db.query(
    "DELETE FROM club_members WHERE student_id = ? AND club_id = ?",
    [req.user.id, req.params.id],
    (err) => {
      if (err) return res.status(500).json({ message: "Server error" });
      res.json({ message: "Left club successfully" });
    }
  );
});


router.post("/:id/upload-logo", authorize(["ADMIN"]), upload.single("logo"), (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No file uploaded" });
  const logoPath = `uploads/logos/${req.file.filename}`;
  db.query(
    "UPDATE clubs SET club_logo = ? WHERE club_id = ?",
    [logoPath, req.params.id],
    (err) => {
      if (err) return res.status(500).json({ message: "DB update failed" });
      res.json({ message: "Logo uploaded successfully", path: logoPath });
    }
  );
});


router.get("/:id", (req, res) => {
  db.query(
    "SELECT * FROM clubs WHERE club_id = ?",
    [req.params.id],
    (err, result) => {
      if (err) return res.status(500).json({ message: "Server error" });
      if (!result.length) return res.status(404).json({ message: "Club not found" });
      res.json(result[0]);
    }
  );
});

module.exports = router;