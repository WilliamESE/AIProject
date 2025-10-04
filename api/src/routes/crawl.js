import express from "express";
import * as cheerio from "cheerio";
import { chunkText } from "../chunk.js";
import { embedTexts } from "../embed.js";
import { upsertVectors } from "../pinecone.js";
import { scrapeText } from "../scraper.js";
import { isHttpUrl, cleanUrl, clampInt, sleep, ok, userError } from "../utilities.js";

const UA = "DocChatBot/1.0 (+https://example.com)";

// -------- functions --------

async function fetchHtml(url, { timeoutMs = 25000 } = {}) {
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "user-agent": UA, accept: "text/html,*/*" }
    });

    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const type = res.headers.get("content-type") || "";
    if (!type.includes("text/html")) throw new Error(`Not HTML: ${type}`);

    return await res.text();
  } finally {
    clearTimeout(to);
  }
}

function discoverLinks(html, baseUrl, { sameDomain = true, pathPrefix } = {}) {
  const $ = cheerio.load(html);
  const out = new Set();
  const base = new URL(baseUrl);
  const origin = base.origin;

  $("a[href]").each((_, a) => {
    const raw = $(a).attr("href");
    if (!raw) return;

    //ignore anchors and non-http protocols quickly
    if (raw.startsWith("#")) return;
    if (raw.startsWith("mailto:") || raw.startsWith("javascript:")) return;

    let u;
    try {
      u = new URL(raw, baseUrl);
    } catch {
      return;
    }
    if (!["http:", "https:"].includes(u.protocol)) return;
    if (sameDomain && u.origin !== origin) return;

    //PathPrefix filter
    if (pathPrefix && !u.pathname.startsWith(pathPrefix)) return;

    out.add(cleanUrl(u.toString()));
  });

  return Array.from(out);
}

// -------- router --------

export function buildCrawlRouter() {
  const router = express.Router();

  /**
   * POST /ingest-crawl
   * body: {
   *   startUrl: string,
   *   namespace?: string,
   *   pathPrefix?: string = "/docs",
   *   maxDepth?: number = 1,
   *   maxPages?: number = 50,
   *   delayMs?: number = 200,
   *   title?: string
   * }
   */
  router.post("/ingest-crawl", async (req, res) => {
    const startedAt = Date.now();

    try {
      let {
        startUrl,
        namespace,
        pathPrefix = "/docs",
        maxDepth = 1,
        maxPages = 50,
        delayMs = 200,
        title = ""
      } = req.body || {};

      //validation
      if (!startUrl || typeof startUrl !== "string" || !isHttpUrl(startUrl)) {
        return res
          .status(400)
          .json(userError("Please provide a valid HTTP(S) 'startUrl'."));
      }

      pathPrefix =
        typeof pathPrefix === "string" && pathPrefix.length
          ? (pathPrefix.startsWith("/") ? pathPrefix : `/${pathPrefix}`)
          : undefined;

      maxDepth = clampInt(maxDepth, { min: 0, max: 6, fallback: 1 });
      maxPages = clampInt(maxPages, { min: 1, max: 1000, fallback: 50 });
      delayMs = clampInt(delayMs, { min: 0, max: 5000, fallback: 200 });

      //crawl state
      const seen = new Set();
      const q = [{ url: cleanUrl(startUrl), depth: 0 }];
      let crawled = 0;
      let upserted = 0;

      //crawl loop
      while (q.length && crawled < maxPages) {
        const { url, depth } = q.shift();
        if (seen.has(url) || depth > maxDepth) continue;
        seen.add(url);

        //Fetch raw HTML (for link discovery and optional <title>)
        let html;
        try {
          html = await fetchHtml(url);
        } catch (e) {
          console.warn("[crawl] fetchHtml failed:", { url, error: e.message });
          continue;
        }

        //If no title was provided, try to use the page title
        let pageTitle = title;
        try {
          if (!pageTitle) {
            const $ = cheerio.load(html);
            const rawTitle = ($("title").first().text() || "").trim();
            if (rawTitle) pageTitle = rawTitle;
          }
        } catch {
          //Non-fatel
        }

        //Queue next links
        try {
          const links = discoverLinks(html, url, {
            sameDomain: true,
            pathPrefix
          });
          for (const l of links) {
            if (!seen.has(l)) q.push({ url: l, depth: depth + 1 });
          }
        } catch (e) {
          console.warn("[crawl] discoverLinks failed:", { url, error: e.message });
        }

        //Scrape cleaned text
        let text;
        try {
          text = await scrapeText(url);
        } catch (e) {
          console.warn("[crawl] scrapeText failed:", { url, error: e.message });
          continue;
        }

        //Chunk -> embed -> upsert
        try {
          const chunks = chunkText(text, 1200, 150);
          if (chunks.length) {
            const embeddings = await embedTexts(chunks);
            const now = Date.now();

            const vectors = embeddings.map((vec, i) => ({
              id: `${now}-${crawled}-${i}`,
              values: vec,
              metadata: {
                url,
                title: pageTitle || "", //prefer discovered title if available
                chunk: i,
                text: chunks[i].slice(0, 800)
              }
            }));

            const { upsertedCount } = await upsertVectors(vectors, { namespace });
            upserted += upsertedCount;
          }
        } catch (e) {
          console.warn("[crawl] upsert failed:", { url, error: e.message });
        }

        crawled += 1;
        if (delayMs) await sleep(delayMs);
      }

      //Return
      return res.json(
        ok({
          startUrl,
          namespace: namespace || null,
          pathPrefix: pathPrefix || null,
          maxDepth,
          maxPages,
          crawled,
          upserted,
          took_ms: Date.now() - startedAt
        })
      );
    } catch (err) {
      console.error("[/ingest-crawl] error", {
        message: err?.message,
        name: err?.name,
        stack: err?.stack
      });
      //Error handling
      return res.status(500).json(
        userError("Ingestion failed. Please try again or adjust your settings.", "server_error", {
          crawled: 0,
          upserted: 0
        })
      );
    }
  });

  return router;
}
