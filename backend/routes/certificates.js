// ============================================================
// routes/certificates.js — EVEXA Certificate System
// ============================================================

require("dotenv").config();
const express    = require("express");
const router     = express.Router();
const multer     = require("multer");
const XLSX       = require("xlsx");
const fs         = require("fs");
const path       = require("path");
const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");
const archiver   = require("archiver");
const { v4: uuidv4 } = require("uuid");
const jwt        = require("jsonwebtoken");

const db = require("../db"); 

// ─────────────────────────────────────────────────────────────
// Auth middleware
// ─────────────────────────────────────────────────────────────
function authorize(roles = []) {
  return (req, res, next) => {
    const auth = req.headers.authorization;
    if (!auth) return res.status(401).json({ message: "No token" });
    try {
      const decoded = jwt.verify(auth.split(" ")[1], process.env.JWT_SECRET);
      if (roles.length && !roles.includes(decoded.role))
        return res.status(403).json({ message: "Forbidden" });
      req.user = decoded;
      next();
    } catch {
      res.status(401).json({ message: "Invalid token" });
    }
  };
}

// ─────────────────────────────────────────────────────────────
// Ensure upload directories exist on startup
// ─────────────────────────────────────────────────────────────
["uploads/templates", "uploads/excels", "generated_certificates"].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ─────────────────────────────────────────────────────────────
// Multer config
// ─────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === "template") cb(null, "uploads/templates");
    else cb(null, "uploads/excels");
  },
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.fieldname === "template" && !file.mimetype.includes("pdf"))
      return cb(new Error("Template must be a PDF"));
    cb(null, true);
  },
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
});

// ─────────────────────────────────────────────────────────────
// Helper: parse hex color string to pdf-lib rgb()
// ─────────────────────────────────────────────────────────────
function hexToRgb(hex) {
  const clean = (hex || "").replace("#", "");
  if (clean.length !== 6) return rgb(0.1, 0.1, 0.1);
  return rgb(
    parseInt(clean.slice(0, 2), 16) / 255,
    parseInt(clean.slice(2, 4), 16) / 255,
    parseInt(clean.slice(4, 6), 16) / 255
  );
}

// ─────────────────────────────────────────────────────────────
// Helper: draw name centered at (xPct, yPct) of the page
// ─────────────────────────────────────────────────────────────
async function drawName(page, name, opts = {}) {
  const { width, height } = page.getSize();
  const font     = opts.font;
  const fontSize = opts.fontSize || 36;
  const color    = opts.color    || rgb(0.1, 0.1, 0.1);
  const xPct     = opts.xPct !== undefined ? opts.xPct : 0.5;
  const yPct     = opts.yPct !== undefined ? opts.yPct : 0.52;

  const textWidth = font.widthOfTextAtSize(name, fontSize);
  const x = width  * xPct - textWidth / 2;
  const y = height * yPct;

  page.drawText(name, { x, y, size: fontSize, font, color });
}

// ─────────────────────────────────────────────────────────────
// [ORGANIZER] GET /api/certificates/events
// Returns all events owned by the requesting organizer,
// including registration count and how many certs issued.
// ─────────────────────────────────────────────────────────────
router.get("/events", authorize(["ORGANIZER"]), async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT e.id, e.title, e.date, e.venue,
              COUNT(DISTINCT r.id) AS registered_count,
              COUNT(DISTINCT c.id) AS certs_issued
       FROM events e
       LEFT JOIN registrations r ON r.event_id = e.id
       LEFT JOIN certificates  c ON c.event_id = e.id
       WHERE e.organizer_id = ?
       GROUP BY e.id
       ORDER BY e.date DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error("GET /certificates/events error:", err);
    res.status(500).json({ message: "Failed to load events" });
  }
});

