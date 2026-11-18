require("dotenv").config();

const express = require("express");
const secureAdminRoutes = require("./routes/secureAdminRoutes");
const session = require("express-session");
const SQLiteStoreFactory = require("connect-sqlite3");
const path = require("path");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const authRoutes = require("./routes/authRoutes");
const examRoutes = require("./routes/examRoutes");
const practiceRoutes = require('./routes/practiceRoutes');
const materialRoutes = require("./routes/materialRoutes");
const adminRoutes = require("./routes/adminRoutes");

if (!process.env.SESSION_SECRET ||
    process.env.SESSION_SECRET === "REPLACE_WITH_A_LONG_RANDOM_SECRET") {
  throw new Error("Set a real random SESSION_SECRET in your .env file.");
}

const app = express();
const SQLiteStore = SQLiteStoreFactory(session);

if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

app.disable("x-powered-by");
app.use(helmet());
app.use(express.json({ limit: "20kb" }));
app.use(express.urlencoded({ extended: false, limit: "20kb" }));

app.use(session({
  name: "tattva.sid",
  store: new SQLiteStore({
    db: "sessions.sqlite",
    dir: path.join(__dirname, "database")
  }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 1000 * 60 * 60 * 4
  }
}));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: (req) =>
    req.method !== "POST" ||
    !["/login", "/register"].includes(req.path),
  message: { error: "Too many login or registration attempts. Please try again later." }
});

app.use("/api/auth", authLimiter);
app.use("/api/auth", authRoutes);
app.use("/api/exams", examRoutes);
app.use('/api/practice', practiceRoutes);
app.use("/api/materials", materialRoutes);
app.use("/api/admin", adminRoutes);

app.use("/api/admin-control", secureAdminRoutes);
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", portal: "TATTVA HSC Practice Portal" });
});

app.use((req, res) => {
  res.status(404).json({ error: "Page or API route not found." });
});

app.use((err, req, res, next) => {
  console.error("Server error:", err.message);
  res.status(500).json({ error: "Something went wrong on the server." });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`TATTVA HSC Portal running at http://localhost:${PORT}`);
});



