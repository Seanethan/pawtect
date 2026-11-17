
const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const { requireAuth, allowRoles } = require("../middleware/auth");

const router = express.Router();

router.use(requireAuth, allowRoles("admin"));

const activeCaseStatuses = ["accepted", "en_route", "arrived"];
const resolvedReportStatuses = [
  "rescued",
  "brought_to_vet",
  "brought_to_shelter"
];

// ==========================================
// ADMIN OVERVIEW
// ==========================================
router.get("/overview", async (req, res, next) => {
  try {
    const [[users]] = await db.execute(`
      SELECT
        COUNT(*) AS totalUsers,
        COALESCE(SUM(account_status = 'active'), 0) AS activeUsers,
        COALESCE(SUM(account_status = 'suspended'), 0) AS suspendedUsers,
        COALESCE(SUM(created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')), 0) AS newUsersThisMonth
      FROM users
      WHERE role = 'reporter'
    `);

    const [[staff]] = await db.execute(`
      SELECT
        COUNT(DISTINCT u.user_id) AS totalStaff,

        COALESCE(SUM(
          u.account_status = 'active'
          AND rp.application_status = 'approved'
          AND NOT EXISTS (
            SELECT 1
            FROM rescue_cases rc
            WHERE rc.rescuer_id = u.user_id
              AND rc.status IN ('accepted', 'en_route', 'arrived')
          )
        ), 0) AS availableStaff,

        COALESCE(SUM(
          u.account_status = 'active'
          AND rp.application_status = 'approved'
          AND EXISTS (
            SELECT 1
            FROM rescue_cases rc
            WHERE rc.rescuer_id = u.user_id
              AND rc.status IN ('accepted', 'en_route', 'arrived')
          )
        ), 0) AS onDutyStaff

      FROM users u
      LEFT JOIN rescuer_profiles rp ON rp.user_id = u.user_id
      WHERE u.role = 'rescuer'
    `);

    const [[reports]] = await db.execute(`
      SELECT
        COUNT(*) AS totalReports,

        COALESCE(SUM(status = 'reported'), 0) AS pendingReports,

        COALESCE(SUM(
          status IN ('accepted', 'en_route', 'arrived')
        ), 0) AS inProgressReports,

        COALESCE(SUM(
          status IN ('rescued', 'brought_to_vet', 'brought_to_shelter')
        ), 0) AS resolvedReports,

        COALESCE(SUM(
          urgency = 'urgent'
          AND status NOT IN (
            'rescued',
            'brought_to_vet',
            'brought_to_shelter',
            'rejected'
          )
        ), 0) AS urgentReports,

        COALESCE(SUM(escalated = 1), 0) AS flagReports,

        COALESCE(SUM(
          status IN ('rescued', 'brought_to_vet', 'brought_to_shelter')
        ), 0) AS rescuedAnimals

      FROM stray_reports
    `);

    const [recentReports] = await db.execute(`
      SELECT
        r.report_id,
        r.location_address,
        r.urgency,
        r.status,
        r.created_at,
        r.animal_type,
        CONCAT(u.first_name, ' ', u.last_name) AS reporter_name
      FROM stray_reports r
      JOIN users u ON u.user_id = r.user_id
      ORDER BY r.created_at DESC
      LIMIT 5
    `);

    const totalStaff = Number(staff.totalStaff || 0);
    const availableStaff = Number(staff.availableStaff || 0);
    const onDutyStaff = Number(staff.onDutyStaff || 0);

    res.json({
      stats: {
        ...users,
        ...reports,
        ...staff,

        totalUsers: Number(users.totalUsers || 0),
        activeUsers: Number(users.activeUsers || 0),
        suspendedUsers: Number(users.suspendedUsers || 0),
        newUsersThisMonth: Number(users.newUsersThisMonth || 0),

        totalStaff,
        availableStaff,
        onDutyStaff,
        offDutyStaff: Math.max(
          0,
          totalStaff - availableStaff - onDutyStaff
        ),

        totalReports: Number(reports.totalReports || 0),
        pendingReports: Number(reports.pendingReports || 0),
        inProgressReports: Number(reports.inProgressReports || 0),
        resolvedReports: Number(reports.resolvedReports || 0),
        urgentReports: Number(reports.urgentReports || 0),
        flagReports: Number(reports.flagReports || 0),
        rescuedAnimals: Number(reports.rescuedAnimals || 0)
      },
      recentReports
    });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// REPORTER / USER MANAGEMENT
// ==========================================
router.get("/users", async (req, res, next) => {
  try {
    const [users] = await db.execute(`
      SELECT
        user_id,
        first_name,
        last_name,
        username,
        email,
        contact_number,
        account_status,
        created_at
      FROM users
      WHERE role = 'reporter'
      ORDER BY created_at DESC
    `);

    res.json({ users });
  } catch (error) {
    next(error);
  }
});

router.patch("/users/:id/status", async (req, res, next) => {
  try {
    const { status } = req.body;

    if (!["active", "pending", "suspended", "disabled"].includes(status)) {
      return res.status(400).json({
        message: "Invalid account status."
      });
    }

    const [result] = await db.execute(
      `UPDATE users
       SET account_status = ?
       WHERE user_id = ? AND role = 'reporter'`,
      [status, req.params.id]
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        message: "User not found."
      });
    }

    res.json({
      message: "User account status updated.",
      status
    });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// RESCUER / STAFF MANAGEMENT
// ==========================================
router.get("/staff", async (req, res, next) => {
  try {
    const [staff] = await db.execute(`
      SELECT
        u.user_id,
        u.first_name,
        u.last_name,
        u.username,
        u.email,
        u.contact_number,
        u.account_status,
        u.created_at,

        rp.rescuer_profile_id,
        rp.experience,
        rp.address,

        COALESCE(rp.application_status, 'pending') AS application_status,

        CASE
          WHEN u.account_status = 'suspended' THEN 'Suspended'
          WHEN u.account_status = 'disabled' THEN 'Disabled'
          WHEN u.account_status = 'pending'
            OR COALESCE(rp.application_status, 'pending') <> 'approved'
            THEN 'Pending'

          WHEN EXISTS (
            SELECT 1
            FROM rescue_cases rc
            WHERE rc.rescuer_id = u.user_id
              AND rc.status IN ('accepted', 'en_route', 'arrived')
          ) THEN 'On Duty'

          ELSE 'Available'
        END AS duty_status

      FROM users u
      LEFT JOIN rescuer_profiles rp ON rp.user_id = u.user_id
      WHERE u.role = 'rescuer'
      ORDER BY u.created_at DESC
    `);

    res.json({ staff });
  } catch (error) {
    next(error);
  }
});

// Create a rescuer account
router.post("/staff", async (req, res, next) => {
  const {
    firstName,
    lastName,
    email,
    contactNumber,
    password,
    experience,
    address
  } = req.body;

  if (!firstName || !lastName || !email || !password) {
    return res.status(400).json({
      message: "First name, last name, email, and password are required."
    });
  }

  if (String(password).length < 8) {
    return res.status(400).json({
      message: "Password must be at least 8 characters."
    });
  }

  let connection;

  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    const emailAddress = String(email).trim().toLowerCase();

    const [existing] = await connection.execute(
      "SELECT user_id FROM users WHERE email = ? LIMIT 1",
      [emailAddress]
    );

    if (existing.length) {
      await connection.rollback();

      return res.status(409).json({
        message: "An account with this email already exists."
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const [userResult] = await connection.execute(`
      INSERT INTO users (
        first_name,
        last_name,
        email,
        password_hash,
        contact_number,
        role,
        account_status,
        email_verified
      )
      VALUES (?, ?, ?, ?, ?, 'rescuer', 'active', 1)
    `, [
      String(firstName).trim(),
      String(lastName).trim(),
      emailAddress,
      passwordHash,
      contactNumber ? String(contactNumber).trim() : null
    ]);

    await connection.execute(`
      INSERT INTO rescuer_profiles (
        user_id,
        application_status,
        experience,
        address,
        reviewed_by,
        reviewed_at
      )
      VALUES (?, 'approved', ?, ?, ?, NOW())
    `, [
      userResult.insertId,
      experience ? String(experience).trim() : null,
      address ? String(address).trim() : null,
      req.user.userId
    ]);

    await connection.commit();

    res.status(201).json({
      message: "Rescuer account created.",
      userId: userResult.insertId
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

// Update rescuer account status
router.patch("/staff/:id/status", async (req, res, next) => {
  try {
    const { status } = req.body;

    if (!["active", "pending", "suspended", "disabled"].includes(status)) {
      return res.status(400).json({
        message: "Invalid account status."
      });
    }

    const [result] = await db.execute(
      `UPDATE users
       SET account_status = ?
       WHERE user_id = ? AND role = 'rescuer'`,
      [status, req.params.id]
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        message: "Staff member not found."
      });
    }

    res.json({
      message: "Staff account status updated.",
      status
    });
  } catch (error) {
    next(error);
  }
});

// Approve, reject, or reset rescuer application
router.patch("/staff/:id/application", async (req, res, next) => {
  try {
    const { status } = req.body;

    if (!["pending", "approved", "rejected"].includes(status)) {
      return res.status(400).json({
        message: "Invalid rescuer application status."
      });
    }

    const [staff] = await db.execute(
      `SELECT user_id
       FROM users
       WHERE user_id = ? AND role = 'rescuer'
       LIMIT 1`,
      [req.params.id]
    );

    if (!staff.length) {
      return res.status(404).json({
        message: "Staff member not found."
      });
    }

    await db.execute(`
      INSERT INTO rescuer_profiles (
        user_id,
        application_status,
        reviewed_by,
        reviewed_at
      )
      VALUES (?, ?, ?, ?)

      ON DUPLICATE KEY UPDATE
        application_status = VALUES(application_status),
        reviewed_by = VALUES(reviewed_by),
        reviewed_at = VALUES(reviewed_at)
    `, [
      req.params.id,
      status,
      status === "pending" ? null : req.user.userId,
      status === "pending" ? null : new Date()
    ]);

    res.json({
      message: "Rescuer application updated.",
      status
    });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// STRAY REPORT MANAGEMENT
// ==========================================
router.get("/reports", async (req, res, next) => {
  try {
    const [reports] = await db.execute(`
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
        r.location_hint,
        r.status,
        r.escalated,
        r.rejection_reason,
        r.created_at,
        r.updated_at,

        CONCAT(u.first_name, ' ', u.last_name) AS reporter_name

      FROM stray_reports r
      JOIN users u ON u.user_id = r.user_id
      ORDER BY r.created_at DESC
    `);

    res.json({ reports });
  } catch (error) {
    next(error);
  }
});

// Update report status
router.patch("/reports/:id/status", async (req, res, next) => {
  const allowed = [
    "reported",
    "accepted",
    "en_route",
    "arrived",
    "rescued",
    "brought_to_vet",
    "brought_to_shelter",
    "rejected"
  ];

  const { status, remarks } = req.body;

  if (!allowed.includes(status)) {
    return res.status(400).json({
      message: "Invalid report status."
    });
  }

  let connection;

  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    const [rows] = await connection.execute(
      `SELECT report_id, status
       FROM stray_reports
       WHERE report_id = ?
       FOR UPDATE`,
      [req.params.id]
    );

    if (!rows.length) {
      await connection.rollback();

      return res.status(404).json({
        message: "Report not found."
      });
    }

    const previousStatus = rows[0].status;

    await connection.execute(
      `UPDATE stray_reports
       SET status = ?, rejection_reason = ?
       WHERE report_id = ?`,
      [
        status,
        status === "rejected" ? (remarks || null) : null,
        req.params.id
      ]
    );

    await connection.execute(`
      INSERT INTO case_status_log (
        report_id,
        actor_user_id,
        previous_status,
        new_status,
        remarks
      )
      VALUES (?, ?, ?, ?, ?)
    `, [
      req.params.id,
      req.user.userId,
      previousStatus,
      status,
      remarks || "Status updated by admin"
    ]);

    await connection.commit();

    res.json({
      message: "Report status updated.",
      status
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

module.exports = router;
