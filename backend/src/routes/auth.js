const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.post("/register", async (req, res, next) => {
  try {
    const { firstName, lastName, email, password, contactNumber, birthday, username } = req.body;
    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ message: "First name, last name, email, and password are required." });
    }
    if (String(password).length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters." });
    }

    const [existing] = await db.execute(
      "SELECT user_id FROM users WHERE email = ? LIMIT 1", [String(email).trim().toLowerCase()]
    );
    if (existing.length) return res.status(409).json({ message: "Email is already registered." });

    const passwordHash = await bcrypt.hash(password, 12);
    const [result] = await db.execute(
      `INSERT INTO users
       (first_name, last_name, username, email, password_hash, contact_number, birthday, role, account_status, email_verified)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'reporter', 'active', 0)`,
      [
        String(firstName).trim(), String(lastName).trim(),
        username ? String(username).trim() : null,
        String(email).trim().toLowerCase(), passwordHash,
        contactNumber || null, birthday || null
      ]
    );

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    await db.execute(
      "INSERT INTO email_verification_tokens (user_id, token_hash, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 24 HOUR))",
      [result.insertId, tokenHash]
    );

    // In development only, expose the token so email verification can be tested without an email provider.
    const response = { message: "Account created. Email verification is required.", userId: result.insertId };
    if (process.env.NODE_ENV !== "production") response.developmentVerificationToken = rawToken;
    res.status(201).json(response);
  } catch (error) { next(error); }
});

router.post("/verify-email", async (req, res, next) => {
  try {
    const { userId, token } = req.body;
    if (!userId || !token) return res.status(400).json({ message: "User ID and verification token are required." });

    const tokenHash = crypto.createHash("sha256").update(String(token)).digest("hex");
    const [rows] = await db.execute(
      `SELECT token_id FROM email_verification_tokens
       WHERE user_id = ? AND token_hash = ? AND used_at IS NULL AND expires_at > NOW()
       LIMIT 1`, [userId, tokenHash]
    );
    if (!rows.length) return res.status(400).json({ message: "Verification token is invalid or expired." });

    await db.execute("UPDATE users SET email_verified = 1 WHERE user_id = ?", [userId]);
    await db.execute("UPDATE email_verification_tokens SET used_at = NOW() WHERE token_id = ?", [rows[0].token_id]);
    res.json({ message: "Email verified successfully." });
  } catch (error) { next(error); }
});

router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: "Email and password are required." });

    const [rows] = await db.execute(
      `SELECT user_id, first_name, last_name, username, email, password_hash, role, account_status, email_verified
       FROM users WHERE email = ? LIMIT 1`, [String(email).trim().toLowerCase()]
    );
    if (!rows.length) return res.status(401).json({ message: "Invalid email or password." });

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ message: "Invalid email or password." });
    if (user.account_status !== "active") return res.status(403).json({ message: "This account is not active." });
    if (!user.email_verified) return res.status(403).json({ message: "Please verify your email before logging in." });

    const token = jwt.sign(
      { userId: user.user_id, role: user.role, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "1d" }
    );

    delete user.password_hash;
    res.json({ message: "Login successful.", token, user });
  } catch (error) { next(error); }
});

router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const [rows] = await db.execute(
      `SELECT user_id, first_name, last_name, username, email,
       contact_number, birthday, role, account_status
FROM users
WHERE user_id = ?
LIMIT 1`, [req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ message: "User not found." });
    res.json({ user: rows[0] });
  } catch (error) { next(error); }
});


router.patch("/me", requireAuth, async (req, res, next) => {
  try {
    const { firstName, lastName, username, contactNumber, birthday } = req.body;
    const [result] = await db.execute(
      `UPDATE users SET first_name = COALESCE(?, first_name),
       last_name = COALESCE(?, last_name), username = COALESCE(?, username),
       contact_number = COALESCE(?, contact_number), birthday = COALESCE(?, birthday)
       WHERE user_id = ?`,
      [firstName ?? null, lastName ?? null, username ?? null, contactNumber ?? null, birthday ?? null, req.user.userId]
    );
    const [rows] = await db.execute(
      `SELECT user_id, first_name, last_name, username, email, contact_number, birthday, role, account_status
       FROM users WHERE user_id = ?`, [req.user.userId]
    );
    res.json({ message: "Profile updated.", user: rows[0] });
  } catch (error) { next(error); }
});

module.exports = router;
