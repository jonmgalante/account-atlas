import { describe, expect, it } from "vitest";

import type {
  CreatedQueuedReportRecord,
  ReportRepository,
  StoredReportShell,
} from "@/server/repositories/report-repository";
import { createReportService } from "@/server/services/report-service";
import { createInitialPipelineState } from "@/server/pipeline/pipeline-steps";

function createRepositoryStub() {
  const storedReports = new Map<string, StoredReportShell>();
  const unavailableShareIds = new Set<string>();
  const storedSources = new Map<number, Awaited<ReturnType<ReportRepository["listSourcesByRunId"]>>>();
  const storedFacts = new Map<number, Awaited<ReturnType<ReportRepository["listFactsByRunId"]>>>();
  const storedArtifacts = new Map<number, Awaited<ReturnType<ReportRepository["listArtifactsByRunId"]>>>();
  const requestRecords: Array<{ requesterHash: string; outcome: string }> = [];

  const repository: ReportRepository = {
    async isShareIdAvailable(shareId) {
      return !unavailableShareIds.has(shareId) && !storedReports.has(shareId);
    },

    async createQueuedReport(input) {
      const created: CreatedQueuedReportRecord = {
        report: {
          id: 1,
          shareId: input.shareId,
          status: "queued",
          normalizedInputUrl: input.normalizedInputUrl,
          canonicalDomain: input.canonicalDomain,
          companyName: input.companyName ?? null,
          createdAt: new Date("2026-04-07T12:00:00.000Z"),
          updatedAt: new Date("2026-04-07T12:00:00.000Z"),
          completedAt: null,
          failedAt: null,
        },
        currentRun: {
          id: 11,
          reportId: 1,
          attemptNumber: 1,
          status: "queued",
          executionMode: input.executionMode,
          progressPercent: 0,
          stepKey: null,
          statusMessage: "Report queued for processing.",
          pipelineState: createInitialPipelineState(),
          queueMessageId: null,
          vectorStoreId: null,
          researchSummary: null,
          accountPlan: null,
          errorCode: null,
          errorMessage: null,
          createdAt: new Date("2026-04-07T12:00:00.000Z"),
          updatedAt: new Date("2026-04-07T12:00:00.000Z"),
          startedAt: null,
          lastHeartbeatAt: null,
          completedAt: null,
          failedAt: null,
        },
      };

      storedReports.set(input.shareId, {
        report: created.report,
        currentRun: created.currentRun,
        recentEvents: [],
      });
      storedSources.set(created.currentRun.id, []);
      storedFacts.set(created.currentRun.id, []);
      storedArtifacts.set(created.currentRun.id, []);

      return created;
    },

    async findReportShellByShareId(shareId) {
      return storedReports.get(shareId) ?? null;
    },

    async findLatestReportShellByCanonicalDomain(canonicalDomain) {
      return [...storedReports.values()].find((entry) => entry.report.canonicalDomain === canonicalDomain) ?? null;
    },

    async findRunContextById() {
      throw new Error("Not needed in this test");
    },

    async listSourcesByRunId(runId) {
      return storedSources.get(runId) ?? [];
    },

    async listFactsByRunId(runId) {
      return storedFacts.get(runId) ?? [];
    },

    async listArtifactsByRunId(runId) {
      return storedArtifacts.get(runId) ?? [];
    },

    async findArtifactByShareId(shareId, artifactType) {
      const shell = storedReports.get(shareId);

      if (!shell?.currentRun) {
        return null;
      }

      return (
        storedArtifacts.get(shell.currentRun.id)?.find((artifact) => artifact.artifactType === artifactType) ?? null
      );
    },

    async countRecentRequestsByRequester(input) {
      return requestRecords.filter(
        (record) =>
          record.requesterHash === input.requesterHash &&
          ["created", "dispatch_failed"].includes(record.outcome),
      ).length;
    },

    async recordReportRequest(input) {
      requestRecords.push({
        requesterHash: input.requesterHash,
        outcome: input.outcome,
      });
    },

    async setRunDispatchState({ runId, executionMode, queueMessageId, statusMessage }) {
      for (const entry of storedReports.values()) {
        if (entry.currentRun?.id === runId) {
          entry.currentRun = {
            ...entry.currentRun,
            executionMode,
            queueMessageId: queueMessageId ?? null,
            statusMessage,
            updatedAt: new Date("2026-04-07T12:01:00.000Z"),
          };
          entry.report = {
            ...entry.report,
            updatedAt: new Date("2026-04-07T12:01:00.000Z"),
          };
        }
      }
    },

    async updateRunStepState() {
      throw new Error("Not needed in this test");
    },

    async setRunVectorStore() {
      throw new Error("Not needed in this test");
    },

    async updateRunResearchSummary() {
      throw new Error("Not needed in this test");
    },

    async updateRunAccountPlan() {
      throw new Error("Not needed in this test");
    },

    async appendRunEvent({ runId, level, eventType, message }) {
      for (const entry of storedReports.values()) {
        if (entry.currentRun?.id === runId) {
          entry.recentEvents.push({
            id: entry.recentEvents.length + 1,
            level,
            eventType,
            stepKey: null,
            message,
            occurredAt: new Date("2026-04-07T12:01:00.000Z"),
          });
        }
      }
    },

    async upsertCrawledSource() {
      throw new Error("Not needed in this test");
    },

    async updateSourceStoragePointers() {
      throw new Error("Not needed in this test");
    },

    async replaceFactsForRun() {
      throw new Error("Not needed in this test");
    },

    async replaceUseCasesForRun() {
      throw new Error("Not needed in this test");
    },

    async replaceStakeholdersForRun() {
      throw new Error("Not needed in this test");
    },

    async upsertArtifact() {
      throw new Error("Not needed in this test");
    },
  };

  return {
    repository,
    unavailableShareIds,
    storedReports,
    storedSources,
    storedFacts,
    storedArtifacts,
    requestRecords,
  };
}

