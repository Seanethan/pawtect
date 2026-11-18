
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// ==========================================
// REGISTER
// ==========================================
router.post("/register", async (req, res, next) => {
    let connection;

    try {
        const {
            firstName,
            lastName,
            email,
            password,
            contactNumber,
            birthday,
            username,
            becomeRescuer
        } = req.body;

        // Validate required fields
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

        const cleanFirstName = String(firstName).trim();
        const cleanLastName = String(lastName).trim();
        const cleanEmail = String(email).trim().toLowerCase();

        if (!cleanFirstName || !cleanLastName) {
            return res.status(400).json({
                message: "First name and last name cannot be empty."
            });
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
            return res.status(400).json({
                message: "Please enter a valid email address."
            });
        }

        // Determine account role from the checkbox
        const role = becomeRescuer === true ? "rescuer" : "reporter";

        // Hash password
        const passwordHash = await bcrypt.hash(String(password), 12);

        // Generate email verification token
        const rawToken = crypto.randomBytes(32).toString("hex");

        const tokenHash = crypto
            .createHash("sha256")
            .update(rawToken)
            .digest("hex");

        // Start database transaction
        connection = await db.getConnection();
        await connection.beginTransaction();

        // Check existing email
        const [existing] = await connection.execute(
            "SELECT user_id FROM users WHERE email = ? LIMIT 1",
            [cleanEmail]
        );

        if (existing.length) {
            await connection.rollback();

            return res.status(409).json({
                message: "Email is already registered."
            });
        }

        // Insert user
        const [userResult] = await connection.execute(
            `INSERT INTO users
            (
                first_name,
                last_name,
                username,
                email,
                password_hash,
                contact_number,
                birthday,
                role,
                account_status,
                email_verified
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', 0)`,
            [
                cleanFirstName,
                cleanLastName,
                username ? String(username).trim() || null : null,
                cleanEmail,
                passwordHash,
                contactNumber ? String(contactNumber).trim() || null : null,
                birthday || null,
                role
            ]
        );

        const userId = userResult.insertId;

        // Create rescuer profile if applicable
        if (role === "rescuer") {
            await connection.execute(
                `INSERT INTO rescuer_profiles
                (
                    user_id,
                    application_status
                )
                VALUES (?, 'pending')`,
                [userId]
            );
        }

        // Insert email verification token
        await connection.execute(
            `INSERT INTO email_verification_tokens
            (
                user_id,
                token_hash,
                expires_at
            )
            VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 24 HOUR))`,
            [userId, tokenHash]
        );

        // Commit transaction
        await connection.commit();

        const response = {
            message: role === "rescuer"
                ? "Rescuer account created. Please verify your email. Your rescuer application is pending admin approval."
                : "Account created. Please verify your email.",
            userId,
            role
        };

        // Development only
        if (process.env.NODE_ENV !== "production") {
            response.developmentVerificationToken = rawToken;
        }

        return res.status(201).json(response);

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


// ==========================================
// VERIFY EMAIL
// ==========================================
router.post("/verify-email", async (req, res, next) => {
    try {
        const { userId, token } = req.body;

        if (!userId || !token) {
            return res.status(400).json({
                message: "User ID and verification token are required."
            });
        }

        const tokenHash = crypto
            .createHash("sha256")
            .update(String(token))
            .digest("hex");

        const [rows] = await db.execute(
            `SELECT token_id
             FROM email_verification_tokens
             WHERE user_id = ?
             AND token_hash = ?
             AND used_at IS NULL
             AND expires_at > NOW()
             LIMIT 1`,
            [userId, tokenHash]
        );

        if (!rows.length) {
            return res.status(400).json({
                message: "Verification token is invalid or expired."
            });
        }

        const connection = await db.getConnection();

        try {
            await connection.beginTransaction();

            await connection.execute(
                "UPDATE users SET email_verified = 1 WHERE user_id = ?",
                [userId]
            );

            await connection.execute(
                "UPDATE email_verification_tokens SET used_at = NOW() WHERE token_id = ?",
                [rows[0].token_id]
            );

            await connection.commit();

        } catch (error) {
            await connection.rollback();
            throw error;

        } finally {
            connection.release();
        }

        res.json({
            message: "Email verified successfully."
        });

    } catch (error) {
        next(error);
    }
});


// ==========================================
// LOGIN
// ==========================================
router.post("/login", async (req, res, next) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                message: "Email and password are required."
            });
        }

        const [rows] = await db.execute(
            `SELECT
                user_id,
                first_name,
                last_name,
                username,
                email,
                password_hash,
                role,
                account_status,
                email_verified
             FROM users
             WHERE email = ?
             LIMIT 1`,
            [String(email).trim().toLowerCase()]
        );

        if (!rows.length) {
            return res.status(401).json({
                message: "Invalid email or password."
            });
        }

        const user = rows[0];

        const valid = await bcrypt.compare(
            password,
            user.password_hash
        );

        if (!valid) {
            return res.status(401).json({
                message: "Invalid email or password."
            });
        }

        if (user.account_status !== "active") {
            return res.status(403).json({
                message: "This account is not active."
            });
        }

        if (!user.email_verified) {
            return res.status(403).json({
                message: "Please verify your email before logging in."
            });
        }

        const token = jwt.sign(
            {
                userId: user.user_id,
                role: user.role,
                email: user.email
            },
            process.env.JWT_SECRET,
            {
                expiresIn: process.env.JWT_EXPIRES_IN || "1d"
            }
        );

        delete user.password_hash;

        res.json({
            message: "Login successful.",
            token,
            user
        });

    } catch (error) {
        next(error);
    }
});


// ==========================================
// GET CURRENT USER
// ==========================================
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
                role,
                account_status
             FROM users
             WHERE user_id = ?
             LIMIT 1`,
            [req.user.userId]
        );

        if (!rows.length) {
            return res.status(404).json({
                message: "User not found."
            });
        }

        res.json({
            user: rows[0]
        });

    } catch (error) {
        next(error);
    }
});


// ==========================================
// UPDATE CURRENT USER
// ==========================================
router.patch("/me", requireAuth, async (req, res, next) => {
    try {
        const {
            firstName,
            lastName,
            username,
            contactNumber,
            birthday
        } = req.body;

        await db.execute(
            `UPDATE users SET
                first_name = COALESCE(?, first_name),
                last_name = COALESCE(?, last_name),
                username = COALESCE(?, username),
                contact_number = COALESCE(?, contact_number),
                birthday = COALESCE(?, birthday)
             WHERE user_id = ?`,
            [
                firstName ?? null,
                lastName ?? null,
                username ?? null,
                contactNumber ?? null,
                birthday ?? null,
                req.user.userId
            ]
        );

        const [rows] = await db.execute(
            `SELECT
                user_id,
                first_name,
                last_name,
                username,
                email,
                contact_number,
                birthday,
                role,
                account_status
             FROM users
             WHERE user_id = ?`,
            [req.user.userId]
        );

        res.json({
            message: "Profile updated.",
            user: rows[0]
        });

    } catch (error) {
        next(error);
    }
});

module.exports = router;

