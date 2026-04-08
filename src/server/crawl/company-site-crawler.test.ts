import { describe, expect, it } from "vitest";

import type { ReportRepository, StoredRunContext, UpsertArtifactInput, UpsertCrawledSourceInput } from "@/server/repositories/report-repository";
import { createCompanySiteCrawler } from "@/server/crawl/company-site-crawler";
import { createInitialPipelineState } from "@/server/pipeline/pipeline-steps";

function createRepositoryStub() {
  let sourceId = 1;
  const canonicalIndex = new Map<string, ReturnType<typeof createSourceRecord>>();
  const contentHashIndex = new Map<string, ReturnType<typeof createSourceRecord>>();
  const artifacts: UpsertArtifactInput[] = [];
  const events: string[] = [];

  function createSourceRecord(input: UpsertCrawledSourceInput) {
    return {
      id: sourceId++,
      reportId: input.reportId,
      runId: input.runId,
      url: input.url,
      normalizedUrl: input.normalizedUrl,
      canonicalUrl: input.canonicalUrl,
      canonicalDomain: input.canonicalDomain,
      title: input.title ?? null,
      sourceType: input.sourceType,
      sourceTier: input.sourceTier,
      mimeType: input.mimeType ?? null,
      discoveredAt: input.discoveredAt ?? new Date("2026-04-07T12:00:00.000Z"),
      publishedAt: input.publishedAt ?? null,
      updatedAtHint: input.updatedAtHint ?? null,
      retrievedAt: input.retrievedAt ?? new Date("2026-04-07T12:00:00.000Z"),
      contentHash: input.contentHash ?? null,
      textContent: input.textContent ?? null,
      markdownContent: input.markdownContent ?? null,
      storagePointers: input.storagePointers ?? {},
      createdAt: new Date("2026-04-07T12:00:00.000Z"),
      updatedAt: new Date("2026-04-07T12:00:00.000Z"),
    };
  }

  const repository: ReportRepository = {
    async isShareIdAvailable() {
      return true;
    },
    async createQueuedReport() {
      throw new Error("Not used");
    },
    async findReportShellByShareId() {
      throw new Error("Not used");
    },
    async findLatestReportShellByCanonicalDomain() {
      return null;
    },
    async findRunContextById() {
      throw new Error("Not used");
    },
    async listSourcesByRunId() {
      return [];
    },
    async listFactsByRunId() {
      return [];
    },
    async listArtifactsByRunId() {
      return [];
    },
    async findArtifactByShareId() {
      return null;
    },
    async countRecentRequestsByRequester() {
      return 0;
    },
    async recordReportRequest() {
      return;
    },
    async setRunDispatchState() {
      throw new Error("Not used");
    },
    async setRunVectorStore() {
      throw new Error("Not used");
    },
    async updateRunResearchSummary() {
      throw new Error("Not used");
    },
    async updateRunAccountPlan() {
      throw new Error("Not used");
    },
    async updateRunStepState() {
      throw new Error("Not used");
    },
    async appendRunEvent(input) {
      events.push(input.message);
    },
    async upsertCrawledSource(input) {
      const existingByCanonical = canonicalIndex.get(input.canonicalUrl);

      if (existingByCanonical) {
        return {
          source: existingByCanonical,
          dedupeStrategy: "canonical_url" as const,
        };
      }

      if (input.contentHash) {
        const existingByHash = contentHashIndex.get(input.contentHash);

        if (existingByHash) {
          return {
            source: existingByHash,
            dedupeStrategy: "content_hash" as const,
          };
        }
      }

      const source = createSourceRecord(input);
      canonicalIndex.set(source.canonicalUrl, source);

      if (source.contentHash) {
        contentHashIndex.set(source.contentHash, source);
      }

      return {
        source,
        dedupeStrategy: "created" as const,
      };
    },
    async updateSourceStoragePointers() {
      throw new Error("Not used");
    },
    async replaceFactsForRun() {
      throw new Error("Not used");
    },
    async replaceUseCasesForRun() {
      throw new Error("Not used");
    },
    async replaceStakeholdersForRun() {
      throw new Error("Not used");
    },
    async upsertArtifact(input) {
      artifacts.push(input);
    },
  };

  return {
    repository,
    artifacts,
    events,
  };
}

