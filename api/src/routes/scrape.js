import express from "express";
import { scrapeText } from "../scraper.js";
import { isHttpUrl, cleanUrl, safeSlice, ok, userError } from "../utilities.js";

/* ---------- router ---------- */
export function buildScrapeRouter() {
  const router = express.Router();

  /**
   * POST/GET /scrape
   * Query/Body: { 
   *    url: string 
   * }
   * Returns a short preview of the page text plus length.
   */
  router.all("/scrape", async (req, res) => {
    const startedAt = Date.now();

    try {
      const urlRaw = req.body?.url || req.query?.url;

      if (!urlRaw || typeof urlRaw !== "string") {
        return res
          .status(400)
          .json(userError("Please provide a url as a string."));
      }
      if (!isHttpUrl(urlRaw)) {
        return res
          .status(400)
          .json(userError("Please provide a valid HTTPS or HTTP url."));
      }

      const url = cleanUrl(urlRaw);

      const text = await scrapeText(url);
      if (!text || !text.trim()) {
        return res
          .status(422)
          .json(userError("No readable text found at the provided url.", "no_content", { url }));
      }

      return res.json(
        ok({
          url,
          length: text.length,
          preview: safeSlice(text, 1500),
          took_ms: Date.now() - startedAt,
        })
      );
    } catch (err) {
      console.error("[/scrape] error", {
        message: err?.message,
        name: err?.name,
        stack: err?.stack,
      });

      return res
        .status(500)
        .json(userError("Scrape failed. Please try again.", "server_error"));
    }
  });

  return router;
}
