const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const db = require("../database/database");

const router = express.Router();
const attempts = new Map();

db.exec(`
CREATE TABLE IF NOT EXISTS portal_admins (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 email TEXT NOT NULL UNIQUE,
 password_hash TEXT NOT NULL,
 totp_secret TEXT NOT NULL,
 active INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS portal_admin_audit (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 admin_id INTEGER,
 action TEXT NOT NULL,
 detail TEXT DEFAULT '',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS portal_written_questions (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 paper_id INTEGER NOT NULL,
 chapter TEXT NOT NULL DEFAULT '',
 question TEXT NOT NULL,
 expected_answer TEXT DEFAULT '',
 rubric TEXT NOT NULL,
 marks INTEGER NOT NULL DEFAULT 1,
 language TEXT NOT NULL DEFAULT 'Theory',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

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
`);

function base32Decode(s) {
 const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
 let bits = "";
 for (const c of s.replace(/=+$/,"").toUpperCase()) {
  const n = alphabet.indexOf(c);
  if (n < 0) throw new Error("Invalid authenticator secret");
  bits += n.toString(2).padStart(5,"0");
 }
 const out = [];
 for (let i=0;i+8<=bits.length;i+=8) out.push(parseInt(bits.slice(i,i+8),2));
 return Buffer.from(out);
}

function totp(secret, counter) {
 const key = base32Decode(secret);
 const msg = Buffer.alloc(8);
 msg.writeBigUInt64BE(BigInt(counter));
 const h = crypto.createHmac("sha1",key).update(msg).digest();
 const offset = h[h.length-1] & 15;
 const num = (h.readUInt32BE(offset) & 0x7fffffff) % 1000000;
 return String(num).padStart(6,"0");
}

function verifyTotp(secret, token) {
 if (!/^\d{6}$/.test(String(token || ""))) return false;
 const step = Math.floor(Date.now()/30000);
 return [-1,0,1].some(d => totp(secret,step+d) === String(token));
}

function audit(req, action, detail) {
 db.prepare("INSERT INTO portal_admin_audit(admin_id,action,detail) VALUES(?,?,?)")
   .run(req.session.adminId,action,String(detail || "").slice(0,500));
}

function adminOnly(req,res,next) {
 if (!req.session || !req.session.adminId) {
  return res.status(401).json({error:"Admin login required."});
 }
 const admin = db.prepare("SELECT id,email FROM portal_admins WHERE id=? AND active=1")
  .get(req.session.adminId);
 if (!admin) return res.status(401).json({error:"Admin account unavailable."});
 req.admin = admin;
 next();
}

router.post("/login", async (req,res) => {
 const ip = req.ip || "unknown";
 const state = attempts.get(ip) || {count:0,until:0};
 if (Date.now() < state.until) return res.status(429).json({error:"Too many login attempts. Try again later."});

 const email = String(req.body.email || "").trim().toLowerCase();
 const password = String(req.body.password || "");
 const code = String(req.body.code || "");
 const admin = db.prepare("SELECT * FROM portal_admins WHERE email=? AND active=1").get(email);

 const passwordOk = admin ? await bcrypt.compare(password,admin.password_hash) : false;
 const codeOk = admin ? verifyTotp(admin.totp_secret,code) : false;

 if (!passwordOk || !codeOk) {
  state.count++;
  if (state.count >= 5) { state.count=0; state.until=Date.now()+15*60*1000; }
  attempts.set(ip,state);
  return res.status(401).json({error:"Invalid admin credentials or authenticator code."});
 }

 attempts.delete(ip);
 req.session.regenerate(err => {
  if (err) return res.status(500).json({error:"Could not create secure session."});
  req.session.adminId = admin.id;
  req.session.save(saveErr => {
   if (saveErr) return res.status(500).json({error:"Could not save admin session."});
   db.prepare("INSERT INTO portal_admin_audit(admin_id,action) VALUES(?,?)").run(admin.id,"LOGIN");
   res.json({ok:true,email:admin.email});
  });
 });
});

router.get("/me",adminOnly,(req,res)=>res.json({admin:req.admin}));

router.post("/logout",adminOnly,(req,res)=>{
 db.prepare("INSERT INTO portal_admin_audit(admin_id,action) VALUES(?,?)").run(req.admin.id,"LOGOUT");
 req.session.destroy(()=>res.json({ok:true}));
});

