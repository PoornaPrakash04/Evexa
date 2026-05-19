
const express   = require("express");
const db        = require("../db");
const authorize = require("../middleware/authMiddleware");
const router    = express.Router();
function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({
        message: `Access restricted to: ${roles.join(", ")}.`,
      });
    }
    next();
  };
}



function loadOrganizerClub(req, res, next) {
  db.query(
    "SELECT club_id FROM organizers WHERE id = ?",
    [req.user.id],
    (err, rows) => {
      if (err) {
        console.error("[loadOrganizerClub] error:", err);
        return res.status(500).json({ message: "Server error", detail: err.message });
      }
      if (!rows.length || !rows[0].club_id) {
        return res.status(404).json({ message: "No club linked to this organizer." });
      }
      req.clubId = rows[0].club_id;
      next();
    }
  );
}




router.get("/faculty", authorize(), requireRole("FACULTY"), (req, res) => {
  db.query(
    `SELECT a.id, a.title, a.message, a.type, a.created_at,
            a.club_id, c.club_name, a.status
     FROM announcements a
     INNER JOIN clubs c ON c.club_id = a.club_id
     WHERE c.faculty_id = ?
       AND a.status = 'published'
     ORDER BY a.created_at DESC
     LIMIT 30`,
    [req.user.id],
    (err, results) => {
      if (err) {
        console.error("GET /announcements/faculty error:", err);
        return res.status(500).json({ message: "Server error", detail: err.message });
      }
      res.json(results);
    }
  );
});





router.get("/my-posts", authorize(), requireRole("FACULTY"), (req, res) => {
  db.query(
    `SELECT a.id, a.title, a.message, a.type, a.status,
            a.club_id, c.club_name, a.created_at
     FROM announcements a
     INNER JOIN clubs c ON c.club_id = a.club_id
     WHERE a.created_by = ?
     ORDER BY a.created_at DESC`,
    [req.user.id],
    (err, results) => {
      if (err) {
        console.error("GET /announcements/my-posts error:", err);
        return res.status(500).json({ message: "Server error", detail: err.message });
      }
      res.json(results);
    }
  );
});








router.get("/student", authorize(), (req, res) => {
  db.query(
    `SELECT DISTINCT
       a.id, a.title, a.message,
       a.club_id, c.club_name,
       a.type, a.created_at
     FROM announcements a
     LEFT JOIN clubs c ON c.club_id = a.club_id
     WHERE a.status      = 'published'
       AND a.is_archived = 0
       AND (
         -- Announcements from clubs the student belongs to
         a.club_id IN (
           SELECT cm.club_id
           FROM club_members cm
           WHERE cm.student_id = ?
         )
         OR
         -- Announcements from faculty advisors of those clubs
         a.created_by IN (
           SELECT c2.faculty_id
           FROM clubs c2
           INNER JOIN club_members cm2 ON cm2.club_id = c2.club_id
           WHERE cm2.student_id = ? AND c2.faculty_id IS NOT NULL
         )
         OR
         -- System-wide announcements from admins
         a.created_by IN (SELECT id FROM admin)
       )
     ORDER BY a.created_at DESC
     LIMIT 50`,
    [req.user.id, req.user.id],
    (err, results) => {
      if (err) {
        console.error("GET /announcements/student error:", err);
        return res.status(500).json({ message: "Server error" });
      }
      res.json(results);
    }
  );
});





router.get("/", authorize(), requireRole("ORGANIZER"), loadOrganizerClub, (req, res) => {
  db.query(
    `SELECT a.id, a.title, a.message, a.type, a.status, a.created_at,
            a.club_id, c.club_name
     FROM announcements a
     INNER JOIN clubs c ON c.club_id = a.club_id
     WHERE a.club_id = ?
     ORDER BY a.created_at DESC`,
    [req.clubId],
    (err, results) => {
      if (err) {
        console.error("GET /announcements error:", err);
        return res.status(500).json({ message: "Server error", detail: err.message });
      }
      res.json(results);
    }
  );
});







