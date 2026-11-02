require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const morgan = require("morgan");
const path = require("path");
const rateLimit = require("express-rate-limit");
const connectDB = require("./config/db");
const { publicDir } = require("./config/uploadPaths");

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.CLIENT_URL || true }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));
app.use("/uploads", express.static(publicDir));
app.use(express.static(path.join(__dirname, "public")));

// Connect to MongoDB on API requests. The connection is cached between
// warm serverless invocations and reused by the local Express server.
app.use("/api", async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    res.status(503).json({ message: "Database connection failed. Check MONGODB_URI in deployment settings." });
  }
});

app.use("/api", rateLimit({ windowMs: 15 * 60 * 1000, limit: 300 }));

app.use("/api/auth", require("./routes/auth"));
app.use("/api/tests", require("./routes/tests"));
app.use("/api/attempts", require("./routes/attempts"));
app.use("/api/coding", require("./routes/coding"));
app.use("/api/jobs", require("./routes/jobs"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api/interviews", require("./routes/interviews"));

app.get("/api/health", (req, res) => res.json({ status: "ok", service: "Launchly API" }));
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ message: err.message || "Server error" });
});

if (require.main === module) {
  const PORT = process.env.PORT || 5001;
  app.listen(PORT, () => console.log(`Launchly running at http://localhost:${PORT}`));
}

module.exports = app;
