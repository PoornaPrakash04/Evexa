const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth");
const eventRoutes = require("./routes/events");
const attendanceRoutes = require("./routes/attendance");
const certificateRoutes = require("./routes/certificates");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/certificates", certificateRoutes);

app.get("/", (req, res) => {
  res.send("EVEXA Backend is running");
});

app.listen(5000, () => {
  console.log("Server running on http://localhost:5000");
});
const venueRoutes = require("./routes/venue");
app.use("/api/venue", venueRoutes);
