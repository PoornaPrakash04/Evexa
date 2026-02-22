require("dotenv").config();
const express = require("express");
const cors = require("cors");

const authRoutes         = require("./routes/auth");
const eventRoutes        = require("./routes/events");
const attendanceRoutes   = require("./routes/attendance");
const certificateRoutes  = require("./routes/certificates");
const venueRoutes        = require("./routes/venue");
const clubRoutes         = require("./routes/clubs");
const studentRoutes      = require("./routes/student");
const announcementRoutes = require("./routes/announcements");
const execomRoutes       = require("./routes/execom");
const ticketRoutes       = require("./routes/tickets");

const app = express();

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static("uploads"));

// ✅ ALL routes before app.listen
app.use("/api/auth",          authRoutes);
app.use("/api/user",          authRoutes);
app.use("/api/events",        eventRoutes);
app.use("/api/attendance",    attendanceRoutes);
app.use("/api/certificates",  certificateRoutes);
app.use("/api/venues",        venueRoutes);
app.use("/api/announcements", announcementRoutes);
app.use("/api/execom",        execomRoutes);
app.use("/api/student",       studentRoutes);
app.use("/api/clubs",         clubRoutes);
app.use("/api/tickets",       ticketRoutes);

app.get("/", (req, res) => res.send("EVEXA Backend is running"));

// ✅ app.listen LAST
app.listen(5000, () => {
  console.log("Server running on http://localhost:5000");
  console.log("JWT_SECRET:", process.env.JWT_SECRET);
});