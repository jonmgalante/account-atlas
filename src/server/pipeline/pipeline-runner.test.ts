import { describe, expect, it } from "vitest";

import type { FinalAccountPlan } from "@/lib/types/account-plan";
import type { CrawlIngestionResult } from "@/server/crawl/types";
import { createInitialPipelineState } from "@/server/pipeline/pipeline-steps";
import { createReportPipelineRunner } from "@/server/pipeline/pipeline-runner";
import type { ReportRepository, StoredReportShell, StoredRunContext } from "@/server/repositories/report-repository";

function createAccountPlan(): FinalAccountPlan {
  return {
    overallAccountMotion: {
      recommendedMotion: "hybrid",
      rationale: "Top use cases span workspace and API-led execution paths.",
      evidenceSourceIds: [1],
    },
    candidateUseCases: [
      {
        priorityRank: 1,
        department: "sales",
        workflowName: "Account research copilot",
        summary: "Summarize account context before calls.",
        painPoint: "Reps spend too much time gathering context.",
        whyNow: "Commercial focus and AI maturity are visible in public sources.",
        likelyUsers: ["Sales reps"],
        expectedOutcome: "Faster prep and better discovery quality.",
        metrics: ["Prep time"],
        dependencies: ["CRM hygiene"],
        securityComplianceNotes: [],
        recommendedMotion: "workspace",
        motionRationale: "Knowledge-heavy workflow with light integration needs.",
        evidenceSourceIds: [1],
        openQuestions: ["Where does the latest account data live?"],
        scorecard: {
          businessValue: 90,
          deploymentReadiness: 82,
          expansionPotential: 84,
          openaiFit: 88,
          sponsorLikelihood: 80,
          evidenceConfidence: 76,
          riskPenalty: 12,
          priorityScore: 83.9,
        },
      },
      {
        priorityRank: 2,
        department: "customer_support",
        workflowName: "Support triage assistant",
        summary: "Route and summarize incoming issues.",
        painPoint: "Support teams lose time on repetitive triage.",
        whyNow: "Public support scale and trust expectations are visible.",
        likelyUsers: ["Support leads"],
        expectedOutcome: "Faster response and cleaner routing.",
        metrics: ["First response time"],
        dependencies: ["Knowledge base"],
        securityComplianceNotes: ["Review customer data handling."],
        recommendedMotion: "hybrid",
        motionRationale: "Needs knowledge access and workflow hooks.",
        evidenceSourceIds: [1],
        openQuestions: ["What systems own case routing?"],
        scorecard: {
          businessValue: 82,
          deploymentReadiness: 78,
          expansionPotential: 80,
          openaiFit: 84,
          sponsorLikelihood: 74,
          evidenceConfidence: 72,
          riskPenalty: 16,
          priorityScore: 77.5,
        },
      },
      {
        priorityRank: 3,
        department: "engineering",
        workflowName: "Developer documentation assistant",
        summary: "Improve access to platform guidance.",
        painPoint: "Engineers lose time hunting for internal docs.",
        whyNow: "Developer platform positioning is public.",
        likelyUsers: ["Developers"],
        expectedOutcome: "Faster implementation cycles.",
        metrics: ["Time to resolve questions"],
        dependencies: ["Current docs corpus"],
        securityComplianceNotes: [],
        recommendedMotion: "workspace",
        motionRationale: "Documentation workflows fit workspace-first adoption.",
        evidenceSourceIds: [1],
        openQuestions: ["How current are internal docs?"],
        scorecard: {
          businessValue: 78,
          deploymentReadiness: 80,
          expansionPotential: 76,
          openaiFit: 86,
          sponsorLikelihood: 70,
          evidenceConfidence: 74,
          riskPenalty: 10,
          priorityScore: 76.6,
        },
      },
    ],
    topUseCases: [],
    stakeholderHypotheses: [
      {
        likelyRole: "VP of Engineering",
        department: "engineering",
        hypothesis: "Likely sponsor for developer productivity workflows.",
        rationale: "Platform positioning suggests engineering sponsorship.",
        confidence: 78,
        evidenceSourceIds: [1],
      },
    ],
    objectionsAndRebuttals: [
      {
        objection: "Security review may slow rollout.",
        rebuttal: "Start with bounded workflows and clear controls.",
        evidenceSourceIds: [1],
      },
    ],
    discoveryQuestions: [
      {
        question: "Which workflow has the strongest owner?",
        whyItMatters: "Pilot success depends on ownership.",
        evidenceSourceIds: [1],
      },
    ],
    pilotPlan: {
      objective: "Validate one workspace-led workflow.",
      recommendedMotion: "workspace",
      scope: "One team and one workflow for 90 days.",
      successMetrics: ["Time saved"],
      phases: [
        {
          name: "Scope",
          duration: "Weeks 1-2",
          goals: ["Confirm workflow"],
          deliverables: ["Pilot brief"],
        },
      ],
      dependencies: ["Owner"],
      risks: ["Limited evidence depth"],
      evidenceSourceIds: [1],
    },
    expansionScenarios: {
      low: {
        summary: "Expand to one adjacent team.",
        assumptions: ["Pilot works"],
        expectedOutcomes: ["Limited expansion"],
        evidenceSourceIds: [1],
      },
      base: {
        summary: "Expand to two workflows.",
        assumptions: ["Sponsor remains engaged"],
        expectedOutcomes: ["Broader adoption"],
        evidenceSourceIds: [1],
      },
      high: {
        summary: "Expand across functions.",
        assumptions: ["Clear ROI"],
        expectedOutcomes: ["Multi-team expansion"],
        evidenceSourceIds: [1],
      },
    },
  };
}

