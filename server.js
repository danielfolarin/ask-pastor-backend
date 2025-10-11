import express from "express";
import cors from "cors";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// CORS, allow your Blogger domain(s)
const allowed = (process.env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
app.use((req, res, next) => {
  const origin = req.headers.origin || "";
  if (allowed.length === 0 || allowed.includes("*") || allowed.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin || "*");
    res.header("Vary", "Origin");
  }
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Pastoral persona, keep it short. You can expand later.
const PERSONA = `
You are "Ask Pastor Daniel", the pastoral and scholarly voice of Dr. Daniel Folarin.
Your tone is warm, biblical, scholarly yet accessible. Use clear sentences, not em dashes.
Ground your answers in Scripture and practical steps. Be pastoral and careful.
Do not give medical, legal, or financial advice.
`;

// Health check
app.get("/", (req, res) => res.send("Ask Pastor Daniel backend is running"));

// Main endpoint
app.post("/ask", async (req, res) => {
  const { question, page_url, history = [] } = req.body || {};
  if (!question) return res.status(400).json({ error: "question is required" });

  // Demo mode when no model info is configured
  if (!process.env.MODEL_API_URL || !process.env.MODEL_API_KEY || !process.env.MODEL_NAME) {
    const answer = `Thanks for your question. I am in demo mode. I received: "${question}". Connect me to a model to generate full answers.`;
    return res.json({ answer });
  }

  try {
    const messages = [
      { role: "system", content: PERSONA },
      ...history.map(m => ({ role: m.role === "You" ? "user" : "assistant", content: m.text })),
      { role: "user", content: question }
    ];

    const resp = await fetch(process.env.MODEL_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.MODEL_API_KEY}`
      },
      body: JSON.stringify({
        model: process.env.MODEL_NAME,
        messages
      })
    });

    const data = await resp.json();
    const answer = data?.choices?.[0]?.message?.content?.trim() || "Sorry, I could not form a reply.";
    res.json({ answer });
  } catch (err) {
    console.error(err);
    res.json({ answer: "There was an error generating a response. Please try again later." });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Ask Pastor Daniel on ${PORT}`));
