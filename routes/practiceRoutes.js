const express = require("express");
const db = require("../database/database");
const { requireLogin } = require("../middleware/auth");

const router = express.Router();

db.exec(`
  CREATE TABLE IF NOT EXISTS it_practice_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chapter TEXT NOT NULL,
    question TEXT NOT NULL,
    options_json TEXT NOT NULL,
    correct_option TEXT NOT NULL
      CHECK(correct_option IN ('A','B','C','D')),
    explanation TEXT DEFAULT '',
    is_published INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

function parseOptions(value) {
  try {
    const options = JSON.parse(value);
    if (
      !options ||
      !["A", "B", "C", "D"].every(
        key => typeof options[key] === "string" && options[key].trim()
      )
    ) {
      return null;
    }
    return options;
  } catch {
    return null;
  }
}

// Return published questions without correct answers.
router.get("/questions", requireLogin, (req, res, next) => {
  try {
    const chapter = String(req.query.chapter || "").trim();

    const rows = chapter
      ? db.prepare(`
          SELECT id, chapter, question, options_json
          FROM it_practice_questions
          WHERE is_published = 1 AND chapter = ?
          ORDER BY sort_order, id
        `).all(chapter)
      : db.prepare(`
          SELECT id, chapter, question, options_json
          FROM it_practice_questions
          WHERE is_published = 1
          ORDER BY sort_order, id
        `).all();

    const questions = rows.map(row => ({
      id: row.id,
      chapter: row.chapter,
      question: row.question,
      options: parseOptions(row.options_json)
    })).filter(item => item.options);

    res.set("Cache-Control", "no-store");
    res.json({ questions });
  } catch (error) {
    next(error);
  }
});

// Check an answer on the server.
router.post("/questions/:id/answer", requireLogin, (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const selectedOption = String(req.body.selectedOption || "").toUpperCase();

    if (!Number.isSafeInteger(id) || id < 1) {
      return res.status(400).json({ error: "Invalid question." });
    }

    if (!["A", "B", "C", "D"].includes(selectedOption)) {
      return res.status(400).json({ error: "Select a valid answer." });
    }

    const question = db.prepare(`
      SELECT correct_option, explanation
      FROM it_practice_questions
      WHERE id = ? AND is_published = 1
    `).get(id);

    if (!question) {
      return res.status(404).json({ error: "Question not found." });
    }

    res.set("Cache-Control", "no-store");
    res.json({
      isCorrect: selectedOption === question.correct_option,
      explanation: question.explanation || ""
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
