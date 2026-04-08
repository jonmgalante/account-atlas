import "server-only";

import { serverEnv } from "@/env/server";

export const crawlConfig = {
  maxHtmlPages: serverEnv.CRAWL_MAX_HTML_PAGES,
  maxPdfLinks: serverEnv.CRAWL_MAX_PDF_LINKS,
  maxConcurrency: serverEnv.CRAWL_MAX_CONCURRENCY,
  requestTimeoutMs: serverEnv.CRAWL_REQUEST_TIMEOUT_MS,
  maxResponseBytes: serverEnv.CRAWL_MAX_RESPONSE_BYTES,
  maxPdfBytes: serverEnv.CRAWL_MAX_PDF_BYTES,
  maxRedirects: 4,
  maxStoredTextChars: 120_000,
  maxStoredMarkdownChars: 120_000,
  blobThresholdBytes: 160 * 1024,
};

export type CrawlConfig = typeof crawlConfig;