// ─────────────────────────────────────────────────────────────
// [ORGANIZER] GET /api/certificates/participants/:eventId
// Returns all registered participants for a given event.
// ─────────────────────────────────────────────────────────────
router.get("/participants/:eventId", authorize(["ORGANIZER"]), async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT r.id, s.id AS student_id, s.name, s.email, s.roll_no, r.status
       FROM registrations r
       JOIN students s ON s.id = r.student_id
       WHERE r.event_id = ?
       ORDER BY s.name ASC`,
      [req.params.eventId]
    );
    res.json(rows);
  } catch (err) {
    console.error("GET /certificates/participants error:", err);
    res.status(500).json({ message: "Failed to load participants" });
  }
});

// ─────────────────────────────────────────────────────────────
// [ORGANIZER] POST /api/certificates/preview
// Renders a single preview PDF with a sample name.
//
// Body (multipart/form-data):
//   template     — PDF file (required)
//   preview_name — string (default: "John Doe")
//   font_size    — number (default: 36)
//   x_pct        — 0-100 (default: 50)
//   y_pct        — 0-100 (default: 52)
//   color_hex    — hex color string (default: #1a1a2e)
//
// Response: PDF binary, inline
// ─────────────────────────────────────────────────────────────
router.post(
  "/preview",
  authorize(["ORGANIZER"]),
  upload.fields([{ name: "template", maxCount: 1 }]),
  async (req, res) => {
    const templatePath = req.files?.template?.[0]?.path;
    if (!templatePath)
      return res.status(400).json({ message: "PDF template is required" });

    const fontSize    = parseFloat(req.body.font_size) || 36;
    const xPct        = (parseFloat(req.body.x_pct)    || 50) / 100;
    const yPct        = (parseFloat(req.body.y_pct)    || 52) / 100;
    const color       = hexToRgb(req.body.color_hex);
    const previewName = req.body.preview_name           || "John Doe";

    try {
      const templateBytes = fs.readFileSync(templatePath);
      const pdfDoc        = await PDFDocument.load(templateBytes);
      const font          = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const idFont        = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const firstPage     = pdfDoc.getPages()[0];

      await drawName(firstPage, previewName, { font, fontSize, color, xPct, yPct });

      firstPage.drawText("Certificate ID: PREVIEW", {
        x: 30, y: 28,
        size: 9,
        font: idFont,
        color: rgb(0.5, 0.5, 0.5),
      });

      const pdfBytes = await pdfDoc.save();
      res.setHeader("Content-Type",        "application/pdf");
      res.setHeader("Content-Disposition", "inline; filename=preview.pdf");
      res.send(Buffer.from(pdfBytes));
    } catch (err) {
      console.error("Preview error:", err);
      res.status(500).json({ message: "Preview generation failed" });
    }
  }
);

// ─────────────────────────────────────────────────────────────
// [ORGANIZER] POST /api/certificates/generate
// Generates one PDF per participant, saves them, zips & sends.
//
// Body (multipart/form-data):
//   template     — PDF file (required)
//   event_id     — number (required when source is DB)
//   excel        — xlsx/csv file (optional, overrides DB source)
//   font_size    — number (default: 36)
//   x_pct        — 0-100 (default: 50)
//   y_pct        — 0-100 (default: 52)
//   color_hex    — hex color string (default: #1a1a2e)
//
// Response: ZIP download containing one PDF per participant
//
// Side effects:
//   - Inserts/updates rows in `certificates` table
//   - Updates events.certs_issued count
// ─────────────────────────────────────────────────────────────
router.post(
  "/generate",
  authorize(["ORGANIZER"]),
  upload.fields([
    { name: "template", maxCount: 1 },
    { name: "excel",    maxCount: 1 },
  ]),
  async (req, res) => {
    const templatePath = req.files?.template?.[0]?.path;
    const excelPath    = req.files?.excel?.[0]?.path;

    if (!templatePath)
      return res.status(400).json({ message: "PDF template is required" });

    const fontSize = parseFloat(req.body.font_size) || 36;
    const xPct     = (parseFloat(req.body.x_pct)    || 50) / 100;
    const yPct     = (parseFloat(req.body.y_pct)    || 52) / 100;
    const color    = hexToRgb(req.body.color_hex);
    const eventId  = req.body.event_id ? Number(req.body.event_id) : null;

    // ── Collect participants ───────────────────────────────
    let participants = [];
    const source     = excelPath ? "excel" : "db";

    if (source === "excel") {
      const wb    = XLSX.readFile(excelPath);
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows  = XLSX.utils.sheet_to_json(sheet);

      participants = rows
        .map(r => ({
          student_id: r.student_id || r.StudentId || null,
          name:       (r.Name || r.name || r.NAME || String(Object.values(r)[0])).trim(),
          email:      r.Email || r.email || null,
        }))
        .filter(p => p.name && p.name !== "undefined");

    } else if (eventId) {
      const [rows] = await db.execute(
        `SELECT s.id AS student_id, s.name, s.email
         FROM registrations r
         JOIN students s ON s.id = r.student_id
         WHERE r.event_id = ?
         ORDER BY s.name ASC`,
        [eventId]
      );
      participants = rows;
    }

    if (!participants.length)
      return res.status(400).json({ message: "No participants found" });

    // ── Create output folder ───────────────────────────────
    // Named by eventId so student downloads can find the files later
    const folderName   = eventId ? String(eventId) : uuidv4();
    const outputFolder = path.join("generated_certificates", folderName);
    fs.mkdirSync(outputFolder, { recursive: true });

    const templateBytes = fs.readFileSync(templatePath);

    // ── Generate one PDF per participant ───────────────────
    for (const person of participants) {
      const pdfDoc    = await PDFDocument.load(templateBytes);
      const font      = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const idFont    = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const firstPage = pdfDoc.getPages()[0];
      const certId    = uuidv4().slice(0, 8).toUpperCase();

      await drawName(firstPage, person.name, { font, fontSize, color, xPct, yPct });

      firstPage.drawText(`Certificate ID: ${certId}`, {
        x: 30, y: 28,
        size: 9,
        font: idFont,
        color: rgb(0.5, 0.5, 0.5),
      });

      const pdfBytes = await pdfDoc.save();
      const safeName = person.name.replace(/[^a-zA-Z0-9 _-]/g, "").trim() || "Participant";
      const filePath = path.join(outputFolder, `${safeName}.pdf`);

      fs.writeFileSync(filePath, pdfBytes);

      // ── Save record to DB so student can download later ──
      if (eventId && person.student_id) {
        try {
          await db.execute(
            `INSERT INTO certificates (event_id, student_id, student_name, file_path, cert_id)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               file_path = VALUES(file_path),
               cert_id   = VALUES(cert_id),
               issued_at = NOW()`,
            [eventId, person.student_id, person.name, filePath, certId]
          );
        } catch (dbErr) {
          console.warn(`DB cert record failed for ${person.name}:`, dbErr.message);
        }
      }
    }

    // ── Update event cert count ────────────────────────────
    if (eventId) {
      try {
        await db.execute(
          `UPDATE events SET certs_issued = ? WHERE id = ?`,
          [participants.length, eventId]
        );
      } catch (e) {
        console.warn("Could not update certs_issued:", e.message);
      }
    }

    // ── Zip all PDFs and stream download ───────────────────
    const zipPath = `${outputFolder}.zip`;
    const output  = fs.createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    archive.on("error", err => {
      console.error("Archive error:", err);
      if (!res.headersSent) res.status(500).json({ message: "Zip creation failed" });
    });

    archive.pipe(output);
    archive.directory(outputFolder, false);
    await archive.finalize();

    output.on("close", () => {
      const zipName = eventId ? `certificates-event-${eventId}.zip` : "certificates.zip";
      res.download(zipPath, zipName, () => {
        // Delete zip after download; keep individual PDFs for student access
        setTimeout(() => {
          fs.rmSync(zipPath, { force: true });
          if (excelPath) fs.rmSync(excelPath, { force: true });
        }, 15_000);
      });
    });
  }
);

// ─────────────────────────────────────────────────────────────
// [STUDENT] GET /api/certificates/status/:eventId
// Checks whether this student's certificate has been issued.
//
// Response:
//   { available: false }
//   { available: true, issued_at: "...", event_title: "..." }
// ─────────────────────────────────────────────────────────────
router.get("/status/:eventId", authorize(["STUDENT"]), async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT c.id, c.file_path, c.issued_at, e.title AS event_title
       FROM certificates c
       JOIN events e ON e.id = c.event_id
       WHERE c.event_id = ? AND c.student_id = ?`,
      [req.params.eventId, req.user.id]
    );

    if (!rows.length)
      return res.json({ available: false });

    const filePath   = rows[0].file_path;
    const fileExists = !!(filePath && fs.existsSync(filePath));

    res.json({
      available:   fileExists,
      issued_at:   rows[0].issued_at,
      event_title: rows[0].event_title,
    });
  } catch (err) {
    console.error("Certificate status error:", err);
    res.status(500).json({ message: "Failed to check certificate status" });
  }
});

