import { describe, expect, it } from "vitest";

import type {
  CreatedQueuedReportRecord,
  ReportRepository,
  StoredReportShell,
} from "@/server/repositories/report-repository";
import type { DeepResearchReportGenerationService } from "@/server/deep-research/report-generation-service";
import { createReportService } from "@/server/services/report-service";
import { createInitialPipelineState } from "@/server/pipeline/pipeline-steps";

function createMinimalAccountPlan() {
  return {
    overallAccountMotion: {
      recommendedMotion: "workspace" as const,
      rationale: "The strongest visible workflows are knowledge-heavy and can start without deep integration.",
      evidenceSourceIds: [1],
    },
    candidateUseCases: [
      {
        priorityRank: 1,
        department: "sales" as const,
        workflowName: "Account research copilot",
        summary: "Prepare sellers with account context before discovery.",
        painPoint: "Reps lose time gathering fragmented company context.",
        whyNow: "Public materials show enough signal to prioritize a seller workflow.",
        likelyUsers: ["Account executives"],
        expectedOutcome: "Faster prep and stronger discovery quality.",
        metrics: ["Prep time"],
        dependencies: ["Sales content owners"],
        securityComplianceNotes: [],
        recommendedMotion: "workspace" as const,
        motionRationale: "Knowledge-heavy workflow with light integration needs.",
        evidenceSourceIds: [1],
        openQuestions: ["Where is the latest account brief assembled today?"],
        scorecard: {
          businessValue: 88,
          deploymentReadiness: 82,
          expansionPotential: 80,
          openaiFit: 90,
          sponsorLikelihood: 78,
          evidenceConfidence: 79,
          riskPenalty: 12,
          priorityScore: 81.9,
        },
      },
      {
        priorityRank: 2,
        department: "customer_support" as const,
        workflowName: "Support triage assistant",
        summary: "Summarize and route incoming issues.",
        painPoint: "Teams lose time triaging repetitive inbound tickets.",
        whyNow: "Support scale and trust requirements are visible publicly.",
        likelyUsers: ["Support leads"],
        expectedOutcome: "Faster routing and clearer issue handling.",
        metrics: ["First response time"],
        dependencies: ["Knowledge base owners"],
        securityComplianceNotes: [],
        recommendedMotion: "hybrid" as const,
        motionRationale: "Requires knowledge access plus workflow hooks.",
        evidenceSourceIds: [1],
        openQuestions: ["Which systems own routing rules today?"],
        scorecard: {
          businessValue: 82,
          deploymentReadiness: 78,
          expansionPotential: 79,
          openaiFit: 83,
          sponsorLikelihood: 75,
          evidenceConfidence: 74,
          riskPenalty: 14,
          priorityScore: 77.5,
        },
      },
      {
        priorityRank: 3,
        department: "engineering" as const,
        workflowName: "Developer documentation assistant",
        summary: "Improve access to platform guidance and trust docs.",
        painPoint: "Engineers lose time searching fragmented documentation.",
        whyNow: "Platform positioning is explicit in public sources.",
        likelyUsers: ["Developers"],
        expectedOutcome: "Faster implementation cycles.",
        metrics: ["Time to resolve documentation questions"],
        dependencies: ["Current docs corpus"],
        securityComplianceNotes: [],
        recommendedMotion: "workspace" as const,
        motionRationale: "Documentation-heavy workflow fits workspace-first adoption.",
        evidenceSourceIds: [1],
        openQuestions: ["How current is the internal docs corpus?"],
        scorecard: {
          businessValue: 79,
          deploymentReadiness: 80,
          expansionPotential: 77,
          openaiFit: 84,
          sponsorLikelihood: 71,
          evidenceConfidence: 73,
          riskPenalty: 10,
          priorityScore: 76.9,
        },
      },
    ],
    topUseCases: [],
    stakeholderHypotheses: [
      {
        likelyRole: "Revenue Operations lead",
        department: "sales",
        hypothesis: "Likely sponsor for seller workflow acceleration.",
        rationale: "Commercial workflow efficiency is central to the visible use cases.",
        confidence: 76,
        evidenceSourceIds: [1],
      },
    ],
    objectionsAndRebuttals: [],
    discoveryQuestions: [
      {
        question: "Which workflow has the strongest business owner today?",
        whyItMatters: "A pilot needs a clear operational owner to move quickly.",
        evidenceSourceIds: [1],
      },
    ],
    pilotPlan: null,
    expansionScenarios: {
      low: null,
      base: null,
      high: null,
    },
  };
}

