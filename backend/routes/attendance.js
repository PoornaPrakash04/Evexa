const express = require("express");
const { generateCertificate } = require("../utils/certificate");
const auth = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/generate", auth(["ORGANIZER"]), (req, res) => {
  const { name, event } = req.body;
  const path = generateCertificate(name, event);
  res.json({ message: "Certificate generated", path });
});

module.exports = router;
