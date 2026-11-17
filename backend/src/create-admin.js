
const path = require("path");

require("dotenv").config({
  path: path.join(__dirname, "..", ".env")
});

const bcrypt = require("bcryptjs");
const readline = require("readline");
const db = require("./db");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(question) {
  return new Promise(resolve => rl.question(question, resolve));
}

async function createAdmin() {
  try {
    console.log("\n=== PAWTECT ADMIN ACCOUNT SETUP ===\n");

    const firstName = await ask("First name: ");
    const lastName = await ask("Last name: ");
    const email = (await ask("Email: ")).trim().toLowerCase();
    const username = (await ask("Username: ")).trim();
    const password = await ask("Password (minimum 8 characters): ");

    if (!firstName.trim() || !lastName.trim() || !email || !password) {
      throw new Error("Please complete all required fields.");
    }

    if (password.length < 8) {
      throw new Error("Password must be at least 8 characters.");
    }

    const [existing] = await db.execute(
      "SELECT user_id FROM users WHERE email = ? LIMIT 1",
      [email]
    );

    if (existing.length > 0) {
      throw new Error("An account with this email already exists.");
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const [result] = await db.execute(
      `INSERT INTO users
       (first_name, last_name, username, email, password_hash,
        role, account_status, email_verified)
       VALUES (?, ?, ?, ?, ?, 'admin', 'active', 1)`,
      [
        firstName.trim(),
        lastName.trim(),
        username || null,
        email,
        passwordHash
      ]
    );

    console.log("\nAdmin account created successfully!");
    console.log("Admin ID:", result.insertId);
    console.log("Email:", email);
    console.log("Role: admin");
    console.log("Status: active");

  } catch (error) {
    console.error("\nError:", error.message);
  } finally {
    rl.close();
    await db.end();
  }
}

createAdmin();
