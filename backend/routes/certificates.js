const express = require("express");
const { generateCertificate } = require("../utils/certificate");
const auth = require("../middleware/authMiddleware");

const router = express.Router();

// Generate certificate (Organizer only)
router.post("/generate", auth(["ORGANIZER"]), (req, res) => {
  const { name, event } = req.body;

  if (!name || !event) {
    return res.status(400).json({ message: "Name and event are required" });
  }

  try {
    const filePath = generateCertificate(name, event);
    res.json({
      message: "Certificate generated successfully",
      file: filePath
    });
  } catch (error) {
    res.status(500).json({ message: "Certificate generation failed" });
  }
});

module.exports = router;
