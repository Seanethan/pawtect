const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();


// List reports visible to the current account.
router.get("/", requireAuth, async (req, res, next) => {
  try {
    let sql = `SELECT r.report_id, r.user_id, r.animal_type, r.photo_url, r.animal_description,
                      r.\`condition\`, r.urgency, r.location_address, r.latitude, r.longitude,
                      r.status, r.created_at, CONCAT(u.first_name, ' ', u.last_name) AS reporter_name
               FROM stray_reports r JOIN users u ON u.user_id = r.user_id`;
    const params = [];
    if (req.user.role === "reporter") {
      sql += " WHERE r.user_id = ?";
      params.push(req.user.userId);
    }
    sql += " ORDER BY r.created_at DESC";
    const [rows] = await db.execute(sql, params);
    res.json({ reports: rows });
  } catch (error) { next(error); }
});

router.post("/", requireAuth, async (req, res, next) => {
  try {
    const { animalType, photoUrl, animalDescription, condition, urgency, locationAddress, latitude, longitude, locationHint } = req.body;
    if (!animalType || !condition || !locationAddress) {
      return res.status(400).json({ message: "Animal type, condition, and location are required." });
    }

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const [result] = await connection.execute(
        `INSERT INTO stray_reports
         (user_id, animal_type, photo_url, animal_description, \`condition\`, urgency,
          location_address, latitude, longitude, location_hint, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'reported')`,
        [req.user.userId, animalType, photoUrl || null, animalDescription || null,
         condition, urgency || "medium", locationAddress, latitude ?? null,
         longitude ?? null, locationHint || null]
      );
      await connection.execute(
        `INSERT INTO case_status_log (report_id, actor_user_id, previous_status, new_status, remarks)
         VALUES (?, ?, NULL, 'reported', 'Report submitted')`,
        [result.insertId, req.user.userId]
      );
      await connection.commit();
      res.status(201).json({ message: "Report submitted successfully.", reportId: result.insertId });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally { connection.release(); }
  } catch (error) { next(error); }
});

router.get("/mine", requireAuth, async (req, res, next) => {
  try {
    const [rows] = await db.execute(
      `SELECT report_id, animal_type, photo_url, animal_description, \`condition\`, urgency,
              location_address, latitude, longitude, status, created_at, updated_at
       FROM stray_reports WHERE user_id = ? ORDER BY created_at DESC`,
      [req.user.userId]
    );
    res.json({ reports: rows });
  } catch (error) { next(error); }
});

router.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const [rows] = await db.execute(
      `SELECT r.*, CONCAT(u.first_name, ' ', u.last_name) AS reporter_name
       FROM stray_reports r JOIN users u ON u.user_id = r.user_id
       WHERE r.report_id = ? AND (r.user_id = ? OR ? IN ('admin','rescuer'))`,
      [req.params.id, req.user.userId, req.user.role]
    );
    if (!rows.length) return res.status(404).json({ message: "Report not found." });
    const [history] = await db.execute(
      `SELECT previous_status, new_status, remarks, created_at
       FROM case_status_log WHERE report_id = ? ORDER BY created_at ASC`,
      [req.params.id]
    );
    res.json({ report: rows[0], history });
  } catch (error) { next(error); }
});

module.exports = router;
