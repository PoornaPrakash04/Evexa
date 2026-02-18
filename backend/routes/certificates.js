const express = require("express");
const router = express.Router();
const multer = require("multer");
const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");
const { PDFDocument } = require("pdf-lib");
const archiver = require("archiver");
const { v4: uuidv4 } = require("uuid");


// Multer storage config
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (file.fieldname === "template") {
      cb(null, "uploads/templates");
    } else {
      cb(null, "uploads/excels");
    }
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({ storage: storage });

router.post(
  "/upload",
  upload.fields([
    { name: "template", maxCount: 1 },
    { name: "excel", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const templatePath = req.files.template[0].path;
      const excelPath = req.files.excel[0].path;

      // Read Excel
      const workbook = XLSX.readFile(excelPath);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const participants = XLSX.utils.sheet_to_json(sheet);

      const outputFolder = `generated_certificates/${Date.now()}`;
      fs.mkdirSync(outputFolder, { recursive: true });

      for (const person of participants) {
        const templateBytes = fs.readFileSync(templatePath);
        const pdfDoc = await PDFDocument.load(templateBytes);
        const pages = pdfDoc.getPages();
        const firstPage = pages[0];

        const { width, height } = firstPage.getSize();

        // Adjust X and Y based on your certificate design
        firstPage.drawText(person.Name || "Participant", {
          x: width / 2 - 150,
          y: height / 2,
          size: 28,
        });

        const certificateId = uuidv4();

        firstPage.drawText(`ID: ${certificateId}`, {
          x: 50,
          y: 50,
          size: 12,
        });

        const pdfBytes = await pdfDoc.save();

        fs.writeFileSync(
          `${outputFolder}/${person.Name}.pdf`,
          pdfBytes
        );
      }

      // Create ZIP
      const zipPath = `${outputFolder}.zip`;
      const output = fs.createWriteStream(zipPath);
      const archive = archiver("zip");

      archive.pipe(output);
      archive.directory(outputFolder, false);
      await archive.finalize();

      res.download(zipPath);

    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Certificate generation failed" });
    }
  }
);

module.exports = router;
