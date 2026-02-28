const express   = require("express");
const router    = express.Router();
const db        = require("../db");
const authorize = require("../middleware/authMiddleware");

const VALID_STATUSES = ["available", "booked", "maintenance"];

router.put("/venue/:id", authorize(["admin", "faculty"]), async (req, res) => {
    const { status } = req.body;

    if (!status || !VALID_STATUSES.includes(status)) {
        return res.status(400).json({
            message: `Status must be one of: ${VALID_STATUSES.join(", ")}`
        });
    }

    try {
        const [result] = await db.query(
            "UPDATE venues SET status = ?, updated_by = ? WHERE id = ?",
            [status, req.user.id, req.params.id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Venue not found." });
        }

        res.json({ message: "Venue status updated successfully" });

    } catch (err) {
  console.error("Update venue error:", err); // ← check your terminal for this
  res.status(500).json({ message: "Server error. Please try again." });
}
});

module.exports = router;