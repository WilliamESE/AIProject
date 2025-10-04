import express from "express";
import { queryVector } from "../pinecone.js";
import { embedTexts } from "../embed.js";
import { normalizeTopK, ok, userError } from "../utilities.js";

/* ---------- router ---------- */
export function buildQueryRouter() {
  const router = express.Router();

  /**
   * POST /query
   * Body: { 
   *    question: string, 
   *    topK?: number, 
   *    namespace?: string 
   * }
   * Returns vector search matches (score, url, title, snippet).
   */
  router.post("/query", async (req, res) => {
    const startedAt = Date.now();

    try {
      const { question, topK, namespace } = req.body || {};

      if (!question || typeof question !== "string" || !question.trim()) {
        return res
          .status(400)
          .json(userError("Please include a non-empty 'question' string."));
      }

      const k = normalizeTopK(topK, 5);

      //embed the questin and retrieve nearest neighbours
      const [qVec] = await embedTexts([question]);
      const matches = await queryVector(qVec, k, { namespace });

      const results = (matches || []).map((m) => ({
        score: m?.score ?? null,
        url: m?.metadata?.url || null,
        title: m?.metadata?.title || null,
        snippet: safeString(m?.metadata?.text, 800),
      }));

      return res.json(
        ok({
          question: question.trim(),
          namespace: namespace ?? null,
          topK: k,
          count: results.length,
          results,
          took_ms: Date.now() - startedAt,
        })
      );
    } catch (err) {
      console.error("[/query] error", {
        message: err?.message,
        name: err?.name,
        stack: err?.stack,
      });

      return res
        .status(500)
        .json(userError("Query failed. Please try again.", "server_error"));
    }
  });

  return router;
}
