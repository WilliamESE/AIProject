import express from "express";
import { embedTexts } from "../embed.js";
import { upsertVectors } from "../pinecone.js";
import { chunkText } from "../chunk.js";
import { scrapeText } from "../scraper.js";
import { isHttpUrl, cleanUrl, safeSlice, newId, ok, userError } from "../utilities.js";

export function buildIngestRouter() {
  const router = express.Router();

  /**
   * POST /ingest-one
   * Body: { 
   *    url: string, 
   *    title?: string, 
   *    text: string, 
   *    namespace?: string 
   * }
   * Single vector upsert with a short snippet for chat context.
   */
  router.post("/ingest-one", async (req, res) => {
    const startedAt = Date.now();

    try {
      const { url, title = "", text, namespace } = req.body || {};

      if (!url || !isHttpUrl(url)) {
        return res.status(400).json(userError("Please provide a valid HTTP(S) 'url'."));
      }
      if (!text || typeof text !== "string" || !text.trim()) {
        return res.status(400).json(userError("Please provide non-empty 'text'."));
      }

      const clean = cleanUrl(url);

      //Limit the text we embed to something reasonable (OpenAI handles longer,
      //    but keeping it bounded helps costs + latency).
      const embedInput = safeSlice(text, 5000);
      const [vec] = await embedTexts([embedInput]);

      const vector = {
        id: newId("one"),
        values: vec,
        metadata: {
          url: clean,
          title: safeSlice(title, 300),
          text: safeSlice(text, 800) //short snippet for grounding
        }
      };

      const { upsertedCount } = await upsertVectors([vector], { namespace });

      return res.json(
        ok({
          url: clean,
          namespace: namespace ?? null,
          upserted: upsertedCount || 0,
          took_ms: Date.now() - startedAt
        })
      );
    } catch (err) {
      console.error("[/ingest-one] error", {
        message: err?.message,
        name: err?.name,
        stack: err?.stack
      });

      return res
        .status(500)
        .json(userError("Upsert failed. Please try again.", "server_error"));
    }
  });

  /**
   * POST /ingest-url-chunks
   * Body: { 
   *    url: string, 
   *    title?: string, 
   *    namespace?: string 
   * }
   * scrape -> chunk -> embed -> upsert (multi-vector)
   */
  router.post("/ingest-url-chunks", async (req, res) => {
    const startedAt = Date.now();

    try {
      const { url, title = "", namespace } = req.body || {};
      if (!url || !isHttpUrl(url)) {
        return res.status(400).json(userError("Please provide a valid HTTP(S) 'url'."));
      }

      const clean = cleanUrl(url);

      //Scrape full page text
      const text = await scrapeText(clean);
      if (!text || !text.trim()) {
        return res
          .status(422)
          .json(userError("The page had no readable text to ingest.", "no_content"));
      }

      //Chunk the page into overlapping segments for better retrieval
      const chunks = chunkText(text, 1200, 150);
      if (!chunks.length) {
        return res
          .status(422)
          .json(userError("No chunks were produced from the page text.", "no_chunks"));
      }

      const embeddings = await embedTexts(chunks);
      const now = Date.now();

      const vectors = embeddings.map((vec, i) => ({
        id: `${now}-${i}`,
        values: vec,
        metadata: {
          url: clean,
          title: safeSlice(title, 300),
          chunk: i,
          text: safeSlice(chunks[i], 800)
        }
      }));

      const { upsertedCount } = await upsertVectors(vectors, { namespace });

      return res.json(
        ok({
          url: clean,
          namespace: namespace ?? null,
          chunks: chunks.length,
          upserted: upsertedCount || 0,
          took_ms: Date.now() - startedAt
        })
      );
    } catch (err) {
      console.error("[/ingest-url-chunks] error", {
        message: err?.message,
        name: err?.name,
        stack: err?.stack
      });

      return res.status(500).json(
        userError("Ingestion failed. Please try again or check the URL.", "server_error")
      );
    }
  });

  return router;
}
