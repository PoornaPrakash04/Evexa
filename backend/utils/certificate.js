const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

exports.generateCertificate = (name, event) => {
  // Ensure certificates folder exists
  const certDir = path.join(__dirname, "..", "certificates");
  if (!fs.existsSync(certDir)) {
    fs.mkdirSync(certDir);
  }

  const fileName = `${name}_${event}.pdf`.replace(/\s+/g, "_");
  const filePath = path.join(certDir, fileName);

  const doc = new PDFDocument({ size: "A4" });
  doc.pipe(fs.createWriteStream(filePath));

  // Certificate content
  doc.fontSize(24).text("Certificate of Participation", {
    align: "center"
  });

  doc.moveDown(2);

  doc.fontSize(16).text(
    `This is to certify that`,
    { align: "center" }
  );

  doc.moveDown();

  doc.fontSize(20).text(
    name,
    { align: "center", underline: true }
  );

  doc.moveDown();

  doc.fontSize(16).text(
    `has successfully participated in the event`,
    { align: "center" }
  );

  doc.moveDown();

  doc.fontSize(18).text(
    event,
    { align: "center", underline: true }
  );

  doc.moveDown(3);

  doc.fontSize(12).text(
    "Authorized by EVEXA Event Management System",
    { align: "center" }
  );

  doc.end();

  return filePath;
};