describe("createReportService", () => {
  it("creates and dispatches a queued report with a canonical domain", async () => {
    const { repository } = createRepositoryStub();
    const service = createReportService({
      repository,
      shareIdGenerator: () => "atlas12345",
      dispatcher: {
        resolvePreferredExecutionMode: () => "inline",
        dispatch: async () => ({
          executionMode: "inline",
          queueMessageId: null,
          statusMessage: "Report run started inline for local development.",
        }),
      },
    });

    const result = await service.createReport("https://www.openai.com");

    expect(result.shareId).toBe("atlas12345");
    expect(result.runId).toBe(11);
    expect(result.disposition).toBe("created");
    expect(result.reuseReason).toBeNull();
    expect(result.report.normalizedInputUrl).toBe("https://www.openai.com/");
    expect(result.report.canonicalDomain).toBe("openai.com");
    expect(result.currentRun.executionMode).toBe("inline");
    expect(result.currentRun.progress.steps).toHaveLength(8);
  });

  it("retries when a generated share ID is already taken", async () => {
    const { repository, unavailableShareIds } = createRepositoryStub();
    unavailableShareIds.add("taken-id");

    const generatedIds = ["taken-id", "fresh-id"];
    const service = createReportService({
      repository,
      shareIdGenerator: () => {
        const next = generatedIds.shift();

        if (!next) {
          throw new Error("Expected another generated ID");
        }

        return next;
      },
      dispatcher: {
        resolvePreferredExecutionMode: () => "inline",
        dispatch: async () => ({
          executionMode: "inline",
          queueMessageId: null,
          statusMessage: "Report run started inline for local development.",
        }),
      },
    });

    const result = await service.createReport("example.com");

    expect(result.shareId).toBe("fresh-id");
  });

  it("reuses a recent completed report for the same domain", async () => {
    const { repository, storedReports } = createRepositoryStub();
    const service = createReportService({
      repository,
      shareIdGenerator: () => "atlas12345",
      dispatcher: {
        resolvePreferredExecutionMode: () => "inline",
        dispatch: async () => ({
          executionMode: "inline",
          queueMessageId: null,
          statusMessage: "Report run started inline for local development.",
        }),
      },
    });

    const created = await service.createReport("example.com");
    const stored = storedReports.get(created.shareId);

    if (!stored?.currentRun) {
      throw new Error("Expected stored run");
    }

    stored.report.status = "ready";
    stored.report.completedAt = new Date();
    stored.currentRun.status = "completed";
    stored.currentRun.completedAt = new Date();
    stored.currentRun.statusMessage = "Reusing a recent completed report.";

    const reused = await service.createReport("https://www.example.com/about", {
      requesterHash: "reuse-hash",
    });

    expect(reused.disposition).toBe("reused");
    expect(reused.reuseReason).toBe("recent_completed");
    expect(reused.shareId).toBe(created.shareId);
  });

  it("rate limits repeated new report creation attempts for the same requester", async () => {
    const { repository, requestRecords } = createRepositoryStub();
    const service = createReportService({
      repository,
      shareIdGenerator: () => "atlas12345",
      dispatcher: {
        resolvePreferredExecutionMode: () => "inline",
        dispatch: async () => ({
          executionMode: "inline",
          queueMessageId: null,
          statusMessage: "Report run started inline for local development.",
        }),
      },
    });

    for (let index = 0; index < 8; index += 1) {
      requestRecords.push({
        requesterHash: "rate-limited-hash",
        outcome: "created",
      });
    }

    await expect(
      service.createReport("https://newco.example", {
        requesterHash: "rate-limited-hash",
      }),
    ).rejects.toMatchObject({
      code: "RATE_LIMITED",
      status: 429,
    });
  });

  it("returns a status shell with polling metadata", async () => {
    const { repository } = createRepositoryStub();
    const service = createReportService({ repository });

    const created = await service.createReport("example.com");
    const status = await service.getReportStatusShell(created.shareId);

    expect(status?.shareId).toBe(created.shareId);
    expect(status?.statusUrl).toBe(`/api/reports/${created.shareId}/status`);
    expect(status?.pollAfterMs).toBe(2000);
    expect(status?.isTerminal).toBe(false);
  });

  it("returns a not-found placeholder page model", async () => {
    const { repository } = createRepositoryStub();
    const service = createReportService({ repository });

    const result = await service.getReportPageModel("missing-report");

    expect(result.status).toBe("not-found");
    expect(result.sections).toHaveLength(10);
  });

  it("returns a full report document with persisted facts, sources, and artifacts", async () => {
    const { repository, storedReports, storedSources, storedFacts, storedArtifacts } = createRepositoryStub();
    const service = createReportService({ repository });
    const created = await service.createReport("example.com");
    const stored = storedReports.get(created.shareId);

    if (!stored?.currentRun) {
      throw new Error("Expected stored run");
    }

    stored.currentRun.researchSummary = {
      companyIdentity: {
        companyName: "Example",
        archetype: "B2B software vendor",
        businessModel: "Enterprise software",
        industry: "Software",
        publicCompany: false,
        headquarters: null,
        sourceIds: [1],
      },
      growthPriorities: [],
      aiMaturityEstimate: {
        level: "moderate",
        rationale: "Public materials indicate platform and support scale.",
        sourceIds: [1],
      },
      regulatorySensitivity: {
        level: "medium",
        rationale: "The company handles operational workflows with trust expectations.",
        sourceIds: [1],
      },
      notableProductSignals: [],
      notableHiringSignals: [],
      notableTrustSignals: [],
      complaintThemes: [],
      leadershipSocialThemes: [],
      researchCompletenessScore: 68,
      confidenceBySection: [
        {
          section: "company-brief",
          confidence: 81,
          rationale: "Identity and positioning are clear.",
        },
      ],
      evidenceGaps: ["Limited public details on production rollout."],
      overallConfidence: "medium",
      sourceIds: [1],
    };

    storedSources.set(stored.currentRun.id, [
      {
        id: 1,
        reportId: stored.report.id,
        runId: stored.currentRun.id,
        url: "https://example.com/",
        normalizedUrl: "https://example.com/",
        canonicalUrl: "https://example.com/",
        canonicalDomain: "example.com",
        title: "Example",
        sourceType: "company_homepage",
        sourceTier: "primary",
        mimeType: "text/html",
        discoveredAt: new Date("2026-04-07T12:00:00.000Z"),
        publishedAt: null,
        updatedAtHint: null,
        retrievedAt: new Date("2026-04-07T12:00:00.000Z"),
        contentHash: "abc123",
        textContent: "Example overview.",
        markdownContent: "# Example",
        storagePointers: {
          summary: "Example provides enterprise workflow software.",
        },
        createdAt: new Date("2026-04-07T12:00:00.000Z"),
        updatedAt: new Date("2026-04-07T12:00:00.000Z"),
      },
    ]);

    storedFacts.set(stored.currentRun.id, [
      {
        id: 1,
        reportId: stored.report.id,
        runId: stored.currentRun.id,
        sourceId: 1,
        section: "fact-base",
        classification: "fact",
        statement: "Example publicly positions itself around enterprise workflow software.",
        rationale: "This is explicit in the company overview.",
        confidence: 84,
        freshness: "current",
        sentiment: "neutral",
        relevance: 90,
        evidenceSnippet: "Enterprise workflow software.",
        sourceIds: [1],
        createdAt: new Date("2026-04-07T12:00:00.000Z"),
        updatedAt: new Date("2026-04-07T12:00:00.000Z"),
      },
    ]);

    storedArtifacts.set(stored.currentRun.id, [
      {
        id: 1,
        reportId: stored.report.id,
        runId: stored.currentRun.id,
        artifactType: "markdown",
        mimeType: "text/markdown; charset=utf-8",
        fileName: "example-account-atlas-atlas12345.md",
        storagePointers: {
          storageMode: "inline_text",
          inlineText: "# Example",
        },
        contentHash: "hash123",
        sizeBytes: 9,
        createdAt: new Date("2026-04-07T12:00:00.000Z"),
        updatedAt: new Date("2026-04-07T12:00:00.000Z"),
      },
    ]);

    const document = await service.getReportDocument(created.shareId);

    expect(document?.sources).toHaveLength(1);
    expect(document?.facts).toHaveLength(1);
    expect(document?.artifacts).toHaveLength(1);
    expect(document?.artifacts[0]?.downloadPath).toBe(`/api/reports/${created.shareId}/artifacts/markdown`);
    expect(document?.sectionAssessments).toHaveLength(10);
    expect(document?.thinEvidenceWarnings.length).toBeGreaterThan(0);
    expect(document?.result.state).toBe("partial");
  });

  it("does not advertise unsupported download routes for non-export artifacts", async () => {
    const { repository, storedArtifacts } = createRepositoryStub();
    const service = createReportService({ repository });
    const created = await service.createReport("example.com");

    storedArtifacts.set(created.runId, [
      {
        id: 1,
        reportId: 1,
        runId: created.runId,
        artifactType: "source_bundle",
        mimeType: "application/json",
        fileName: "crawl-manifest.json",
        storagePointers: {
          inlineJson: "{\"ok\":true}",
        },
        contentHash: "hash123",
        sizeBytes: 11,
        createdAt: new Date("2026-04-07T12:00:00.000Z"),
        updatedAt: new Date("2026-04-07T12:00:00.000Z"),
      },
    ]);

    const document = await service.getReportDocument(created.shareId);

    expect(document?.artifacts).toHaveLength(1);
    expect(document?.artifacts[0]?.artifactType).toBe("source_bundle");
    expect(document?.artifacts[0]?.downloadPath).toBeNull();
  });

  it("returns inline artifact downloads when Blob storage is unavailable", async () => {
    const { repository, storedArtifacts } = createRepositoryStub();
    const service = createReportService({ repository });
    const created = await service.createReport("example.com");

    storedArtifacts.set(created.runId, [
      {
        id: 1,
        reportId: 1,
        runId: created.runId,
        artifactType: "markdown",
        mimeType: "text/markdown; charset=utf-8",
        fileName: "example-account-atlas-atlas12345.md",
        storagePointers: {
          storageMode: "inline_text",
          inlineText: "# Example",
        },
        contentHash: "hash123",
        sizeBytes: 9,
        createdAt: new Date("2026-04-07T12:00:00.000Z"),
        updatedAt: new Date("2026-04-07T12:00:00.000Z"),
      },
    ]);

    const artifact = await service.getArtifactDownload(created.shareId, "markdown");

    expect(artifact).not.toBeNull();
    expect(artifact?.kind).toBe("inline");

    if (artifact?.kind !== "inline") {
      throw new Error("Expected inline artifact");
    }

    expect(artifact.body).toBe("# Example");
  });
});
