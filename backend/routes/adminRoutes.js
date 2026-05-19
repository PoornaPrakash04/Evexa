const express    = require("express");
const bcrypt     = require("bcrypt");
const jwt        = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const db         = require("../db");

const router  = express.Router();
function addColumnIfMissing(table, column, definition) {
  const checkSql = `
    SELECT COUNT(*) AS cnt
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = ?
      AND COLUMN_NAME  = ?`;
  db.query(checkSql, [table, column], (err, rows) => {
    if (err) return console.warn(`[Migration] Check failed for ${table}.${column}:`, err.message);
    if (rows[0].cnt > 0) return; 
    db.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`, (err2) => {
      if (err2) console.warn(`[Migration] Failed to add ${table}.${column}:`, err2.message);
      else      console.log(`[Migration] Added ${table}.${column}`);
    });
  });
}

(function runMigrations() {
  addColumnIfMissing("events",     "deleted_at", "DATETIME DEFAULT NULL");
  addColumnIfMissing("students",   "deleted_at", "DATETIME DEFAULT NULL");
  addColumnIfMissing("organizers", "deleted_at", "DATETIME DEFAULT NULL");
  addColumnIfMissing("faculty",    "deleted_at", "DATETIME DEFAULT NULL");
  addColumnIfMissing("clubs",      "deleted_at", "DATETIME DEFAULT NULL");
})();

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});




function adminOnly(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer "))
    return res.status(401).json({ message: "No token provided." });
  try {
    const decoded = jwt.verify(header.split(" ")[1], process.env.JWT_SECRET);
    if ((decoded.role || "").toUpperCase() !== "ADMIN")
      return res.status(403).json({ message: "Access denied. Admins only." });
    req.admin = decoded;
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token." });
  }
}

function pushLog(type, icon, color, action, user) {
  const ts = new Date().toISOString().slice(0, 19).replace("T", " ");
  db.query(
    "INSERT INTO activity_logs (type, icon, color, action, user, created_at) VALUES (?,?,?,?,?,?)",
    [type, icon, color, action, user, ts],
    () => {}
  );
}




router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ message: "Email and password are required." });

  db.query("SELECT * FROM admin WHERE email = ? LIMIT 1", [email], async (err, rows) => {
    if (err) {
      console.error("Admin login error:", err.message);
      return res.status(500).json({ message: err.message });
    }
    if (!rows.length) return res.status(401).json({ message: "Admin not found." });

    const admin = rows[0];
    const match = await bcrypt.compare(password, admin.password);
    if (!match) return res.status(401).json({ message: "Invalid password." });

    const token = jwt.sign(
      { id: admin.admin_id, role: "ADMIN", name: admin.admin_name },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );
    pushLog("user", "🛡️", "purple", `Admin login: ${admin.admin_name}`, admin.admin_name);
    res.json({ token, name: admin.admin_name, email: admin.email });
  });
});




router.get("/profile", adminOnly, (req, res) => {
  db.query(
    "SELECT admin_id AS id, admin_name AS name, email, phone, created_at FROM admin WHERE admin_id = ?",
    [req.admin.id],
    (err, rows) => {
      if (err) return res.status(500).json({ message: err.message });
      if (!rows.length) return res.status(404).json({ message: "Admin not found." });
      res.json(rows[0]);
    }
  );
});

router.put("/profile", adminOnly, (req, res) => {
  const { name, phone } = req.body;
  db.query(
    "UPDATE admin SET admin_name=?, phone=? WHERE admin_id=?",
    [name, phone || null, req.admin.id],
    (err) => {
      if (err) return res.status(500).json({ message: "Server error." });
      pushLog("system", "⚙️", "blue", "Admin profile updated", req.admin.name || "Admin");
      res.json({ message: "Profile updated." });
    }
  );
});

router.put("/change-password", adminOnly, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword)
    return res.status(400).json({ message: "Both fields are required." });

  db.query("SELECT password FROM admin WHERE admin_id=?", [req.admin.id], async (err, rows) => {
    if (err || !rows.length) return res.status(500).json({ message: "Server error." });
    const match = await bcrypt.compare(currentPassword, rows[0].password);
    if (!match) return res.status(401).json({ message: "Current password is incorrect." });
    const hashed = await bcrypt.hash(newPassword, 10);
    db.query("UPDATE admin SET password=? WHERE admin_id=?", [hashed, req.admin.id], (err2) => {
      if (err2) return res.status(500).json({ message: "Server error." });
      pushLog("system", "🔒", "red", "Admin password changed", req.admin.name || "Admin");
      res.json({ message: "Password updated." });
    });
  });
});




router.get("/dashboard", adminOnly, (req, res) => {
  const q = (sql, params = []) =>
    new Promise((resolve, reject) =>
      db.query(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)))
    );
 console.log("TOTAL EVENTS QUERY FIXED");
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekStartStr = weekStart.toISOString().slice(0, 10);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekEndStr = weekEnd.toISOString().slice(0, 10);
  console.log("Dashboard total events query running");
  Promise.all([
    q("SELECT COUNT(*) AS total FROM (SELECT DISTINCT events.id FROM events WHERE events.deleted_at IS NULL) x"),
    q("SELECT COUNT(*) AS total FROM events WHERE status IN ('Approved','Completed')"),
    q("SELECT COUNT(*) AS total FROM events WHERE status = 'Pending'"),
    q("SELECT COUNT(*) AS total FROM students"),
    q("SELECT COUNT(*) AS total FROM organizers"),
    q("SELECT COUNT(*) AS total FROM faculty"),
    q("SELECT COUNT(*) AS total FROM certificates"),
    q("SELECT COUNT(*) AS total FROM events WHERE DATE(date) BETWEEN ? AND ?", [weekStartStr, weekEndStr]),
    q("SELECT COUNT(*) AS total FROM registrations"),
    q(`SELECT c.club_name AS club,
              COUNT(DISTINCT e.id)  AS event_count,
              COUNT(r.id)           AS total_participants
       FROM events e
       LEFT JOIN clubs         c ON c.club_id   = e.club_id
       LEFT JOIN registrations r ON r.event_id  = e.id
       WHERE e.status IN ('hall_approved', 'published', 'completed')
         AND e.deleted_at IS NULL
         AND e.hall_approved_at IS NOT NULL
       GROUP BY e.club_id, c.club_name
       ORDER BY event_count DESC LIMIT 5`),
    q(`SELECT SUM(CASE WHEN category = 'Technical' THEN 1 ELSE 0 END) AS academic,
              SUM(CASE WHEN category != 'Technical' OR category IS NULL THEN 1 ELSE 0 END) AS non_academic
       FROM events
       WHERE status IN ('hall_approved', 'published', 'completed')
         AND deleted_at IS NULL
         AND hall_approved_at IS NOT NULL`),
    q(`SELECT c.club_name AS club,
              COUNT(r.id)          AS total_participants,
              COUNT(DISTINCT e.id) AS events
       FROM events e
       LEFT JOIN clubs         c ON c.club_id  = e.club_id
       LEFT JOIN registrations r ON r.event_id = e.id
       WHERE e.status IN ('hall_approved', 'published', 'completed')
         AND e.deleted_at IS NULL
         AND e.hall_approved_at IS NOT NULL
       GROUP BY e.club_id, c.club_name ORDER BY total_participants DESC LIMIT 5`),
    q(`SELECT e.id, e.title AS name,
              COALESCE(c.club_name, CONCAT('Club #', e.club_id)) AS organizer,
              e.date, e.category,
              (SELECT COUNT(*) FROM registrations r WHERE r.event_id = e.id) AS participants,
              e.status
       FROM events e LEFT JOIN clubs c ON e.club_id = c.club_id
       ORDER BY e.id DESC LIMIT 5`),
    q("SELECT * FROM activity_logs ORDER BY id DESC LIMIT 5"),
  ])
    .then(([
      [totalEvents], [approved], [pending],
      [students], [organizers], [faculty],
      [certs],
      [eventsThisWeek],
      [totalParticipation],
      mostActiveClubs,
      [academicSplit],
      topClubs,
      recentEvents,
      recentLogs,
    ]) => {
      res.json({
        stats: {
          totalEvents:        totalEvents.total,
          eventsApproved:     approved.total,
          pendingReview:      pending.total,
          totalUsers:         students.total + organizers.total + faculty.total,
          certsIssued:        certs.total,
          activeClubs:        mostActiveClubs.length,
          pendingRoles:       pending.total,  
          eventsThisWeek:     eventsThisWeek.total,
          totalParticipation: totalParticipation.total,
          userBreakdown: {
            students:   students.total,
            organizers: organizers.total,
            faculty:    faculty.total,
          },
          academicSplit: {
            academic:     academicSplit.academic || 0,
            non_academic: academicSplit.non_academic || 0,
          },
        },
        mostActiveClubs,
        topClubs,
        recentEvents,
        recentLogs,
      });
    })
    .catch((err) => {
      console.error("Dashboard error:", err.message);
      res.status(500).json({ message: err.message });
    });
});




router.get("/events", adminOnly, (req, res) => {
  const { search = "", status = "all", category = "all" } = req.query;
  let sql = `SELECT e.*, COALESCE(c.club_name, CONCAT('Club #', e.club_id)) AS organizer_name
             FROM events e LEFT JOIN clubs c ON e.club_id = c.club_id WHERE e.deleted_at IS NULL`;
  const params = [];

  if (search)             { sql += " AND e.title LIKE ?"; params.push(`%${search}%`); }
  if (status !== "all")   { sql += " AND e.status = ?";  params.push(status); }
  if (category !== "all") { sql += " AND e.category = ?";    params.push(category); }

  sql += " ORDER BY e.id DESC";
  db.query(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ message: err.message });
    res.json(rows);
  });
});

router.post("/events", adminOnly, (req, res) => {
  const { name, club_id, date, category } = req.body;
  if (!name || !date || !category)
    return res.status(400).json({ message: "Required fields missing." });

  db.query(
    "INSERT INTO events (title, club_id, date, type, status) VALUES (?,?,?,?,'Pending')",
    [name, club_id || null, date, category],
    (err, result) => {
      if (err) return res.status(500).json({ message: err.message });
      pushLog("event", "📋", "purple", `Event '${name}' created`, req.admin.name || "Admin");
      res.status(201).json({ id: result.insertId, message: "Event created." });
    }
  );
});

router.put("/events/:id", adminOnly, (req, res) => {
  const { name, date, status, category } = req.body;
  db.query(
    "UPDATE events SET title=?, date=?, status=?, type=? WHERE id=?",
    [name, date, status, category, req.params.id],
    (err) => {
      if (err) return res.status(500).json({ message: err.message });
      pushLog("event", "📋", "orange", `Event '${name}' updated`, req.admin.name || "Admin");
      res.json({ message: "Event updated." });
    }
  );
});

router.delete("/events/:id", adminOnly, (req, res) => {
  db.query("SELECT title FROM events WHERE id=?", [req.params.id], (err, rows) => {
    if (err) return res.status(500).json({ message: err.message });
    const evName = rows?.[0]?.title || `ID ${req.params.id}`;
    
    db.query("UPDATE events SET deleted_at = NOW() WHERE id=?", [req.params.id], (err2) => {
      if (err2) {
        
        if (err2.code === "ER_BAD_FIELD_ERROR") {
          return db.query("DELETE FROM events WHERE id=?", [req.params.id], (err3) => {
            if (err3) return res.status(500).json({ message: err3.message });
            pushLog("event", "📋", "red", `Event '${evName}' deleted`, req.admin.name || "Admin");
            res.json({ message: "Event deleted." });
          });
        }
        return res.status(500).json({ message: err2.message });
      }
      pushLog("event", "📋", "red", `Event '${evName}' moved to trash`, req.admin.name || "Admin");
      res.json({ message: "Event moved to trash." });
    });
  });
});

router.put("/events/:id/approve", adminOnly, (req, res) => {
  db.query("SELECT title FROM events WHERE id=?", [req.params.id], (err, rows) => {
    const evName = rows?.[0]?.title || `ID ${req.params.id}`;
    db.query("UPDATE events SET status='Approved' WHERE id=?", [req.params.id], (err2) => {
      if (err2) return res.status(500).json({ message: err2.message });
      pushLog("event", "📋", "green", `Event '${evName}' approved`, req.admin.name || "Admin");
      res.json({ message: "Event approved." });
    });
  });
});

router.post("/events/bulk-approve", adminOnly, (req, res) => {
  const { ids } = req.body;
  if (!ids?.length) return res.status(400).json({ message: "No IDs provided." });
  db.query("UPDATE events SET status='Approved' WHERE id IN (?)", [ids], (err) => {
    if (err) return res.status(500).json({ message: err.message });
    pushLog("event", "📋", "green", `Bulk approved ${ids.length} events`, req.admin.name || "Admin");
    res.json({ message: `${ids.length} event(s) approved.` });
  });
});

router.post("/events/bulk-delete", adminOnly, (req, res) => {
  const { ids } = req.body;
  if (!ids?.length) return res.status(400).json({ message: "No IDs provided." });
  db.query("DELETE FROM events WHERE id IN (?)", [ids], (err) => {
    if (err) return res.status(500).json({ message: err.message });
    pushLog("event", "📋", "red", `Bulk deleted ${ids.length} events`, req.admin.name || "Admin");
    res.json({ message: `${ids.length} event(s) deleted.` });
  });
});


router.get("/events/:id/participants", adminOnly, (req, res) => {
  db.query(
    `SELECT
       r.id          AS registration_id,
       s.name        AS student_name,
       s.roll_no,
       s.admission_no,
       s.email,
       s.phone,
       s.department,
       s.class,
       CASE WHEN cert.id IS NOT NULL THEN 'Yes' ELSE 'No' END AS certificate_issued
     FROM registrations r
     JOIN students s ON r.student_id = s.id
     LEFT JOIN certificates cert ON cert.event_id = r.event_id AND cert.student_id = r.student_id
     WHERE r.event_id = ?
     ORDER BY s.name ASC`,
    [req.params.id],
    (err, rows) => {
      if (err) return res.status(500).json({ message: err.message });
      res.json(rows);
    }
  );
});


router.get("/events/:id/participants/csv", adminOnly, (req, res) => {
  db.query(
    "SELECT title AS event_title, date AS event_date FROM events WHERE id = ?",
    [req.params.id],
    (evErr, evRows) => {
      if (evErr || !evRows.length)
        return res.status(404).json({ message: "Event not found." });

      const { event_title, event_date } = evRows[0];

      db.query(
        `SELECT
           s.name         AS Name,
           s.roll_no      AS Roll_No,
           s.admission_no AS Admission_No,
           s.email        AS Email,
           s.phone        AS Phone,
           s.department   AS Department,
           s.class        AS Class,
           CASE WHEN cert.id IS NOT NULL THEN 'Yes' ELSE 'No' END AS Certificate_Issued
         FROM registrations r
         JOIN students s ON r.student_id = s.id
         LEFT JOIN certificates cert ON cert.event_id = r.event_id AND cert.student_id = r.student_id
         WHERE r.event_id = ?
         ORDER BY s.name ASC`,
        [req.params.id],
        (err, rows) => {
          if (err) return res.status(500).json({ message: err.message });

          if (!rows.length) {
            return res.status(200)
              .header("Content-Type", "text/csv")
              .send("No participants registered yet.");
          }

          const headers = Object.keys(rows[0]).join(",");
          const csvRows = rows.map(r =>
            Object.values(r).map(v =>
              v === null ? "" : `"${String(v).replace(/"/g, '""')}"`
            ).join(",")
          );
          const csv      = [headers, ...csvRows].join("\n");
          const filename = `${event_title.replace(/[^a-z0-9]/gi, "_")}_participants_${event_date}.csv`;

          res.header("Content-Type", "text/csv");
          res.header("Content-Disposition", `attachment; filename="${filename}"`);
          res.send(csv);
        }
      );
    }
  );
});


