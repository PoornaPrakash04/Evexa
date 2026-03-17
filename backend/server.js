//server.js
require("dotenv").config();
const express = require("express");
const cors    = require("cors");
const db      = require("./db");

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
const registrationsRoute = require("./routes/registrations");
const facultyRoutes      = require("./routes/faculty");

const app = express();

app.use(cors({
  origin: ["http://localhost:5500", "http://127.0.0.1:5500",
           "http://localhost:5501", "http://127.0.0.1:5501"],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));
app.use(express.json());
app.use(express.static("frontend"));
app.use("/uploads", express.static("uploads"));

app.use("/api/auth",          authRoutes);       // ← check-admission & student-register live here
app.use("/api/events",        eventRoutes);
app.use("/api/attendance",    attendanceRoutes);
app.use("/api/certificates",  certificateRoutes);
app.use("/api/venues",        venueRoutes);
app.use("/api/announcements", announcementRoutes);
app.use("/api/execom",        execomRoutes);
app.use("/api/student",       studentRoutes);
app.use("/api/clubs",         clubRoutes);
app.use("/api/tickets",       ticketRoutes);
app.use("/api/registrations", registrationsRoute);
app.use("/api/faculty",       facultyRoutes);
app.get("/", (req, res) => res.send("EVEXA Backend is running"));

app.listen(5000, () => {
  console.log("🚀 Server running on http://localhost:5000");
});