const express = require("express");
const db = require("../database/database");
const { requireRole } = require("../middleware/auth");

const router = express.Router();

router.get("/dashboard", requireRole("admin"), (req, res) => {
  const totalStudents = db.prepare(
    "SELECT COUNT(*) AS count FROM users WHERE role = 'student'"
  ).get().count;

  res.json({
    message: "Administrator access granted.",
    totalStudents
  });
});

module.exports = router;
