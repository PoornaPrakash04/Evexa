router.put("/venue/:id", verifyToken, async (req, res) => {
    const { status } = req.body;

    await db.query(
        "UPDATE venues SET status = ?, updated_by = ? WHERE id = ?",
        [status, req.user.id, req.params.id]
    );

    res.json({ message: "Venue status updated successfully" });
});