describe("createCompanySiteCrawler", () => {
  it("stores normalized sources, detects PDFs, and counts deduped content hashes", async () => {
    const stub = createRepositoryStub();
    const crawler = createCompanySiteCrawler({
      repository: stub.repository,
      config: {
        maxHtmlPages: 2,
        maxPdfLinks: 1,
        maxConcurrency: 1,
        requestTimeoutMs: 1000,
        maxResponseBytes: 500_000,
        maxPdfBytes: 500_000,
        maxRedirects: 2,
        maxStoredTextChars: 10_000,
        maxStoredMarkdownChars: 10_000,
        blobThresholdBytes: 10_000,
      },
      fetchResource: async ({ url }) => {
        if (url.endsWith(".pdf")) {
          return {
            finalUrl: url,
            status: 200,
            mimeType: "application/pdf",
            buffer: Buffer.from("%PDF-same-company-report%"),
            retrievedAt: new Date("2026-04-07T12:00:00.000Z"),
          };
        }

        return {
          finalUrl: url,
          status: 200,
          mimeType: "text/html",
          buffer: Buffer.from("<html><body>shared html payload</body></html>"),
          retrievedAt: new Date("2026-04-07T12:00:00.000Z"),
        };
      },
      parseDocument: ({ finalUrl }) => ({
        title: finalUrl.endsWith("/about") ? "About OpenAI" : "OpenAI",
        canonicalUrl: finalUrl,
        markdownContent: `# ${finalUrl}`,
        textContent: `Text for ${finalUrl}`,
        publishedAt: null,
        updatedAtHint: null,
        links: finalUrl === "https://openai.com/" ? [{ url: "/investors/annual-report.pdf", anchorText: "Annual report" }] : [],
      }),
      storeBlobArtifact: async () => null,
    });

    const context: StoredRunContext = {
      report: {
        id: 1,
        shareId: "atlas12345",
        status: "running",
        normalizedInputUrl: "https://openai.com/",
        canonicalDomain: "openai.com",
        companyName: null,
        createdAt: new Date("2026-04-07T12:00:00.000Z"),
        updatedAt: new Date("2026-04-07T12:00:00.000Z"),
        completedAt: null,
        failedAt: null,
      },
      run: {
        id: 11,
        reportId: 1,
        attemptNumber: 1,
        status: "fetching",
        executionMode: "inline",
        progressPercent: 25,
        stepKey: "crawl_company_site",
        statusMessage: "Crawling company site.",
        pipelineState: createInitialPipelineState(),
        queueMessageId: null,
        vectorStoreId: null,
        researchSummary: null,
        accountPlan: null,
        errorCode: null,
        errorMessage: null,
        createdAt: new Date("2026-04-07T12:00:00.000Z"),
        updatedAt: new Date("2026-04-07T12:00:00.000Z"),
        startedAt: new Date("2026-04-07T12:00:00.000Z"),
        lastHeartbeatAt: null,
        completedAt: null,
        failedAt: null,
      },
    };

    const result = await crawler.crawlCompanySite(context);

    expect(result.pagesFetched).toBe(3);
    expect(result.htmlPagesStored).toBe(1);
    expect(result.pdfSourcesStored).toBe(1);
    expect(result.dedupedSources).toBe(1);
    expect(result.manifest.pdfUrls).toContain("https://openai.com/investors/annual-report.pdf");
    expect(stub.artifacts).toHaveLength(1);
    expect(stub.events.some((event) => event.includes("Stored"))).toBe(true);
  });
});
