// adminRoutes.js  —  EVEXA Admin API
// Mount at: app.use("/api/admin", require("./routes/adminRoutes"))

const express    = require("express");
const bcrypt     = require("bcrypt");
const jwt        = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const db         = require("../db");

const router  = express.Router();

// ─────────────────────────────────────────────────────────────
//  EMAIL TRANSPORTER
// ─────────────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ─────────────────────────────────────────────────────────────
//  MIDDLEWARE
// ─────────────────────────────────────────────────────────────
function adminOnly(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer "))
    return res.status(401).json({ message: "No token provided." });
  try {
    const decoded = jwt.verify(header.split(" ")[1], process.env.JWT_SECRET);
    if (decoded.role !== "ADMIN")
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

// ─────────────────────────────────────────────────────────────
//  LOGIN
// ─────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────
//  PROFILE
// ─────────────────────────────────────────────────────────────
router.get("/profile", adminOnly, (req, res) => {
  db.query(
    "SELECT admin_id AS id, admin_name AS name, email, phone, created_at FROM admin WHERE admin_id = ?",
    [req.admin.id],
    (err, rows) => {
      if (err || !rows.length) return res.status(500).json({ message: "Server error." });
      res.json(rows[0]);
    }
  );
});

router.put("/profile", adminOnly, (req, res) => {
  const { name, email, phone, department } = req.body;
  db.query(
    "UPDATE admin SET admin_name=?, email=?, phone=? WHERE admin_id=?",
    [name, email, phone || null, req.admin.id],
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

// ─────────────────────────────────────────────────────────────
//  DASHBOARD
// ─────────────────────────────────────────────────────────────
router.get("/dashboard", adminOnly, (req, res) => {
  const q = (sql, params = []) =>
    new Promise((resolve, reject) =>
      db.query(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)))
    );

  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekStartStr = weekStart.toISOString().slice(0, 10);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekEndStr = weekEnd.toISOString().slice(0, 10);

  Promise.all([
    q("SELECT COUNT(*) AS total FROM events"),
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
       GROUP BY e.club_id, c.club_name
       ORDER BY event_count DESC LIMIT 5`),
    q(`SELECT SUM(CASE WHEN category = 'Technical' THEN 1 ELSE 0 END) AS academic,
              SUM(CASE WHEN category != 'Technical' OR category IS NULL THEN 1 ELSE 0 END) AS non_academic
       FROM events`),
    q(`SELECT c.club_name AS club,
              COUNT(r.id)          AS total_participants,
              COUNT(DISTINCT e.id) AS events
       FROM events e
       LEFT JOIN clubs         c ON c.club_id  = e.club_id
       LEFT JOIN registrations r ON r.event_id = e.id
       GROUP BY e.club_id, c.club_name ORDER BY total_participants DESC LIMIT 5`),
    q(`SELECT e.id, e.title AS name,
              COALESCE(c.club_name, CONCAT('Club #', e.club_id)) AS organizer,
              e.date, e.category,
              (SELECT COUNT(*) FROM registrations r WHERE r.event_id = e.id) AS participants,
              e.status
       FROM events e LEFT JOIN clubs c ON e.club_id = c.club_id
       ORDER BY e.id DESC LIMIT 5`),
    q("SELECT * FROM activity_logs ORDER BY id DESC LIMIT 5"),
    q("SELECT COUNT(*) AS total FROM students WHERE 1=0"),
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
      [pendingRoles],
    ]) => {
      res.json({
        stats: {
          totalEvents:        totalEvents.total,
          eventsApproved:     approved.total,
          pendingReview:      pending.total,
          totalUsers:         students.total + organizers.total + faculty.total,
          certsIssued:        certs.total,
          activeClubs:        mostActiveClubs.length,
          pendingRoles:       pendingRoles.total,
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

// ─────────────────────────────────────────────────────────────
//  EVENTS
// ─────────────────────────────────────────────────────────────
router.get("/events", adminOnly, (req, res) => {
  const { search = "", status = "all", category = "all" } = req.query;
  let sql = `SELECT e.*, COALESCE(c.club_name, CONCAT('Club #', e.club_id)) AS organizer_name
             FROM events e LEFT JOIN clubs c ON e.club_id = c.club_id WHERE 1=1`;
  const params = [];

  if (search)             { sql += " AND e.title LIKE ?"; params.push(`%${search}%`); }
  if (status !== "all")   { sql += " AND e.status = ?";  params.push(status); }
  if (category !== "all") { sql += " AND e.type = ?";    params.push(category); }

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
    const evName = rows?.[0]?.title || `ID ${req.params.id}`;
    db.query("DELETE FROM events WHERE id=?", [req.params.id], (err2) => {
      if (err2) return res.status(500).json({ message: err2.message });
      pushLog("event", "📋", "red", `Event '${evName}' deleted`, req.admin.name || "Admin");
      res.json({ message: "Event deleted." });
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

// GET /api/admin/events/:id/participants — full participant list
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

// GET /api/admin/events/:id/participants/csv — download as CSV
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

// POST /api/admin/send-message — send email to event organizer
router.post("/send-message", adminOnly, (req, res) => {
  const { event_id, to_email, subject, message } = req.body;

  if (!to_email || !subject || !message)
    return res.status(400).json({ message: "to_email, subject, and message are required." });

  // Optionally verify the email belongs to the organizer of this event
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

// ─────────────────────────────────────────────────────────────
//  CLUB PERFORMANCE
// ─────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────
//  USERS
// ─────────────────────────────────────────────────────────────
router.get("/users", adminOnly, (req, res) => {
  const { search = "", role = "all" } = req.query;

  const queries = {
    student:   "SELECT id, name, email, 'student' AS role, department AS department, 'active' AS status, admission_no AS admission_no, phone AS phone, NULL AS last FROM students",
    organizer: "SELECT id,       name,       email, 'organizer' AS role, COALESCE(club,'')             AS department, 'active'  AS status, COALESCE(admission_no,'') AS admission_no, phone AS phone, created_at AS last FROM organizers",
    faculty:   "SELECT id,       name,       email, 'faculty'   AS role, department                    AS department, 'active'  AS status, faculty_no   AS admission_no, phone_no AS phone, NULL       AS last FROM faculty",
    admin:     "SELECT admin_id AS id, admin_name AS name, email, 'admin' AS role, ''                  AS department, 'active'  AS status, ''           AS admission_no, phone    AS phone, created_at AS last FROM admin",
  };

  const roleList = role === "all" ? ["student", "organizer", "faculty", "admin"] : [role];
  const parts    = roleList.filter(r => queries[r]).map(r => queries[r]);
  let sql        = `(${parts.join(") UNION ALL (")})`;
  if (search)    sql = `SELECT * FROM (${sql}) AS u WHERE name LIKE ? OR email LIKE ?`;

  const params = search ? [`%${search}%`, `%${search}%`] : [];
  db.query(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ message: err.message });
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

  db.query(`DELETE FROM ${table} WHERE id=?`, [req.params.id], (err) => {
    if (err) return res.status(500).json({ message: err.message });
    pushLog("user", "👤", "red", `${role} (ID ${req.params.id}) removed`, req.admin.name || "Admin");
    res.json({ message: "User removed." });
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

// ─────────────────────────────────────────────────────────────
//  ACTIVITY LOGS
// ─────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────
//  ANALYTICS
// ─────────────────────────────────────────────────────────────
router.get("/analytics", adminOnly, (req, res) => {
  const q = (sql, p = []) =>
    new Promise((resolve, reject) =>
      db.query(sql, p, (err, rows) => (err ? reject(err) : resolve(rows)))
    );

  Promise.all([
    // GROUP BY and SELECT use identical expressions to satisfy only_full_group_by
    q(`SELECT DATE_FORMAT(date,'%Y-%m') AS ym, DATE_FORMAT(date,'%b') AS month, COUNT(*) AS count
       FROM events
       WHERE date >= DATE_SUB(NOW(), INTERVAL 8 MONTH)
       GROUP BY DATE_FORMAT(date,'%Y-%m'), DATE_FORMAT(date,'%b')
       ORDER BY ym`),

    q(`SELECT COALESCE(type,'Other') AS category, COUNT(*) AS count
       FROM events GROUP BY COALESCE(type,'Other')`),

    q(`SELECT
         SUM(CASE WHEN category = 'Technical' THEN 1 ELSE 0 END) AS academic,
         SUM(CASE WHEN category != 'Technical' OR category IS NULL THEN 1 ELSE 0 END) AS non_academic
       FROM events`),

    q(`SELECT DATE_FORMAT(e.date,'%Y-%m') AS ym, DATE_FORMAT(e.date,'%b') AS month, COUNT(r.id) AS participants
       FROM events e
       LEFT JOIN registrations r ON r.event_id = e.id
       WHERE e.date >= DATE_SUB(NOW(), INTERVAL 8 MONTH)
       GROUP BY DATE_FORMAT(e.date,'%Y-%m'), DATE_FORMAT(e.date,'%b')
       ORDER BY ym`),

    q(`SELECT
         SUM(CASE WHEN MONTH(date) BETWEEN 8 AND 12 THEN 1 ELSE 0 END) AS sem1,
         SUM(CASE WHEN MONTH(date) BETWEEN 1  AND 7  THEN 1 ELSE 0 END) AS sem2
       FROM events`),

    q(`SELECT DATE_FORMAT(created_at,'%Y-%m') AS ym, DATE_FORMAT(created_at,'%b') AS month, COUNT(*) AS count
       FROM students
       WHERE created_at >= DATE_SUB(NOW(), INTERVAL 8 MONTH)
       GROUP BY DATE_FORMAT(created_at,'%Y-%m'), DATE_FORMAT(created_at,'%b')
       ORDER BY ym`),

    q(`SELECT DATE_FORMAT(created_at,'%Y-%m') AS ym, DATE_FORMAT(created_at,'%b') AS month, COUNT(*) AS count
       FROM certificates
       WHERE created_at >= DATE_SUB(NOW(), INTERVAL 8 MONTH)
       GROUP BY DATE_FORMAT(created_at,'%Y-%m'), DATE_FORMAT(created_at,'%b')
       ORDER BY ym`),

    q(`SELECT 'Students'   AS role, COUNT(*) AS count FROM students
       UNION ALL SELECT 'Faculty',    COUNT(*) FROM faculty
       UNION ALL SELECT 'Organizers', COUNT(*) FROM organizers
       UNION ALL SELECT 'Admins',     COUNT(*) FROM admin`),
  ])
    .then(([eventsPerMonth, categories, [acadSplit], participationPerMonth, [semesters], userGrowth, certs, roles]) => {
      res.json({ eventsPerMonth, categories, acadSplit, participationPerMonth, semesters, userGrowth, certs, roles });
    })
    .catch((err) => {
      console.error("Analytics error:", err.message);
      res.status(500).json({ message: err.message });
    });
});

module.exports = router;