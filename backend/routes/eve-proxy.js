const express   = require("express");
const router    = express.Router();
const authorize = require("../middleware/authMiddleware");

router.post("/chat", authorize(["STUDENT"]), async (req, res) => {
  const { contents } = req.body;

  if (!contents || !Array.isArray(contents)) {
    return res.status(400).json({ message: "contents array is required." });
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-1.0-pro:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents,
          generationConfig: { temperature: 0.7, maxOutputTokens: 400 },
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini API error:", data);
      return res.status(response.status).json({ message: data?.error?.message || "Gemini error" });
    }

    res.json(data);
  } catch (err) {
    console.error("EVE proxy error:", err);
    res.status(500).json({ message: "AI service unavailable." });
  }
});

module.exports = router;