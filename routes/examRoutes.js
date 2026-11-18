const express = require("express");
const db = require("../database/database");
const { requireLogin } = require("../middleware/auth");
const router = express.Router();

// student-exam-engine-v1
db.exec(`
CREATE TABLE IF NOT EXISTS student_exam_papers (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 title TEXT NOT NULL,
 subject TEXT NOT NULL DEFAULT 'Information Technology',
 duration_minutes INTEGER NOT NULL DEFAULT 150,
 total_marks INTEGER NOT NULL DEFAULT 80,
 exam_date TEXT NOT NULL,
 is_published INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS student_exam_questions (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 paper_id INTEGER NOT NULL,
 question TEXT NOT NULL,
 options_json TEXT NOT NULL,
 correct_option TEXT NOT NULL CHECK(correct_option IN ('A','B','C','D')),
 marks INTEGER NOT NULL DEFAULT 1,
 explanation TEXT DEFAULT '',
 FOREIGN KEY(paper_id) REFERENCES student_exam_papers(id)
);

CREATE TABLE IF NOT EXISTS student_exam_attempts (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 paper_id INTEGER NOT NULL,
 user_id INTEGER NOT NULL,
 started_at TEXT NOT NULL,
 deadline_at TEXT NOT NULL,
 submitted_at TEXT,
 answers_json TEXT NOT NULL DEFAULT '{}',
 score INTEGER,
 grading_complete INTEGER NOT NULL DEFAULT 1,
 UNIQUE(paper_id,user_id),
 FOREIGN KEY(paper_id) REFERENCES student_exam_papers(id)
);
`);

function istNow() {
 return new Date(Date.now() + 330 * 60000);
}
function isSunday() {
 return istNow().getUTCDay() === 0;
}
function getUserId(req) {
 return req.user?.id || req.session?.user?.id;
}
function getAttempt(id,userId) {
 return db.prepare(
  "SELECT * FROM student_exam_attempts WHERE id=? AND user_id=?"
 ).get(id,userId);
}

// List available Sunday papers.
router.get("/papers", requireLogin, (req,res) => {
 const papers = db.prepare(`
  SELECT p.id,p.title,p.exam_date,p.duration_minutes,p.total_marks,
  a.id AS attempt_id,a.submitted_at
  FROM student_exam_papers p
  LEFT JOIN student_exam_attempts a
  ON a.paper_id=p.id AND a.user_id=?
  WHERE p.is_published=1
  ORDER BY p.exam_date DESC
 `).all(getUserId(req));
 res.json({papers});
});

// Start one attempt per student and paper.
router.post("/:paperId/start", requireLogin, (req,res) => {
 if (!isSunday()) return res.status(403).json({error:"Exams are available on Sundays only."});
 const paper = db.prepare(
  "SELECT * FROM student_exam_papers WHERE id=? AND is_published=1"
 ).get(req.params.paperId);
 if (!paper) return res.status(404).json({error:"Exam not found."});

 const existing = db.prepare(
  "SELECT * FROM student_exam_attempts WHERE paper_id=? AND user_id=?"
 ).get(paper.id,getUserId(req));
 if (existing) return res.status(409).json({error:"You have already used your attempt.",attemptId:existing.id});

 const questions = db.prepare(`
  SELECT id,question,options_json,marks
  FROM student_exam_questions WHERE paper_id=? ORDER BY id
 `).all(paper.id);
 if (!questions.length) return res.status(409).json({error:"This exam has no questions yet."});

 const now = new Date();
 const deadline = new Date(now.getTime()+paper.duration_minutes*60000);
 const result = db.prepare(`
  INSERT INTO student_exam_attempts
  (paper_id,user_id,started_at,deadline_at)
  VALUES (?,?,?,?)
 `).run(paper.id,getUserId(req),now.toISOString(),deadline.toISOString());

 res.json({
  attemptId:result.lastInsertRowid,
  title:paper.title,
  durationMinutes:paper.duration_minutes,
  totalMarks:paper.total_marks,
  deadlineAt:deadline.toISOString(),
  questions:questions.map(q=>({
   id:q.id,question:q.question,
   options:JSON.parse(q.options_json),marks:q.marks
  }))
 });
});

