import "server-only";

import { lookup } from "node:dns/promises";

import { BLOCKED_PUBLIC_URL_MESSAGE, isBlockedHostname, isBlockedIpAddress, isCompanyHostname, normalizeCompanyUrl } from "@/lib/url";
import { logServerEvent } from "@/server/observability/logger";
import type { FetchCompanyResourceResult } from "@/server/crawl/types";
import { PipelineStepError } from "@/server/pipeline/pipeline-errors";
import { retryWithBackoff, withTimeout } from "@/server/reliability/retry";

const DEFAULT_FETCH_USER_AGENT = "AccountAtlasCrawler/0.1";
const DNS_LOOKUP_TIMEOUT_MS = 4_000;

declare global {
  var __accountAtlasDnsCache: Map<string, Promise<string[]>> | undefined;
}

function getDnsCache() {
  if (!globalThis.__accountAtlasDnsCache) {
    globalThis.__accountAtlasDnsCache = new Map<string, Promise<string[]>>();
  }

  return globalThis.__accountAtlasDnsCache;
}

async function lookupHostAddresses(hostname: string) {
  const cache = getDnsCache();
  const cacheKey = hostname.toLowerCase();

  if (!cache.has(cacheKey)) {
    cache.set(
      cacheKey,
      lookup(cacheKey, {
        all: true,
        verbatim: true,
      }).then((results) => results.map((result) => result.address)),
    );
  }

  return cache.get(cacheKey)!;
}

export async function assertPublicCompanyUrl(rawUrl: string, canonicalDomain?: string) {
  const normalizedUrl = normalizeCompanyUrl(rawUrl);
  const parsedUrl = new URL(normalizedUrl);

  if (isBlockedHostname(parsedUrl.hostname)) {
    throw new PipelineStepError("CRAWL_TARGET_BLOCKED", BLOCKED_PUBLIC_URL_MESSAGE);
  }

  let addresses: string[];

  try {
    addresses = await withTimeout(
      () => lookupHostAddresses(parsedUrl.hostname),
      {
        timeoutMs: DNS_LOOKUP_TIMEOUT_MS,
        label: `DNS lookup for ${parsedUrl.hostname}`,
      },
    );
  } catch (error) {
    throw new PipelineStepError("CRAWL_DNS_LOOKUP_FAILED", `Unable to resolve ${parsedUrl.hostname}.`, {
      cause: error,
    });
  }

  if (!addresses.length || addresses.some((address) => isBlockedIpAddress(address))) {
    throw new PipelineStepError("CRAWL_TARGET_BLOCKED", BLOCKED_PUBLIC_URL_MESSAGE);
  }

  if (canonicalDomain && !isCompanyHostname(parsedUrl.hostname, canonicalDomain)) {
    throw new PipelineStepError(
      "CRAWL_HOST_OUTSIDE_DOMAIN",
      `The crawl target ${parsedUrl.hostname} is outside the allowed company domain ${canonicalDomain}.`,
    );
  }

  return normalizedUrl;
}

async function readResponseBuffer(response: Response, maxBytes: number) {
  const contentLengthHeader = response.headers.get("content-length");
  const declaredLength = contentLengthHeader ? Number(contentLengthHeader) : null;

  if (declaredLength && Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new PipelineStepError(
      "CRAWL_RESPONSE_TOO_LARGE",
      `Skipping ${response.url} because it exceeded the crawl response budget.`,
    );
  }

  if (!response.body) {
    return Buffer.alloc(0);
  }

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    const chunk = Buffer.from(value);
    totalBytes += chunk.length;

    if (totalBytes > maxBytes) {
      throw new PipelineStepError("CRAWL_RESPONSE_TOO_LARGE", `Skipping ${response.url} because it exceeded the crawl response budget.`);
    }

    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

export async function fetchCompanyResource(input: {
  url: string;
  canonicalDomain: string;
  maxBytes: number;
  requestTimeoutMs: number;
  maxRedirects: number;
  acceptHeader: string;
}) {
  let currentUrl = input.url;

  for (let redirectCount = 0; redirectCount <= input.maxRedirects; redirectCount += 1) {
      const safeUrl = await assertPublicCompanyUrl(currentUrl, input.canonicalDomain);
    const result = await retryWithBackoff(
      async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), input.requestTimeoutMs);
        const retrievedAt = new Date();

        try {
          const response = await fetch(safeUrl, {
            method: "GET",
            redirect: "manual",
            signal: controller.signal,
            headers: {
              Accept: input.acceptHeader,
              "User-Agent": DEFAULT_FETCH_USER_AGENT,
            },
          });

          if ([301, 302, 303, 307, 308].includes(response.status)) {
            const location = response.headers.get("location");

            if (!location) {
              throw new PipelineStepError("CRAWL_REDIRECT_INVALID", `Received a redirect from ${safeUrl} without a location header.`);
            }

            currentUrl = new URL(location, safeUrl).toString();
            return {
              kind: "redirect" as const,
            };
          }

          if (!response.ok) {
            const errorCode = [408, 425, 429, 500, 502, 503, 504].includes(response.status)
              ? "CRAWL_FETCH_RETRYABLE"
              : "CRAWL_FETCH_FAILED";

            throw new PipelineStepError(errorCode, `Failed to fetch ${safeUrl} (HTTP ${response.status}).`);
          }

          const buffer = await readResponseBuffer(response, input.maxBytes);
          const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? null;

          return {
            kind: "response" as const,
            response: {
              finalUrl: response.url || safeUrl,
              status: response.status,
              mimeType,
              buffer,
              retrievedAt,
            } satisfies FetchCompanyResourceResult,
          };
        } catch (error) {
          if (error instanceof PipelineStepError) {
            throw error;
          }

          if (error instanceof Error && error.name === "AbortError") {
            throw new PipelineStepError("CRAWL_TIMEOUT", `Timed out while fetching ${safeUrl}.`, {
              cause: error,
            });
          }

          throw new PipelineStepError("CRAWL_FETCH_RETRYABLE", `Failed to fetch ${safeUrl}.`, {
            cause: error,
          });
        } finally {
          clearTimeout(timeout);
        }
      },
      {
        maxAttempts: 3,
        baseDelayMs: 400,
        maxDelayMs: 3_000,
        shouldRetry: (error) =>
          error instanceof PipelineStepError &&
          ["CRAWL_FETCH_RETRYABLE", "CRAWL_TIMEOUT", "CRAWL_DNS_LOOKUP_FAILED"].includes(error.code),
        onRetry: ({ attempt, nextDelayMs }, error) => {
          logServerEvent("warn", "crawl.fetch.retry", {
            url: safeUrl,
            attempt,
            nextDelayMs,
            error,
          });
        },
      },
    );

    if (result.kind === "redirect") {
      continue;
    }

    return result.response;
  }

  throw new PipelineStepError("CRAWL_TOO_MANY_REDIRECTS", `Too many redirects while fetching ${input.url}.`);
}
