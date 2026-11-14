const express = require("express");
const db = require("../db");
const { requireAuth, allowRoles } = require("../middleware/auth");

const router = express.Router();

router.get("/", requireAuth, async (req, res, next) => {
  try {
    let sql = `SELECT rc.case_id, rc.report_id, rc.rescuer_id, rc.status AS case_status,
                      rc.created_at, r.animal_type, r.\`condition\`, r.urgency,
                      r.location_address, r.photo_url, r.status AS report_status
               FROM rescue_cases rc JOIN stray_reports r ON r.report_id = rc.report_id`;
    const params = [];
    if (req.user.role === "rescuer") { sql += " WHERE rc.rescuer_id = ?"; params.push(req.user.userId); }
    else if (req.user.role === "reporter") { sql += " WHERE r.user_id = ?"; params.push(req.user.userId); }
    sql += " ORDER BY rc.created_at DESC";
    const [rows] = await db.execute(sql, params);
    res.json({ cases: rows });
  } catch (error) { next(error); }
});

router.post("/:reportId/claim", requireAuth, allowRoles("rescuer"), async (req, res, next) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [reports] = await connection.execute(
      "SELECT report_id, status FROM stray_reports WHERE report_id = ? FOR UPDATE",
      [req.params.reportId]
    );
    if (!reports.length) { await connection.rollback(); return res.status(404).json({ message: "Report not found." }); }
    if (reports[0].status !== "reported") { await connection.rollback(); return res.status(409).json({ message: "This report is no longer available to claim." }); }

    const [existing] = await connection.execute(
      "SELECT case_id FROM rescue_cases WHERE report_id = ? AND status NOT IN ('cancelled','completed')",
      [req.params.reportId]
    );
    if (existing.length) { await connection.rollback(); return res.status(409).json({ message: "This report already has an active rescue case." }); }

    const [result] = await connection.execute(
      "INSERT INTO rescue_cases (report_id, rescuer_id, status) VALUES (?, ?, 'accepted')",
      [req.params.reportId, req.user.userId]
    );
    await connection.execute("UPDATE stray_reports SET status = 'accepted' WHERE report_id = ?", [req.params.reportId]);
    await connection.execute(
      `INSERT INTO case_status_log (report_id, case_id, actor_user_id, previous_status, new_status, remarks)
       VALUES (?, ?, ?, 'reported', 'accepted', 'Rescuer claimed the report')`,
      [req.params.reportId, result.insertId, req.user.userId]
    );
    await connection.commit();
    res.status(201).json({ message: "Rescue case claimed.", caseId: result.insertId });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally { connection.release(); }
});

router.patch("/:caseId/status", requireAuth, allowRoles("rescuer", "admin"), async (req, res, next) => {
  const allowed = ["en_route", "arrived", "completed", "not_found", "cancelled"];
  const { status, remarks } = req.body;
  if (!allowed.includes(status)) return res.status(400).json({ message: "Invalid case status." });

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      `SELECT rc.case_id, rc.report_id, rc.rescuer_id, rc.status, r.status AS report_status
       FROM rescue_cases rc JOIN stray_reports r ON r.report_id = rc.report_id
       WHERE rc.case_id = ? FOR UPDATE`, [req.params.caseId]
    );
    if (!rows.length) { await connection.rollback(); return res.status(404).json({ message: "Case not found." }); }
    const item = rows[0];
    if (req.user.role !== "admin" && item.rescuer_id !== req.user.userId) {
      await connection.rollback(); return res.status(403).json({ message: "This case is assigned to another rescuer." });
    }

    await connection.execute("UPDATE rescue_cases SET status = ? WHERE case_id = ?", [status, item.case_id]);
    const reportStatus = status === "completed" ? "rescued" : status === "not_found" ? "reported" : status;
    await connection.execute("UPDATE stray_reports SET status = ? WHERE report_id = ?", [reportStatus, item.report_id]);
    await connection.execute(
      `INSERT INTO case_status_log (report_id, case_id, actor_user_id, previous_status, new_status, remarks)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [item.report_id, item.case_id, req.user.userId, item.status, status, remarks || null]
    );
    await connection.commit();
    res.json({ message: "Case status updated.", status });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally { connection.release(); }
});

module.exports = router;
