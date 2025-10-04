# DocChat — Scrape Docs → Embed → Chat (Node + React)

A full-stack app that crawls documentation sites, chunks & embeds the content into a vector DB (Pinecone), and lets you chat with the docs through a clean React UI.

- Backend: Node.js (Express), Playwright (scraping), OpenAI Embeddings (RAG), Pinecone (vector search)
- Frontend: React + Vite (single-page app)
- Infra: Docker Desktop + docker-compose (dev-friendly)

## Features

- Analyze any docs URL — one input + “Analyze” button
- Respectful crawler — same-domain, optional path prefix (e.g. /docs), depth & page caps, small delay
- Chunking — ~1200 chars with overlap for better retrieval
- Chat — RAG answer with compact source pills (last path segment), dark theme, code blocks
- Semantic search — OpenAI embeddings → Pinecone (stores url, title, and a snippet per chunk)
- Dockerized — one docker compose up -d --build for API + Web

## Project Structure
```
/api
  ├─ src/
  │  ├─ index.js               # Express bootstrap + CORS + routes
  │  ├─ chunk.js               # simple chunker
  │  ├─ embed.js               # OpenAI embeddings
  │  ├─ pinecone.js            # v3 SDK helpers (upsert/query)
  │  ├─ scraper.js             # HTTP fast path + Playwright fallback
  │  └─ routes/
  │     ├─ index.js            # mounts all routers
  │     ├─ chat.js             # POST /chat
  │     ├─ crawl.js            # POST /ingest-crawl
  │     ├─ ingest.js           # POST /ingest-one, /ingest-url-chunks
  │     ├─ query.js            # POST /query
  │     └─ scrape.js           # GET/POST /scrape
  ├─ Dockerfile
  └─ .env.example

/web
  ├─ src/
  │  ├─ App.jsx                # centered UI (Analyze + Chat)
  │  ├─ main.jsx               # imports styles.css
  │  ├─ lib/api.js             # API helper
  │  └─ styles.css             # global layout + dark theme
  ├─ Dockerfile
  └─ .env.local.example

docker-compose.yml
```

## Prerequisites

- Docker Desktop
- Node 20+ (optional, for running locally without Docker)
- Accounts + API keys:
    - OpenAI (OPENAI_API_KEY)
    - Pinecone (PINECONE_API_KEY) and a serverless index (see setup below)

## Configuration
### API (api/.env)

Copy .env.example → .env and fill:

```ini
OPENAI_API_KEY=sk-...
# choose one: "gpt-4o-mini" (default in code) or your preferred chat model
OPENAI_CHAT_MODEL=gpt-4o-mini

PINECONE_API_KEY=pcn-...
PINECONE_INDEX=your-index-name
# optional default namespace (you can also pass per request)
# PINECONE_NAMESPACE=docs
PORT=4000
```

Ensure your Pinecone index dimension matches the embedding model:
text-embedding-3-small → 1536 dimensions (this is what the app uses).

### Web (web/.env.local)
```ini
VITE_API_URL=http://localhost:4000
```

### Run (Docker Desktop)

From repo root:
```bash
docker compose up -d --build
```

- Web (Vite dev): http://localhost:5173
- API health: http://localhost:4000/health -> {"ok":true}

The compose uses a bind mount and a named volume for /app/node_modules.
It runs npm ci on container start so dependencies are always available.

## Run (Local, without Docker)

### API
```bash
cd api
npm ci
# If running Playwright locally the first time:
npx playwright install
npm run start
# API on http://localhost:4000
```

### Web
```bash
cd web
npm ci
npm run dev
# Web on http://localhost:5173
```
## Using the App

1. Analyze a site
In the UI, paste a docs URL (e.g. https://nextjs.org/docs) and click Analyze.
The backend will:

- Crawl the start page + its direct links (maxDepth: 1 by default)
- Restrict to the first path segment (e.g. /docs)
- Rate-limit with a small delay
- Chunk → embed (OpenAI) → upsert to Pinecone (with url, title, text snippet)

2. Ask questions
Type your question and click Ask.
You’ll get a short answer with source pills; click a pill to open the exact doc page.

Namespaces are auto-derived from the hostname (e.g., nextjs.org → nextjs) so each site is isolated in Pinecone.

## REST API (for integrations)

Base URL: http://localhost:4000

/health	GET	—	Service health
/scrape	POST/GET	{ url }	Return cleaned text (first 1500 chars)
/ingest-one	POST	{ url, title?, text, namespace? }	Embed one blob and upsert
/ingest-url-chunks	POST	{ url, title?, namespace? }	Scrape → chunk → embed → upsert (one page)
/ingest-crawl	POST	{ startUrl, namespace?, pathPrefix?, maxDepth?, maxPages?, delayMs?, title? }	Crawl site and ingest multiple pages
/query	POST	{ question, topK?, namespace? }	Semantic nearest-neighbors with snippets
/chat	POST	{ question, topK?, namespace? }	RAG answer + citations using top chunks

### Notes

Typical crawl body for a docs site:
```json
{
  "startUrl": "https://nextjs.org/docs",
  "namespace": "nextjs",
  "pathPrefix": "/docs",
  "maxDepth": 1,
  "maxPages": 80,
  "delayMs": 200,
  "title": "Next.js Docs"
}
```

The scraper uses an HTTP fast path and a Playwright fallback with domcontentloaded (not networkidle) to avoid hanging pages.

## Tech Choices

- Playwright browser fallback avoids SPA/JS rendering issues
- Cheerio for fast link discovery
- OpenAI embeddings (text-embedding-3-small, 1536 dims)
- Pinecone v3 SDK (namespaces, batched upserts)
- React + Vite UI (dark theme, code blocks, responsive, centered)
- CORS enabled so the browser can call the API

## Development Tips

- Windows + Docker Desktop:
- Watchers can cause resets mid-request; the compose runs the API without --watch.
- Because of the /app/node_modules volume, install deps inside the container (compose handles this via npm ci at start).
- Playwright: If you run outside the Playwright base image, run npx playwright install once locally.
- Index dimension mismatch: If Pinecone rejects upserts, recreate the index with the correct dimension (1536).
- CORS: Already enabled (cors({ origin: true })) in src/index.js.

## Respect & Safety

- Keep crawl limits reasonable (maxDepth, maxPages, delayMs).
- Prefer scoping with pathPrefix (e.g., /docs) to avoid marketing pages.
- Consider parsing robots.txt/sitemap.xml for stricter compliance (easy to add later).

### Quick Test (PowerShell)
```powershell
# check API
Invoke-RestMethod 'http://localhost:4000/health'

# crawl & ingest a docs site
$body = @{
  startUrl = 'https://nextjs.org/docs'
  namespace = 'nextjs'
  pathPrefix = '/docs'
  maxDepth = 1
  maxPages = 50
  delayMs = 200
  title = 'Next.js Docs'
} | ConvertTo-Json -Compress
Invoke-RestMethod -Uri 'http://localhost:4000/ingest-crawl' -Method Post -ContentType 'application/json' -Body $body

# query / chat
$ask = @{ question = 'What is the App Router?'; topK = 5; namespace = 'nextjs' } | ConvertTo-Json -Compress
Invoke-RestMethod -Uri 'http://localhost:4000/query' -Method Post -ContentType 'application/json' -Body $ask
Invoke-RestMethod -Uri 'http://localhost:4000/chat'  -Method Post -ContentType 'application/json' -Body $ask
```

## License

MIT — free to use, modify, and ship.

## Credits

Built with Node.js, React, Playwright, OpenAI, and Pinecone.