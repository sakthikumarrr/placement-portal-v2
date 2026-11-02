const fs = require("fs");
const os = require("os");
const path = require("path");

// Vercel's deployed source directory is read-only. /tmp is writable,
// but it is ephemeral and is not suitable for permanent file storage.
const root = path.join(os.tmpdir(), "placement-portal-uploads");
const publicDir = path.join(root, "public");
const privateResumeDir = path.join(root, "private", "resumes");

fs.mkdirSync(publicDir, { recursive: true });
fs.mkdirSync(privateResumeDir, { recursive: true });

module.exports = { publicDir, privateResumeDir };
