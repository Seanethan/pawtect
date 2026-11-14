require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");
const db = require("./db");

const authRoutes = require("./routes/auth");
const reportRoutes = require("./routes/reports");
const caseRoutes = require("./routes/cases");

const app = express();
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({
  origin: process.env.CLIENT_ORIGIN ? process.env.CLIENT_ORIGIN.split(",").map(x => x.trim()) : true,
  credentials: true
}));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", rateLimit({ windowMs: 15 * 60 * 1000, limit: 300 }));
app.get("/api/health", async (req, res, next) => {
  try {
    await db.query("SELECT 1");
    res.json({ status: "ok", database: "connected" });
  } catch (error) { next(error); }
});

app.use("/api/auth", authRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/cases", caseRoutes);

// Optional: serve the PawTect HTML/CSS/JS from a sibling public folder.
const publicDir = path.join(__dirname, "..", "..");
app.use(express.static(publicDir));

app.use((req, res) => res.status(404).json({ message: "Route not found." }));
app.use((err, req, res, next) => {
  console.error(err);
  if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ message: "A record with that value already exists." });
  res.status(500).json({ message: "Server error. Check the backend terminal for details." });
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`PawTect backend running at http://localhost:${port}`));