// Save answers. Correct answers are never sent to the browser.
router.post("/attempt/:attemptId/answer", requireLogin, (req,res) => {
 const attempt = getAttempt(req.params.attemptId,getUserId(req));
 if (!attempt) return res.status(404).json({error:"Attempt not found."});
 if (attempt.submitted_at) return res.status(403).json({error:"Attempt is locked."});
 if (Date.now() >= Date.parse(attempt.deadline_at)) {
  return res.status(403).json({error:"Exam time has expired. Submit your exam."});
 }
 const {questionId,selectedOption} = req.body;
 if (!["A","B","C","D"].includes(selectedOption)) {
  return res.status(400).json({error:"Invalid option."});
 }
 const question = db.prepare(
  "SELECT id FROM student_exam_questions WHERE id=? AND paper_id=?"
 ).get(questionId,attempt.paper_id);
 if (!question) return res.status(404).json({error:"Question not found."});
 const answers = JSON.parse(attempt.answers_json || "{}");
 answers[questionId] = selectedOption;
 db.prepare(
  "UPDATE student_exam_attempts SET answers_json=? WHERE id=?"
 ).run(JSON.stringify(answers),attempt.id);
 res.json({saved:true});
});

// Submit or automatically submit after deadline.
router.post("/attempt/:attemptId/submit", requireLogin, (req,res) => {
 const attempt = getAttempt(req.params.attemptId,getUserId(req));
 if (!attempt) return res.status(404).json({error:"Attempt not found."});
 if (attempt.submitted_at) return res.json({submitted:true,alreadySubmitted:true});
 if (Date.now() < Date.parse(attempt.deadline_at) && req.body.confirm !== true) {
  return res.status(400).json({error:"Confirm submission by sending confirm:true."});
 }
 const answers = JSON.parse(attempt.answers_json || "{}");
 const questions = db.prepare(
  "SELECT id,correct_option,marks FROM student_exam_questions WHERE paper_id=?"
 ).all(attempt.paper_id);
 let score = 0;
 for (const q of questions) {
  if (answers[q.id] === q.correct_option) score += q.marks;
 }
 const submittedAt = new Date().toISOString();
 db.prepare(`
  UPDATE student_exam_attempts
  SET submitted_at=?,score=?,grading_complete=1
  WHERE id=? AND submitted_at IS NULL
 `).run(submittedAt,score,attempt.id);
 res.json({submitted:true,resultAvailableAt:new Date(Date.now()+12*3600000).toISOString()});
});

// Student result list. Result stays hidden for 12 hours.
router.get("/results", requireLogin, (req,res) => {
 const rows = db.prepare(`
  SELECT a.id,a.submitted_at,a.score,a.grading_complete,
  p.title,p.total_marks
  FROM student_exam_attempts a
  JOIN student_exam_papers p ON p.id=a.paper_id
  WHERE a.user_id=? AND a.submitted_at IS NOT NULL
  ORDER BY a.submitted_at DESC
 `).all(getUserId(req));
 const results = rows.map(r=>{
  const release = Date.parse(r.submitted_at)+12*3600000;
  const available = Date.now()>=release && !!r.grading_complete;
  return {
   attemptId:r.id,title:r.title,submittedAt:r.submitted_at,
   available,resultAvailableAt:new Date(release).toISOString(),
   score:available?r.score:null,totalMarks:available?r.total_marks:null
  };
 });
 res.json({results});
});

// Result and answer key only after the release time.
router.get("/results/:attemptId", requireLogin, (req,res) => {
 const attempt = getAttempt(req.params.attemptId,getUserId(req));
 if (!attempt || !attempt.submitted_at) return res.status(404).json({error:"Result not found."});
 const release = Date.parse(attempt.submitted_at)+12*3600000;
 if (Date.now()<release || !attempt.grading_complete) {
  return res.status(403).json({error:"Your result is not released yet."});
 }
 const paper = db.prepare("SELECT * FROM student_exam_papers WHERE id=?").get(attempt.paper_id);
 const answers = JSON.parse(attempt.answers_json || "{}");
 const questions = db.prepare(`
  SELECT id,question,options_json,correct_option,marks,explanation
  FROM student_exam_questions WHERE paper_id=? ORDER BY id
 `).all(attempt.paper_id);
 res.json({
  title:paper.title,score:attempt.score,totalMarks:paper.total_marks,
  submittedAt:attempt.submitted_at,
  questions:questions.map(q=>({
   question:q.question,options:JSON.parse(q.options_json),
   selected:answers[q.id] || null,correct:q.correct_option,
   marks:q.marks,explanation:q.explanation
  }))
 });
});

module.exports = router;
