import { chromium } from "playwright";
import { isHttpUrl, cleanUrl, cleanText } from "../utilities.js";

const UA = "DocChatBot/1.0 (+https://example.com)";

/* ---------- HTTP fetch ---------- */
async function fetchViaHttp(url, { timeoutMs = 25000 } = {}) {
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "user-agent": UA,
        accept: "text/html,*/*",
        "accept-language": "en-US,en;q=0.9",
      },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ctype = res.headers.get("content-type") || "";
    if (!ctype.toLowerCase().includes("text/html")) {
      throw new Error(`Not HTML: ${ctype}`);
    }

    const html = await res.text();
    return cleanText(html);
  } finally {
    clearTimeout(to);
  }
}

/* ---------- Playwright ---------- */

async function fetchViaBrowser(url, { navTimeoutMs = 45000, selectorWaitMs = 10000 } = {}) {
  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-dev-shm-usage", "--no-sandbox"],
  });

  try {
    const context = await browser.newContext({
      userAgent: UA,
      ignoreHTTPSErrors: true,
      locale: "en-US",
    });
    const page = await context.newPage();

    //Skip heavy/analytics requests to speed up & avoid never idle
    await page.route("**/*", (route) => {
      const req = route.request();
      const rt = req.resourceType();
      if (["media", "font", "image"].includes(rt)) return route.abort();

      const u = req.url();
      if (
        /(googletagmanager|google-analytics|gtag|doubleclick|hotjar|segment|amplitude|intercom|clarity|optimizely|cdn-cookielaw)/i.test(
          u
        )
      ) {
        return route.abort();
      }
      route.continue();
    });

    page.setDefaultNavigationTimeout(navTimeoutMs);

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: navTimeoutMs });
    //Try to wait for a meaningful container but don't block if it's missing
    await page.waitForSelector("main, article, #__next, .content, .docs", {
      timeout: selectorWaitMs,
    }).catch(() => {});

    //Prefer visible text if possible, fall back to cleaned HTML
    const visible = await page.evaluate(() => {
      const pick = document.querySelector("main, article, #__next, .content, .docs, body");
      return (pick?.innerText || document.body?.innerText || "").trim();
    });

    if (visible && visible.replace(/\s+/g, " ").length > 200) {
      //whitespace
      return visible.replace(/\s+/g, " ").trim();
    }

    const html = await page.content();
    return cleanText(html);
  } finally {
    await browser.close();
  }
}

/* ---------- public functions ---------- */

/**
 * Scrape a URL to readable text.
 * Tries a fast HTTP fetch first, if that fails or yields no content, falls back to Playwright.
 * @param {string} rawUrl
 * @param {{ httpTimeoutMs?: number, navTimeoutMs?: number, selectorWaitMs?: number }} [opts]
 * @returns {Promise<string>}
 */
export async function scrapeText(rawUrl, opts = {}) {
  if (!rawUrl || !isHttpUrl(rawUrl)) {
    throw new Error("scrapeText: please provide a valid HTTP(S) URL");
  }

  const url = cleanUrl(rawUrl);

  //Fast path: HTTP fetch
  try {
    const text = await fetchViaHttp(url, { timeoutMs: opts.httpTimeoutMs ?? 25000 });
    if (text && text.length >= 200) return text; // good enough
  } catch (e) {
    console.warn("[scraper] HTTP fast-path failed, falling back to playwright: ", e.message);
  }

  //Playwright
  return await fetchViaBrowser(url, {
    navTimeoutMs: opts.navTimeoutMs ?? 45000,
    selectorWaitMs: opts.selectorWaitMs ?? 10000,
  });
}