// ─────────────────────────────────────────────────────────────
// [STUDENT] GET /api/certificates/download/:eventId
// Streams the student's individual certificate PDF.
// ─────────────────────────────────────────────────────────────
router.get("/download/:eventId", authorize(["STUDENT"]), async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT c.file_path, s.name AS student_name, e.title AS event_title
       FROM certificates c
       JOIN students s ON s.id = c.student_id
       JOIN events   e ON e.id = c.event_id
       WHERE c.event_id = ? AND c.student_id = ?`,
      [req.params.eventId, req.user.id]
    );

    if (!rows.length)
      return res.status(404).json({ message: "Certificate not found. It may not have been issued yet." });

    const filePath = rows[0].file_path;

    if (!filePath || !fs.existsSync(filePath))
      return res.status(404).json({ message: "Certificate file missing on server. Please contact the organizer." });

    const safeName     = (rows[0].student_name || "Student").replace(/[^a-zA-Z0-9 _-]/g, "").trim();
    const eventSlug    = (rows[0].event_title  || "Event").replace(/[^a-zA-Z0-9 _-]/g, "-").slice(0, 40);
    const downloadName = `Certificate-${safeName}-${eventSlug}.pdf`;

    res.setHeader("Content-Type",        "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${downloadName}"`);
    fs.createReadStream(filePath).pipe(res);

  } catch (err) {
    console.error("Certificate download error:", err);
    res.status(500).json({ message: "Server error while downloading certificate" });
  }
});

module.exports = router;