router.post("/", authorize(), async (req, res) => {
  const { title, message, type, club_id: requestedClubId } = req.body;

  if (!title || !message) {
    return res.status(400).json({ message: "title and message are required." });
  }

  try {
    if (req.user.role === "FACULTY") {
      
      const clubQuery = requestedClubId
        ? "SELECT club_id FROM clubs WHERE faculty_id = ? AND club_id = ? LIMIT 1"
        : "SELECT club_id FROM clubs WHERE faculty_id = ? LIMIT 1";
      const clubParams = requestedClubId
        ? [req.user.id, requestedClubId]
        : [req.user.id];

      const [clubResult] = await db.promise().query(clubQuery, clubParams);
      if (!clubResult.length) {
        return res.status(404).json({
          message: requestedClubId
            ? "Club not found or you are not in charge of it."
            : "No club found for this faculty member.",
        });
      }

      const clubId = clubResult[0].club_id;
      const [result] = await db.promise().query(
        "INSERT INTO announcements (title, message, club_id, type, status, created_by) VALUES (?, ?, ?, ?, 'published', ?)",
        [title, message, clubId, type || "General", req.user.id]
      );
      return res.json({ message: "Announcement posted", id: result.insertId });

    } else if (req.user.role === "ORGANIZER") {
      const [orgResult] = await db.promise().query(
        "SELECT club_id FROM organizers WHERE id = ?",
        [req.user.id]
      );
      if (!orgResult.length || !orgResult[0].club_id) {
        return res.status(404).json({ message: "No club linked to this organizer." });
      }

      const clubId = orgResult[0].club_id;
      const [result] = await db.promise().query(
        "INSERT INTO announcements  (title, message, club_id, type, status, created_by, created_by_role) VALUES (?, ?, ?, ?, 'published', ?, ?)",
        [title, message, clubId, type || "General", req.user.id, req.user.role]
      );
      return res.json({ message: "Announcement created", id: result.insertId });

    } else {
      return res.status(403).json({ message: "Faculty or Organizer access only." });
    }
  } catch (err) {
    console.error("POST /announcements error:", err);
    res.status(500).json({ message: "Server error", detail: err.message });
  }
});






router.put("/:id", authorize(), async (req, res) => {
  const { title, message, type } = req.body;

  try {
    if (req.user.role === "FACULTY") {
      const [result] = await db.promise().query(
        `UPDATE announcements
         SET title = ?, message = ?, type = COALESCE(?, type)
         WHERE id = ? AND created_by = ?`,
        [title, message, type || null, req.params.id, req.user.id]
      );
      if (!result.affectedRows)
        return res.status(404).json({ message: "Not found or unauthorized." });
      return res.json({ message: "Announcement updated" });

    } else if (req.user.role === "ORGANIZER") {
      const [orgResult] = await db.promise().query(
        "SELECT club_id FROM organizers WHERE id = ?",
        [req.user.id]
      );
      if (!orgResult.length || !orgResult[0].club_id) {
        return res.status(404).json({ message: "No club linked to this organizer." });
      }

      const clubId = orgResult[0].club_id;
      const [result] = await db.promise().query(
        `UPDATE announcements
         SET title = ?, message = ?, type = COALESCE(?, type)
         WHERE id = ? AND club_id = ? AND created_by = ?`,
        [title, message, type || null, req.params.id, clubId, req.user.id]
      );
      if (!result.affectedRows)
        return res.status(404).json({ message: "Not found or unauthorized." });
      return res.json({ message: "Announcement updated" });

    } else {
      return res.status(403).json({ message: "Faculty or Organizer access only." });
    }
  } catch (err) {
    console.error("PUT /announcements/:id error:", err);
    res.status(500).json({ message: "Server error", detail: err.message });
  }
});






router.delete("/:id", authorize(), async (req, res) => {
  try {
    if (req.user.role === "FACULTY") {
      const [result] = await db.promise().query(
        "DELETE FROM announcements WHERE id = ? AND created_by = ?",
        [req.params.id, req.user.id]
      );
      if (!result.affectedRows)
        return res.status(404).json({ message: "Not found or unauthorized." });
      return res.json({ message: "Announcement deleted" });

    } else if (req.user.role === "ORGANIZER") {
      const [orgResult] = await db.promise().query(
        "SELECT club_id FROM organizers WHERE id = ?",
        [req.user.id]
      );
      if (!orgResult.length || !orgResult[0].club_id) {
        return res.status(404).json({ message: "No club linked to this organizer." });
      }

      const clubId = orgResult[0].club_id;
      const [result] = await db.promise().query(
        "DELETE FROM announcements WHERE id = ? AND club_id = ? AND created_by = ?",
        [req.params.id, clubId, req.user.id]
      );
      if (!result.affectedRows)
        return res.status(404).json({ message: "Not found or unauthorized." });
      return res.json({ message: "Announcement deleted" });

    } else {
      return res.status(403).json({ message: "Faculty or Organizer access only." });
    }
  } catch (err) {
    console.error("DELETE /announcements/:id error:", err);
    res.status(500).json({ message: "Server error", detail: err.message });
  }
});



module.exports = router;