const router = require("express").Router();
const CodingProblem = require("../models/CodingProblem");
const CodingSubmission = require("../models/CodingSubmission");
const { protect, allow } = require("../middleware/auth");

const LANGUAGE_NAMES = { "71": "Python 3", "62": "Java", "54": "C++", "50": "C" };
const ALLOWED_LANGUAGES = new Set(Object.keys(LANGUAGE_NAMES));
const TERMINAL_JUDGE_IDS = new Set([3,4,5,6,7,8,9,10,11,12,13,14]);

function judgeHeaders(json = false) {
  const headers = {};
  if (json) headers["Content-Type"] = "application/json";
  if (process.env.JUDGE0_API_KEY) headers["X-RapidAPI-Key"] = process.env.JUDGE0_API_KEY;
  if (process.env.JUDGE0_API_HOST) headers["X-RapidAPI-Host"] = process.env.JUDGE0_API_HOST;
  if (process.env.JUDGE0_AUTH_TOKEN) headers["X-Auth-Token"] = process.env.JUDGE0_AUTH_TOKEN;
  return headers;
}
function judgeUrl(path) {
  return `${process.env.JUDGE0_URL.replace(/\/$/, "")}${path}`;
}
function normalizeOutput(value) {
  return String(value ?? "").replace(/\r\n/g, "\n").trim();
}
function isTerminal(result) {
  return TERMINAL_JUDGE_IDS.has(Number(result?.status?.id));
}
async function fetchJudgeResult(token) {
  const response = await fetch(judgeUrl(`/submissions/${encodeURIComponent(token)}?base64_encoded=false&fields=token,stdout,stderr,status,language_id,time,memory,compile_output,message`), {
    headers: judgeHeaders()
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.message || `Judge0 returned HTTP ${response.status}`);
  return data;
}
async function refreshSubmission(sub) {
  if (!process.env.JUDGE0_URL || !sub.judgeTokens?.length) return sub;
  const pending = [];
  for (const item of sub.judgeTokens) {
    const old = sub.testResults[item.caseIndex] || {};
    if (old.status && old.status !== "In Queue" && old.status !== "Processing") continue;
    try {
      const result = await fetchJudgeResult(item.token);
      const description = result.status?.description || "Processing";
      const expected = old.expectedOutput ?? "";
      const actual = result.stdout ?? "";
      let caseStatus = description;
      if (isTerminal(result)) {
        if (Number(result.status.id) === 3 && normalizeOutput(actual) !== normalizeOutput(expected)) caseStatus = "Wrong Answer";
        else if (Number(result.status.id) === 3) caseStatus = "Accepted";
      } else {
        pending.push(item);
      }
      sub.testResults[item.caseIndex] = {
        input: old.input || "",
        expectedOutput: expected,
        actualOutput: actual,
        status: caseStatus,
        time: result.time || "",
        memory: result.memory || 0,
        stderr: result.stderr || "",
        compileOutput: result.compile_output || ""
      };
    } catch (error) {
      pending.push(item);
      sub.result = error.message;
    }
  }

  const finished = sub.testResults.filter(x => x && TERMINAL_JUDGE_IDS.has(
    ({ "Accepted":3, "Wrong Answer":4, "Time Limit Exceeded":5, "Compilation Error":6,
       "Runtime Error (SIGSEGV)":7, "Runtime Error (SIGXFSZ)":8, "Runtime Error (SIGFPE)":9,
       "Runtime Error (SIGABRT)":10, "Runtime Error (NZEC)":11, "Runtime Error (Other)":12,
       "Internal Error":13, "Exec Format Error":14 })[x.status]
  ));
  const total = sub.totalTests || sub.judgeTokens.length;
  const passed = sub.testResults.filter(x => x?.status === "Accepted").length;
  sub.passedTests = passed;
  sub.totalTests = total;
  sub.score = total ? Math.round(((passed / total) * (sub.problem?.points || 100)) * 100) / 100 : 0;
  const allComplete = sub.testResults.length === total && finished.length === total;
  if (allComplete) {
    if (passed === total) sub.status = "Accepted";
    else if (sub.testResults.some(x => x?.status === "Compilation Error")) sub.status = "Compilation Error";
    else if (sub.testResults.some(x => x?.status === "Time Limit Exceeded")) sub.status = "Time Limit Exceeded";
    else if (sub.testResults.some(x => String(x?.status || "").startsWith("Runtime Error"))) sub.status = "Runtime Error";
    else sub.status = "Wrong Answer";
    const times = sub.testResults.map(x => Number(x?.time || 0));
    sub.executionTime = times.reduce((a,b) => a+b, 0).toFixed(3) + " s";
    sub.memory = Math.max(0, ...sub.testResults.map(x => Number(x?.memory || 0)));
    sub.stdout = sub.testResults.map((x,i) => `Test ${i+1}: ${x?.actualOutput || ""}`).join("\n");
    sub.stderr = sub.testResults.map(x => x?.stderr).filter(Boolean).join("\n");
    sub.compileOutput = sub.testResults.map(x => x?.compileOutput).filter(Boolean).join("\n");
    sub.result = `${passed}/${total} test cases passed`;
  } else {
    sub.status = "Running";
    sub.result = `${passed}/${total} test cases completed`;
  }
  await sub.save();
  return sub;
}

router.get("/problems", protect, async (req,res) => {
  const problems = await CodingProblem.find({ active: true }).select("-testCases -__v").sort({ createdAt: -1 });
  res.json(problems);
});

router.post("/problems", protect, allow("admin"), async (req,res) => {
  const payload = { ...req.body, createdBy: req.user._id };
  if (!payload.title || !payload.statement) return res.status(400).json({ message: "Problem title and statement are required" });
  const tests = Array.isArray(payload.testCases) ? payload.testCases : [];
  const examples = Array.isArray(payload.examples) ? payload.examples : [];
  payload.testCases = tests.length ? tests : examples.map(x => ({ input: x.input || "", output: x.output }));
  if (!payload.testCases.length || payload.testCases.some(x => x.output === undefined || x.output === null))
    return res.status(400).json({ message: "Add at least one valid test case with input and expected output" });
  res.status(201).json(await CodingProblem.create(payload));
});

router.delete("/problems/:id", protect, allow("admin"), async (req,res) => {
  const deleted = await CodingProblem.findByIdAndDelete(req.params.id);
  if (!deleted) return res.status(404).json({ message: "Coding problem not found" });
  res.json({ message: "Coding problem deleted" });
});

router.get("/submissions", protect, allow("admin"), async (req,res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.problemId) filter.problem = req.query.problemId;
  if (req.query.studentId) filter.student = req.query.studentId;
  const rows = await CodingSubmission.find(filter)
    .populate("student", "name email")
    .populate("problem", "title difficulty points")
    .sort({ createdAt: -1 }).limit(500).lean();
  const [total, accepted, queued] = await Promise.all([
    CodingSubmission.countDocuments(),
    CodingSubmission.countDocuments({ status: "Accepted" }),
    CodingSubmission.countDocuments({ status: { $in: ["Queued", "Running", "Submitted to Judge0"] } })
  ]);
  res.json({ rows, stats: { total, accepted, queued, acceptanceRate: total ? Math.round(accepted / total * 100) : 0 } });
});

