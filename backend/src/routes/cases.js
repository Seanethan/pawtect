
const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// ======================================================
// HELPER: VALIDATE ID
// ======================================================

function isValidId(id) {
  return Number.isInteger(Number(id)) && Number(id) > 0;
}

// ======================================================
// GET ALL CASES
// GET /api/cases
// ======================================================

router.get("/", requireAuth, async (req, res, next) => {
  try {
    let sql = `
      SELECT
        rc.case_id,
        rc.report_id,
        rc.rescuer_id,
        rc.status AS case_status,
        rc.cancellation_reason,
        rc.created_at AS case_created_at,
        rc.updated_at AS case_updated_at,

        r.user_id,
        r.animal_type,
        r.photo_url,
        r.animal_description,
        r.\`condition\`,
        r.urgency,
        r.location_address,
        r.latitude,
        r.longitude,
        r.status AS report_status,
        r.created_at AS report_created_at,

        CONCAT(u.first_name, ' ', u.last_name) AS reporter_name

      FROM rescue_cases rc
      JOIN stray_reports r ON r.report_id = rc.report_id
      JOIN users u ON u.user_id = r.user_id
    `;

    const params = [];

    if (req.user.role === "rescuer") {
      sql += " WHERE rc.rescuer_id = ?";
      params.push(req.user.userId);
    } else if (req.user.role === "reporter") {
      sql += " WHERE r.user_id = ?";
      params.push(req.user.userId);
    } else if (req.user.role !== "admin") {
      return res.status(403).json({
        message: "You are not allowed to view rescue cases."
      });
    }

    sql += " ORDER BY rc.created_at DESC";

    const [rows] = await db.execute(sql, params);

    res.json({ cases: rows });

  } catch (error) {
    next(error);
  }
});


// ======================================================
// GET ONE REPORT WITH RESCUE CASE, PHOTOS, AND HISTORY
// GET /api/cases/by-report/:reportId
// ======================================================

router.get("/by-report/:reportId", requireAuth, async (req, res, next) => {
  try {
    const reportId = Number(req.params.reportId);

    if (!isValidId(reportId)) {
      return res.status(400).json({
        message: "Invalid report ID."
      });
    }

    const [rows] = await db.execute(
      `SELECT
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
          r.location_hint,
          r.status,
          r.rejection_reason,
          r.created_at,
          r.updated_at,

          CONCAT(u.first_name, ' ', u.last_name) AS reporter_name,

          rc.case_id,
          rc.rescuer_id,
          rc.status AS case_status,
          rc.cancellation_reason,
          rc.created_at AS case_created_at,
          rc.updated_at AS case_updated_at

       FROM stray_reports r
       JOIN users u ON u.user_id = r.user_id

       LEFT JOIN rescue_cases rc
         ON rc.case_id = (
           SELECT MAX(rc2.case_id)
           FROM rescue_cases rc2
           WHERE rc2.report_id = r.report_id
         )

       WHERE r.report_id = ?
       LIMIT 1`,
      [reportId]
    );

    if (!rows.length) {
      return res.status(404).json({
        message: "Report not found."
      });
    }

    const row = rows[0];

    // Check access permissions.
    if (!["reporter", "rescuer", "admin"].includes(req.user.role)) {
      return res.status(403).json({
        message: "You are not allowed to view this report."
      });
    }

    // Reporters can only view their own reports.
    if (
      req.user.role === "reporter" &&
      Number(row.user_id) !== Number(req.user.userId)
    ) {
      return res.status(403).json({
        message: "You are not allowed to view this report."
      });
    }

    // Rescuers can only view reports assigned to them.
    if (
      req.user.role === "rescuer" &&
      Number(row.rescuer_id) !== Number(req.user.userId)
    ) {
      return res.status(403).json({
        message: "You are not assigned to this rescue case."
      });
    }

    const report = {
      report_id: row.report_id,
      user_id: row.user_id,
      animal_type: row.animal_type,
      photo_url: row.photo_url,
      animal_description: row.animal_description,
      condition: row.condition,
      urgency: row.urgency,
      location_address: row.location_address,
      latitude: row.latitude,
      longitude: row.longitude,
      location_hint: row.location_hint,
      status: row.status,
      rejection_reason: row.rejection_reason,
      reporter_name: row.reporter_name,
      created_at: row.created_at,
      updated_at: row.updated_at
    };

    const rescueCase = row.case_id
      ? {
          case_id: row.case_id,
          report_id: row.report_id,
          rescuer_id: row.rescuer_id,
          case_status: row.case_status,
          cancellation_reason: row.cancellation_reason,
          created_at: row.case_created_at,
          updated_at: row.case_updated_at
        }
      : null;

    // Get uploaded photos.
    const [photos] = await db.execute(
      `SELECT photo_id, photo_url, uploaded_at
       FROM report_photos
       WHERE report_id = ?
       ORDER BY photo_id ASC`,
      [reportId]
    );

    // Get report status history.
    const [history] = await db.execute(
      `SELECT
          log_id,
          report_id,
          case_id,
          actor_user_id,
          previous_status,
          new_status,
          remarks,
          created_at
       FROM case_status_log
       WHERE report_id = ?
       ORDER BY created_at ASC, log_id ASC`,
      [reportId]
    );

    res.json({
      report,
      rescueCase,
      photos,
      history
    });

  } catch (error) {
    next(error);
  }
});