router.post("/send-message", adminOnly, (req, res) => {
  const { event_id, to_email, subject, message } = req.body;

  if (!to_email || !subject || !message)
    return res.status(400).json({ message: "to_email, subject, and message are required." });

  
  const verifySql = `
    SELECT o.name AS organizer_name, o.email AS organizer_email, e.title
    FROM events e
    JOIN organizers o ON o.id = e.organizer_id
    WHERE e.id = ? AND o.email = ?
    LIMIT 1
  `;

  db.query(verifySql, [event_id || 0, to_email], (err, rows) => {
    if (err) {
      console.error("send-message verify error:", err);
      return res.status(500).json({ message: "Server error" });
    }

    const organizer_name = rows[0]?.organizer_name || "Organizer";
    const event_title    = rows[0]?.title          || "your event";

    transporter.sendMail(
      {
        from:    `EVEXA Admin <${process.env.EMAIL_USER}>`,
        to:      to_email,
        subject: subject,
        html: `
          <div style="font-family:sans-serif;max-width:560px;margin:auto;">
            <h2 style="color:#6d5efc;">EVEXA Admin Message</h2>
            <p>Hi <strong>${organizer_name}</strong>,</p>
            <p>You have received a message from the EVEXA Admin regarding
               <strong>${event_title}</strong>:</p>
            <blockquote style="border-left:4px solid #6d5efc;padding:10px 16px;
                               background:#f5f3ff;border-radius:6px;color:#374151;">
              ${message.replace(/\n/g, "<br/>")}
            </blockquote>
            <p style="color:#6b7280;font-size:13px;margin-top:24px;">
              This message was sent via the EVEXA Admin Portal.
              Please do not reply to this email directly.
            </p>
          </div>
        `,
      },
      (mailErr) => {
        if (mailErr) {
          console.error("send-message mail error:", mailErr);
          return res.status(500).json({ message: "Failed to send email: " + mailErr.message });
        }
        pushLog("event", "✉️", "blue", `Admin messaged organizer of event ${event_id}`, req.admin.name || "Admin");
        res.json({ message: "Message sent successfully." });
      }
    );
  });
});




