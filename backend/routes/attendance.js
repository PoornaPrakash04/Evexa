
const express   = require("express");
const router    = express.Router();
const db        = require("../db");
const authorize = require("../middleware/authMiddleware");






function withTransaction(fn, res) {
  db.getConnection((connErr, conn) => {
    if (connErr) {
      console.error("[withTransaction] getConnection error:", connErr);
      return res.status(500).json({ message: "Server error" });
    }

    conn.beginTransaction((txErr) => {
      if (txErr) {
        conn.release();
        console.error("[withTransaction] beginTransaction error:", txErr);
        return res.status(500).json({ message: "Server error" });
      }

      fn(conn, (err, payload) => {
        if (err) {
          return conn.rollback(() => {
            conn.release();
            const status  = err.statusCode || 500;
            const message = err.message    || "Server error";
            console.error("[withTransaction] rolled back:", message);
            res.status(status).json({ message });
          });
        }

        conn.commit((commitErr) => {
          conn.release();
          if (commitErr) {
            console.error("[withTransaction] commit error:", commitErr);
            return res.status(500).json({ message: "Server error" });
          }
          res.json(payload);
        });
      });
    });
  });
}


















router.post("/register", authorize(["STUDENT"]), (req, res) => {
  const { event_id } = req.body;
  const student_id   = req.user.id;

  if (!event_id) {
    return res.status(400).json({ message: "event_id is required." });
  }

  withTransaction((conn, done) => {
    
    
    
    conn.query(
      `SELECT id, status, capacity
       FROM events
       WHERE id = ?
       FOR UPDATE`,
      [event_id],
      (err, events) => {
        if (err) return done(err);
        if (!events.length) {
          return done({ statusCode: 404, message: "Event not found." });
        }

        const event = events[0];
        if (event.status !== "published") {
          return done({ statusCode: 400, message: "Registrations are not open for this event." });
        }

        
        conn.query(
          "SELECT id FROM registrations WHERE student_id = ? AND event_id = ?",
          [student_id, event_id],
          (err2, existing) => {
            if (err2) return done(err2);
            if (existing.length > 0) {
              return done({ statusCode: 400, message: "Already registered for this event." });
            }

            
            conn.query(
              "SELECT COUNT(*) AS cnt FROM registrations WHERE event_id = ?",
              [event_id],
              (err3, countRows) => {
                if (err3) return done(err3);

                const currentCount = countRows[0].cnt;
                if (event.capacity !== null && currentCount >= event.capacity) {
                  return done({ statusCode: 400, message: "This event is fully booked." });
                }

                
                conn.query(
                  "INSERT INTO registrations (student_id, event_id, registered_at) VALUES (?, ?, NOW())",
                  [student_id, event_id],
                  (err4, result) => {
                    if (err4) return done(err4);

                    
                    
                    conn.query(
                      `UPDATE events
                       SET registered_count = (
                         SELECT COUNT(*) FROM registrations WHERE event_id = ?
                       )
                       WHERE id = ?`,
                      [event_id, event_id],
                      (err5) => {
                        if (err5) return done(err5);
                        done(null, {
                          message: "Registered successfully",
                          id:      result.insertId,
                        });
                      }
                    );
                  }
                );
              }
            );
          }
        );
      }
    );
  }, res);
});




router.get("/my-registrations", authorize(["STUDENT"]), (req, res) => {
  const sql = `
    SELECT
      r.id,
      r.registered_at,
      e.id               AS event_id,
      e.title            AS event_title,
      e.date,
      e.time,
      e.venue,
      e.type,
      e.registration_fee,
      e.status,
      c.club_name        AS club
    FROM registrations r
    JOIN   events e ON e.id       = r.event_id
    LEFT JOIN clubs c ON c.club_id = e.club_id
    WHERE r.student_id = ?
    ORDER BY r.registered_at DESC
  `;

  db.query(sql, [req.user.id], (err, results) => {
    if (err) {
      console.error("GET /my-registrations error:", err.sqlMessage || err.message);
      return res.status(500).json({ message: "Server error", detail: err.sqlMessage || err.message });
    }
    res.json(results);
  });
});




router.get("/upcoming", authorize(["STUDENT"]), (req, res) => {
  const sql = `
    SELECT
      r.id,
      r.registered_at,
      e.id               AS event_id,
      e.title            AS event_title,
      e.date,
      e.time,
      e.venue,
      e.type,
      e.registration_fee,
      c.club_name        AS club
    FROM registrations r
    JOIN   events e ON e.id       = r.event_id
    LEFT JOIN clubs c ON c.club_id = e.club_id
    WHERE r.student_id = ?
      AND e.date > CURDATE()
    ORDER BY e.date ASC
  `;

  db.query(sql, [req.user.id], (err, results) => {
    if (err) {
      console.error("GET /upcoming error:", err.sqlMessage || err.message);
      return res.status(500).json({ message: "Server error" });
    }
    res.json(results);
  });
});

module.exports = router;