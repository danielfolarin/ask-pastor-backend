import "dotenv/config";
import express from "express";
import fetch, { Blob, FormData } from "node-fetch";
import fs from "node:fs";
import { promises as fsp } from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "32kb" }));
app.use(express.static(path.join(__dirname, "public")));

const logFile = path.resolve(__dirname, process.env.LOG_FILE || "data/question-logs.jsonl");

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

app.use((req, res, next) => {
  const origin = req.headers.origin || "";
  if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin || "*");
    res.header("Vary", "Origin");
  }
  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

const rateLimits = new Map();
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = Number(process.env.RATE_LIMIT_MAX || 20);

app.use(["/ask", "/transcribe", "/feedback"], (req, res, next) => {
  const now = Date.now();
  const key = req.ip || "unknown";
  const current = rateLimits.get(key);
  if (!current || now - current.startedAt > RATE_WINDOW_MS) {
    rateLimits.set(key, { startedAt: now, count: 1 });
    return next();
  }
  current.count += 1;
  if (current.count > RATE_MAX) {
    return res.status(429).json({ error: "Please wait a few minutes before asking another question." });
  }
  next();
});

const knowledgeDir = path.join(__dirname, "knowledge");
const assistantInstructions = fs.readFileSync(path.join(knowledgeDir, "ASSISTANT_INSTRUCTIONS.md"), "utf8");
const convictions = fs.readFileSync(path.join(knowledgeDir, "CONVICTIONS.md"), "utf8");
const voiceGuide = fs.readFileSync(path.join(knowledgeDir, "VOICE_GUIDE.md"), "utf8");
const chunks = fs
  .readFileSync(path.join(knowledgeDir, "retrieval-chunks.jsonl"), "utf8")
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line));

const stopWords = new Set([
  "about", "after", "again", "against", "also", "because", "been", "before", "being", "between",
  "could", "does", "from", "have", "into", "just", "more", "most", "other", "should", "some",
  "than", "that", "their", "them", "then", "there", "these", "they", "this", "those", "through",
  "very", "what", "when", "where", "which", "while", "with", "would", "your"
]);

function terms(text) {
  return [...new Set(
    text.toLowerCase().match(/[a-z0-9']{3,}/g)?.filter((word) => !stopWords.has(word)) || []
  )];
}

function retrieve(question, limit = 6) {
  const queryTerms = terms(question);
  const phrase = question.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  return chunks
    .map((chunk) => {
      const text = chunk.text.toLowerCase();
      let score = chunk.source_role === "controlling" ? 3 : chunk.source_role === "primary" ? 1.5 : 0;
      for (const term of queryTerms) {
        const matches = text.split(term).length - 1;
        score += Math.min(matches, 5) * (term.length > 7 ? 2.2 : 1);
        if (chunk.title.toLowerCase().includes(term)) score += 3;
      }
      if (phrase.length > 12 && text.includes(phrase)) score += 12;
      return { ...chunk, score };
    })
    .filter((chunk) => chunk.score > 2)
    .sort((a, b) => b.score - a.score)
    .filter((chunk, index, all) =>
      all.findIndex((item) => item.document_id === chunk.document_id && item.page_start === chunk.page_start) === index
    )
    .slice(0, limit);
}

function safetyResponse(question) {
  const text = question.toLowerCase();
  if (/(suicid|kill myself|harm(?:ing)? myself|end my life|want to die)/.test(text)) {
    return "I am truly sorry you are carrying this much pain. You matter, and you should not face this moment alone. If you may act on these thoughts, call emergency services now. In the United States or Canada, call or text 988. Please also contact a trusted person who can stay with you. Ask Pastor Daniel AI cannot provide crisis care, but seeking immediate help is an act of courage, not a failure of faith.";
  }
  if (/(abuse|abusive|beating me|hits me|unsafe at home|threatening me)/.test(text)) {
    return "Your safety matters. Christian teaching does not require you to remain in immediate danger. Move to a safe place if you can, contact local emergency services when necessary, and reach out to a trusted person or domestic-violence service. A qualified counselor, advocate, and trusted pastor can help you consider the next steps without using Scripture to minimize abuse.";
  }
  return null;
}

function cleanHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .slice(-8)
    .filter((item) => item && typeof item.text === "string" && item.text.trim())
    .map((item) => ({
      role: item.role === "assistant" || item.role === "Pastor Daniel AI" ? "assistant" : "user",
      content: item.text.trim().slice(0, 4000)
    }));
}

function sourceList(retrieved) {
  return retrieved.map((source) => ({
    title: source.title,
    page: source.page_start,
    role: source.source_role
  }));
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[char]);
}