router.get("/clubs/performance", adminOnly, (req, res) => {
  const { academic_year } = req.query;
  let where = "WHERE 1=1";
  const params = [];
  if (academic_year && academic_year !== "all") {
    where += " AND e.academic_year = ?";
    params.push(academic_year);
  }

  const sql = `
    SELECT
      COALESCE(c.club_name, CONCAT('Club #', e.club_id)) AS club,
      COUNT(DISTINCT e.id)                               AS events_conducted,
      COUNT(r.id)                                        AS total_participants,
      ROUND(COUNT(r.id) / NULLIF(COUNT(DISTINCT e.id), 0), 1) AS avg_attendance,
      DATE_FORMAT(MAX(e.date), "%Y-%m-%d")              AS last_event
    FROM events e
    LEFT JOIN clubs         c ON c.club_id  = e.club_id
    LEFT JOIN registrations r ON r.event_id = e.id
    ${where}
    GROUP BY e.club_id, c.club_name
    ORDER BY total_participants DESC
  `;
  db.query(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ message: err.message });
    res.json(rows.map(r => ({
      ...r,
      avg_attendance: r.avg_attendance ?? "0",
      avg_feedback:   "N/A",
    })));
  });
});

router.get("/clubs/growth", adminOnly, (req, res) => {
  const sql = `
    SELECT
      COALESCE(c.club_name, CONCAT('Club #', e.club_id)) AS club,
      DATE_FORMAT(e.date, '%b %Y')                        AS month,
      DATE_FORMAT(e.date, '%Y-%m')                        AS month_sort,
      COUNT(r.id)                                         AS participants
    FROM events e
    LEFT JOIN clubs         c ON c.club_id  = e.club_id
    LEFT JOIN registrations r ON r.event_id = e.id
    WHERE e.date >= DATE_SUB(NOW(), INTERVAL 8 MONTH)
    GROUP BY e.club_id, c.club_name, DATE_FORMAT(e.date, '%Y-%m')
    ORDER BY month_sort ASC, c.club_name ASC
  `;
  db.query(sql, (err, rows) => {
    if (err) return res.status(500).json({ message: err.message });
    res.json(rows);
  });
});




