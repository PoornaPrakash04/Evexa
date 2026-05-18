console.log("JWT_SECRET:", process.env.JWT_SECRET);
console.log("JWT_REFRESH_SECRET:", process.env.JWT_REFRESH_SECRET);
const express   = require("express");
const bcrypt    = require("bcrypt");
const jwt       = require("jsonwebtoken");
const db        = require("../db");
const authorize = require("../middleware/authMiddleware");
const multer    = require("multer");
const path      = require("path");
const fs        = require("fs");

const router = express.Router();



const AVATAR_DIR    = path.join(__dirname, "..", "uploads", "avatars");
const ACCESS_EXPIRY  = "15m";
const REFRESH_EXPIRY = "7d";


const ALLOWED_AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];



if (!fs.existsSync(AVATAR_DIR)) fs.mkdirSync(AVATAR_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, AVATAR_DIR),
  
  
  
  
  filename: (req, file, cb) => cb(null, `student_${req.user.id}${path.extname(file.originalname)}`),
});



const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, 
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_AVATAR_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only JPEG, PNG, WebP, and GIF images are allowed."));
    }
  },
});



/** Write an activity log row (fire-and-forget). */
function pushLog(type, icon, color, action, user) {
  const ts = new Date().toISOString().slice(0, 19).replace("T", " ");
  db.query(
    "INSERT INTO activity_logs (type, icon, color, action, user, created_at) VALUES (?,?,?,?,?,?)",
    [type, icon, color, action, user, ts],
    () => {}
  );
}

/**
 * Issue an access token (short-lived) and a refresh token (long-lived).
 * @param {object} payload - JWT payload (id, role, …)
 * @returns {{ accessToken, refreshToken }}
 */
function issueTokens(payload) {
  const accessToken  = jwt.sign(payload, process.env.JWT_SECRET,         { expiresIn: ACCESS_EXPIRY });
  const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET, { expiresIn: REFRESH_EXPIRY });
  return { accessToken, refreshToken };
}

/**
 * Role config map – drives the unified login handler.
 * Each entry describes how to look up a user for a given role.
 */
const ROLE_CONFIG = {
  STUDENT: {
    table:       "students",
    idField:     "admission_no",
    logIcon:     "🎓",
    logColor:    "blue",
    extraClaims: () => ({}),
  },
  ORGANIZER: {
    table:       "organizers",
    idField:     "admission_no",
    logIcon:     "🏷️",
    logColor:    "teal",
    extraClaims: (user) => ({ club: user.club }),
  },
  FACULTY: {
    table:       "faculty",
    idField:     "faculty_no",
    logIcon:     "👨‍🏫",
    logColor:    "orange",
    extraClaims: (user) => ({ faculty_no: user.faculty_no, role_id: user.role_id }),
  },
};



/**
 * POST /api/auth/login
 * Body: { role: "STUDENT"|"ORGANIZER"|"FACULTY", identifier: "...", password: "..." }
 */
router.post("/login", async (req, res) => {
  const { role, identifier, password } = req.body;

  if (!role || !identifier || !password)
    return res.status(400).json({ message: "role, identifier, and password are required." });

  const config = ROLE_CONFIG[role.toUpperCase()];
  if (!config)
    return res.status(400).json({ message: `Unknown role '${role}'.` });

  db.query(
    
    
    
    `SELECT id, name, password, ${config.idField}${config.table === "organizers" ? ", club" : config.table === "faculty" ? ", faculty_no, role_id" : ""} FROM ${config.table} WHERE ${config.idField} = ? LIMIT 1`,
    [identifier],
    async (err, rows) => {
      if (err) return res.status(500).json({ message: "Server error." });

      
      
      
      
      const DUMMY_HASH = "$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012345";
      const storedHash = rows.length ? rows[0].password : DUMMY_HASH;
      const match      = await bcrypt.compare(password, storedHash);

      if (!rows.length || !match)
        return res.status(401).json({ message: "Invalid credentials." });

      const user    = rows[0];
      const payload = { id: user.id, role: role.toUpperCase(), ...config.extraClaims(user) };
      const { accessToken, refreshToken } = issueTokens(payload);

      pushLog("login", config.logIcon, config.logColor, `${role} login: ${user.name}`, user.name);

      res.json({ accessToken, refreshToken });
    }
  );
});