function createRepositoryStub() {
  const report: StoredRunContext["report"] = {
    id: 1,
    shareId: "atlas12345",
    status: "queued",
    normalizedInputUrl: "https://openai.com/",
    canonicalDomain: "openai.com",
    companyName: null,
    createdAt: new Date("2026-04-07T12:00:00.000Z"),
    updatedAt: new Date("2026-04-07T12:00:00.000Z"),
    completedAt: null,
    failedAt: null,
  };

  const run: StoredRunContext["run"] = {
    id: 11,
    reportId: 1,
    attemptNumber: 1,
    status: "queued",
    executionMode: "inline",
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
  };

  const recentEvents: StoredReportShell["recentEvents"] = [];
  const artifacts: Awaited<ReturnType<ReportRepository["listArtifactsByRunId"]>> = [];
  let crawlInvocations = 0;
  let markdownExportInvocations = 0;
  let pdfExportInvocations = 0;

  const repository: ReportRepository = {
    async isShareIdAvailable() {
      return true;
    },

    async createQueuedReport() {
      throw new Error("Not needed in this test");
    },

    async findReportShellByShareId() {
      return {
        report,
        currentRun: run,
        recentEvents,
      };
    },

    async findLatestReportShellByCanonicalDomain() {
      return null;
    },

    async findRunContextById(runId) {
      if (runId !== run.id) {
        return null;
      }

      return {
        report,
        run,
      };
    },

    async setRunDispatchState() {
      throw new Error("Not needed in this test");
    },

    async listSourcesByRunId() {
      return [];
    },

    async listFactsByRunId() {
      return [];
    },

    async listArtifactsByRunId() {
      return artifacts;
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

    async setRunVectorStore() {
      throw new Error("Not needed in this test");
    },

    async updateRunResearchSummary() {
      throw new Error("Not needed in this test");
    },

    async updateRunAccountPlan() {
      throw new Error("Not needed in this test");
    },

    async updateRunStepState(input) {
      run.status = input.status;
      run.executionMode = input.executionMode ?? run.executionMode;
      run.progressPercent = input.progressPercent;
      run.stepKey = input.stepKey;
      run.statusMessage = input.statusMessage;
      run.pipelineState = input.pipelineState;
      run.queueMessageId = input.queueMessageId ?? null;
      run.vectorStoreId = run.vectorStoreId;
      run.researchSummary = run.researchSummary;
      run.errorCode = input.errorCode ?? null;
      run.errorMessage = input.errorMessage ?? null;
      run.startedAt = input.startedAt ?? run.startedAt;
      run.completedAt = input.completedAt ?? null;
      run.failedAt = input.failedAt ?? null;
      run.updatedAt = new Date("2026-04-07T12:05:00.000Z");
      report.status = input.reportStatus ?? report.status;
      report.completedAt = input.reportCompletedAt ?? null;
      report.updatedAt = new Date("2026-04-07T12:05:00.000Z");
    },

    async appendRunEvent(input) {
      recentEvents.push({
        id: recentEvents.length + 1,
        level: input.level,
        eventType: input.eventType,
        stepKey: input.stepKey ?? null,
        message: input.message,
        occurredAt: new Date("2026-04-07T12:05:00.000Z"),
      });
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

    async upsertArtifact(input) {
      const existingIndex = artifacts.findIndex((artifact) => artifact.artifactType === input.artifactType);
      const persistedArtifact = {
        id: existingIndex >= 0 ? artifacts[existingIndex].id : artifacts.length + 1,
        reportId: input.reportId,
        runId: input.runId,
        artifactType: input.artifactType,
        mimeType: input.mimeType,
        fileName: input.fileName ?? null,
        storagePointers: input.storagePointers ?? {},
        contentHash: input.contentHash ?? null,
        sizeBytes: input.sizeBytes ?? null,
        createdAt: new Date("2026-04-07T12:05:00.000Z"),
        updatedAt: new Date("2026-04-07T12:05:00.000Z"),
      };

      if (existingIndex >= 0) {
        artifacts[existingIndex] = persistedArtifact;
      } else {
        artifacts.push(persistedArtifact);
      }
    },
  };

  return {
    repository,
    run,
    report,
    recentEvents,
    artifacts,
    crawlInvocations: () => crawlInvocations,
    markdownExportInvocations: () => markdownExportInvocations,
    pdfExportInvocations: () => pdfExportInvocations,
    crawler: {
      async crawlCompanySite(): Promise<CrawlIngestionResult> {
        crawlInvocations += 1;

        return {
          pagesFetched: 3,
          htmlPagesStored: 2,
          pdfSourcesStored: 1,
          dedupedSources: 0,
          sourceIds: [1, 2, 3],
          manifest: {
            visitedUrls: ["https://openai.com/"],
            pdfUrls: ["https://openai.com/investors/annual-report.pdf"],
            blockedUrls: [],
          },
        };
      },
      async processPdfCandidate() {
        throw new Error("Not needed in this test");
      },
    },
    researchService: {
      async enrichExternalSources() {
        return "External enrichment completed.";
      },
      async buildFactBase() {
        return "Fact base completed.";
      },
      async generateResearchSummary() {
        return "Research summary completed.";
      },
    },
    accountPlanService: {
      async generateAccountPlan() {
        const accountPlan = createAccountPlan();
        accountPlan.topUseCases = accountPlan.candidateUseCases.slice(0, 3);
        run.accountPlan = accountPlan;

        return "Account plan completed.";
      },
    },
    exportService: {
      async generateMarkdownArtifact() {
        markdownExportInvocations += 1;

        await repository.upsertArtifact({
          reportId: report.id,
          runId: run.id,
          artifactType: "markdown",
          mimeType: "text/markdown; charset=utf-8",
          fileName: "openai-account-atlas-atlas12345.md",
          storagePointers: {
            storageMode: "inline_text",
            inlineText: "# OpenAI",
          },
          contentHash: "markdown-hash",
          sizeBytes: 8,
        });

        return "Markdown export completed.";
      },
      async generatePdfArtifact() {
        pdfExportInvocations += 1;

        await repository.upsertArtifact({
          reportId: report.id,
          runId: run.id,
          artifactType: "pdf",
          mimeType: "application/pdf",
          fileName: "openai-account-atlas-atlas12345.pdf",
          storagePointers: {
            storageMode: "inline_base64",
            inlineBase64: Buffer.from("%PDF-1.4").toString("base64"),
          },
          contentHash: "pdf-hash",
          sizeBytes: 8,
        });

        return "PDF export completed.";
      },
    },
  };
}

describe("createReportPipelineRunner", () => {
  it("processes the ordered step pipeline and marks the run completed", async () => {
    const stub = createRepositoryStub();
    const runner = createReportPipelineRunner({
      repository: stub.repository,
      crawler: stub.crawler,
      researchService: stub.researchService,
      accountPlanService: stub.accountPlanService,
      exportService: stub.exportService,
    });

    await runner.processReportRun({
      runId: 11,
      trigger: "inline",
    });

    expect(stub.report.status).toBe("ready");
    expect(stub.run.status).toBe("completed");
    expect(stub.run.progressPercent).toBe(100);
    expect(stub.run.pipelineState.steps.finalize_report.status).toBe("completed");
    expect(stub.run.accountPlan?.overallAccountMotion.recommendedMotion).toBe("hybrid");
    expect(stub.crawlInvocations()).toBe(1);
    expect(stub.markdownExportInvocations()).toBe(1);
    expect(stub.pdfExportInvocations()).toBe(1);
    expect(stub.artifacts).toHaveLength(2);
    expect(stub.recentEvents.length).toBeGreaterThanOrEqual(16);
  });

  it("is safe to call again after the run is already completed", async () => {
    const stub = createRepositoryStub();
    const runner = createReportPipelineRunner({
      repository: stub.repository,
      crawler: stub.crawler,
      researchService: stub.researchService,
      accountPlanService: stub.accountPlanService,
      exportService: stub.exportService,
    });

    await runner.processReportRun({
      runId: 11,
      trigger: "inline",
    });
    await runner.processReportRun({
      runId: 11,
      trigger: "inline",
    });

    expect(stub.crawlInvocations()).toBe(1);
    expect(stub.run.status).toBe("completed");
  });

  it("keeps the run shareable when PDF export fails after Markdown succeeds", async () => {
    const stub = createRepositoryStub();
    const runner = createReportPipelineRunner({
      repository: stub.repository,
      crawler: stub.crawler,
      researchService: stub.researchService,
      accountPlanService: stub.accountPlanService,
      exportService: {
        ...stub.exportService,
        async generatePdfArtifact() {
          throw new Error("PDF renderer failed");
        },
      },
    });

    await runner.processReportRun({
      runId: 11,
      trigger: "inline",
    });

    expect(stub.run.status).toBe("completed");
    expect(stub.report.status).toBe("ready");
    expect(stub.artifacts.some((artifact) => artifact.artifactType === "markdown")).toBe(true);
    expect(stub.artifacts.some((artifact) => artifact.artifactType === "pdf")).toBe(false);
    expect(stub.recentEvents.some((event) => event.eventType === "artifact.pdf.failed")).toBe(true);
  });

  it("keeps the run shareable when Markdown export fails before PDF succeeds", async () => {
    const stub = createRepositoryStub();
    const runner = createReportPipelineRunner({
      repository: stub.repository,
      crawler: stub.crawler,
      researchService: stub.researchService,
      accountPlanService: stub.accountPlanService,
      exportService: {
        ...stub.exportService,
        async generateMarkdownArtifact() {
          throw new Error("Blob upload failed");
        },
      },
    });

    await runner.processReportRun({
      runId: 11,
      trigger: "inline",
    });

    expect(stub.run.status).toBe("completed");
    expect(stub.report.status).toBe("ready");
    expect(stub.artifacts.some((artifact) => artifact.artifactType === "markdown")).toBe(false);
    expect(stub.artifacts.some((artifact) => artifact.artifactType === "pdf")).toBe(true);
    expect(stub.recentEvents.some((event) => event.eventType === "artifact.markdown.failed")).toBe(true);
  });

  it("keeps the run in progress when a step fails but still has retry attempts remaining", async () => {
    const stub = createRepositoryStub();
    let enrichAttempts = 0;
    const runner = createReportPipelineRunner({
      repository: stub.repository,
      crawler: stub.crawler,
      researchService: {
        ...stub.researchService,
        async enrichExternalSources() {
          enrichAttempts += 1;

          if (enrichAttempts === 1) {
            throw new Error("Transient upstream timeout");
          }

          return "External enrichment completed on retry.";
        },
      },
      accountPlanService: stub.accountPlanService,
      exportService: stub.exportService,
    });

    await expect(
      runner.processReportRun({
        runId: 11,
        trigger: "inline",
      }),
    ).rejects.toThrow("Transient upstream timeout");

    expect(stub.report.status).toBe("running");
    expect(stub.run.status).toBe("fetching");
    expect(stub.run.stepKey).toBe("enrich_external_sources");
    expect(stub.run.statusMessage).toContain("will retry automatically");
    expect(stub.run.pipelineState.steps.enrich_external_sources.status).toBe("retrying");
    expect(stub.recentEvents.some((event) => event.eventType === "pipeline.step.retry_scheduled")).toBe(true);

    await runner.processReportRun({
      runId: 11,
      trigger: "inline",
    });

    expect(stub.report.status).toBe("ready");
    expect(stub.run.status).toBe("completed");
    expect(stub.run.pipelineState.steps.enrich_external_sources.status).toBe("completed");
    expect(enrichAttempts).toBe(2);
  });
});