router.get("/users", adminOnly, (req, res) => {
  const { search = "", role = "all" } = req.query;

  
  
  const roleQueries = {
    student:   `SELECT id, name, email, 'student'   AS role, department         AS department, 'active' AS status, admission_no              AS admission_no, phone    AS phone, NULL       AS last FROM students   WHERE deleted_at IS NULL`,
    organizer: `SELECT id, name, email, 'organizer' AS role, COALESCE(club,'') AS department, 'active' AS status, COALESCE(admission_no,'') AS admission_no, phone    AS phone, created_at AS last FROM organizers WHERE deleted_at IS NULL`,
    faculty:   `SELECT id, name, email, 'faculty'   AS role, department         AS department, 'active' AS status, faculty_no               AS admission_no, phone_no AS phone, NULL       AS last FROM faculty    WHERE deleted_at IS NULL`,
    admin:     `SELECT admin_id AS id, admin_name AS name, email, 'admin' AS role, '' AS department, 'active' AS status, '' AS admission_no, phone AS phone, created_at AS last FROM admin`,
  };

  const roleList = role === "all" ? ["student", "organizer", "faculty", "admin"] : [role];
  const parts    = roleList.filter(r => roleQueries[r]).map(r => roleQueries[r]);
  let sql        = parts.join(" UNION ALL ");
  const params   = [];
  if (search) {
    sql = `SELECT * FROM (${sql}) AS u WHERE name LIKE ? OR email LIKE ?`;
    params.push(`%${search}%`, `%${search}%`);
  }

  db.query(sql, params, (err, rows) => {
    if (err) {
      console.error("GET /users SQL error:", err.message);
      return res.status(500).json({ message: err.message });
    }
    res.json(rows);
  });
});