function csvValue(value = "") {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function requestLocation(req) {
  return {
    country: req.get("cf-ipcountry") || req.get("x-vercel-ip-country") || req.get("x-country") || "",
    city: decodeURIComponent(req.get("x-vercel-ip-city") || req.get("x-appengine-city") || req.get("x-city") || "")
  };
}

function detectDevice(userAgent = "") {
  const value = userAgent.toLowerCase();
  const device = /ipad|tablet/.test(value) ? "tablet" : /mobile|iphone|android/.test(value) ? "mobile" : "desktop";
  const browser =
    /edg\//.test(value) ? "Edge" :
    /chrome|crios/.test(value) ? "Chrome" :
    /safari/.test(value) ? "Safari" :
    /firefox|fxios/.test(value) ? "Firefox" :
    "Unknown";
  return `${device} / ${browser}`;
}

async function ensureLogDir() {
  await fsp.mkdir(path.dirname(logFile), { recursive: true });
}

async function saveQuestionLog(req, { question, answer, feedbackRating = "" }) {
  const userAgent = req.get("user-agent") || "";
  const location = requestLocation(req);
  const record = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    question,
    answer,
    pageUrl: typeof req.body?.pageUrl === "string" ? req.body.pageUrl.slice(0, 500) : "",
    country: location.country,
    city: location.city,
    ip: req.ip || "",
    userAgent,
    device: detectDevice(userAgent),
    feedbackRating
  };
  await ensureLogDir();
  await fsp.appendFile(logFile, `${JSON.stringify(record)}\n`, "utf8");
  return record.id;
}

