const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// GET notifications
router.get("/", requireAuth, async (req, res, next) => {
  try {
    const [rows] = await db.execute(
      `SELECT notification_id, report_id, case_id, title, message,
              notification_type, is_read, created_at
       FROM notifications
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 10`,
      [req.user.userId]
    );

    const [countRows] = await db.execute(
      `SELECT COUNT(*) AS unreadCount
       FROM notifications
       WHERE user_id = ? AND is_read = 0`,
      [req.user.userId]
    );

    res.json({
      notifications: rows,
      unreadCount: Number(countRows[0].unreadCount)
    });

  } catch (error) {
    next(error);
  }
});

// MARK NOTIFICATION AS READ
router.patch("/:id/read", requireAuth, async (req, res, next) => {
  try {
    const [result] = await db.execute(
      `UPDATE notifications
       SET is_read = 1
       WHERE notification_id = ? AND user_id = ?`,
      [req.params.id, req.user.userId]
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        message: "Notification not found."
      });
    }

    res.json({
      message: "Notification marked as read."
    });

  } catch (error) {
    next(error);
  }
});

module.exports = router;