// ======================================================
// CLAIM A REPORT
// POST /api/cases/:reportId/claim
// ======================================================

router.post("/:reportId/claim", requireAuth, async (req, res, next) => {
  let connection;

  try {
    const reportId = Number(req.params.reportId);
    const rescuerId = Number(req.user.userId);

    if (!isValidId(reportId)) {
      return res.status(400).json({
        message: "Invalid report ID."
      });
    }

    if (req.user.role !== "rescuer") {
      return res.status(403).json({
        message: "Only verified rescuers can claim reports."
      });
    }

    connection = await db.getConnection();
    await connection.beginTransaction();

    // Lock the report to prevent simultaneous claims.
    const [reports] = await connection.execute(
      `SELECT report_id, user_id, status
       FROM stray_reports
       WHERE report_id = ?
       FOR UPDATE`,
      [reportId]
    );

    if (!reports.length) {
      await connection.rollback();

      return res.status(404).json({
        message: "Report not found."
      });
    }

    const report = reports[0];

    if (report.status !== "reported") {
      await connection.rollback();

      return res.status(400).json({
        message: "This report is no longer available for claiming."
      });
    }

    // Check for an existing active rescue case.
    const [existingCases] = await connection.execute(
      `SELECT case_id
       FROM rescue_cases
       WHERE report_id = ?
       AND status IN ('accepted', 'en_route', 'arrived')
       LIMIT 1`,
      [reportId]
    );

    if (existingCases.length) {
      await connection.rollback();

      return res.status(409).json({
        message: "This report has already been claimed."
      });
    }

    // Create the rescue case.
    const [result] = await connection.execute(
      `INSERT INTO rescue_cases (
        report_id,
        rescuer_id,
        status
      ) VALUES (?, ?, 'accepted')`,
      [reportId, rescuerId]
    );

    const caseId = result.insertId;

    // Update the main report status.
    await connection.execute(
      `UPDATE stray_reports
       SET status = 'accepted'
       WHERE report_id = ?`,
      [reportId]
    );

    // Record status history.
    await connection.execute(
      `INSERT INTO case_status_log (
        report_id,
        case_id,
        actor_user_id,
        previous_status,
        new_status,
        remarks
      ) VALUES (?, ?, ?, 'reported', 'accepted', 'Report claimed by rescuer')`,
      [reportId, caseId, rescuerId]
    );

    await connection.commit();

    res.status(201).json({
      message: "Report successfully claimed.",
      caseId,
      reportId,
      status: "accepted"
    });

  } catch (error) {
    if (connection) {
      await connection.rollback();
    }

    next(error);

  } finally {
    if (connection) {
      connection.release();
    }
  }
});


// ======================================================
// UPDATE RESCUE CASE STATUS
// PATCH /api/cases/:caseId/status
// ======================================================