router.post("/users", adminOnly, async (req, res) => {
  const { name, email, password, role, department, phone, admission_no, roll_no, cls, club, faculty_no } = req.body;
  if (!name || !email || !password || !role)
    return res.status(400).json({ message: "name, email, password and role are required." });

  const hashed = await bcrypt.hash(password, 10);

  const inserts = {
    student: [
      "INSERT INTO students (name,email,password,department,phone,admission_no,roll_no,class) VALUES (?,?,?,?,?,?,?,?)",
      [name, email, hashed, department||null, phone||null, admission_no||null, roll_no||null, cls||null],
    ],
    organizer: [
      "INSERT INTO organizers (name,email,password,club,phone,admission_no,roll_no,class) VALUES (?,?,?,?,?,?,?,?)",
      [name, email, hashed, club||department||null, phone||null, admission_no||null, roll_no||null, cls||null],
    ],
    faculty: [
      "INSERT INTO faculty (name,email,password,department,phone_no,faculty_no,role_id) VALUES (?,?,?,?,?,?,1)",
      [name, email, hashed, department||null, phone||null, faculty_no||null],
    ],
    admin: [
      "INSERT INTO admin (admin_name,email,password,phone) VALUES (?,?,?,?)",
      [name, email, hashed, phone||null],
    ],
  };

  const [sql, params] = inserts[role] || [];
  if (!sql) return res.status(400).json({ message: "Invalid role." });

  db.query(sql, params, (err) => {
    if (err) {
      if (err.code === "ER_DUP_ENTRY")
        return res.status(409).json({ message: "Email or ID already in use." });
      return res.status(500).json({ message: err.message });
    }
    pushLog("user", "👤", "blue", `New ${role} added: ${name}`, req.admin.name || "Admin");
    res.status(201).json({ message: `${role} added successfully.` });
  });
});

router.put("/users/:id", adminOnly, (req, res) => {
  const { name, email, role, status, department, phone, club, faculty_no } = req.body;

  const updates = {
    student: [
      "UPDATE students SET name=?,email=?,department=?,phone=? WHERE id=?",
      [name, email, department||null, phone||null, req.params.id],
    ],
    organizer: [
      "UPDATE organizers SET name=?,email=?,club=?,phone=? WHERE id=?",
      [name, email, club||department||null, phone||null, req.params.id],
    ],
    faculty: [
      "UPDATE faculty SET name=?,email=?,department=?,phone_no=?,faculty_no=? WHERE id=?",
      [name, email, department||null, phone||null, faculty_no||null, req.params.id],
    ],
    admin: [
      "UPDATE admin SET admin_name=?,email=?,phone=? WHERE admin_id=?",
      [name, email, phone||null, req.params.id],
    ],
  };

  const [sql, params] = updates[role] || [];
  if (!sql) return res.status(400).json({ message: "Invalid role." });

  db.query(sql, params, (err) => {
    if (err) return res.status(500).json({ message: err.message });
    pushLog("user", "👤", "orange", `User updated: ${name} (${role})`, req.admin.name || "Admin");
    res.json({ message: "User updated." });
  });
});

