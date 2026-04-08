import "server-only";

import { createHash } from "node:crypto";

import pLimit from "p-limit";

import { normalizeCompanyUrl } from "@/lib/url";
import { crawlConfig, type CrawlConfig } from "@/server/crawl/config";
import { fetchCompanyResource } from "@/server/crawl/fetch-company-resource";
import { parseHtmlDocument } from "@/server/crawl/parse-html-document";
import { buildInitialCrawlCandidates, classifyDiscoveredCandidate, takeNextCandidates } from "@/server/crawl/source-discovery";
import type { CrawlCandidate, CrawlIngestionResult } from "@/server/crawl/types";
import type { ReportRepository, StoredRunContext, UpsertCrawledSourceResult } from "@/server/repositories/report-repository";
import { drizzleReportRepository } from "@/server/repositories/report-repository";
import { maybeStoreBlobArtifact } from "@/server/storage/blob-store";

type CompanySiteCrawlerDependencies = {
  repository?: ReportRepository;
  config?: CrawlConfig;
  fetchResource?: typeof fetchCompanyResource;
  parseDocument?: typeof parseHtmlDocument;
  storeBlobArtifact?: typeof maybeStoreBlobArtifact;
};

type ProcessedCandidateResult = {
  discoveredCandidates: CrawlCandidate[];
  outcome: UpsertCrawledSourceResult;
  sourceKind: "html" | "pdf";
};

