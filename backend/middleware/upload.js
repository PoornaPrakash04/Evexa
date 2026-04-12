const multer = require("multer");
const path = require("path");
const fs = require("fs");

const ALLOWED_IMAGES = /jpeg|jpg|png|gif|webp/;
const ALLOWED_DOCS   = /pdf/;

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // PDFs (reports) go to uploads/reports/, images go to uploads/logos/
    const isPdf = file.mimetype === "application/pdf";
    const dir   = isPdf ? "uploads/reports/" : "uploads/logos/";
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const uniqueName = Date.now() + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    const isPdf   = ALLOWED_DOCS.test(ext)   && file.mimetype === "application/pdf";
    const isImage = ALLOWED_IMAGES.test(ext) && ALLOWED_IMAGES.test(file.mimetype);
    if (isPdf || isImage) return cb(null, true);
    cb(new Error("Only image files (jpeg, jpg, png, gif, webp) or PDF files are allowed"));
  },
  limits: { fileSize: 10 * 1024 * 1024 } // 10 MB to accommodate PDFs
});

module.exports = upload;