// Study materials: uses the same table as the student materials page.
router.get("/materials",adminOnly,(req,res)=>{
 const rows = db.prepare("SELECT * FROM it_study_materials ORDER BY id DESC").all();
 res.json({materials:rows});
});

router.post("/materials",adminOnly,(req,res)=>{
 const {chapter,title,description,content,file_url,material_type,publish} = req.body;
 if (!chapter || !title) return res.status(400).json({error:"Chapter and title are required."});
 const result = db.prepare(`
 INSERT INTO it_study_materials
 (chapter,title,description,content,file_url,material_type,is_published)
 VALUES (?,?,?,?,?,?,?)
 `).run(
  String(chapter).slice(0,150),String(title).slice(0,200),
  String(description||""),String(content||""),String(file_url||""),
  String(material_type||"Notes").slice(0,50),publish ? 1 : 0
 );
 audit(req,"CREATE_MATERIAL","Material ID "+result.lastInsertRowid);
 res.json({ok:true,id:result.lastInsertRowid});
});

router.post("/materials/:id/publish",adminOnly,(req,res)=>{
 const r=db.prepare("UPDATE it_study_materials SET is_published=? WHERE id=?")
  .run(req.body.publish ? 1 : 0,req.params.id);
 if (!r.changes) return res.status(404).json({error:"Material not found."});
 audit(req,"CHANGE_MATERIAL_PUBLICATION","Material "+req.params.id);
 res.json({ok:true});
});

router.delete("/materials/:id",adminOnly,(req,res)=>{
 db.prepare("DELETE FROM it_study_materials WHERE id=?").run(req.params.id);
 audit(req,"DELETE_MATERIAL","Material "+req.params.id);
 res.json({ok:true});
});

// Practice MCQs: correct answers remain on the server.
router.get("/practice",adminOnly,(req,res)=>{
 const rows=db.prepare("SELECT id,chapter,question,options_json,correct_option,explanation,is_published FROM it_practice_questions ORDER BY id DESC").all();
 res.json({questions:rows.map(q=>({...q,options:JSON.parse(q.options_json)}))});
});

router.post("/practice",adminOnly,(req,res)=>{
 const {chapter,question,options,correct_option,explanation,publish}=req.body;
 if (!chapter || !question || !options || !["A","B","C","D"].includes(correct_option))
  return res.status(400).json({error:"Enter chapter, question, four options and correct answer."});
 for (const k of ["A","B","C","D"]) if (!String(options[k]||"").trim())
  return res.status(400).json({error:"All four options are required."});
 const result=db.prepare(`
 INSERT INTO it_practice_questions
 (chapter,question,options_json,correct_option,explanation,is_published)
 VALUES (?,?,?,?,?,?)
 `).run(String(chapter),String(question),JSON.stringify(options),correct_option,String(explanation||""),publish?1:0);
 audit(req,"CREATE_PRACTICE_QUESTION","Question "+result.lastInsertRowid);
 res.json({ok:true,id:result.lastInsertRowid});
});

router.post("/practice/:id/publish",adminOnly,(req,res)=>{
 const r=db.prepare("UPDATE it_practice_questions SET is_published=? WHERE id=?")
  .run(req.body.publish?1:0,req.params.id);
 if (!r.changes) return res.status(404).json({error:"Question not found."});
 audit(req,"CHANGE_PRACTICE_PUBLICATION","Question "+req.params.id);
 res.json({ok:true});
});

router.delete("/practice/:id",adminOnly,(req,res)=>{
 db.prepare("DELETE FROM it_practice_questions WHERE id=?").run(req.params.id);
 audit(req,"DELETE_PRACTICE_QUESTION","Question "+req.params.id);
 res.json({ok:true});
});

// Sunday exam papers and MCQ answer keys.
router.get("/exams",adminOnly,(req,res)=>{
 const papers=db.prepare("SELECT * FROM student_exam_papers ORDER BY id DESC").all();
 const questions=db.prepare("SELECT id,paper_id,question,marks,correct_option FROM student_exam_questions ORDER BY id DESC").all();
 const written=db.prepare("SELECT id,paper_id,chapter,question,marks,language FROM portal_written_questions ORDER BY id DESC").all();
 res.json({papers,questions,written});
});