function hashBuffer(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function truncate(value: string | null, maxChars: number) {
  if (!value) {
    return null;
  }

  return value.length > maxChars ? value.slice(0, maxChars) : value;
}

function buildArtifactPath(input: {
  reportId: number;
  runId: number;
  sourceType: string;
  hash: string;
  extension: string;
}) {
  return `reports/${input.reportId}/runs/${input.runId}/crawl/${input.sourceType}/${input.hash}.${input.extension}`;
}

export function createCompanySiteCrawler(dependencies: CompanySiteCrawlerDependencies = {}) {
  const repository = dependencies.repository ?? drizzleReportRepository;
  const config = dependencies.config ?? crawlConfig;
  const fetchResource = dependencies.fetchResource ?? fetchCompanyResource;
  const parseDocument = dependencies.parseDocument ?? parseHtmlDocument;
  const storeBlobArtifact = dependencies.storeBlobArtifact ?? maybeStoreBlobArtifact;

  async function processPdfCandidate(context: StoredRunContext, candidate: CrawlCandidate) {
    const response = await fetchResource({
      url: candidate.url,
      canonicalDomain: context.report.canonicalDomain,
      maxBytes: config.maxPdfBytes,
      requestTimeoutMs: config.requestTimeoutMs,
      maxRedirects: config.maxRedirects,
      acceptHeader: "application/pdf,text/html;q=0.8",
    });

    if (response.mimeType?.includes("text/html")) {
      const htmlCandidate =
        classifyDiscoveredCandidate(response.finalUrl, response.finalUrl, context.report.canonicalDomain, candidate.anchorText) ??
        ({
          ...candidate,
          url: response.finalUrl,
          kind: "html",
          sourceType: "company_site",
        } satisfies CrawlCandidate);

      const html = response.buffer.toString("utf8");
      const parsed = parseDocument({
        html,
        finalUrl: response.finalUrl,
        canonicalDomain: context.report.canonicalDomain,
      });
      const contentHash = hashBuffer(response.buffer);

      return repository.upsertCrawledSource({
        reportId: context.report.id,
        runId: context.run.id,
        url: response.finalUrl,
        normalizedUrl: response.finalUrl,
        canonicalUrl: parsed.canonicalUrl,
        canonicalDomain: context.report.canonicalDomain,
        title: parsed.title,
        sourceType: htmlCandidate.sourceType,
        sourceTier: "primary",
        mimeType: response.mimeType,
        discoveredAt: candidate.discoveredAt,
        publishedAt: parsed.publishedAt,
        updatedAtHint: parsed.updatedAtHint,
        retrievedAt: response.retrievedAt,
        contentHash,
        textContent: truncate(parsed.textContent, config.maxStoredTextChars),
        markdownContent: truncate(parsed.markdownContent, config.maxStoredMarkdownChars),
        storagePointers: {
          httpStatus: response.status,
          rawHtmlBytes: response.buffer.byteLength,
        },
      });
    }

    const contentHash = hashBuffer(response.buffer);
    const pdfBlob = await storeBlobArtifact({
      pathname: buildArtifactPath({
        reportId: context.report.id,
        runId: context.run.id,
        sourceType: candidate.sourceType,
        hash: contentHash,
        extension: "pdf",
      }),
      body: response.buffer,
      contentType: response.mimeType ?? "application/pdf",
      minimumBytes: 0,
    });

    return repository.upsertCrawledSource({
      reportId: context.report.id,
      runId: context.run.id,
      url: response.finalUrl,
      normalizedUrl: response.finalUrl,
      canonicalUrl: response.finalUrl,
      canonicalDomain: context.report.canonicalDomain,
      title: candidate.anchorText ?? new URL(response.finalUrl).pathname.split("/").at(-1) ?? "Linked PDF",
      sourceType: candidate.sourceType,
      sourceTier: "primary",
      mimeType: response.mimeType ?? "application/pdf",
      discoveredAt: candidate.discoveredAt,
      publishedAt: null,
      updatedAtHint: null,
      retrievedAt: response.retrievedAt,
      contentHash,
      textContent: null,
      markdownContent: null,
      storagePointers: {
        httpStatus: response.status,
        pdfBytes: response.buffer.byteLength,
        pdfBlob,
      },
    });
  }

  async function crawlCompanySite(context: StoredRunContext): Promise<CrawlIngestionResult> {
      const normalizedTargetUrl = normalizeCompanyUrl(context.report.normalizedInputUrl);
      const pendingCandidates = new Map<string, CrawlCandidate>();
      const visitedHtmlUrls = new Set<string>();
      const visitedPdfUrls = new Set<string>();
      const blockedUrls = new Set<string>();
      const pdfUrls = new Set<string>();
      const sourceIds = new Set<number>();
      const limiter = pLimit(config.maxConcurrency);

      for (const candidate of buildInitialCrawlCandidates(normalizedTargetUrl, context.report.canonicalDomain)) {
        pendingCandidates.set(candidate.url, candidate);
      }

      let pagesFetched = 0;
      let htmlPagesStored = 0;
      let pdfSourcesStored = 0;
      let dedupedSources = 0;

      const processHtmlCandidate = async (candidate: CrawlCandidate): Promise<ProcessedCandidateResult | null> => {
        if (visitedHtmlUrls.has(candidate.url)) {
          return null;
        }

        visitedHtmlUrls.add(candidate.url);

        const response = await fetchResource({
          url: candidate.url,
          canonicalDomain: context.report.canonicalDomain,
          maxBytes: config.maxResponseBytes,
          requestTimeoutMs: config.requestTimeoutMs,
          maxRedirects: config.maxRedirects,
          acceptHeader: "text/html,application/xhtml+xml;q=0.9",
        });

        if (response.mimeType === "application/pdf") {
          const outcome = await processPdfCandidate(context, {
            ...candidate,
            kind: "pdf",
          });

          return {
            discoveredCandidates: [],
            outcome,
            sourceKind: "pdf",
          };
        }

        const html = response.buffer.toString("utf8");
        const parsed = parseDocument({
          html,
          finalUrl: response.finalUrl,
          canonicalDomain: context.report.canonicalDomain,
        });

        const rawHtmlHash = hashBuffer(response.buffer);
        const markdownBlob = parsed.markdownContent
          ? await storeBlobArtifact({
              pathname: buildArtifactPath({
                reportId: context.report.id,
                runId: context.run.id,
                sourceType: candidate.sourceType,
                hash: rawHtmlHash,
                extension: "md",
              }),
              body: parsed.markdownContent,
              contentType: "text/markdown; charset=utf-8",
              minimumBytes: config.blobThresholdBytes,
            })
          : null;
        const rawHtmlBlob = await storeBlobArtifact({
          pathname: buildArtifactPath({
            reportId: context.report.id,
            runId: context.run.id,
            sourceType: candidate.sourceType,
            hash: rawHtmlHash,
            extension: "html",
          }),
          body: html,
          contentType: "text/html; charset=utf-8",
          minimumBytes: config.blobThresholdBytes,
        });

        const outcome = await repository.upsertCrawledSource({
          reportId: context.report.id,
          runId: context.run.id,
          url: response.finalUrl,
          normalizedUrl: response.finalUrl,
          canonicalUrl: parsed.canonicalUrl,
          canonicalDomain: context.report.canonicalDomain,
          title: parsed.title,
          sourceType: candidate.sourceType,
          sourceTier: "primary",
          mimeType: response.mimeType ?? "text/html",
          discoveredAt: candidate.discoveredAt,
          publishedAt: parsed.publishedAt,
          updatedAtHint: parsed.updatedAtHint,
          retrievedAt: response.retrievedAt,
          contentHash: rawHtmlHash,
          textContent: truncate(parsed.textContent, config.maxStoredTextChars),
          markdownContent: truncate(parsed.markdownContent, config.maxStoredMarkdownChars),
          storagePointers: {
            httpStatus: response.status,
            rawHtmlBytes: response.buffer.byteLength,
            markdownBytes: parsed.markdownContent ? Buffer.byteLength(parsed.markdownContent) : 0,
            rawHtmlBlob,
            markdownBlob,
          },
        });

        const discovered = parsed.links
          .map((link) =>
            classifyDiscoveredCandidate(link.url, response.finalUrl, context.report.canonicalDomain, link.anchorText),
          )
          .filter((nextCandidate): nextCandidate is CrawlCandidate => Boolean(nextCandidate));

        return {
          discoveredCandidates: discovered,
          outcome,
          sourceKind: "html",
        };
      };

      const htmlErrors: Error[] = [];

      while (visitedHtmlUrls.size < config.maxHtmlPages) {
        const batch = takeNextCandidates(pendingCandidates, "html", config.maxConcurrency).filter(
          (candidate) => !visitedHtmlUrls.has(candidate.url),
        );

        if (!batch.length) {
          break;
        }

        const settledResults = await Promise.allSettled(batch.map((candidate) => limiter(() => processHtmlCandidate(candidate))));

        for (const [index, settled] of settledResults.entries()) {
          const candidate = batch[index];

          if (settled.status === "rejected") {
            blockedUrls.add(candidate.url);
            htmlErrors.push(settled.reason instanceof Error ? settled.reason : new Error(String(settled.reason)));

            await repository.appendRunEvent({
              reportId: context.report.id,
              runId: context.run.id,
              level: "warning",
              eventType: "crawl.source.skipped",
              stepKey: "crawl_company_site",
              message: `Skipped ${candidate.url}: ${settled.reason instanceof Error ? settled.reason.message : "Unknown crawl error."}`,
              metadata: {
                candidateUrl: candidate.url,
                sourceType: candidate.sourceType,
              },
            });

            continue;
          }

          if (!settled.value) {
            continue;
          }

          pagesFetched += 1;
          sourceIds.add(settled.value.outcome.source.id);

          if (settled.value.outcome.dedupeStrategy === "created") {
            if (settled.value.sourceKind === "pdf") {
              pdfSourcesStored += 1;
            } else {
              htmlPagesStored += 1;
            }
          } else {
            dedupedSources += 1;
          }

          await repository.appendRunEvent({
            reportId: context.report.id,
            runId: context.run.id,
            level: "info",
            eventType: settled.value.sourceKind === "pdf" ? "crawl.pdf.ingested" : "crawl.source.ingested",
            stepKey: "crawl_company_site",
            message: `${settled.value.outcome.dedupeStrategy === "created" ? "Stored" : "Updated"} ${settled.value.outcome.source.sourceType} source: ${settled.value.outcome.source.title ?? settled.value.outcome.source.canonicalUrl}`,
            metadata: {
              sourceId: settled.value.outcome.source.id,
              sourceType: settled.value.outcome.source.sourceType,
              canonicalUrl: settled.value.outcome.source.canonicalUrl,
              dedupeStrategy: settled.value.outcome.dedupeStrategy,
            },
          });

          for (const discoveredCandidate of settled.value.discoveredCandidates) {
            const current = pendingCandidates.get(discoveredCandidate.url);

            if (!current || discoveredCandidate.priority > current.priority) {
              pendingCandidates.set(discoveredCandidate.url, discoveredCandidate);
            }
          }
        }

        if (!htmlPagesStored && htmlErrors.length && visitedHtmlUrls.size >= Math.min(2, config.maxHtmlPages)) {
          throw htmlErrors[0];
        }
      }

      const pdfBatch = takeNextCandidates(pendingCandidates, "pdf", config.maxPdfLinks).filter(
        (candidate) => !visitedPdfUrls.has(candidate.url),
      );

      const pdfResults = await Promise.allSettled(
        pdfBatch.map((candidate) =>
          limiter(async () => {
            visitedPdfUrls.add(candidate.url);
            pdfUrls.add(candidate.url);
            const outcome = await processPdfCandidate(context, candidate);
            sourceIds.add(outcome.source.id);
            pagesFetched += 1;

            if (outcome.dedupeStrategy === "created") {
              pdfSourcesStored += 1;
            } else {
              dedupedSources += 1;
            }

            await repository.appendRunEvent({
              reportId: context.report.id,
              runId: context.run.id,
              level: "info",
              eventType: "crawl.pdf.ingested",
              stepKey: "crawl_company_site",
              message: `${outcome.dedupeStrategy === "created" ? "Stored" : "Updated"} PDF source: ${candidate.url}`,
              metadata: {
                sourceId: outcome.source.id,
                sourceType: candidate.sourceType,
              },
            });
          }),
        ),
      );

      for (const [index, settled] of pdfResults.entries()) {
        if (settled.status === "fulfilled") {
          continue;
        }

        const candidate = pdfBatch[index];
        blockedUrls.add(candidate.url);

        await repository.appendRunEvent({
          reportId: context.report.id,
          runId: context.run.id,
          level: "warning",
          eventType: "crawl.pdf.skipped",
          stepKey: "crawl_company_site",
          message: `Skipped PDF ${candidate.url}: ${settled.reason instanceof Error ? settled.reason.message : "Unknown crawl error."}`,
          metadata: {
            candidateUrl: candidate.url,
            sourceType: candidate.sourceType,
          },
        });
      }

      const manifest = {
        visitedUrls: [...visitedHtmlUrls],
        pdfUrls: [...pdfUrls],
        blockedUrls: [...blockedUrls],
      };
      const manifestBody = JSON.stringify(
        {
          reportId: context.report.id,
          runId: context.run.id,
          pagesFetched,
          htmlPagesStored,
          pdfSourcesStored,
          dedupedSources,
          ...manifest,
        },
        null,
        2,
      );
      const manifestHash = createHash("sha256").update(manifestBody).digest("hex");
      const manifestBlob = await storeBlobArtifact({
        pathname: `reports/${context.report.id}/runs/${context.run.id}/crawl/manifest.json`,
        body: manifestBody,
        contentType: "application/json",
        minimumBytes: 0,
      });

      await repository.upsertArtifact({
        reportId: context.report.id,
        runId: context.run.id,
        artifactType: "source_bundle",
        mimeType: "application/json",
        fileName: `report-${context.report.shareId}-crawl-manifest.json`,
        contentHash: manifestHash,
        sizeBytes: Buffer.byteLength(manifestBody),
        storagePointers: {
          manifestBlob,
          pagesFetched,
          htmlPagesStored,
          pdfSourcesStored,
          dedupedSources,
          blockedUrlCount: blockedUrls.size,
        },
      });

      return {
        pagesFetched,
        htmlPagesStored,
        pdfSourcesStored,
        dedupedSources,
        sourceIds: [...sourceIds],
        manifest,
      };
  }

  return {
    crawlCompanySite,
    processPdfCandidate,
  };
}