router.delete("/users/:id", adminOnly, (req, res) => {
  const { role } = req.query;
  const tables = { student: "students", organizer: "organizers", faculty: "faculty" };
  const table  = tables[role];
  if (!table) return res.status(400).json({ message: "Invalid or unremovable role." });

  
  db.query(`UPDATE ${table} SET deleted_at = NOW() WHERE id=?`, [req.params.id], (err) => {
    if (err) {
      
      if (err.code === "ER_BAD_FIELD_ERROR") {
        return db.query(`DELETE FROM ${table} WHERE id=?`, [req.params.id], (err2) => {
          if (err2) return res.status(500).json({ message: err2.message });
          pushLog("user", "👤", "red", `${role} (ID ${req.params.id}) deleted`, req.admin.name || "Admin");
          res.json({ message: "User deleted." });
        });
      }
      return res.status(500).json({ message: err.message });
    }
    pushLog("user", "👤", "red", `${role} (ID ${req.params.id}) moved to trash`, req.admin.name || "Admin");
    res.json({ message: "User moved to trash." });
  });
});

router.put("/users/:id/assign-club", adminOnly, (req, res) => {
  const { club } = req.body;
  if (!club) return res.status(400).json({ message: "Club name required." });
  db.query("UPDATE organizers SET club=? WHERE id=?", [club, req.params.id], (err) => {
    if (err) return res.status(500).json({ message: err.message });
    pushLog("user", "👤", "blue", `Club '${club}' assigned to organizer ID ${req.params.id}`, req.admin.name || "Admin");
    res.json({ message: "Club assigned." });
  });
});




router.get("/logs", adminOnly, (req, res) => {
  const { search = "", type = "all", from = "", to = "" } = req.query;
  let sql      = "SELECT * FROM activity_logs WHERE 1=1";
  const params = [];

  if (type !== "all") { sql += " AND type = ?";                      params.push(type); }
  if (from)           { sql += " AND DATE(created_at) >= ?";         params.push(from); }
  if (to)             { sql += " AND DATE(created_at) <= ?";         params.push(to); }
  if (search)         { sql += " AND (action LIKE ? OR user LIKE ?)"; params.push(`%${search}%`, `%${search}%`); }

  sql += " ORDER BY id DESC LIMIT 500";
  db.query(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ message: err.message });
    res.json(rows);
  });
});

router.delete("/logs", adminOnly, (req, res) => {
  db.query("DELETE FROM activity_logs", (err) => {
    if (err) return res.status(500).json({ message: err.message });
    pushLog("system", "🗑️", "red", "All activity logs cleared", req.admin.name || "Admin");
    res.json({ message: "Logs cleared." });
  });
});




router.get("/analytics", adminOnly, (req, res) => {
  const { academic_year } = req.query;
  const q = (sql, p = []) =>
    new Promise((resolve, reject) =>
      db.query(sql, p, (err, rows) => (err ? reject(err) : resolve(rows)))
    );

  
  
  let yearWhere  = "";
  const yearParams = [];
  if (academic_year && academic_year !== "all") {
    const startYear = parseInt(academic_year.split("-")[0], 10);
    const endYear   = startYear + 1;
    yearWhere = " AND e.date BETWEEN ? AND ?";
    yearParams.push(`${startYear}-08-01`, `${endYear}-07-31`);
  }

  Promise.all([
    
    q(`SELECT DATE_FORMAT(e.date,'%Y-%m') AS ym, DATE_FORMAT(e.date,'%b') AS month, COUNT(*) AS count
       FROM events e WHERE 1=1 ${yearWhere}
       GROUP BY DATE_FORMAT(e.date,'%Y-%m'), DATE_FORMAT(e.date,'%b')
       ORDER BY ym`, yearParams),

    
    q(`SELECT
         SUM(CASE WHEN e.category = 'Technical' THEN 1 ELSE 0 END)                        AS academic,
         SUM(CASE WHEN e.category != 'Technical' OR e.category IS NULL THEN 1 ELSE 0 END) AS non_academic
       FROM events e WHERE 1=1 ${yearWhere}`, yearParams),

    
    q(`SELECT DATE_FORMAT(e.date,'%Y-%m') AS ym, DATE_FORMAT(e.date,'%b') AS month, COUNT(r.id) AS participants
       FROM events e
       LEFT JOIN registrations r ON r.event_id = e.id
       WHERE 1=1 ${yearWhere}
       GROUP BY DATE_FORMAT(e.date,'%Y-%m'), DATE_FORMAT(e.date,'%b')
       ORDER BY ym`, yearParams),

    
    q(`SELECT
         SUM(CASE WHEN MONTH(e.date) BETWEEN 8 AND 12 THEN 1 ELSE 0 END) AS sem1,
         SUM(CASE WHEN MONTH(e.date) BETWEEN 1  AND 7  THEN 1 ELSE 0 END) AS sem2
       FROM events e WHERE 1=1 ${yearWhere}`, yearParams),

    
    q(`SELECT 'Students'   AS role, COUNT(*) AS count FROM students
       UNION ALL SELECT 'Faculty',    COUNT(*) FROM faculty
       UNION ALL SELECT 'Organizers', COUNT(*) FROM organizers
       UNION ALL SELECT 'Admins',     COUNT(*) FROM admin`),
  ])
    .then(([eventsPerMonth, acadSplitRows, participationPerMonth, semestersRows, roles]) => {
      const acadSplit = acadSplitRows?.[0] || { academic: 0, non_academic: 0 };
      const semesters = semestersRows?.[0] || { sem1: 0, sem2: 0 };
      res.json({ eventsPerMonth, acadSplit, participationPerMonth, semesters, roles });
    })
    .catch((err) => {
      console.error("Analytics error:", err.message);
      res.status(500).json({ message: err.message });
    });
});




