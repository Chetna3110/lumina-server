require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { GoogleGenAI } = require("@google/genai");

const app = express();
app.use(cors());
app.use(express.json());

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

const SYSTEM_PROMPT = `You are Lumina, a warm, calm emotional well-being companion inside a mobile app.

Style:
- Talk like a kind, grounded friend. Short replies (2-5 sentences). No bullet lists, no headings.
- Reflect what the person said, validate their feelings, and gently ask at most one question.
- Offer small, practical ideas when helpful (a breathing exercise, a short walk, writing a thought down). The app has a Calm Space breathing exercise you can suggest.

Boundaries:
- You are not a therapist and you do not diagnose or give medical advice. If someone seems to be struggling a lot over time, gently encourage talking to a trusted person or a mental health professional.
- If the person mentions suicide, self-harm, or being in danger, respond with warmth and care, take it seriously, encourage them to contact local emergency services or a crisis helpline right now and to reach out to someone they trust. Do not give methods or details. Stay supportive.
- Never claim to be human.`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Retry when Gemini is busy (503) or rate limited (429)
async function generateWithRetry(contents) {
  const maxAttempts = 4;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await ai.models.generateContent({
        model: MODEL,
        contents,
        config: {
          systemInstruction: SYSTEM_PROMPT,
          maxOutputTokens: 400,
        },
      });
    } catch (err) {
      const retryable = err.status === 503 || err.status === 429;
      if (!retryable || attempt === maxAttempts) throw err;

      const wait = attempt * 1500; // 1.5s, 3s, 4.5s
      console.log(`Gemini busy (${err.status}), retry ${attempt} in ${wait}ms`);
      await sleep(wait);
    }
  }
}

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.post("/chat", async (req, res) => {
  try {
    const { messages } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages is required" });
    }

    // keep the last 20 messages, limit size, convert to Gemini's format
    const contents = messages.slice(-20).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: String(m.content).slice(0, 2000) }],
    }));

    const response = await generateWithRetry(contents);

    res.json({ reply: response.text || "I'm here with you. Can you say that again?" });
  } catch (err) {
    console.error("Chat error:", err.status, err.message);
    res.status(500).json({ error: "Something went wrong" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Lumina server running on port ${PORT}`);
});