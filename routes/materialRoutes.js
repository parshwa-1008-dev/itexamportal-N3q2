const express = require("express");
const db = require("../database/database");
const { requireLogin } = require("../middleware/auth");

const router = express.Router();

// Students can only see published Information Technology materials.
router.get("/", requireLogin, (req, res, next) => {
  try {
    const materials = db.prepare(`
      SELECT
        id,
        chapter,
        title,
        description,
        content,
        file_url,
        material_type,
        created_at
      FROM it_study_materials
      WHERE is_published = 1
      ORDER BY sort_order ASC, id ASC
    `).all();

    res.set("Cache-Control", "no-store");
    res.json({ materials });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