router.get("/system-health", adminOnly, (req, res) => {
  const q = (sql, p = []) =>
    new Promise((resolve, reject) =>
      db.query(sql, p, (err, rows) => (err ? reject(err) : resolve(rows)))
    );

  const startTime = Date.now();

  Promise.all([
    
    q("SELECT COUNT(*) AS total FROM events"),
    q("SELECT COUNT(*) AS total FROM students"),
    q("SELECT COUNT(*) AS total FROM registrations"),
    q("SELECT COUNT(*) AS total FROM certificates"),
    q("SELECT COUNT(*) AS total FROM activity_logs"),
    
    q(`SELECT ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS size_mb
       FROM information_schema.tables
       WHERE table_schema = DATABASE()`),
  ])
    .then(([[events], [students], [registrations], [certs], [logs], [dbSize]]) => {
      const dbMs      = Date.now() - startTime;   
      const sizeMb    = parseFloat(dbSize.size_mb) || 0;
      const limitMb   = 100;                       
      const usedPct   = Math.min(Math.round((sizeMb / limitMb) * 100), 100);
      const freeMb    = Math.max(limitMb - sizeMb, 0).toFixed(2);
      const dbHealthPct = dbMs < 200 ? 100 : dbMs < 500 ? 90 : dbMs < 1000 ? 75 : 60;

      res.json({
        storage: {
          used_mb:   sizeMb,
          free_mb:   parseFloat(freeMb),
          limit_mb:  limitMb,
          used_pct:  usedPct,
          free_pct:  100 - usedPct,
        },
        database: {
          health_pct:    dbHealthPct,
          query_time_ms: dbMs,
          status:        dbHealthPct >= 90 ? "Healthy" : dbHealthPct >= 75 ? "Degraded" : "Slow",
        },
        counts: {
          events:        events.total,
          students:      students.total,
          registrations: registrations.total,
          certificates:  certs.total,
          logs:          logs.total,
        },
      });
    })
    .catch((err) => {
      console.error("System health error:", err.message);
      res.status(500).json({ message: err.message });
    });
});















router.get("/trash/events", adminOnly, (req, res) => {
  db.query(
    `SELECT e.id, e.title, e.date, e.category, e.status, e.deleted_at,
            COALESCE(c.club_name, CONCAT('Club #', e.club_id)) AS club
     FROM events e
     LEFT JOIN clubs c ON c.club_id = e.club_id
     WHERE e.deleted_at IS NOT NULL
     ORDER BY e.deleted_at DESC`,
    (err, rows) => {
      if (err) return res.status(500).json({ message: err.message });
      res.json(rows);
    }
  );
});

router.get("/trash/users", adminOnly, (req, res) => {
  
  const sql = `
    SELECT id, name, email, 'student'   AS role, department, deleted_at FROM students   WHERE deleted_at IS NOT NULL
    UNION ALL
    SELECT id, name, email, 'organizer' AS role, club AS department,     deleted_at FROM organizers WHERE deleted_at IS NOT NULL
    UNION ALL
    SELECT id, name, email, 'faculty'   AS role, department,             deleted_at FROM faculty    WHERE deleted_at IS NOT NULL
    ORDER BY deleted_at DESC
  `;
  db.query(sql, (err, rows) => {
    if (err) return res.status(500).json({ message: err.message });
    res.json(rows);
  });
});

router.get("/trash/clubs", adminOnly, (req, res) => {
  db.query(
    `SELECT c.club_id AS id, c.club_name AS club, c.deleted_at,
            o.name AS organizer_name,
            (SELECT COUNT(*) FROM events e WHERE e.club_id = c.club_id) AS event_count
     FROM clubs c
     LEFT JOIN organizers o ON o.club = c.club_name
     WHERE c.deleted_at IS NOT NULL
     ORDER BY c.deleted_at DESC`,
    (err, rows) => {
      if (err) return res.status(500).json({ message: err.message });
      res.json(rows);
    }
  );
});