async function readLogs() {
  try {
    const text = await fsp.readFile(logFile, "utf8");
    return text
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function updateFeedback(logId, rating) {
  const logs = await readLogs();
  let updated = false;
  for (const log of logs) {
    if (log.id === logId) {
      log.feedbackRating = rating;
      updated = true;
      break;
    }
  }
  if (!updated) return false;
  await ensureLogDir();
  const tempFile = `${logFile}.${process.pid}.tmp`;
  await fsp.writeFile(tempFile, logs.map((log) => JSON.stringify(log)).join("\n") + "\n", "utf8");
  await fsp.rename(tempFile, logFile);
  return true;
}

function filterLogs(logs, query = "") {
  const needle = query.trim().toLowerCase();
  if (!needle) return logs;
  return logs.filter((log) =>
    [log.question, log.answer, log.pageUrl, log.country, log.city, log.userAgent, log.device, log.feedbackRating]
      .some((value) => String(value || "").toLowerCase().includes(needle))
  );
}

function checkPassword(value = "") {
  const expected = process.env.ADMIN_PASSWORD || "";
  if (!expected || !value) return false;
  const actualBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function requireAdmin(req, res, next) {
  if (!process.env.ADMIN_PASSWORD) {
    return res.status(503).send("Admin dashboard is not configured. Set ADMIN_PASSWORD in Render.");
  }
  const header = req.get("authorization") || "";
  const [scheme, encoded] = header.split(" ");
  if (scheme === "Basic" && encoded) {
    const [, password = ""] = Buffer.from(encoded, "base64").toString("utf8").split(":");
    if (checkPassword(password)) {
      res.set("Cache-Control", "no-store");
      return next();
    }
  }
  res.set("WWW-Authenticate", 'Basic realm="Ask Pastor Daniel Admin"');
  return res.status(401).send("Authentication required.");
}

function adminPage(logs, query) {
  const rows = logs.slice(0, 500).map((log) => `
    <tr>
      <td>${escapeHtml(log.timestamp)}</td>
      <td>${escapeHtml(log.question)}</td>
      <td>${escapeHtml(log.answer)}</td>
      <td>${escapeHtml([log.city, log.country].filter(Boolean).join(", "))}</td>
      <td>${escapeHtml(log.device)}<br><small>${escapeHtml(log.userAgent)}</small></td>
      <td>${escapeHtml(log.feedbackRating || "—")}</td>
      <td><a href="${escapeHtml(log.pageUrl)}" target="_blank" rel="noopener noreferrer">Page</a></td>
    </tr>
  `).join("");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Ask Pastor Daniel AI Admin</title>
  <style>
    :root { color-scheme: light; --green: #1d5b42; --cream: #f7f4ec; --line: rgba(29,91,66,.16); }
    body { margin: 0; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--cream); color: #17211b; }
    main { max-width: 1180px; margin: auto; padding: 32px 18px; }
    header { display: flex; gap: 14px; justify-content: space-between; align-items: end; margin-bottom: 22px; }
    h1 { margin: 0; font-size: clamp(28px, 4vw, 44px); letter-spacing: -.04em; }
    p { color: #637068; }
    form { display: flex; gap: 8px; margin: 18px 0; }
    input { flex: 1; border: 1px solid var(--line); border-radius: 12px; padding: 12px; font: inherit; }
    button, .button { border: 0; border-radius: 12px; padding: 12px 14px; background: var(--green); color: white; font: inherit; font-weight: 700; text-decoration: none; cursor: pointer; }
    .panel { overflow: auto; background: rgba(255,255,252,.82); border: 1px solid var(--line); border-radius: 18px; box-shadow: 0 18px 50px rgba(38,52,43,.08); }
    table { width: 100%; border-collapse: collapse; min-width: 980px; }
    th, td { padding: 12px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; font-size: 13px; }
    th { color: var(--green); font-size: 11px; text-transform: uppercase; letter-spacing: .1em; }
    td:nth-child(2), td:nth-child(3) { max-width: 310px; }
    small { color: #637068; }
    @media (max-width: 720px) { header, form { display: block; } .button, button { display: inline-block; margin-top: 8px; } }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <h1>Question Logs</h1>
        <p>${logs.length} matching records. Showing newest 500.</p>
      </div>
      <a class="button" href="/admin/export.csv?q=${encodeURIComponent(query)}">Export CSV</a>
    </header>
    <form method="get" action="/admin">
      <input name="q" value="${escapeHtml(query)}" placeholder="Search questions, answers, location, device, or feedback">
      <button type="submit">Search</button>
    </form>
    <div class="panel">
      <table>
        <thead><tr><th>Timestamp</th><th>Question</th><th>Answer</th><th>Location</th><th>Device</th><th>Feedback</th><th>URL</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="7">No logs yet.</td></tr>'}</tbody>
      </table>
    </div>
  </main>
</body>
</html>`;
}

app.get("/health", (req, res) => {
  res.json({ status: "ok", sources: chunks.length, model_configured: Boolean(process.env.MODEL_API_KEY) });
});

app.get("/admin", requireAdmin, async (req, res) => {
  const query = typeof req.query.q === "string" ? req.query.q : "";
  const logs = filterLogs(await readLogs(), query).sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
  res.type("html").send(adminPage(logs, query));
});

app.get("/admin/export.csv", requireAdmin, async (req, res) => {
  const query = typeof req.query.q === "string" ? req.query.q : "";
  const logs = filterLogs(await readLogs(), query).sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
  const header = ["timestamp", "question", "answer", "pageUrl", "country", "city", "device", "userAgent", "feedbackRating"];
  const csv = [
    header.join(","),
    ...logs.map((log) => header.map((key) => csvValue(log[key])).join(","))
  ].join("\n");
  res.set({
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": 'attachment; filename="ask-pastor-daniel-questions.csv"',
    "Cache-Control": "no-store"
  });
  res.send(csv);
});

app.post("/transcribe", express.raw({ type: ["audio/*", "application/octet-stream"], limit: "15mb" }), async (req, res) => {
  if (!process.env.MODEL_API_KEY) {
    return res.status(503).json({ error: "Voice transcription has not been configured yet." });
  }
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(400).json({ error: "No audio recording was received." });
  }

  const contentType = req.headers["content-type"]?.split(";")[0] || "audio/webm";
  const extension = contentType.includes("mp4") ? "m4a" : contentType.includes("ogg") ? "ogg" : "webm";
  const form = new FormData();
  form.append("file", new Blob([req.body], { type: contentType }), `question.${extension}`);
  form.append("model", process.env.TRANSCRIPTION_MODEL || "whisper-1");

  try {
    const response = await fetch(process.env.TRANSCRIPTION_API_URL || "https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.MODEL_API_KEY}` },
      body: form
    });
    const data = await response.json();
    if (!response.ok) {
      console.error("Transcription provider error", response.status, data?.error?.message || data);
      if (response.status === 429) {
        return res.status(503).json({ error: "Voice transcription needs active model credits." });
      }
      return res.status(502).json({ error: "The recording could not be transcribed. Please try again." });
    }
    const text = data?.text?.trim();
    if (!text) return res.status(502).json({ error: "No speech was detected in the recording." });
    res.json({ text });
  } catch (error) {
    console.error(error);
    res.status(502).json({ error: "Voice transcription is temporarily unavailable." });
  }
});

app.post("/ask", async (req, res) => {
  const question = typeof req.body?.question === "string" ? req.body.question.trim() : "";
  if (!question) return res.status(400).json({ error: "Please enter a question." });
  if (question.length > 3000) return res.status(400).json({ error: "Please shorten your question." });

  const urgentAnswer = safetyResponse(question);
  if (urgentAnswer) {
    const logId = await saveQuestionLog(req, { question, answer: urgentAnswer });
    return res.json({ answer: urgentAnswer, sources: [], logId });
  }

  if (!process.env.MODEL_API_URL || !process.env.MODEL_API_KEY || !process.env.MODEL_NAME) {
    const error = "The AI model has not been configured yet.";
    const logId = await saveQuestionLog(req, { question, answer: error });
    return res.status(503).json({ error, logId });
  }

  const retrieved = retrieve(question);
  const context = retrieved.length
    ? retrieved.map((source, index) =>
        `[Source ${index + 1}: ${source.title}, page ${source.page_start}, role: ${source.source_role}]\n${source.text}`
      ).join("\n\n")
    : "No directly relevant source passage was retrieved.";

  const system = `${assistantInstructions}

The following summaries guide your theology and style:

${convictions}

${voiceGuide}

Use only the supplied retrieved passages when claiming Pastor Daniel's documented position. Include a short "Sources" section at the end listing only sources you actually used, with title and page. Never fabricate a citation.

RETRIEVED PASSAGES:
${context}

FINAL RESPONSE GUIDANCE:
Answer in Pastor Daniel's documented theological voice, not as a generic
evangelical summary. For passage questions, help the reader observe the text
before explaining it. Notice literary movement, repeated words, cultural
context, canonical connections, and Christological significance where
relevant. Briefly acknowledge legitimate orthodox alternatives when needed.
Use a warm conversational flow with only essential headings or bullets. Never
use boilerplate sections titled "Key Themes," "Conclusion," "Reflection,"
"Observations and Themes," "Christological Significance," or "Pastoral
Application." Do not merely retell the passage.`;

  try {
    const response = await fetch(process.env.MODEL_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.MODEL_API_KEY}`
      },
      body: JSON.stringify({
        model: process.env.MODEL_NAME,
        temperature: 0.35,
        messages: [
          { role: "system", content: system },
          ...cleanHistory(req.body?.history),
          { role: "user", content: question }
        ]
      })
    });

    const data = await response.json();
    if (!response.ok) {
      console.error("Model provider error", response.status, data?.error?.message || data);
      if (response.status === 429) {
        const error = "Ask Pastor Daniel AI needs active model credits before it can answer ordinary questions.";
        const logId = await saveQuestionLog(req, { question, answer: error });
        return res.status(503).json({
          error,
          logId
        });
      }
      const error = "The answer service is temporarily unavailable.";
      const logId = await saveQuestionLog(req, { question, answer: error });
      return res.status(502).json({ error, logId });
    }
    const answer = data?.choices?.[0]?.message?.content?.trim();
    if (!answer) return res.status(502).json({ error: "The answer service returned an empty response." });
    const logId = await saveQuestionLog(req, { question, answer });
    res.json({ answer, sources: sourceList(retrieved), logId });
  } catch (error) {
    console.error(error);
    const message = "There was an error generating a response. Please try again.";
    try {
      const logId = await saveQuestionLog(req, { question, answer: message });
      res.status(502).json({ error: message, logId });
    } catch {
      res.status(502).json({ error: message });
    }
  }
});

app.post("/feedback", async (req, res) => {
  const logId = typeof req.body?.logId === "string" ? req.body.logId : "";
  const rating = typeof req.body?.rating === "string" ? req.body.rating : "";
  if (!logId || !["helpful", "not-helpful"].includes(rating)) {
    return res.status(400).json({ error: "Invalid feedback." });
  }
  const updated = await updateFeedback(logId, rating);
  if (!updated) return res.status(404).json({ error: "Log entry not found." });
  res.json({ ok: true });
});

app.use((req, res) => res.status(404).json({ error: "Not found" }));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Ask Pastor Daniel AI running on ${PORT}`));
