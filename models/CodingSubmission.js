const mongoose = require("mongoose");
const caseResultSchema = new mongoose.Schema({
  input: String,
  expectedOutput: { type: String, select: false },
  actualOutput: String,
  status: String,
  time: String,
  memory: Number,
  stderr: String,
  compileOutput: String
}, { _id: false });

module.exports = mongoose.model("CodingSubmission", new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  problem: { type: mongoose.Schema.Types.ObjectId, ref: "CodingProblem", required: true, index: true },
  language: String,
  sourceCode: String,
  status: { type: String, default: "Queued", index: true },
  score: { type: Number, default: 0 },
  passedTests: { type: Number, default: 0 },
  totalTests: { type: Number, default: 0 },
  judgeTokens: [{ token: String, caseIndex: Number }],
  testResults: [caseResultSchema],
  result: String,
  stdout: String,
  stderr: String,
  compileOutput: String,
  executionTime: String,
  memory: Number
}, { timestamps: true }));