/**
 * POST /api/auth/refresh
 * Body: { refreshToken: "..." }
 *
 * Validates the refresh token and issues a fresh access + refresh token pair.
 * (Implement refresh token rotation / revocation via a DB table if needed.)
 */
router.post("/refresh", (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken)
    return res.status(400).json({ message: "refreshToken is required." });

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    
    const { iat, exp, ...payload } = decoded; 
    const tokens = issueTokens(payload);

    res.json(tokens);
  } catch {
    res.status(401).json({ message: "Invalid or expired refresh token." });
  }
});



const ME_QUERIES = {
  STUDENT:   "SELECT id, name, email, roll_no, admission_no, class, department, phone, avatar FROM students   WHERE id = ?",
  FACULTY:   "SELECT id, faculty_no, name, email, department, phone_no                          FROM faculty    WHERE id = ?",
  ORGANIZER: "SELECT id, name, email, club, phone, roll_no, admission_no, class                FROM organizers WHERE id = ?",
};

router.get("/me", authorize(), (req, res) => {
  const { id, role } = req.user;
  
  
  
  const sql = ME_QUERIES[role];
  if (!sql) return res.status(400).json({ message: `Unrecognised role '${role}'.` });

  db.query(sql, [id], (err, rows) => {
    if (err)          return res.status(500).json({ message: "Server error." });
    if (!rows.length) return res.status(404).json({ message: "User not found." });
    res.json({ ...rows[0], role });
  });
});



function checkExists(table, field, value, res) {
  db.query(
    `SELECT id FROM ${table} WHERE ${field} = ? LIMIT 1`,
    [value],
    (err, rows) => {
      if (err) return res.status(500).json({ exists: false, message: "Server error." });
      res.json({ exists: rows.length > 0 });
    }
  );
}

router.post("/check-admission", (req, res) => {
  const { admission_no } = req.body;
  if (!admission_no) return res.status(400).json({ exists: false, message: "admission_no is required." });
  checkExists("students", "admission_no", admission_no, res);
});

router.post("/check-organizer-admission", (req, res) => {
  const { admission_no } = req.body;
  if (!admission_no) return res.status(400).json({ exists: false, message: "admission_no is required." });
  checkExists("organizers", "admission_no", admission_no, res);
});

router.post("/check-faculty-id", (req, res) => {
  const { faculty_no } = req.body;
  if (!faculty_no) return res.status(400).json({ exists: false, message: "faculty_no is required." });
  checkExists("faculty", "faculty_no", faculty_no, res);
});



/** Shared bcrypt + INSERT wrapper used by all three register routes. */
async function registerUser({ table, dupField, dupValue, insertSql, insertParams, res }) {
  try {
    const existing = await new Promise((resolve, reject) =>
      db.query(
        `SELECT id FROM ${table} WHERE ${dupField} = ? LIMIT 1`,
        [dupValue],
        (err, rows) => (err ? reject(err) : resolve(rows))
      )
    );
    if (existing.length)
      return res.status(409).json({ message: `A ${table.slice(0, -1)} with this ID is already registered.` });

    
    
    
    
    insertParams.hashedPassword = await bcrypt.hash(insertParams.rawPassword, 10);

    
    const values = insertParams.ordered.map((v) =>
      v === "__PASSWORD__" ? insertParams.hashedPassword : v
    );

    db.query(insertSql, values, (err) => {
      if (err) {
        if (err.code === "ER_DUP_ENTRY")
          return res.status(409).json({ message: "Email or ID is already in use." });
        return res.status(500).json({ message: "Server error." });
      }
      res.status(201).json({ success: true, message: "Registered successfully." });
    });
  } catch {
    res.status(500).json({ message: "Server error." });
  }
}