router.post("/exams",adminOnly,(req,res)=>{
 const {title,exam_date,total_marks}=req.body;
 if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(String(exam_date||"")))
  return res.status(400).json({error:"Enter an exam title and date in YYYY-MM-DD format."});
 const date=new Date(exam_date+"T12:00:00+05:30");
 if (date.getUTCDay()!==0) return res.status(400).json({error:"Sunday exams must be scheduled on a Sunday."});
 const marks=Number(total_marks||80);
 if (!Number.isInteger(marks)||marks<1||marks>80) return res.status(400).json({error:"Total marks must be between 1 and 80."});
 const r=db.prepare(`
 INSERT INTO student_exam_papers(title,subject,duration_minutes,total_marks,exam_date,is_published)
 VALUES(?,'Information Technology',150,?,?,0)
 `).run(String(title).slice(0,200),marks,exam_date);
 audit(req,"CREATE_EXAM","Paper "+r.lastInsertRowid);
 res.json({ok:true,id:r.lastInsertRowid});
});

router.post("/exams/:id/mcq",adminOnly,(req,res)=>{
 const {question,options,correct_option,marks,explanation}=req.body;
 if (!question || !options || !["A","B","C","D"].includes(correct_option))
  return res.status(400).json({error:"Question, options and correct answer are required."});
 for (const k of ["A","B","C","D"]) if (!String(options[k]||"").trim())
  return res.status(400).json({error:"All four options are required."});
 const paper=db.prepare("SELECT id FROM student_exam_papers WHERE id=?").get(req.params.id);
 if (!paper) return res.status(404).json({error:"Paper not found."});
 const r=db.prepare(`
 INSERT INTO student_exam_questions(paper_id,question,options_json,correct_option,marks,explanation)
 VALUES(?,?,?,?,?,?)
 `).run(paper.id,String(question),JSON.stringify(options),correct_option,Math.max(1,Number(marks)||1),String(explanation||""));
 audit(req,"ADD_EXAM_MCQ","Question "+r.lastInsertRowid);
 res.json({ok:true,id:r.lastInsertRowid});
});

router.post("/exams/:id/written",adminOnly,(req,res)=>{
 const {chapter,question,expected_answer,rubric,marks,language}=req.body;
 if (!question || !rubric) return res.status(400).json({error:"Written question and marking rubric are required."});
 const paper=db.prepare("SELECT id FROM student_exam_papers WHERE id=?").get(req.params.id);
 if (!paper) return res.status(404).json({error:"Paper not found."});
 const r=db.prepare(`
 INSERT INTO portal_written_questions(paper_id,chapter,question,expected_answer,rubric,marks,language)
 VALUES(?,?,?,?,?,?,?)
 `).run(paper.id,String(chapter||""),String(question),String(expected_answer||""),String(rubric),Math.max(1,Number(marks)||1),String(language||"Theory"));
 audit(req,"ADD_WRITTEN_EXAM_QUESTION","Question "+r.lastInsertRowid);
 res.json({ok:true,id:r.lastInsertRowid});
});

router.post("/exams/:id/publish",adminOnly,(req,res)=>{
 const paper=db.prepare("SELECT * FROM student_exam_papers WHERE id=?").get(req.params.id);
 if (!paper) return res.status(404).json({error:"Paper not found."});
 const mcq=db.prepare("SELECT COALESCE(SUM(marks),0) AS n FROM student_exam_questions WHERE paper_id=?").get(paper.id).n;
 const written=db.prepare("SELECT COALESCE(SUM(marks),0) AS n FROM portal_written_questions WHERE paper_id=?").get(paper.id).n;
 if (mcq+written!==paper.total_marks)
  return res.status(400).json({error:`Question marks total ${mcq+written}; paper total is ${paper.total_marks}. Fix the difference before publishing.`});
 if (!mcq) return res.status(400).json({error:"Add at least one MCQ before publishing. Written-question delivery needs student exam integration."});
 db.prepare("UPDATE student_exam_papers SET is_published=? WHERE id=?").run(req.body.publish?1:0,paper.id);
 audit(req,"CHANGE_EXAM_PUBLICATION","Paper "+paper.id);
 res.json({ok:true});
});

router.get("/audit",adminOnly,(req,res)=>{
 res.json({logs:db.prepare("SELECT action,detail,created_at FROM portal_admin_audit ORDER BY id DESC LIMIT 200").all()});
});

module.exports=router;
