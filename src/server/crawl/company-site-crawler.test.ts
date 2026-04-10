import { describe, expect, it } from "vitest";

import type { ReportRepository, StoredRunContext, UpsertArtifactInput, UpsertCrawledSourceInput } from "@/server/repositories/report-repository";
import { createCompanySiteCrawler } from "@/server/crawl/company-site-crawler";
import { PipelineStepError } from "@/server/pipeline/pipeline-errors";
import { createInitialPipelineState } from "@/server/pipeline/pipeline-steps";

function createRepositoryStub() {
  let sourceId = 1;
  const canonicalIndex = new Map<string, ReturnType<typeof createSourceRecord>>();
  const contentHashIndex = new Map<string, ReturnType<typeof createSourceRecord>>();
  const artifacts: UpsertArtifactInput[] = [];
  const events: Array<{ eventType: string; message: string }> = [];

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
    async claimRunStepExecution() {
      throw new Error("Not used");
    },
    async touchRunHeartbeat() {
      return;
    },
    async updateRunStepState() {
      throw new Error("Not used");
    },
    async appendRunEvent(input) {
      events.push({
        eventType: input.eventType,
        message: input.message,
      });
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
            truncated: false,
            declaredContentLength: 24,
            retrievedAt: new Date("2026-04-07T12:00:00.000Z"),
          };
        }

        return {
          finalUrl: url,
          status: 200,
          mimeType: "text/html",
          buffer: Buffer.from("<html><body>shared html payload</body></html>"),
          truncated: false,
          declaredContentLength: 45,
          retrievedAt: new Date("2026-04-07T12:00:00.000Z"),
        };
      },
      parseDocument: ({ finalUrl }) => ({
        title: finalUrl.endsWith("/about") ? "About OpenAI" : "OpenAI",
        canonicalUrl: finalUrl,
        markdownContent: `# ${finalUrl}`,
        textContent: `Text for ${finalUrl}`,
        parsingStrategy: "full",
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

    expect(result.pagesFetched).toBeGreaterThanOrEqual(3);
    expect(result.htmlPagesStored).toBe(1);
    expect(result.pdfSourcesStored).toBe(1);
    expect(result.dedupedSources).toBeGreaterThanOrEqual(1);
    expect(result.coverageStatus).toBe("limited");
    expect(result.manifest.pdfUrls).toContain("https://openai.com/investors/annual-report.pdf");
    expect(stub.artifacts).toHaveLength(1);
    expect(stub.events.some((event) => event.message.includes("Stored"))).toBe(true);
  });

  it("tries the submitted locale path before failing generic root fallbacks", async () => {
    const stub = createRepositoryStub();
    const crawler = createCompanySiteCrawler({
      repository: stub.repository,
      config: {
        maxHtmlPages: 3,
        maxPdfLinks: 0,
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
        if (url === "https://www.jll.com/en-us") {
          return {
            finalUrl: "https://www.jll.com/en-us/",
            status: 200,
            mimeType: "text/html",
            buffer: Buffer.from("<html><body>JLL regional homepage</body></html>"),
            truncated: false,
            declaredContentLength: 46,
            retrievedAt: new Date("2026-04-07T12:00:00.000Z"),
          };
        }

        if (url.startsWith("https://www.jll.com/")) {
          throw new PipelineStepError("CRAWL_TOO_MANY_REDIRECTS", `Too many redirects while fetching ${url}.`);
        }

        throw new Error(`Unexpected URL: ${url}`);
      },
      parseDocument: ({ finalUrl }) => ({
        title: "JLL",
        canonicalUrl: finalUrl,
        markdownContent: `# ${finalUrl}`,
        textContent: `Text for ${finalUrl}`,
        parsingStrategy: "full",
        publishedAt: null,
        updatedAtHint: null,
        links: [],
      }),
      storeBlobArtifact: async () => null,
    });

    const context: StoredRunContext = {
      report: {
        id: 1,
        shareId: "atlas67890",
        status: "running",
        normalizedInputUrl: "https://www.jll.com/en-us",
        canonicalDomain: "jll.com",
        companyName: null,
        createdAt: new Date("2026-04-07T12:00:00.000Z"),
        updatedAt: new Date("2026-04-07T12:00:00.000Z"),
        completedAt: null,
        failedAt: null,
      },
      run: {
        id: 12,
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

    expect(result.pagesFetched).toBe(1);
    expect(result.htmlPagesStored).toBe(1);
    expect(result.coverageStatus).toBe("limited");
    expect(result.manifest.visitedUrls.slice(0, 2)).toEqual(["https://www.jll.com/", "https://www.jll.com/en-us"]);
    expect(stub.events.some((event) => event.message.includes("Stored"))).toBe(true);
  });

  it("exhausts the deterministic source plan before optional deep-link crawl candidates", async () => {
    const stub = createRepositoryStub();
    const crawler = createCompanySiteCrawler({
      repository: stub.repository,
      config: {
        maxHtmlPages: 3,
        maxPdfLinks: 0,
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
        if (url === "https://acme.com/") {
          return {
            finalUrl: url,
            status: 200,
            mimeType: "text/html",
            buffer: Buffer.from("<html><body><a href=\"/deep/customer-story\">Deep story</a></body></html>"),
            truncated: false,
            declaredContentLength: 68,
            retrievedAt: new Date("2026-04-07T12:00:00.000Z"),
          };
        }

        if (url === "https://acme.com/about" || url === "https://acme.com/products") {
          return {
            finalUrl: url,
            status: 200,
            mimeType: "text/html",
            buffer: Buffer.from(`<html><body>${url}</body></html>`),
            truncated: false,
            declaredContentLength: 32,
            retrievedAt: new Date("2026-04-07T12:00:00.000Z"),
          };
        }

        throw new Error(`Unexpected URL: ${url}`);
      },
      parseDocument: ({ finalUrl }) => ({
        title: finalUrl,
        canonicalUrl: finalUrl,
        markdownContent: `# ${finalUrl}`,
        textContent: finalUrl,
        parsingStrategy: "full",
        publishedAt: null,
        updatedAtHint: null,
        links:
          finalUrl === "https://acme.com/"
            ? [{ url: "/deep/customer-story", anchorText: "Deep story" }]
            : [],
      }),
      storeBlobArtifact: async () => null,
    });

    const context: StoredRunContext = {
      report: {
        id: 15,
        shareId: "acmeplan01",
        status: "running",
        normalizedInputUrl: "https://acme.com/",
        canonicalDomain: "acme.com",
        companyName: null,
        createdAt: new Date("2026-04-07T12:00:00.000Z"),
        updatedAt: new Date("2026-04-07T12:00:00.000Z"),
        completedAt: null,
        failedAt: null,
      },
      run: {
        id: 15,
        reportId: 15,
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

    expect(result.htmlPagesStored).toBe(3);
    expect(result.manifest.visitedUrls).toEqual([
      "https://acme.com/",
      "https://acme.com/about",
      "https://acme.com/products",
    ]);
    expect(result.manifest.visitedUrls).not.toContain("https://acme.com/deep/customer-story");
    expect(result.manifest.plannedUrls[0]).toBe("https://acme.com/");
  });

  it("falls back to public-web enrichment when first-party crawl coverage is exhausted", async () => {
    const stub = createRepositoryStub();
    const crawler = createCompanySiteCrawler({
      repository: stub.repository,
      config: {
        maxHtmlPages: 2,
        maxPdfLinks: 0,
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
        if (url === "https://www.ford.com/") {
          throw new PipelineStepError(
            "CRAWL_RESPONSE_TOO_LARGE",
            "Skipping https://www.ford.com/ because it exceeded the crawl response budget.",
          );
        }

        if (url.startsWith("https://www.ford.com/")) {
          throw new PipelineStepError(
            "CRAWL_TOO_MANY_REDIRECTS",
            `Too many redirects while fetching ${url}.`,
          );
        }

        throw new Error(`Unexpected URL: ${url}`);
      },
      parseDocument: () => ({
        title: "Ford",
        canonicalUrl: "https://www.ford.com/",
        markdownContent: "# Ford",
        textContent: "Ford",
        parsingStrategy: "full",
        publishedAt: null,
        updatedAtHint: null,
        links: [],
      }),
      storeBlobArtifact: async () => null,
    });

    const context: StoredRunContext = {
      report: {
        id: 13,
        shareId: "jfmrnvj4ng",
        status: "running",
        normalizedInputUrl: "https://www.ford.com/",
        canonicalDomain: "ford.com",
        companyName: null,
        createdAt: new Date("2026-04-09T20:25:49.000Z"),
        updatedAt: new Date("2026-04-09T20:25:49.000Z"),
        completedAt: null,
        failedAt: null,
      },
      run: {
        id: 13,
        reportId: 13,
        attemptNumber: 1,
        status: "fetching",
        executionMode: "vercel_queue",
        progressPercent: 6,
        stepKey: "crawl_company_site",
        statusMessage: "Crawl company site started.",
        pipelineState: createInitialPipelineState(),
        queueMessageId: "msg_123",
        vectorStoreId: null,
        researchSummary: null,
        accountPlan: null,
        errorCode: null,
        errorMessage: null,
        createdAt: new Date("2026-04-09T20:25:49.000Z"),
        updatedAt: new Date("2026-04-09T20:25:49.000Z"),
        startedAt: new Date("2026-04-09T20:25:52.000Z"),
        lastHeartbeatAt: null,
        completedAt: null,
        failedAt: null,
      },
    };

    const result = await crawler.crawlCompanySite(context);

    expect(result.pagesFetched).toBe(0);
    expect(result.coverageStatus).toBe("minimal");
    expect(result.fallbackPlanApplied).toBe("search_first");
    expect(result.limitations).toContain("first_party_crawl_unavailable");
    expect(stub.events.some((event) => event.eventType === "crawl.source.skipped" && event.message.includes("ford.com/"))).toBe(true);
    expect(
      stub.events.some(
        (event) =>
          event.eventType === "crawl.fallback_plan_selected" &&
          event.message.includes("search-first public-web research mode"),
      ),
    ).toBe(true);
  });

  it("stores truncated first-party HTML and continues to linked key pages", async () => {
    const stub = createRepositoryStub();
    const crawler = createCompanySiteCrawler({
      repository: stub.repository,
      config: {
        maxHtmlPages: 2,
        maxPdfLinks: 0,
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
        if (url === "https://www.ford.com/") {
          return {
            finalUrl: url,
            status: 200,
            mimeType: "text/html",
            buffer: Buffer.from(
              "<html><body><nav><a href=\"/about\">About</a><a href=\"/products\">Products</a></nav><main><h1>Ford</h1><p>Automotive company</p>",
            ),
            truncated: true,
            declaredContentLength: 900_000,
            retrievedAt: new Date("2026-04-09T20:25:52.000Z"),
          };
        }

        if (url === "https://www.ford.com/about") {
          throw new PipelineStepError(
            "CRAWL_TOO_MANY_REDIRECTS",
            "Too many redirects while fetching https://www.ford.com/about.",
          );
        }

        if (url === "https://www.ford.com/products") {
          return {
            finalUrl: url,
            status: 200,
            mimeType: "text/html",
            buffer: Buffer.from("<html><body><main><h1>Vehicles</h1><p>F-150 and more</p></main></body></html>"),
            truncated: false,
            declaredContentLength: 82,
            retrievedAt: new Date("2026-04-09T20:25:53.000Z"),
          };
        }

        throw new Error(`Unexpected URL: ${url}`);
      },
      parseDocument: ({ finalUrl, html }) => ({
        title: finalUrl === "https://www.ford.com/" ? "Ford" : "Vehicles",
        canonicalUrl: finalUrl,
        markdownContent: `# ${finalUrl}`,
        textContent: html.includes("F-150") ? "Vehicles F-150 and more" : "Ford Automotive company",
        parsingStrategy: finalUrl === "https://www.ford.com/" ? "fallback" : "full",
        publishedAt: null,
        updatedAtHint: null,
        links:
          finalUrl === "https://www.ford.com/"
            ? [
                { url: "/about", anchorText: "About" },
                { url: "/products", anchorText: "Products" },
              ]
            : [],
      }),
      storeBlobArtifact: async () => null,
    });

    const context: StoredRunContext = {
      report: {
        id: 14,
        shareId: "fordlimited1",
        status: "running",
        normalizedInputUrl: "https://www.ford.com/",
        canonicalDomain: "ford.com",
        companyName: null,
        createdAt: new Date("2026-04-09T20:25:49.000Z"),
        updatedAt: new Date("2026-04-09T20:25:49.000Z"),
        completedAt: null,
        failedAt: null,
      },
      run: {
        id: 14,
        reportId: 14,
        attemptNumber: 1,
        status: "fetching",
        executionMode: "vercel_queue",
        progressPercent: 6,
        stepKey: "crawl_company_site",
        statusMessage: "Crawl company site started.",
        pipelineState: createInitialPipelineState(),
        queueMessageId: "msg_124",
        vectorStoreId: null,
        researchSummary: null,
        accountPlan: null,
        errorCode: null,
        errorMessage: null,
        createdAt: new Date("2026-04-09T20:25:49.000Z"),
        updatedAt: new Date("2026-04-09T20:25:49.000Z"),
        startedAt: new Date("2026-04-09T20:25:52.000Z"),
        lastHeartbeatAt: null,
        completedAt: null,
        failedAt: null,
      },
    };

    const result = await crawler.crawlCompanySite(context);

    expect(result.pagesFetched).toBe(2);
    expect(result.htmlPagesStored).toBe(2);
    expect(result.coverageStatus).toBe("broad");
    expect(stub.events.some((event) => event.eventType === "crawl.source.truncated")).toBe(true);
    expect(stub.events.some((event) => event.eventType === "crawl.parser_fallback_applied")).toBe(true);
  });
});
