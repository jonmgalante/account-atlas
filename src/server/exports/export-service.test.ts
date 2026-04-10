import { describe, expect, it } from "vitest";

import { createInitialPipelineState } from "@/server/pipeline/pipeline-steps";
import type { ReportRepository, StoredRunContext } from "@/server/repositories/report-repository";
import { createReportExportService } from "@/server/exports/export-service";

function createRepositoryStub() {
  const artifacts: Array<Parameters<ReportRepository["upsertArtifact"]>[0]> = [];
  const context: StoredRunContext = {
    report: {
      id: 1,
      shareId: "atlas12345",
      status: "running",
      normalizedInputUrl: "https://example.com/",
      canonicalDomain: "example.com",
      companyName: "Example",
      createdAt: new Date("2026-04-07T12:00:00.000Z"),
      updatedAt: new Date("2026-04-07T12:00:00.000Z"),
      completedAt: null,
      failedAt: null,
    },
    run: {
      id: 11,
      reportId: 1,
      attemptNumber: 1,
      status: "synthesizing",
      executionMode: "inline",
      progressPercent: 70,
      stepKey: "generate_account_plan",
      statusMessage: "Generating account plan.",
      pipelineState: createInitialPipelineState(),
      queueMessageId: null,
      vectorStoreId: null,
      researchSummary: {
        companyIdentity: {
          companyName: "Example",
          archetype: "B2B software vendor",
          businessModel: "Subscription software",
          industry: "Software",
          publicCompany: false,
          headquarters: "New York, NY",
          sourceIds: [1],
        },
        growthPriorities: [
          {
            summary: "Expand enterprise adoption in regulated accounts.",
            sourceIds: [1],
          },
        ],
        aiMaturityEstimate: {
          level: "moderate",
          rationale: "Public materials show workflow automation and platform messaging.",
          sourceIds: [1],
        },
        regulatorySensitivity: {
          level: "medium",
          rationale: "Trust and security positioning matter for the target buyers.",
          sourceIds: [1],
        },
        notableProductSignals: [],
        notableHiringSignals: [],
        notableTrustSignals: [],
        complaintThemes: [],
        leadershipSocialThemes: [],
        researchCompletenessScore: 76,
        confidenceBySection: [
          {
            section: "company-brief",
            confidence: 81,
            rationale: "Identity and positioning are explicit.",
          },
        ],
        evidenceGaps: [],
        overallConfidence: "medium",
        sourceIds: [1],
      },
      accountPlan: {
        overallAccountMotion: {
          recommendedMotion: "workspace",
          rationale: "Top workflows are knowledge-heavy and can start without deep systems integration.",
          evidenceSourceIds: [1],
        },
        candidateUseCases: [
          {
            priorityRank: 1,
            department: "sales",
            workflowName: "Account research copilot",
            summary: "Prepare sellers with account context before discovery.",
            painPoint: "Reps lose time gathering fragmented company context.",
            whyNow: "Enterprise positioning and product breadth are explicit in public materials.",
            likelyUsers: ["Account executives"],
            expectedOutcome: "Faster prep and higher-quality discovery.",
            metrics: ["Prep time"],
            dependencies: ["Sales content owners"],
            securityComplianceNotes: [],
            recommendedMotion: "workspace",
            motionRationale: "Knowledge-heavy workflow with light integration needs.",
            evidenceSourceIds: [1],
            openQuestions: ["Where is the current account brief assembled today?"],
            scorecard: {
              businessValue: 88,
              deploymentReadiness: 82,
              expansionPotential: 83,
              openaiFit: 90,
              sponsorLikelihood: 78,
              evidenceConfidence: 80,
              riskPenalty: 12,
              priorityScore: 82.5,
            },
          },
        ],
        topUseCases: [
          {
            priorityRank: 1,
            department: "sales",
            workflowName: "Account research copilot",
            summary: "Prepare sellers with account context before discovery.",
            painPoint: "Reps lose time gathering fragmented company context.",
            whyNow: "Enterprise positioning and product breadth are explicit in public materials.",
            likelyUsers: ["Account executives"],
            expectedOutcome: "Faster prep and higher-quality discovery.",
            metrics: ["Prep time"],
            dependencies: ["Sales content owners"],
            securityComplianceNotes: [],
            recommendedMotion: "workspace",
            motionRationale: "Knowledge-heavy workflow with light integration needs.",
            evidenceSourceIds: [1],
            openQuestions: ["Where is the current account brief assembled today?"],
            scorecard: {
              businessValue: 88,
              deploymentReadiness: 82,
              expansionPotential: 83,
              openaiFit: 90,
              sponsorLikelihood: 78,
              evidenceConfidence: 80,
              riskPenalty: 12,
              priorityScore: 82.5,
            },
          },
        ],
        stakeholderHypotheses: [],
        objectionsAndRebuttals: [],
        discoveryQuestions: [],
        pilotPlan: {
          objective: "Validate account prep acceleration in one commercial pod.",
          recommendedMotion: "workspace",
          scope: "One account team and one pre-call workflow for 90 days.",
          successMetrics: ["Prep time reduction"],
          phases: [
            {
              name: "Scope",
              duration: "Weeks 1-2",
              goals: ["Define workflow"],
              deliverables: ["Pilot brief"],
            },
          ],
          dependencies: ["Sales sponsor"],
          risks: ["Evidence is still public-only"],
          evidenceSourceIds: [1],
        },
        expansionScenarios: {
          low: {
            summary: "Expand to another pod.",
            assumptions: ["Initial adoption sticks"],
            expectedOutcomes: ["Moderate seat growth"],
            evidenceSourceIds: [1],
          },
          base: {
            summary: "Expand to sales and customer success.",
            assumptions: ["The sponsor remains engaged"],
            expectedOutcomes: ["Broader workflow coverage"],
            evidenceSourceIds: [1],
          },
          high: {
            summary: "Expand to multiple revenue teams plus API-led workflows.",
            assumptions: ["ROI is explicit and stakeholders align"],
            expectedOutcomes: ["Cross-functional adoption"],
            evidenceSourceIds: [1],
          },
        },
      },
      errorCode: null,
      errorMessage: null,
      createdAt: new Date("2026-04-07T12:00:00.000Z"),
      updatedAt: new Date("2026-04-07T12:04:00.000Z"),
      startedAt: new Date("2026-04-07T12:00:30.000Z"),
      lastHeartbeatAt: null,
      completedAt: null,
      failedAt: null,
    },
  };

  const repository: ReportRepository = {
    async isShareIdAvailable() {
      return true;
    },
    async createQueuedReport() {
      throw new Error("Not needed in this test");
    },
    async findReportShellByShareId() {
      throw new Error("Not needed in this test");
    },
    async findLatestReportShellByCanonicalDomain() {
      return null;
    },
    async findRunContextById() {
      return context;
    },
    async listSourcesByRunId() {
      return [
        {
          id: 1,
          reportId: 1,
          runId: 11,
          url: "https://example.com/",
          normalizedUrl: "https://example.com/",
          canonicalUrl: "https://example.com/",
          canonicalDomain: "example.com",
          title: "Example homepage",
          sourceType: "company_homepage",
          sourceTier: "primary",
          mimeType: "text/html",
          discoveredAt: new Date("2026-04-07T12:00:00.000Z"),
          publishedAt: null,
          updatedAtHint: null,
          retrievedAt: new Date("2026-04-07T12:00:00.000Z"),
          contentHash: "sourcehash",
          textContent: "Example sells workflow software for enterprise teams.",
          markdownContent: "# Example",
          storagePointers: {
            summary: "Example sells workflow software for enterprise teams.",
          },
          createdAt: new Date("2026-04-07T12:00:00.000Z"),
          updatedAt: new Date("2026-04-07T12:00:00.000Z"),
        },
      ];
    },
    async listFactsByRunId() {
      return [
        {
          id: 1,
          reportId: 1,
          runId: 11,
          sourceId: 1,
          section: "fact-base",
          classification: "fact",
          statement: "Example positions itself as enterprise workflow software.",
          rationale: "This is stated directly on the homepage.",
          confidence: 84,
          freshness: "current",
          sentiment: "neutral",
          relevance: 90,
          evidenceSnippet: "Enterprise workflow software.",
          sourceIds: [1],
          createdAt: new Date("2026-04-07T12:00:00.000Z"),
          updatedAt: new Date("2026-04-07T12:00:00.000Z"),
        },
      ];
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
    async claimRunStepExecution() {
      throw new Error("Not needed in this test");
    },
    async touchRunHeartbeat() {
      return;
    },
    async updateRunStepState() {
      throw new Error("Not needed in this test");
    },
    async appendRunEvent() {
      throw new Error("Not needed in this test");
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
      artifacts.push(input);
    },
  };

  return {
    repository,
    context,
    artifacts,
  };
}

describe("createReportExportService", () => {
  it("persists deterministic Markdown exports with inline fallback", async () => {
    const stub = createRepositoryStub();
    const service = createReportExportService({
      repository: stub.repository,
      blobStore: async () => null,
      pdfRenderer: async () => Buffer.from("%PDF-1.4"),
    });

    await service.generateMarkdownArtifact(stub.context);
    await service.generateMarkdownArtifact(stub.context);

    expect(stub.artifacts).toHaveLength(2);
    expect(stub.artifacts[0]?.artifactType).toBe("markdown");
    expect(stub.artifacts[1]?.artifactType).toBe("markdown");
    expect(stub.artifacts[0]?.contentHash).toBe(stub.artifacts[1]?.contentHash);
    expect(stub.artifacts[0]?.storagePointers).toMatchObject({
      storageMode: "inline_text",
    });
  });

  it("persists PDF exports with inline base64 fallback", async () => {
    const stub = createRepositoryStub();
    const service = createReportExportService({
      repository: stub.repository,
      blobStore: async () => null,
      pdfRenderer: async () => Buffer.from("%PDF-1.4"),
    });

    await service.generatePdfArtifact(stub.context);

    expect(stub.artifacts).toHaveLength(1);
    expect(stub.artifacts[0]?.artifactType).toBe("pdf");
    expect(stub.artifacts[0]?.storagePointers).toMatchObject({
      storageMode: "inline_base64",
    });
  });
});