router.get("/submissions/mine", protect, allow("student"), async (req,res) =>
  res.json(await CodingSubmission.find({ student: req.user._id }).select("-testResults.expectedOutput -judgeTokens").populate("problem","title difficulty points").sort({ createdAt:-1 }))
);

router.get("/submissions/:id/result", protect, async (req,res) => {
  let sub = await CodingSubmission.findById(req.params.id).select("+testResults.expectedOutput").populate("problem", "title difficulty points");
  if (!sub) return res.status(404).json({ message: "Submission not found" });
  if (req.user.role !== "admin" && String(sub.student) !== String(req.user._id)) return res.status(403).json({ message: "Not allowed" });
  try {
    if (sub.status === "Running" && process.env.JUDGE0_URL) sub = await refreshSubmission(sub);
  } catch (error) {
    sub.result = `Judge0 check failed: ${error.message}`;
    await sub.save();
  }
  const safe = sub.toObject();
  if (req.user.role !== "admin") {
    safe.testResults = (safe.testResults || []).map(x => { delete x.expectedOutput; return x; });
    delete safe.judgeTokens;
    delete safe.sourceCode;
  }
  res.json({ submission: safe, judgeConfigured: !!process.env.JUDGE0_URL });
});

router.post("/submit", protect, allow("student"), async (req,res) => {
  const { problemId, language, sourceCode } = req.body;
  if (!problemId || !language || !String(sourceCode || "").trim()) return res.status(400).json({ message: "Problem, language and source code are required" });
  if (!ALLOWED_LANGUAGES.has(String(language))) return res.status(400).json({ message: "Choose Python 3, Java, C++ or C" });
  if (!process.env.JUDGE0_URL) return res.status(503).json({ message: "Judge0 is not configured. Add JUDGE0_URL to your .env file first." });
  const problem = await CodingProblem.findById(problemId);
  if (!problem || !problem.active) return res.status(404).json({ message: "Coding problem not found" });
  const testCases = problem.testCases?.length ? problem.testCases : (problem.examples || []);
  if (!testCases.length) return res.status(400).json({ message: "This problem has no test cases. Ask an admin to add test cases." });
  if (testCases.length > 10) return res.status(400).json({ message: "A maximum of 10 test cases is supported per problem right now." });

  const sub = await CodingSubmission.create({
    student: req.user._id, problem: problemId, language: LANGUAGE_NAMES[String(language)],
    sourceCode, status: "Running", score: 0, totalTests: testCases.length,
    testResults: testCases.map(tc => ({ input: tc.input || "", expectedOutput: String(tc.output), status: "In Queue" }))
  });

  try {
    const tokens = [];
    for (let i = 0; i < testCases.length; i++) {
      const tc = testCases[i];
      const response = await fetch(judgeUrl(`/submissions?base64_encoded=false&wait=false`), {
        method: "POST",
        headers: judgeHeaders(true),
        body: JSON.stringify({
          source_code: sourceCode,
          language_id: Number(language),
          stdin: tc.input || "",
          expected_output: String(tc.output),
          cpu_time_limit: 5,
          wall_time_limit: 10,
          memory_limit: 256000
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.token) throw new Error(data.error || data.message || `Judge0 returned HTTP ${response.status}`);
      tokens.push({ token: data.token, caseIndex: i });
    }
    sub.judgeTokens = tokens;
    await sub.save();
    res.status(201).json({
      submission: { _id: sub._id, status: sub.status, score: sub.score, totalTests: sub.totalTests },
      message: `Submitted to Judge0. Running ${testCases.length} test cases.`
    });
  } catch (error) {
    sub.status = "Judge service unavailable";
    sub.result = error.message;
    await sub.save();
    res.status(502).json({ message: `Judge0 submission failed: ${error.message}`, submissionId: sub._id });
  }
});

module.exports = router;
