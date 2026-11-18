
const path = require("path");

require("dotenv").config({
    path: path.join(__dirname, "..", ".env")
});

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const db = require("./db");
const profileRoutes = require("./routes/profile");
const notificationRoutes = require("./routes/notifications");
const authRoutes = require("./routes/auth");
const reportRoutes = require("./routes/reports");
const caseRoutes = require("./routes/cases");
const adminRoutes = require("./routes/admin");

const app = express();

// Security
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// CORS
const allowedOrigins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000"
];

app.use(cors({
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error("Not allowed by CORS: " + origin));
        }
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
}));

// Body parsers
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// Serve uploaded report photos
app.use(
    "/uploads",
    express.static(path.join(__dirname, "..", "uploads"))
);

// Rate limiter
app.use("/api", rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300
}));

// Health check
app.get("/api/health", async (req, res, next) => {
    try {
        await db.query("SELECT 1");
        res.json({
            status: "ok",
            database: "connected"
        });
    } catch (error) {
        next(error);
    }
});

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/cases", caseRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/profile", profileRoutes);
// Frontend static files
const publicDir = path.join(__dirname, "..", "..");
app.use(express.static(publicDir));

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        message: "Route not found."
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error(err);

    if (err.code === "ER_DUP_ENTRY") {
        return res.status(409).json({
            message: "A record with that value already exists."
        });
    }

    res.status(500).json({
        message: "Server error. Check the backend terminal for details."
    });
});

// Start server
const port = Number(process.env.PORT || 5000);

app.listen(port, () => {
    console.log(`PawTect backend running at http://localhost:${port}`);
});