function createMinimalResearchSummary() {
  return {
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
      level: "moderate" as const,
      rationale: "Public materials indicate platform and support scale.",
      sourceIds: [1],
    },
    regulatorySensitivity: {
      level: "medium" as const,
      rationale: "The company handles operational workflows with trust expectations.",
      sourceIds: [1],
    },
    notableProductSignals: [],
    notableHiringSignals: [],
    notableTrustSignals: [],
    complaintThemes: [],
    leadershipSocialThemes: [],
    researchCompletenessScore: 68,
    confidenceBySection: [],
    evidenceGaps: [],
    overallConfidence: "medium" as const,
    sourceIds: [1],
  };
}

function createRepositoryStub() {
  const storedReports = new Map<string, StoredReportShell>();
  const unavailableShareIds = new Set<string>();
  const storedSources = new Map<number, Awaited<ReturnType<ReportRepository["listSourcesByRunId"]>>>();
  const storedFacts = new Map<number, Awaited<ReturnType<ReportRepository["listFactsByRunId"]>>>();
  const storedArtifacts = new Map<number, Awaited<ReturnType<ReportRepository["listArtifactsByRunId"]>>>();
  const requestRecords: Array<{ requesterHash: string; outcome: string }> = [];
  let nextReportId = 1;
  let nextRunId = 11;

  const repository: ReportRepository = {
    async isShareIdAvailable(shareId) {
      return !unavailableShareIds.has(shareId) && !storedReports.has(shareId);
    },

    async createQueuedReport(input) {
      const reportId = nextReportId;
      const runId = nextRunId;
      nextReportId += 1;
      nextRunId += 1;

      const created: CreatedQueuedReportRecord = {
        report: {
          id: reportId,
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
          id: runId,
          reportId,
          attemptNumber: 1,
          status: "queued",
          executionMode: input.executionMode,
          progressPercent: 0,
          stepKey: null,
          statusMessage: "Report queued for processing.",
          pipelineState: createInitialPipelineState(),
          queueMessageId: null,
          vectorStoreId: null,
          openaiResponseId: null,
          openaiResponseStatus: null,
          openaiResponseMetadata: {},
          openaiOutputText: null,
          canonicalReport: null,
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
      return (
        [...storedReports.values()]
          .filter((entry) => entry.report.canonicalDomain === canonicalDomain)
          .sort((left, right) => right.report.updatedAt.getTime() - left.report.updatedAt.getTime())[0] ?? null
      );
    },

    async findLatestReadyReportShellByCanonicalDomain(canonicalDomain) {
      return (
        [...storedReports.values()]
          .filter(
            (entry) =>
              entry.report.canonicalDomain === canonicalDomain &&
              ["ready", "ready_with_limited_coverage"].includes(entry.report.status),
          )
          .sort((left, right) => {
            const leftCompletedAt = left.report.completedAt?.getTime() ?? 0;
            const rightCompletedAt = right.report.completedAt?.getTime() ?? 0;
            return rightCompletedAt - leftCompletedAt || right.report.updatedAt.getTime() - left.report.updatedAt.getTime();
          })[0] ?? null
      );
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
      const updatedAt = new Date();

      for (const entry of storedReports.values()) {
        if (entry.currentRun?.id === runId) {
          entry.currentRun = {
            ...entry.currentRun,
            executionMode,
            queueMessageId: queueMessageId ?? null,
            statusMessage,
            updatedAt,
          };
          entry.report = {
            ...entry.report,
            updatedAt,
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

    async setRunOpenAIState({ runId, openaiResponseId, openaiResponseStatus, openaiResponseMetadata, openaiOutputText, canonicalReport, statusMessage }) {
      const updatedAt = new Date();

      for (const entry of storedReports.values()) {
        if (entry.currentRun?.id === runId) {
          entry.currentRun = {
            ...entry.currentRun,
            ...(openaiResponseId !== undefined ? { openaiResponseId } : {}),
            ...(openaiResponseStatus !== undefined ? { openaiResponseStatus } : {}),
            ...(openaiResponseMetadata !== undefined ? { openaiResponseMetadata } : {}),
            ...(openaiOutputText !== undefined ? { openaiOutputText } : {}),
            ...(canonicalReport !== undefined ? { canonicalReport } : {}),
            ...(statusMessage !== undefined ? { statusMessage } : {}),
            updatedAt,
          };
          entry.report = {
            ...entry.report,
            updatedAt,
          };
        }
      }
    },

    async updateRunResearchSummary() {
      throw new Error("Not needed in this test");
    },

    async updateRunAccountPlan() {
      throw new Error("Not needed in this test");
    },

    async claimRunStepExecution() {
      throw new Error("Not needed in this test");
    },

    async touchRunHeartbeat() {
      return;
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

function createReportGenerationStub(input: {
  storedReports: Map<string, StoredReportShell>;
  syncByShareId?: Map<string, (shell: StoredReportShell) => void | Promise<void>>;
}) {
  const startCalls: number[] = [];
  const syncCalls: string[] = [];
  const syncByShareId = input.syncByShareId ?? new Map<string, (shell: StoredReportShell) => void | Promise<void>>();

  const reportGenerationService: DeepResearchReportGenerationService = {
    async startReportRun({ report, run }) {
      startCalls.push(run.id);
      const shell = input.storedReports.get(report.shareId);
      const now = new Date();

      if (!shell?.currentRun) {
        throw new Error("Expected stored run");
      }

      shell.report.status = "running";
      shell.report.updatedAt = now;
      shell.currentRun.status = "synthesizing";
      shell.currentRun.executionMode = "inline";
      shell.currentRun.progressPercent = 62;
      shell.currentRun.stepKey = "generate_account_plan";
      shell.currentRun.statusMessage = "Started the deep research background job.";
      shell.currentRun.startedAt = now;
      shell.currentRun.updatedAt = now;
      shell.currentRun.openaiResponseId = `resp_${run.id}`;
      shell.currentRun.openaiResponseStatus = "queued";
      shell.currentRun.openaiResponseMetadata = {
        status: "queued",
      };
    },

    async syncReportRun({ shareId, shell }) {
      syncCalls.push(shareId);
      const currentShell = shell ?? input.storedReports.get(shareId) ?? null;

      if (!currentShell) {
        return null;
      }

      const syncHandler = syncByShareId.get(shareId);

      if (syncHandler) {
        await syncHandler(currentShell);
      }

      return input.storedReports.get(shareId) ?? currentShell;
    },
  };

  return {
    reportGenerationService,
    startCalls,
    syncCalls,
    syncByShareId,
  };
}

function createServiceHarness(input: {
  repository: ReportRepository;
  storedReports: Map<string, StoredReportShell>;
  shareIdGenerator?: () => string;
  syncByShareId?: Map<string, (shell: StoredReportShell) => void | Promise<void>>;
  exportService?: NonNullable<Parameters<typeof createReportService>[0]>["exportService"];
}) {
  const generation = createReportGenerationStub({
    storedReports: input.storedReports,
    syncByShareId: input.syncByShareId,
  });
  const service = createReportService({
    repository: input.repository,
    shareIdGenerator: input.shareIdGenerator,
    reportGenerationService: generation.reportGenerationService,
    exportService: input.exportService,
  });

  return {
    service,
    generation,
  };
}

describe("createReportService", () => {
  it("creates and dispatches a queued report with a canonical domain", async () => {
    const { repository, storedReports } = createRepositoryStub();
    const { service } = createServiceHarness({
      repository,
      storedReports,
      shareIdGenerator: () => "atlas12345",
    });

    const result = await service.createReport("https://www.openai.com");

    expect(result.shareId).toBe("atlas12345");
    expect(result.runId).toBe(11);
    expect(result.disposition).toBe("created");
    expect(result.reuseReason).toBeNull();
    expect(result.report.normalizedInputUrl).toBe("https://www.openai.com/");
    expect(result.report.canonicalDomain).toBe("openai.com");
    expect(result.currentRun.executionMode).toBe("inline");
    expect(result.currentRun.progress.steps).toHaveLength(3);
    expect(result.currentRun.stepLabel).toBe("Deep research");
  });

  it("retries when a generated share ID is already taken", async () => {
    const { repository, unavailableShareIds, storedReports } = createRepositoryStub();
    unavailableShareIds.add("taken-id");

    const generatedIds = ["taken-id", "fresh-id"];
    const { service } = createServiceHarness({
      repository,
      storedReports,
      shareIdGenerator: () => {
        const next = generatedIds.shift();

        if (!next) {
          throw new Error("Expected another generated ID");
        }

        return next;
      },
    });

    const result = await service.createReport("example.com");

    expect(result.shareId).toBe("fresh-id");
  });

  it("reuses a recent completed report for the same domain", async () => {
    const { repository, storedReports } = createRepositoryStub();
    const { service } = createServiceHarness({
      repository,
      storedReports,
      shareIdGenerator: () => "atlas12345",
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
    stored.currentRun.researchSummary = createMinimalResearchSummary();
    stored.currentRun.accountPlan = createMinimalAccountPlan();
    stored.currentRun.accountPlan.topUseCases = stored.currentRun.accountPlan.candidateUseCases.slice(0, 3);

    const reused = await service.createReport("https://www.example.com/about", {
      requesterHash: "reuse-hash",
    });

    expect(reused.disposition).toBe("reused");
    expect(reused.reuseReason).toBe("recent_completed");
    expect(reused.shareId).toBe(created.shareId);
  });

  it("treats ready_with_limited_coverage as a reusable terminal report", async () => {
    const { repository, storedReports } = createRepositoryStub();
    const { service } = createServiceHarness({
      repository,
      storedReports,
      shareIdGenerator: () => "atlas12345",
    });

    const created = await service.createReport("example.com");
    const stored = storedReports.get(created.shareId);

    if (!stored?.currentRun) {
      throw new Error("Expected stored run");
    }

    stored.report.status = "ready_with_limited_coverage";
    stored.report.completedAt = new Date();
    stored.currentRun.status = "completed";
    stored.currentRun.completedAt = new Date();
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
      confidenceBySection: [],
      evidenceGaps: ["Missing downloadable PDF export."],
      overallConfidence: "medium",
      sourceIds: [1],
    };
    stored.currentRun.accountPlan = createMinimalAccountPlan();
    stored.currentRun.accountPlan.topUseCases = stored.currentRun.accountPlan.candidateUseCases.slice(0, 3);

    const reused = await service.createReport("https://www.example.com/about", {
      requesterHash: "reuse-hash",
    });
    const status = await service.getReportStatusShell(created.shareId);

    expect(reused.disposition).toBe("reused");
    expect(reused.reuseReason).toBe("recent_completed");
    expect(status?.report.status).toBe("ready_with_limited_coverage");
    expect(status?.isTerminal).toBe(true);
    expect(status?.result.label).toBe("Limited coverage");
  });

  it("reuses a stale cached brief immediately and keeps refresh work off the first render", async () => {
    const { repository, storedReports } = createRepositoryStub();
    const generatedIds = ["atlas12345", "atlasrefresh1"];
    const { service, generation } = createServiceHarness({
      repository,
      storedReports,
      shareIdGenerator: () => {
        const next = generatedIds.shift();

        if (!next) {
          throw new Error("Expected another generated ID");
        }

        return next;
      },
    });

    const created = await service.createReport("example.com");
    const cached = storedReports.get(created.shareId);

    if (!cached?.currentRun) {
      throw new Error("Expected cached run");
    }

    const staleCompletedAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    cached.report.status = "ready";
    cached.report.completedAt = staleCompletedAt;
    cached.report.updatedAt = staleCompletedAt;
    cached.currentRun.status = "completed";
    cached.currentRun.completedAt = staleCompletedAt;
    cached.currentRun.updatedAt = staleCompletedAt;
    cached.currentRun.researchSummary = createMinimalResearchSummary();
    cached.currentRun.accountPlan = createMinimalAccountPlan();
    cached.currentRun.accountPlan.topUseCases = cached.currentRun.accountPlan.candidateUseCases.slice(0, 3);

    const reused = await service.createReport("https://www.example.com/about", {
      requesterHash: "cache-hit-hash",
    });
    const document = await service.getReportDocument(reused.shareId);

    expect(reused.shareId).toBe(created.shareId);
    expect(reused.reuseReason).toBe("cached_completed");
    expect(document?.currentRun?.accountPlan?.topUseCases).toHaveLength(3);
    expect(storedReports.size).toBe(2);
    expect(generation.startCalls).toHaveLength(2);

    const refreshEntry = [...storedReports.values()].find((entry) => entry.report.shareId !== created.shareId);

    expect(refreshEntry?.report.status).toBe("running");
    expect(refreshEntry?.currentRun?.status).toBe("synthesizing");

    const reusedAgain = await service.createReport("https://example.com/pricing", {
      requesterHash: "cache-hit-hash-2",
    });

    expect(reusedAgain.shareId).toBe(created.shareId);
    expect(reusedAgain.reuseReason).toBe("cached_completed");
    expect(generation.startCalls).toHaveLength(2);
  });

  it("does not reuse a recent failed report when the deep-research job never started", async () => {
    const { repository, storedReports } = createRepositoryStub();
    const generatedIds = ["atlas12345", "atlas67890"];
    const { service, generation } = createServiceHarness({
      repository,
      storedReports,
      shareIdGenerator: () => {
        const next = generatedIds.shift();

        if (!next) {
          throw new Error("Expected another generated ID");
        }

        return next;
      },
    });

    const created = await service.createReport("example.com");
    const stored = storedReports.get(created.shareId);

    if (!stored?.currentRun) {
      throw new Error("Expected stored run");
    }

    const failedAt = new Date();
    stored.report.status = "failed";
    stored.report.updatedAt = failedAt;
    stored.report.failedAt = failedAt;
    stored.currentRun.status = "failed";
    stored.currentRun.updatedAt = failedAt;
    stored.currentRun.failedAt = failedAt;
    stored.currentRun.errorCode = "DEEP_RESEARCH_START_FAILED";
    stored.currentRun.errorMessage = "OpenAI rejected the schema before the background job started.";
    stored.currentRun.statusMessage = "OpenAI rejected the schema before the background job started.";
    stored.currentRun.openaiResponseId = null;
    stored.currentRun.openaiResponseStatus = null;

    const retried = await service.createReport("https://www.example.com/about", {
      requesterHash: "retry-after-start-failure",
    });

    expect(retried.disposition).toBe("created");
    expect(retried.reuseReason).toBeNull();
    expect(retried.shareId).toBe("atlas67890");
    expect(generation.startCalls).toHaveLength(2);
  });

  it("still reuses a recent failed report after a real deep-research run started", async () => {
    const { repository, storedReports } = createRepositoryStub();
    const { service } = createServiceHarness({
      repository,
      storedReports,
      shareIdGenerator: () => "atlas12345",
    });

    const created = await service.createReport("example.com");
    const stored = storedReports.get(created.shareId);

    if (!stored?.currentRun) {
      throw new Error("Expected stored run");
    }

    const failedAt = new Date();
    stored.report.status = "failed";
    stored.report.updatedAt = failedAt;
    stored.report.failedAt = failedAt;
    stored.currentRun.status = "failed";
    stored.currentRun.updatedAt = failedAt;
    stored.currentRun.failedAt = failedAt;
    stored.currentRun.errorCode = "OPENAI_RESPONSE_FAILED";
    stored.currentRun.errorMessage = "The background response failed.";
    stored.currentRun.statusMessage = "The background response failed.";
    stored.currentRun.openaiResponseId = "resp_real_failure";
    stored.currentRun.openaiResponseStatus = "failed";

    const reused = await service.createReport("https://www.example.com/about", {
      requesterHash: "recent-failed-reuse",
    });

    expect(reused.disposition).toBe("reused");
    expect(reused.reuseReason).toBe("recent_failed");
    expect(reused.shareId).toBe(created.shareId);
  });

  it("rate limits repeated new report creation attempts for the same requester", async () => {
    const { repository, requestRecords, storedReports } = createRepositoryStub();
    const { service } = createServiceHarness({
      repository,
      storedReports,
      shareIdGenerator: () => "atlas12345",
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
    const { repository, storedReports } = createRepositoryStub();
    const { service } = createServiceHarness({ repository, storedReports });

    const created = await service.createReport("example.com");
    const status = await service.getReportStatusShell(created.shareId);

    expect(status?.shareId).toBe(created.shareId);
    expect(status?.statusUrl).toBe(`/api/reports/${created.shareId}/status`);
    expect(status?.pollAfterMs).toBe(2000);
    expect(status?.isTerminal).toBe(false);
  });

  it("syncs a background deep-research run to a terminal stored report", async () => {
    const { repository, storedReports } = createRepositoryStub();
    const syncByShareId = new Map<string, (shell: StoredReportShell) => void>();
    const { service } = createServiceHarness({
      repository,
      storedReports,
      syncByShareId,
    });
    const created = await service.createReport("example.com");

    syncByShareId.set(created.shareId, (shell) => {
      if (!shell.currentRun) {
        throw new Error("Expected stored run");
      }

      shell.report.status = "ready";
      shell.report.completedAt = new Date("2026-04-07T12:03:00.000Z");
      shell.currentRun.status = "completed";
      shell.currentRun.completedAt = new Date("2026-04-07T12:03:00.000Z");
      shell.currentRun.statusMessage = "The deep research background job completed with a source-backed account plan.";
      shell.currentRun.openaiResponseStatus = "completed";
      shell.currentRun.openaiOutputText = "{\"ok\":true}";
      shell.currentRun.canonicalReport = {
        company: {
          resolved_name: "Example",
          canonical_domain: "example.com",
          relationship_to_url: null,
          archetype: "B2B software vendor",
          company_brief: "Example sells enterprise software.",
          business_model: "Enterprise software",
          customer_type: "Enterprise teams",
          industry: "Software",
          sector: "Technology",
          offerings: "Workflow software",
          headquarters: "New York, NY",
          public_company: false,
          citations: [{ source_id: 1, support: "Homepage summary." }],
        },
        report_metadata: {
          schema_name: "account_atlas_canonical_report",
          schema_version: 1,
          report_type: "seller_facing_account_plan",
          generated_at: "2026-04-07T12:03:00.000Z",
          company_url: "https://example.com/",
          normalized_company_url: "https://example.com/",
          canonical_domain: "example.com",
          report_mode: "full_report",
        },
        executive_summary: {
          summary: "Example has clear enterprise workflow positioning.",
          why_now: "Public signals point to workflow scale pressure.",
          strategic_takeaway: "Lead with seller workflow acceleration.",
          citations: [{ source_id: 1, support: "Homepage summary." }],
        },
        fact_base: [],
        ai_maturity_signals: {
          maturity_level: "moderate",
          maturity_summary: "Example has product and trust signals.",
          notable_signals: [],
          regulatory_sensitivity: {
            level: "medium",
            rationale: "Enterprise workflow systems carry trust expectations.",
            citations: [{ source_id: 1, support: "Homepage summary." }],
          },
          citations: [{ source_id: 1, support: "Homepage summary." }],
        },
        recommended_motion: {
          recommended_motion: "workspace",
          rationale: "Knowledge-heavy workflows dominate the first pilot.",
          deployment_shape: null,
          citations: [{ source_id: 1, support: "Homepage summary." }],
        },
        top_opportunities: [],
        buying_map: {
          stakeholder_hypotheses: [],
          likely_objections: [],
          discovery_questions: [],
        },
        pilot_plan: null,
        expansion_scenarios: {
          low: null,
          base: null,
          high: null,
        },
        evidence_coverage: {
          overall_confidence: {
            confidence_band: "medium",
            confidence_score: 68,
            rationale: "Enough public evidence is available.",
          },
          overall_coverage: {
            coverage_level: "usable",
            coverage_score: 70,
            rationale: "Coverage is sufficient for a directional plan.",
          },
          research_completeness_score: 70,
          thin_evidence: false,
          evidence_gaps: [],
          section_coverage: [
            {
              section: "company-brief",
              coverage: { coverage_level: "usable", coverage_score: 70, rationale: "Covered." },
              confidence: { confidence_band: "medium", confidence_score: 70, rationale: "Covered." },
              citations: [{ source_id: 1, support: "Homepage summary." }],
            },
            {
              section: "fact-base",
              coverage: { coverage_level: "usable", coverage_score: 70, rationale: "Covered." },
              confidence: { confidence_band: "medium", confidence_score: 70, rationale: "Covered." },
              citations: [{ source_id: 1, support: "Homepage summary." }],
            },
            {
              section: "ai-maturity-signals",
              coverage: { coverage_level: "usable", coverage_score: 70, rationale: "Covered." },
              confidence: { confidence_band: "medium", confidence_score: 70, rationale: "Covered." },
              citations: [{ source_id: 1, support: "Homepage summary." }],
            },
            {
              section: "prioritized-use-cases",
              coverage: { coverage_level: "thin", coverage_score: 50, rationale: "Thin." },
              confidence: { confidence_band: "low", confidence_score: 50, rationale: "Thin." },
              citations: [{ source_id: 1, support: "Homepage summary." }],
            },
            {
              section: "recommended-motion",
              coverage: { coverage_level: "usable", coverage_score: 70, rationale: "Covered." },
              confidence: { confidence_band: "medium", confidence_score: 70, rationale: "Covered." },
              citations: [{ source_id: 1, support: "Homepage summary." }],
            },
            {
              section: "stakeholder-hypotheses",
              coverage: { coverage_level: "thin", coverage_score: 50, rationale: "Thin." },
              confidence: { confidence_band: "low", confidence_score: 50, rationale: "Thin." },
              citations: [{ source_id: 1, support: "Homepage summary." }],
            },
            {
              section: "objections",
              coverage: { coverage_level: "thin", coverage_score: 50, rationale: "Thin." },
              confidence: { confidence_band: "low", confidence_score: 50, rationale: "Thin." },
              citations: [{ source_id: 1, support: "Homepage summary." }],
            },
            {
              section: "discovery-questions",
              coverage: { coverage_level: "thin", coverage_score: 50, rationale: "Thin." },
              confidence: { confidence_band: "low", confidence_score: 50, rationale: "Thin." },
              citations: [{ source_id: 1, support: "Homepage summary." }],
            },
            {
              section: "pilot-plan",
              coverage: { coverage_level: "thin", coverage_score: 50, rationale: "Thin." },
              confidence: { confidence_band: "low", confidence_score: 50, rationale: "Thin." },
              citations: [{ source_id: 1, support: "Homepage summary." }],
            },
            {
              section: "expansion-scenarios",
              coverage: { coverage_level: "thin", coverage_score: 50, rationale: "Thin." },
              confidence: { confidence_band: "low", confidence_score: 50, rationale: "Thin." },
              citations: [{ source_id: 1, support: "Homepage summary." }],
            },
          ],
        },
        confidence_notes: [],
        sources: [
          {
            source_id: 1,
            title: "Example",
            url: "https://example.com/",
            source_type: "company_homepage",
            source_tier: "primary",
            publisher: null,
            published_at: null,
            retrieved_at: "2026-04-07T12:02:00.000Z",
            summary: "Example homepage.",
          },
        ],
        grounded_fallback: null,
      };
      shell.currentRun.researchSummary = createMinimalResearchSummary();
      shell.currentRun.accountPlan = createMinimalAccountPlan();
      shell.currentRun.accountPlan.topUseCases = shell.currentRun.accountPlan.candidateUseCases.slice(0, 3);
    });

    const status = await service.getReportStatusShell(created.shareId);
    const stored = storedReports.get(created.shareId);

    expect(status?.isTerminal).toBe(true);
    expect(status?.report.status).toBe("ready");
    expect(stored?.currentRun?.openaiResponseStatus).toBe("completed");
    expect(stored?.currentRun?.canonicalReport?.report_metadata.schema_name).toBe("account_atlas_canonical_report");
  });

  it("treats a ready core brief as terminal even while optional work is still running", async () => {
    const { repository, storedReports } = createRepositoryStub();
    const { service } = createServiceHarness({ repository, storedReports });
    const created = await service.createReport("example.com");
    const stored = storedReports.get(created.shareId);

    if (!stored?.currentRun) {
      throw new Error("Expected stored run");
    }

    stored.report.status = "ready_with_limited_coverage";
    stored.report.completedAt = new Date("2026-04-07T12:02:00.000Z");
    stored.currentRun.status = "synthesizing";
    stored.currentRun.stepKey = "export_markdown";
    stored.currentRun.statusMessage = "Export markdown started.";
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
      confidenceBySection: [],
      evidenceGaps: ["Markdown export is still pending."],
      overallConfidence: "medium",
      sourceIds: [1],
    };
    stored.currentRun.accountPlan = createMinimalAccountPlan();
    stored.currentRun.accountPlan.topUseCases = stored.currentRun.accountPlan.candidateUseCases.slice(0, 3);

    const status = await service.getReportStatusShell(created.shareId);

    expect(status?.report.status).toBe("ready_with_limited_coverage");
    expect(status?.currentRun?.status).toBe("synthesizing");
    expect(status?.isTerminal).toBe(true);
    expect(status?.pollAfterMs).toBe(0);
    expect(status?.message).toContain("core brief is ready");
  });

  it("uses focused coverage copy when limited optional coverage follows a high evidence score", async () => {
    const { repository, storedReports } = createRepositoryStub();
    const { service } = createServiceHarness({ repository, storedReports });
    const created = await service.createReport("example.com");
    const stored = storedReports.get(created.shareId);

    if (!stored?.currentRun) {
      throw new Error("Expected stored run");
    }

    stored.report.status = "ready_with_limited_coverage";
    stored.report.completedAt = new Date("2026-04-07T12:02:00.000Z");
    stored.currentRun.status = "completed";
    stored.currentRun.completedAt = new Date("2026-04-07T12:02:00.000Z");
    stored.currentRun.researchSummary = {
      ...createMinimalResearchSummary(),
      researchCompletenessScore: 84,
      overallConfidence: "high",
    };
    stored.currentRun.accountPlan = createMinimalAccountPlan();
    stored.currentRun.accountPlan.topUseCases = stored.currentRun.accountPlan.candidateUseCases.slice(0, 3);

    const status = await service.getReportStatusShell(created.shareId);

    expect(status?.report.status).toBe("ready_with_limited_coverage");
    expect(status?.result.label).toBe("Focused coverage");
    expect(status?.result.summary).toContain("focused source coverage");
    expect(status?.message).toContain("focused source coverage");
  });

  it("does not treat an empty completed shell as a successful report", async () => {
    const { repository, storedReports } = createRepositoryStub();
    const { service } = createServiceHarness({ repository, storedReports });
    const created = await service.createReport("example.com");
    const stored = storedReports.get(created.shareId);

    if (!stored?.currentRun) {
      throw new Error("Expected stored run");
    }

    stored.report.status = "ready";
    stored.report.completedAt = new Date();
    stored.currentRun.status = "completed";
    stored.currentRun.completedAt = new Date();
    stored.currentRun.researchSummary = null;
    stored.currentRun.accountPlan = null;

    const shell = await service.getReportShell(created.shareId);
    const status = await service.getReportStatusShell(created.shareId);

    expect(shell?.result.state).toBe("failed");
    expect(shell?.result.label).toBe("Incomplete");
    expect(shell?.sections.every((section) => section.status === "pending")).toBe(true);
    expect(status?.result.state).toBe("failed");
    expect(status?.result.label).toBe("Incomplete");
  });

  it("returns a not-found placeholder page model", async () => {
    const { repository, storedReports } = createRepositoryStub();
    const { service } = createServiceHarness({ repository, storedReports });

    const result = await service.getReportPageModel("missing-report");

    expect(result.status).toBe("not-found");
    expect(result.sections).toHaveLength(10);
  });

  it("returns a full report document with persisted facts, sources, and artifacts", async () => {
    const { repository, storedReports, storedSources, storedFacts, storedArtifacts } = createRepositoryStub();
    const { service } = createServiceHarness({ repository, storedReports });
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
    const { repository, storedArtifacts, storedReports } = createRepositoryStub();
    const { service } = createServiceHarness({ repository, storedReports });
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
    const { repository, storedArtifacts, storedReports } = createRepositoryStub();
    const { service } = createServiceHarness({ repository, storedReports });
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

  it("materializes a missing Markdown artifact when loading a terminal report document", async () => {
    const { repository, storedReports, storedArtifacts } = createRepositoryStub();
    let markdownGenerations = 0;
    const { service } = createServiceHarness({
      repository,
      storedReports,
      exportService: {
        async generateMarkdownArtifact(context: { report: { id: number }; run: { id: number } }) {
          markdownGenerations += 1;
          const nextArtifacts = storedArtifacts.get(context.run.id) ?? [];
          nextArtifacts.push({
            id: nextArtifacts.length + 1,
            reportId: context.report.id,
            runId: context.run.id,
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
          });
          storedArtifacts.set(context.run.id, nextArtifacts);

          return "Generated Markdown.";
        },
        async generatePdfArtifact() {
          throw new Error("Not needed in this test");
        },
      } as const,
    });
    const created = await service.createReport("example.com");
    const stored = storedReports.get(created.shareId);

    if (!stored?.currentRun) {
      throw new Error("Expected stored run");
    }

    stored.report.status = "ready";
    stored.report.completedAt = new Date("2026-04-07T12:02:00.000Z");
    stored.currentRun.status = "completed";
    stored.currentRun.completedAt = new Date("2026-04-07T12:02:00.000Z");
    stored.currentRun.researchSummary = createMinimalResearchSummary();
    stored.currentRun.accountPlan = createMinimalAccountPlan();
    stored.currentRun.accountPlan.topUseCases = stored.currentRun.accountPlan.candidateUseCases.slice(0, 3);
    storedArtifacts.set(stored.currentRun.id, []);

    const document = await service.getReportDocument(created.shareId);

    expect(markdownGenerations).toBe(1);
    expect(document?.artifacts.some((artifact) => artifact.artifactType === "markdown")).toBe(true);
    expect(document?.artifacts.find((artifact) => artifact.artifactType === "markdown")?.downloadPath).toBe(
      `/api/reports/${created.shareId}/artifacts/markdown`,
    );
  });

  it("generates a missing PDF artifact on demand for a terminal report", async () => {
    const { repository, storedReports, storedArtifacts } = createRepositoryStub();
    let pdfGenerations = 0;
    const { service } = createServiceHarness({
      repository,
      storedReports,
      exportService: {
        async generateMarkdownArtifact() {
          throw new Error("Not needed in this test");
        },
        async generatePdfArtifact(context: { report: { id: number }; run: { id: number } }) {
          pdfGenerations += 1;
          const nextArtifacts = storedArtifacts.get(context.run.id) ?? [];
          nextArtifacts.push({
            id: nextArtifacts.length + 1,
            reportId: context.report.id,
            runId: context.run.id,
            artifactType: "pdf",
            mimeType: "application/pdf",
            fileName: "example-account-atlas-atlas12345.pdf",
            storagePointers: {
              storageMode: "inline_base64",
              inlineBase64: Buffer.from("pdf-bytes").toString("base64"),
            },
            contentHash: "hash456",
            sizeBytes: 9,
            createdAt: new Date("2026-04-07T12:00:00.000Z"),
            updatedAt: new Date("2026-04-07T12:00:00.000Z"),
          });
          storedArtifacts.set(context.run.id, nextArtifacts);

          return "Generated PDF.";
        },
      } as const,
    });
    const created = await service.createReport("example.com");
    const stored = storedReports.get(created.shareId);

    if (!stored?.currentRun) {
      throw new Error("Expected stored run");
    }

    stored.report.status = "ready";
    stored.report.completedAt = new Date("2026-04-07T12:02:00.000Z");
    stored.currentRun.status = "completed";
    stored.currentRun.completedAt = new Date("2026-04-07T12:02:00.000Z");
    stored.currentRun.researchSummary = createMinimalResearchSummary();
    stored.currentRun.accountPlan = createMinimalAccountPlan();
    stored.currentRun.accountPlan.topUseCases = stored.currentRun.accountPlan.candidateUseCases.slice(0, 3);
    storedArtifacts.set(stored.currentRun.id, []);

    const artifact = await service.getArtifactDownload(created.shareId, "pdf");

    expect(pdfGenerations).toBe(1);
    expect(artifact).not.toBeNull();
    expect(artifact?.kind).toBe("inline");

    if (artifact?.kind !== "inline") {
      throw new Error("Expected inline artifact");
    }

    expect(Buffer.from(artifact.body as Buffer).toString()).toBe("pdf-bytes");
  });
});
