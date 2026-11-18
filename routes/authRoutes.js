const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../database/database");

const router = express.Router();

function getIndiaYear() {
  return new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Kolkata",
    year: "numeric"
  }).format(new Date());
}

router.post("/register", async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    if (
      typeof name !== "string" ||
      typeof email !== "string" ||
      typeof password !== "string"
    ) {
      return res.status(400).json({ error: "Please enter valid details." });
    }

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (cleanName.length < 2 || cleanName.length > 60) {
      return res.status(400).json({ error: "Name must be 2–60 characters." });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: "Enter a valid email address." });
    }

    if (password.length < 12 || password.length > 72) {
      return res.status(400).json({
        error: "Password must be 12–72 characters long."
      });
    }

    const existing = db.prepare(
      "SELECT id FROM users WHERE email = ?"
    ).get(cleanEmail);

    if (existing) {
      return res.status(409).json({
        error: "An account with this email already exists."
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const registerStudent = db.transaction(() => {
      const sequence = db.prepare(
        "SELECT next_value FROM candidate_sequence WHERE id = 1"
      ).get();

      if (!sequence || sequence.next_value > 2574) {
        throw new Error("All candidate numbers for batch 2026-27 have been allocated.");
      }

      const number = sequence.next_value;
      const letters = "MNOPQRSTUVWXYZABCDEFGHIJKL";
      const letter = letters[Math.floor((number - 1) / 99)];
      const serial = ((number - 1) % 99) + 1;
      const candidateNo = `${letter}2027${String(serial).padStart(2, "0")}`;

      const result = db.prepare(`
        INSERT INTO users (name, email, password_hash)
        VALUES (?, ?, ?)
      `).run(cleanName, cleanEmail, passwordHash);

      const userId = Number(result.lastInsertRowid);

      db.prepare(
        "UPDATE users SET candidate_no = ? WHERE id = ?"
      ).run(candidateNo, userId);

      db.prepare(
        "UPDATE candidate_sequence SET next_value = ? WHERE id = 1"
      ).run(number + 1);

      return { userId, candidateNo };
    });

    const student = registerStudent();

    return res.status(201).json({
      message: "TATTVA account created successfully.",
      candidateNo: student.candidateNo,
      userId: student.userId
    });

  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(409).json({
        error: "This email or candidate number is already registered."
      });
    }
    next(error);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (typeof email !== "string" || typeof password !== "string") {
      return res.status(400).json({
        error: "Enter your email and password."
      });
    }

    const user = db.prepare(`
      SELECT id, name, email, password_hash, role, candidate_no
      FROM users
      WHERE email = ?
    `).get(email.trim().toLowerCase());

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({
        error: "Incorrect email or password."
      });
    }

    req.session.regenerate((error) => {
      if (error) return next(error);

      req.session.userId = user.id;
      req.session.role = user.role;

      req.session.save((saveError) => {
        if (saveError) return next(saveError);

        res.json({
          message: "Login successful.",
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            candidateNo: user.candidate_no
          }
        });
      });
    });

  } catch (error) {
    next(error);
  }
});

router.get("/me", (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: "Please log in first." });
  }

  const user = db.prepare(`
    SELECT id, name, email, role, candidate_no, created_at
    FROM users
    WHERE id = ?
  `).get(req.session.userId);

  if (!user) {
    return res.status(401).json({ error: "Account not found." });
  }

  res.json({ user });
});

router.post("/logout", (req, res, next) => {
  if (!req.session) {
    return res.status(401).json({ error: "Please log in first." });
  }

  req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie("tattva.sid");
    res.json({ message: "Logged out successfully." });
  });
});

module.exports = router;


