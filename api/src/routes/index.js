import express from 'express';
import { buildChatRouter } from './chat.js';
import { buildScrapeRouter } from './scrape.js';
import { buildIngestRouter } from './ingest.js';
import { buildQueryRouter } from './query.js';
import { buildCrawlRouter } from './crawl.js';

export function buildApiRouter() {
    const router = express.Router();

    router.use(buildScrapeRouter());
    router.use(buildIngestRouter());
    router.use(buildQueryRouter());
    router.use(buildCrawlRouter());
    router.use(buildChatRouter());

    return router;
}

export default buildApiRouter;
