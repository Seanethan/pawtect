
const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const router = express.Router();

// Store uploaded photos in backend/uploads/reports
const uploadDirectory = path.join(__dirname, "..", "..", "uploads", "reports");

fs.mkdirSync(uploadDirectory, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, callback) => {
    callback(null, uploadDirectory);
  },
  filename: (req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`;
    callback(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 5
  },
  fileFilter: (req, file, callback) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

    if (!allowedTypes.includes(file.mimetype)) {
      return callback(new Error("Only JPG, PNG, and WEBP images are allowed."));
    }

    callback(null, true);
  }
});

// Convert uploaded files into public URLs.
function getPhotoUrl(file) {
  return `/uploads/reports/${file.filename}`;
}

// Delete uploaded files if the database operation fails.
function deleteUploadedFiles(files = []) {
  for (const file of files) {
    fs.unlink(file.path, () => {});
  }
}

// Handle Multer errors with a readable response.
function handleReportUpload(req, res, next) {
  upload.array("photos", 5)(req, res, (error) => {
    if (error) {
      return res.status(400).json({
        message: error.message || "Unable to upload photos."
      });
    }

    next();
  });
}


// ======================================================
// GET ALL REPORTS
// ======================================================

router.get("/", requireAuth, async (req, res, next) => {
  try {
    let sql = `
      SELECT
        r.report_id,
        r.user_id,
        r.animal_type,
        r.photo_url,
        r.animal_description,
        r.\`condition\`,
        r.urgency,
        r.location_address,
        r.latitude,
        r.longitude,
        r.status,
        r.created_at,
        CONCAT(u.first_name, ' ', u.last_name) AS reporter_name
      FROM stray_reports r
      JOIN users u ON u.user_id = r.user_id
    `;

    const params = [];

    if (req.user.role === "reporter") {
      sql += " WHERE r.user_id = ?";
      params.push(req.user.userId);
    }

    sql += " ORDER BY r.created_at DESC";

    const [rows] = await db.execute(sql, params);

    res.json({ reports: rows });
  } catch (error) {
    next(error);
  }
});


// ======================================================
// SUBMIT A REPORT
// ======================================================

router.post("/", requireAuth, handleReportUpload, async (req, res, next) => {
  const files = req.files || [];
  let connection;

  try {
    // Accept both snake_case and camelCase field names.
    const animalType = req.body.animal_type || req.body.animalType;
    const animalDescription =
      req.body.animal_description || req.body.animalDescription || null;
    const animalCondition = req.body.condition;
    const urgency = req.body.urgency || "medium";
    const locationAddress =
      req.body.location_address || req.body.locationAddress;
    const locationHint = req.body.location_hint || req.body.locationHint || null;

    const latitude =
      req.body.latitude !== undefined && req.body.latitude !== ""
        ? Number(req.body.latitude)
        : null;

    const longitude =
      req.body.longitude !== undefined && req.body.longitude !== ""
        ? Number(req.body.longitude)
        : null;

    // Validate required fields.
    if (!["dog", "cat", "other"].includes(animalType)) {
      deleteUploadedFiles(files);
      return res.status(400).json({ message: "Please select a valid animal type." });
    }

    if (!["injured", "sick", "healthy", "unknown"].includes(animalCondition)) {
      deleteUploadedFiles(files);
      return res.status(400).json({ message: "Please select a valid animal condition." });
    }

    if (!["urgent", "medium", "low"].includes(urgency)) {
      deleteUploadedFiles(files);
      return res.status(400).json({ message: "Please select a valid urgency level." });
    }

    if (!locationAddress || !locationAddress.trim()) {
      deleteUploadedFiles(files);
      return res.status(400).json({ message: "Location is required." });
    }

    if (
      (latitude !== null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) ||
      (longitude !== null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180))
    ) {
      deleteUploadedFiles(files);
      return res.status(400).json({ message: "Invalid map coordinates." });
    }

    const photoUrls = files.map(getPhotoUrl);
    const mainPhotoUrl = photoUrls[0] || null;

    connection = await db.getConnection();
    await connection.beginTransaction();

    // Insert the main report.
    const [result] = await connection.execute(
      `INSERT INTO stray_reports (
        user_id,
        animal_type,
        photo_url,
        animal_description,
        \`condition\`,
        urgency,
        location_address,
        latitude,
        longitude,
        location_hint,
        status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'reported')`,
      [
        req.user.userId,
        animalType,
        mainPhotoUrl,
        animalDescription,
        animalCondition,
        urgency,
        locationAddress.trim(),
        latitude,
        longitude,
        locationHint
      ]
    );

    const reportId = result.insertId;

    // Save all uploaded photos in report_photos.
    for (const photoUrl of photoUrls) {
      await connection.execute(
        `INSERT INTO report_photos (report_id, photo_url)
         VALUES (?, ?)`,
        [reportId, photoUrl]
      );
    }

    // Record the initial report status.
    await connection.execute(
      `INSERT INTO case_status_log (
        report_id,
        actor_user_id,
        previous_status,
        new_status,
        remarks
      ) VALUES (?, ?, NULL, 'reported', 'Report submitted')`,
      [reportId, req.user.userId]
    );

    await connection.commit();

    res.status(201).json({
      message: "Report submitted successfully.",
      reportId,
      report: {
        report_id: reportId,
        animal_type: animalType,
        photo_url: mainPhotoUrl,
        status: "reported"
      }
    });

  } catch (error) {
    if (connection) {
      await connection.rollback();
    }

    deleteUploadedFiles(files);
    next(error);

  } finally {
    if (connection) {
      connection.release();
    }
  }
});


// ======================================================
// GET MY REPORTS
// ======================================================

router.get("/mine", requireAuth, async (req, res, next) => {
  try {
    const [rows] = await db.execute(
      `SELECT
        report_id,
        animal_type,
        photo_url,
        animal_description,
        \`condition\`,
        urgency,
        location_address,
        latitude,
        longitude,
        status,
        created_at,
        updated_at
       FROM stray_reports
       WHERE user_id = ?
       ORDER BY created_at DESC`,
      [req.user.userId]
    );

    res.json({ reports: rows });
  } catch (error) {
    next(error);
  }
});


// ======================================================
// GET ONE REPORT
// ======================================================

router.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const [rows] = await db.execute(
      `SELECT
        r.*,
        CONCAT(u.first_name, ' ', u.last_name) AS reporter_name
       FROM stray_reports r
       JOIN users u ON u.user_id = r.user_id
       WHERE r.report_id = ?
       AND (r.user_id = ? OR ? IN ('admin', 'rescuer'))`,
      [req.params.id, req.user.userId, req.user.role]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Report not found." });
    }

    const [history] = await db.execute(
      `SELECT previous_status, new_status, remarks, created_at
       FROM case_status_log
       WHERE report_id = ?
       ORDER BY created_at ASC`,
      [req.params.id]
    );

    const [photos] = await db.execute(
      `SELECT photo_id, photo_url, uploaded_at
       FROM report_photos
       WHERE report_id = ?
       ORDER BY uploaded_at ASC`,
      [req.params.id]
    );

    res.json({
      report: rows[0],
      photos,
      history
    });

  } catch (error) {
    next(error);
  }
});

module.exports = router;
