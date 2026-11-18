const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// GET logged-in user's profile
router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const [rows] = await db.execute(
      `SELECT
        user_id,
        first_name,
        last_name,
        username,
        email,
        contact_number,
        birthday,
        location,
        profile_note,
        role,
        account_status,
        created_at
       FROM users
       WHERE user_id = ?
       LIMIT 1`,
      [req.user.userId]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "User profile not found." });
    }

    res.json({ user: rows[0] });
  } catch (error) {
    next(error);
  }
});


// UPDATE logged-in user's profile
router.patch("/me", requireAuth, async (req, res, next) => {
  try {
    const {
      firstName,
      lastName,
      email,
      contactNumber,
      location,
      profileNote
    } = req.body;

    const updates = [];
    const values = [];

    if (firstName !== undefined) {
      if (!String(firstName).trim()) {
        return res.status(400).json({ message: "First name is required." });
      }

      updates.push("first_name = ?");
      values.push(String(firstName).trim());
    }

    if (lastName !== undefined) {
      if (!String(lastName).trim()) {
        return res.status(400).json({ message: "Last name is required." });
      }

      updates.push("last_name = ?");
      values.push(String(lastName).trim());
    }

    if (email !== undefined) {
      const cleanEmail = String(email).trim().toLowerCase();

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        return res.status(400).json({ message: "Please enter a valid email." });
      }

      updates.push("email = ?");
      values.push(cleanEmail);
    }

    if (contactNumber !== undefined) {
      updates.push("contact_number = ?");
      values.push(String(contactNumber).trim() || null);
    }

    if (location !== undefined) {
      updates.push("location = ?");
      values.push(String(location).trim() || null);
    }

    if (profileNote !== undefined) {
      updates.push("profile_note = ?");
      values.push(String(profileNote).trim() || null);
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: "No profile information was provided." });
    }

    values.push(req.user.userId);

    await db.execute(
      `UPDATE users SET ${updates.join(", ")} WHERE user_id = ?`,
      values
    );

    const [rows] = await db.execute(
      `SELECT user_id, first_name, last_name, username, email,
              contact_number, birthday, location, profile_note, role
       FROM users
       WHERE user_id = ?
       LIMIT 1`,
      [req.user.userId]
    );

    res.json({
      message: "Profile updated successfully.",
      user: rows[0]
    });

  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        message: "That email address is already being used."
      });
    }

    next(error);
  }
});


// UPDATE password
router.patch("/password", requireAuth, async (req, res, next) => {
  try {
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({
        message: "Password must be at least 8 characters long."
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await db.execute(
      "UPDATE users SET password_hash = ? WHERE user_id = ?",
      [hashedPassword, req.user.userId]
    );

    res.json({ message: "Password updated successfully." });

  } catch (error) {
    next(error);
  }
});

module.exports = router;