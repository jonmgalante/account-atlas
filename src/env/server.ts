import "server-only";

import { z } from "zod";

const serverEnvSchema = z.object({
  DATABASE_URL: z.string().trim().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  BLOB_READ_WRITE_TOKEN: z.string().min(1).optional(),
  REQUEST_FINGERPRINT_SALT: z.string().min(1).optional(),
  REPORT_PIPELINE_MODE: z.enum(["auto", "inline", "vercel_queue"]).default("auto"),
  REPORT_CREATE_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(50).default(8),
  REPORT_CREATE_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(60_000).max(86_400_000).default(3_600_000),
  REPORT_DOMAIN_ACTIVE_COOLDOWN_MS: z.coerce.number().int().min(60_000).max(86_400_000).default(1_800_000),
  REPORT_DOMAIN_FAILED_COOLDOWN_MS: z.coerce.number().int().min(60_000).max(86_400_000).default(900_000),
  REPORT_RECENT_REUSE_WINDOW_MS: z.coerce.number().int().min(60_000).max(604_800_000).default(86_400_000),
  CRAWL_MAX_HTML_PAGES: z.coerce.number().int().min(1).max(40).default(12),
  CRAWL_MAX_PDF_LINKS: z.coerce.number().int().min(0).max(20).default(6),
  CRAWL_MAX_CONCURRENCY: z.coerce.number().int().min(1).max(6).default(2),
  CRAWL_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(60_000).default(12_000),
  CRAWL_MAX_RESPONSE_BYTES: z.coerce.number().int().min(32_768).max(5_000_000).default(1_500_000),
  CRAWL_MAX_PDF_BYTES: z.coerce.number().int().min(32_768).max(10_000_000).default(4_000_000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export const serverEnv = serverEnvSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
  REQUEST_FINGERPRINT_SALT: process.env.REQUEST_FINGERPRINT_SALT,
  REPORT_PIPELINE_MODE: process.env.REPORT_PIPELINE_MODE,
  REPORT_CREATE_RATE_LIMIT_MAX: process.env.REPORT_CREATE_RATE_LIMIT_MAX,
  REPORT_CREATE_RATE_LIMIT_WINDOW_MS: process.env.REPORT_CREATE_RATE_LIMIT_WINDOW_MS,
  REPORT_DOMAIN_ACTIVE_COOLDOWN_MS: process.env.REPORT_DOMAIN_ACTIVE_COOLDOWN_MS,
  REPORT_DOMAIN_FAILED_COOLDOWN_MS: process.env.REPORT_DOMAIN_FAILED_COOLDOWN_MS,
  REPORT_RECENT_REUSE_WINDOW_MS: process.env.REPORT_RECENT_REUSE_WINDOW_MS,
  CRAWL_MAX_HTML_PAGES: process.env.CRAWL_MAX_HTML_PAGES,
  CRAWL_MAX_PDF_LINKS: process.env.CRAWL_MAX_PDF_LINKS,
  CRAWL_MAX_CONCURRENCY: process.env.CRAWL_MAX_CONCURRENCY,
  CRAWL_REQUEST_TIMEOUT_MS: process.env.CRAWL_REQUEST_TIMEOUT_MS,
  CRAWL_MAX_RESPONSE_BYTES: process.env.CRAWL_MAX_RESPONSE_BYTES,
  CRAWL_MAX_PDF_BYTES: process.env.CRAWL_MAX_PDF_BYTES,
  NODE_ENV: process.env.NODE_ENV,
});

export type ServerEnv = typeof serverEnv;
