//URL + string utilities

// Quick HTTP and HTTPS check
export function isHttpUrl(str) {
  try {
    const u = new URL(str);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

//Common tracking params to strip from URLs
export const DEFAULT_STRIP_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "fbclid",
]);

/**
 * URL:
 *  remove hash
 *  strip tracking params
 *  keep trailing slash only for directory paths
 */
export function cleanUrl(u, { stripParams = DEFAULT_STRIP_PARAMS } = {}) {
  const url = new URL(u);
  url.hash = "";
  if (stripParams && stripParams.size) {
    for (const k of Array.from(url.searchParams.keys())) {
      if (stripParams.has(k)) url.searchParams.delete(k);
    }
  }
  if (url.pathname !== "/" && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.replace(/\/+$/, "/");
  }
  return url.toString();
}

//Safe substring that appends an ellipsis if truncated
export function safeSlice(str = "", max = 1500) {
  if (typeof str !== "string") return "";
  return str.length > max ? `${str.slice(0, max)}…` : str;
}

//Simple HTML to text cleaner (no DOM required)
export function cleanText(html = "") {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}


//Validation
export function clampInt(val, { min, max, fallback }) {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

//Convenience around clampInt for topK-like knobs
export function normalizeTopK(value, { min = 1, max = 50, fallback = 5 } = {}) {
  return clampInt(value, { min, max, fallback });
}

//Quick ID generator suitable for vector IDs
export function newId(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;
}


//Arrays, batching, timing
export function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Retry wrapper with exponential backoff.
 *  retries on ANY thrown error (you can filter in onRetry)
 */
export async function withRetry(
  fn,
  { tries = 3, baseDelayMs = 250, jitter = true, onRetry } = {}
) {
  let lastErr;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < tries) {
        const backoff = baseDelayMs * Math.pow(2, attempt - 1);
        const delay = jitter ? backoff * (0.8 + Math.random() * 0.4) : backoff;
        if (typeof onRetry === "function") {
          try {
            onRetry({ attempt, error: err, delay });
          } catch {
            //ignore onRetry errors
          }
        }
        await sleep(Math.round(delay));
      }
    }
  }
  throw lastErr;
}

//HTTP helpers

/**
 * fetch with timeout + sane defaults for HTML scraping
 *  Returns Response (so caller can decide text/json/etc.)
 */
export async function fetchWithTimeout(url, {
  timeoutMs = 25000,
  redirect = "follow",
  headers = {},
} = {}) {
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect,
      headers,
    });
    return res;
  } finally {
    clearTimeout(to);
  }
}

//API response helpers
export function ok(data) {
  return { ok: true, ...data };
}

export function userError(message, code = "bad_request", extra = {}) {
  return { error: { code, message, ...extra } };
}