router.post("/student-register", (req, res) => {
  const { name, email, password, roll_no, admission_no, class: cls, department, phone } = req.body;
  if (!name || !email || !password || !roll_no || !admission_no || !cls || !department)
    return res.status(400).json({ message: "All required fields must be filled." });

  
  
  if (password.length < 8)
    return res.status(400).json({ message: "Password must be at least 8 characters." });

  registerUser({
    table:    "students",
    dupField: "admission_no",
    dupValue: admission_no,
    insertSql:
      "INSERT INTO students (name, email, password, roll_no, admission_no, class, department, phone) VALUES (?,?,?,?,?,?,?,?)",
    insertParams: {
      rawPassword: password,
      ordered:     [name, email, "__PASSWORD__", roll_no, admission_no, cls, department, phone || null],
    },
    res,
  });
});

router.post("/organizer-register", (req, res) => {
  const { name, email, password, roll_no, admission_no, class: cls, club, phone } = req.body;
  if (!name || !email || !password || !admission_no || !roll_no || !cls || !club)
    return res.status(400).json({ message: "All required fields must be filled." });

  if (password.length < 8)
    return res.status(400).json({ message: "Password must be at least 8 characters." });

  registerUser({
    table:    "organizers",
    dupField: "admission_no",
    dupValue: admission_no,
    insertSql:
      "INSERT INTO organizers (name, email, password, roll_no, admission_no, class, club, phone) VALUES (?,?,?,?,?,?,?,?)",
    insertParams: {
      rawPassword: password,
      ordered:     [name, email, "__PASSWORD__", roll_no, admission_no, cls, club, phone || null],
    },
    res,
  });
});

router.post("/faculty-register", (req, res) => {
  const { name, email, password, faculty_no, department, phone_no } = req.body;
  if (!name || !email || !password || !faculty_no || !department)
    return res.status(400).json({ message: "All required fields must be filled." });

  if (password.length < 8)
    return res.status(400).json({ message: "Password must be at least 8 characters." });

  registerUser({
    table:    "faculty",
    dupField: "faculty_no",
    dupValue: faculty_no,
    insertSql:
      "INSERT INTO faculty (faculty_no, name, email, password, department, phone_no, role_id) VALUES (?,?,?,?,?,?,?)",
    insertParams: {
      rawPassword: password,
      ordered:     [faculty_no, name, email, "__PASSWORD__", department, phone_no || null, 1],
    },
    res,
  });
});






router.post("/avatar", authorize(), (req, res) => {
  upload.single("avatar")(req, res, (err) => {
    if (err) {
      const status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
      return res.status(status).json({ message: err.message });
    }
    if (!req.file) return res.status(400).json({ message: "No file uploaded." });

    const avatarUrl = `/uploads/avatars/${req.file.filename}`;
    db.query("UPDATE students SET avatar = ? WHERE id = ?", [avatarUrl, req.user.id], (dbErr) => {
      if (dbErr) return res.status(500).json({ message: "Server error." });
      res.json({ avatarUrl });
    });
  });
});




router.put("/profile", authorize(), (req, res) => {
  const { name, email, phone } = req.body;
  if (!name || !email)
    return res.status(400).json({ message: "name and email are required." });

  db.query(
    "UPDATE students SET name = ?, email = ?, phone = ? WHERE id = ?",
    [name, email, phone || null, req.user.id],
    (err) => {
      if (err) return res.status(500).json({ message: "Server error." });
      res.json({ message: "Profile updated." });
    }
  );
});





router.put("/change-password", authorize(), async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword)
    return res.status(400).json({ message: "currentPassword and newPassword are required." });

  if (newPassword.length < 8)
    return res.status(400).json({ message: "New password must be at least 8 characters." });

  db.query("SELECT password FROM students WHERE id = ?", [req.user.id], async (err, rows) => {
    if (err)          return res.status(500).json({ message: "Server error." });
    if (!rows.length) return res.status(404).json({ message: "User not found." });

    const match = await bcrypt.compare(currentPassword, rows[0].password);
    if (!match) return res.status(401).json({ message: "Current password is incorrect." });

    const hashed = await bcrypt.hash(newPassword, 10);
    db.query("UPDATE students SET password = ? WHERE id = ?", [hashed, req.user.id], (err2) => {
      if (err2) return res.status(500).json({ message: "Server error." });
      res.json({ message: "Password updated." });
    });
  });
});

module.exports = router;