router.patch("/:caseId/status", requireAuth, async (req, res, next) => {
  let connection;

  try {
    const caseId = Number(req.params.caseId);
    const userId = Number(req.user.userId);
    const newStatus = String(req.body.status || "").toLowerCase();

    const allowedStatuses = [
      "en_route",
      "arrived",
      "completed",
      "not_found",
      "cancelled"
    ];

    if (!isValidId(caseId)) {
      return res.status(400).json({
        message: "Invalid case ID."
      });
    }

    if (!allowedStatuses.includes(newStatus)) {
      return res.status(400).json({
        message: "Invalid rescue case status."
      });
    }

    if (!["rescuer", "admin"].includes(req.user.role)) {
      return res.status(403).json({
        message: "You are not allowed to update rescue cases."
      });
    }

    const cancellationReason =
      req.body.cancellationReason ||
      req.body.cancellation_reason ||
      null;

    if (newStatus === "cancelled" && !cancellationReason) {
      return res.status(400).json({
        message: "Please provide a cancellation reason."
      });
    }

    connection = await db.getConnection();
    await connection.beginTransaction();

    // Lock the case before updating it.
    const [cases] = await connection.execute(
      `SELECT
         case_id,
         report_id,
         rescuer_id,
         status
       FROM rescue_cases
       WHERE case_id = ?
       FOR UPDATE`,
      [caseId]
    );

    if (!cases.length) {
      await connection.rollback();

      return res.status(404).json({
        message: "Rescue case not found."
      });
    }

    const rescueCase = cases[0];

    // Rescuers can only update their own assigned cases.
    if (
      req.user.role === "rescuer" &&
      Number(rescueCase.rescuer_id) !== userId
    ) {
      await connection.rollback();

      return res.status(403).json({
        message: "You are not assigned to this rescue case."
      });
    }

    const currentStatus = rescueCase.status;

    const allowedTransitions = {
      accepted: ["en_route", "cancelled"],
      en_route: ["arrived", "cancelled", "not_found"],
      arrived: ["completed", "not_found", "cancelled"]
    };

    if (
      !allowedTransitions[currentStatus] ||
      !allowedTransitions[currentStatus].includes(newStatus)
    ) {
      await connection.rollback();

      return res.status(400).json({
        message: `Cannot change case status from ${currentStatus} to ${newStatus}.`
      });
    }

    // Map rescue case status to main report status.
    const reportStatusMap = {
      en_route: "en_route",
      arrived: "arrived",
      completed: "rescued",
      not_found: "reported",
      cancelled: "reported"
    };

    const newReportStatus = reportStatusMap[newStatus];

    // Update rescue case.
    await connection.execute(
      `UPDATE rescue_cases
       SET status = ?,
           cancellation_reason = ?
       WHERE case_id = ?`,
      [
        newStatus,
        newStatus === "cancelled" ? cancellationReason : null,
        caseId
      ]
    );

    // Get current report status.
    const [reports] = await connection.execute(
      `SELECT status
       FROM stray_reports
       WHERE report_id = ?
       FOR UPDATE`,
      [rescueCase.report_id]
    );

    if (!reports.length) {
      throw new Error("The report associated with this case no longer exists.");
    }

    const previousReportStatus = reports[0].status;

    // Update report status.
    await connection.execute(
      `UPDATE stray_reports
       SET status = ?
       WHERE report_id = ?`,
      [newReportStatus, rescueCase.report_id]
    );

    // Record status history.
    await connection.execute(
      `INSERT INTO case_status_log (
        report_id,
        case_id,
        actor_user_id,
        previous_status,
        new_status,
        remarks
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        rescueCase.report_id,
        caseId,
        userId,
        previousReportStatus,
        newReportStatus,
        newStatus === "cancelled"
          ? `Rescue case cancelled: ${cancellationReason}`
          : `Rescue case status changed to ${newStatus}`
      ]
    );

    await connection.commit();

    res.json({
      message: "Rescue case status updated successfully.",
      caseId,
      reportId: rescueCase.report_id,
      caseStatus: newStatus,
      reportStatus: newReportStatus
    });

  } catch (error) {
    if (connection) {
      await connection.rollback();
    }

    next(error);

  } finally {
    if (connection) {
      connection.release();
    }
  }
});


// ======================================================
// EXPORT ROUTER
// ======================================================

module.exports = router;