router.put("/trash/events/:id/restore", adminOnly, (req, res) => {
  db.query("SELECT title FROM events WHERE id = ?", [req.params.id], (err, rows) => {
    const name = rows?.[0]?.title || `ID ${req.params.id}`;
    db.query(
      "UPDATE events SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL",
      [req.params.id],
      (err2, result) => {
        if (err2) return res.status(500).json({ message: err2.message });
        if (!result.affectedRows) return res.status(404).json({ message: "Event not found in trash." });
        pushLog("event", "↩️", "green", `Event '${name}' restored from trash`, req.admin.name || "Admin");
        res.json({ message: "Event restored." });
      }
    );
  });
});

router.put("/trash/users/:id/restore", adminOnly, (req, res) => {
  const { role } = req.query;
  const tables = { student: "students", organizer: "organizers", faculty: "faculty" };
  const table  = tables[role];
  if (!table) return res.status(400).json({ message: "Invalid role. Use ?role=student|organizer|faculty" });

  db.query(
    `UPDATE ${table} SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL`,
    [req.params.id],
    (err, result) => {
      if (err) return res.status(500).json({ message: err.message });
      if (!result.affectedRows) return res.status(404).json({ message: "User not found in trash." });
      pushLog("user", "↩️", "green", `${role} ID ${req.params.id} restored from trash`, req.admin.name || "Admin");
      res.json({ message: "User restored." });
    }
  );
});

router.put("/trash/clubs/:id/restore", adminOnly, (req, res) => {
  db.query("SELECT club_name FROM clubs WHERE club_id = ?", [req.params.id], (err, rows) => {
    const name = rows?.[0]?.club_name || `ID ${req.params.id}`;
    db.query(
      "UPDATE clubs SET deleted_at = NULL WHERE club_id = ? AND deleted_at IS NOT NULL",
      [req.params.id],
      (err2, result) => {
        if (err2) return res.status(500).json({ message: err2.message });
        if (!result.affectedRows) return res.status(404).json({ message: "Club not found in trash." });
        pushLog("system", "↩️", "green", `Club '${name}' restored from trash`, req.admin.name || "Admin");
        res.json({ message: "Club restored." });
      }
    );
  });
});



router.delete("/trash/events/:id", adminOnly, (req, res) => {
  db.query("SELECT title FROM events WHERE id = ? AND deleted_at IS NOT NULL", [req.params.id], (err, rows) => {
    if (!rows?.length) return res.status(404).json({ message: "Event not found in trash." });
    const name = rows[0].title;
    db.query("DELETE FROM events WHERE id = ? AND deleted_at IS NOT NULL", [req.params.id], (err2) => {
      if (err2) return res.status(500).json({ message: err2.message });
      pushLog("event", "🗑️", "red", `Event '${name}' permanently deleted`, req.admin.name || "Admin");
      res.json({ message: "Event permanently deleted." });
    });
  });
});

router.delete("/trash/users/:id", adminOnly, (req, res) => {
  const { role } = req.query;
  const tables = { student: "students", organizer: "organizers", faculty: "faculty" };
  const table  = tables[role];
  if (!table) return res.status(400).json({ message: "Invalid role. Use ?role=student|organizer|faculty" });

  db.query(
    `SELECT name FROM ${table} WHERE id = ? AND deleted_at IS NOT NULL`,
    [req.params.id],
    (err, rows) => {
      if (!rows?.length) return res.status(404).json({ message: "User not found in trash." });
      const name = rows[0].name;
      db.query(
        `DELETE FROM ${table} WHERE id = ? AND deleted_at IS NOT NULL`,
        [req.params.id],
        (err2) => {
          if (err2) return res.status(500).json({ message: err2.message });
          pushLog("user", "🗑️", "red", `${role} '${name}' permanently deleted`, req.admin.name || "Admin");
          res.json({ message: "User permanently deleted." });
        }
      );
    }
  );
});

router.delete("/trash/clubs/:id", adminOnly, (req, res) => {
  db.query(
    "SELECT club_name FROM clubs WHERE club_id = ? AND deleted_at IS NOT NULL",
    [req.params.id],
    (err, rows) => {
      if (!rows?.length) return res.status(404).json({ message: "Club not found in trash." });
      const name = rows[0].club_name;
      db.query(
        "DELETE FROM clubs WHERE club_id = ? AND deleted_at IS NOT NULL",
        [req.params.id],
        (err2) => {
          if (err2) return res.status(500).json({ message: err2.message });
          pushLog("system", "🗑️", "red", `Club '${name}' permanently deleted`, req.admin.name || "Admin");
          res.json({ message: "Club permanently deleted." });
        }
      );
    }
  );
});

module.exports = router;