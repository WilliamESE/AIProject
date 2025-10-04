import express from "express";
import OpenAI from "openai";
import { embedTexts } from "../embed.js";
import { queryVector } from "../pinecone.js";
import { normalizeTopK, userError } from "../utilities.js";

const MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";

function trim(str = "", max = 1200) {
  if (str.length <= max) return str;
  return `${str.slice(0, max)}…`;
}

function buildPrompt(question, matches) {
  const sourcesBlock = matches
    .map((m, i) => {
      const title = m.metadata?.title || "Untitled";
      const url = m.metadata?.url || "Unknown URL";
      const text = trim(m.metadata?.text || "", 1500);
      return `# Source ${i + 1}
Title: ${title}
URL: ${url}
Text:
${text}`;
    })
    .join("\n\n");

  const system = [
    "You’re a clear, concise research assistant.",
    "Answer using ONLY the sources below.",
    "If the sources don’t cover the question, say you don’t know.",
    "Cite like [1], [2] right after the sentence that uses that source.",
    "Keep answers direct and free of filler."
  ].join(" ");

  const user = `Question:
${question}

Sources:
${sourcesBlock}`;

  return { system, user };
}

export function buildChatRouter() {
  const router = express.Router();
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  router.post("/chat", async (req, res) => {
    const startedAt = Date.now();

    try {
      const { question, topK, namespace } = req.body || {};

      //Basic validation
      if (!question || typeof question !== "string" || !question.trim()) {
        return res.status(400).json(
          userError("Please include a non-empty 'question' string.")
        );
      }

      const k = normalizeTopK(topK, 5);

      //Embed the question and get candidates
      const [qVec] = await embedTexts([question]);
      const matches = await queryVector(qVec, k, { namespace });

      if (!matches?.length) {
        return res.json({
          answer:
            "I don’t know based on the sources I have. (No relevant passages were found in this workspace.)",
          sources: []
        });
      }

      //Build the prompt
      const { system, user } = buildPrompt(question, matches);

      const completion = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ],
        temperature: 0.2
      });

      const answer =
        completion.choices?.[0]?.message?.content?.trim() ||
        "I don’t know based on the sources provided.";

      const sources = matches.map((m, i) => ({
        id: i + 1,
        url: m?.metadata?.url || null,
        title: m?.metadata?.title || null,
        score: m?.score ?? null
      }));

      res.json({ answer, sources, took_ms: Date.now() - startedAt });
    } catch (err) {
      //Log server errors
      console.error("[/chat] error", {
        message: err?.message,
        name: err?.name,
        stack: err?.stack
      });

      //Handle errors
      const message =
        err?.message?.includes("rate limit") ||
        err?.message?.toLowerCase?.().includes("overloaded")
          ? "The answer engine is busy right now. Please try again."
          : "Something went wrong while generating the answer.";

      res.status(500).json(
        userError(message, "server_error", {
          took_ms: Date.now() - startedAt
        })
      );
    }
  });

  return router;
}
