import { describe, expect, it } from "vitest";

import type { FinalAccountPlan } from "@/lib/types/account-plan";
import type { ResearchSummary } from "@/lib/types/research";
import type { OpenAIResearchClient } from "@/server/openai/client";
import { createAccountPlanService } from "@/server/account-plan/account-plan-service";
import { createInitialPipelineState } from "@/server/pipeline/pipeline-steps";
import type { PersistedSource, ReportRepository, StoredRunContext } from "@/server/repositories/report-repository";

function createResearchSummary(): ResearchSummary {
  return {
    companyIdentity: {
      companyName: "OpenAI",
      archetype: "AI platform provider",
      businessModel: "API and enterprise software",
      industry: "Artificial intelligence",
      publicCompany: false,
      headquarters: "San Francisco, California",
      sourceIds: [1],
    },
    growthPriorities: [
      {
        summary: "Enterprise expansion is a visible growth priority.",
        sourceIds: [1, 2],
      },
    ],
    aiMaturityEstimate: {
      level: "advanced",
      rationale: "The company publicly ships both frontier models and enterprise workflows.",
      sourceIds: [1],
    },
    regulatorySensitivity: {
      level: "medium",
      rationale: "Enterprise AI deployment still carries trust and policy scrutiny.",
      sourceIds: [1, 2],
    },
    notableProductSignals: [
      {
        summary: "Platform and enterprise products both appear in public positioning.",
        sourceIds: [1],
      },
    ],
    notableHiringSignals: [],
    notableTrustSignals: [],
    complaintThemes: [],
    leadershipSocialThemes: [],
    researchCompletenessScore: 82,
    confidenceBySection: [
      {
        section: "company-brief",
        confidence: 88,
        rationale: "Identity and positioning are clear.",
      },
    ],
    evidenceGaps: ["Limited public implementation detail for internal workflows."],
    overallConfidence: "medium",
    sourceIds: [1, 2],
  };
}

function createRepositoryStub() {
  const events: Array<{ eventType: string; message: string }> = [];
  const artifacts: Array<Record<string, unknown>> = [];
  const useCases: FinalAccountPlan["candidateUseCases"] = [];
  const stakeholders: FinalAccountPlan["stakeholderHypotheses"] = [];
  const sources: PersistedSource[] = [
    {
      id: 1,
      reportId: 1,
      runId: 11,
      url: "https://openai.com/",
      normalizedUrl: "https://openai.com/",
      canonicalUrl: "https://openai.com/",
      canonicalDomain: "openai.com",
      title: "OpenAI",
      sourceType: "company_homepage",
      sourceTier: "primary",
      mimeType: "text/html",
      discoveredAt: new Date("2026-04-07T12:00:00.000Z"),
      publishedAt: null,
      updatedAtHint: null,
      retrievedAt: new Date("2026-04-07T12:00:00.000Z"),
      contentHash: "abc123",
      textContent: "OpenAI builds AI models and developer platforms.",
      markdownContent: "# OpenAI\n\nOpenAI builds AI models and developer platforms.",
      storagePointers: {},
      createdAt: new Date("2026-04-07T12:00:00.000Z"),
      updatedAt: new Date("2026-04-07T12:00:00.000Z"),
    },
    {
      id: 2,
      reportId: 1,
      runId: 11,
      url: "https://status.openai.com/",
      normalizedUrl: "https://status.openai.com/",
      canonicalUrl: "https://status.openai.com/",
      canonicalDomain: "status.openai.com",
      title: "OpenAI Status",
      sourceType: "status_page",
      sourceTier: "primary",
      mimeType: "text/html",
      discoveredAt: new Date("2026-04-07T12:00:00.000Z"),
      publishedAt: null,
      updatedAtHint: null,
      retrievedAt: new Date("2026-04-07T12:00:00.000Z"),
      contentHash: "xyz123",
      textContent: "Service status and incident updates.",
      markdownContent: "# OpenAI Status\n\nService status and incident updates.",
      storagePointers: {},
      createdAt: new Date("2026-04-07T12:00:00.000Z"),
      updatedAt: new Date("2026-04-07T12:00:00.000Z"),
    },
  ];

  const context: StoredRunContext = {
    report: {
      id: 1,
      shareId: "atlas12345",
      status: "running",
      normalizedInputUrl: "https://openai.com/",
      canonicalDomain: "openai.com",
      companyName: "OpenAI",
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
      progressPercent: 66,
      stepKey: "generate_account_plan",
      statusMessage: "Generating account plan.",
      pipelineState: createInitialPipelineState(),
      queueMessageId: null,
      vectorStoreId: "vs_test_123",
      researchSummary: createResearchSummary(),
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

  const repository: ReportRepository = {
    async isShareIdAvailable() {
      return true;
    },
    async createQueuedReport() {
      throw new Error("Not needed");
    },
    async findReportShellByShareId() {
      throw new Error("Not needed");
    },
    async findLatestReportShellByCanonicalDomain() {
      return null;
    },
    async findRunContextById() {
      return context;
    },
    async listSourcesByRunId() {
      return sources;
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
          statement: "OpenAI publicly positions itself as both a platform and enterprise AI provider.",
          rationale: "This is stated in company materials.",
          confidence: 92,
          freshness: "current",
          sentiment: "neutral",
          relevance: 95,
          evidenceSnippet: "OpenAI builds AI models and developer platforms.",
          sourceIds: [1],
          createdAt: new Date("2026-04-07T12:00:00.000Z"),
          updatedAt: new Date("2026-04-07T12:00:00.000Z"),
        },
        {
          id: 2,
          reportId: 1,
          runId: 11,
          sourceId: 2,
          section: "ai-maturity-signals",
          classification: "fact",
          statement: "OpenAI operates a public status page for production services.",
          rationale: "This suggests mature production operations and external trust expectations.",
          confidence: 87,
          freshness: "current",
          sentiment: "neutral",
          relevance: 78,
          evidenceSnippet: "Service status and incident updates.",
          sourceIds: [2],
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
      throw new Error("Not needed");
    },
    async setRunVectorStore() {
      throw new Error("Not needed");
    },
    async updateRunResearchSummary() {
      throw new Error("Not needed");
    },
    async updateRunAccountPlan({ accountPlan }) {
      context.run.accountPlan = accountPlan;
    },
    async updateRunStepState() {
      throw new Error("Not needed");
    },
    async appendRunEvent(input) {
      events.push({
        eventType: input.eventType,
        message: input.message,
      });
    },
    async upsertCrawledSource() {
      throw new Error("Not needed");
    },
    async updateSourceStoragePointers() {
      throw new Error("Not needed");
    },
    async replaceFactsForRun() {
      throw new Error("Not needed");
    },
    async replaceUseCasesForRun(input) {
      useCases.splice(0, useCases.length, ...input.useCases);
    },
    async replaceStakeholdersForRun(input) {
      stakeholders.splice(0, stakeholders.length, ...input.stakeholders);
    },
    async upsertArtifact(input) {
      artifacts.push(input.storagePointers ?? {});
    },
  };

  return {
    repository,
    context,
    events,
    artifacts,
    useCases,
    stakeholders,
  };
}

function createCandidateUseCases() {
  const departments = [
    "sales",
    "marketing",
    "customer_support",
    "success_services",
    "finance",
    "legal",
    "operations",
    "hr",
    "engineering",
    "product",
    "it_security",
    "analytics_data",
  ] as const;

  return departments.map((department, index) => ({
    department,
    workflowName: `${department.replaceAll("_", " ")} workflow ${index + 1}`,
    summary: `Target a measurable ${department.replaceAll("_", " ")} workflow with AI-assisted execution.`,
    painPoint: `The ${department.replaceAll("_", " ")} team faces repetitive work and fragmented knowledge.`,
    whyNow: "Public product and trust signals suggest appetite for scalable AI-assisted workflows.",
    likelyUsers: [`${department.replaceAll("_", " ")} lead`, `${department.replaceAll("_", " ")} analyst`],
    expectedOutcome: `Improve throughput and decision quality in ${department.replaceAll("_", " ")} workflows.`,
    metrics: ["Cycle time", "Adoption rate"],
    dependencies: ["Documented process owners", "Internal knowledge source"],
    securityComplianceNotes: department === "it_security" ? ["Confirm least-privilege access and audit logging."] : [],
    recommendedMotion: index < 4 ? "workspace" : index < 8 ? "hybrid" : "api_platform",
    motionRationale: "The likely users, workflow complexity, and integration needs indicate this motion.",
    evidenceSourceIds: index % 2 === 0 ? [1] : [1, 2],
    openQuestions: ["Which system is the source of truth?", "How will teams measure success?"],
    scorecard: {
      businessValue: 95 - index,
      deploymentReadiness: 88 - index,
      expansionPotential: 86 - index,
      openaiFit: 90 - index,
      sponsorLikelihood: 82 - index,
      evidenceConfidence: 80 - index,
      riskPenalty: 8 + index,
    },
  }));
}

function createOpenAIStub(
  parseCalls: Array<{
    schemaName: string;
    tools?: Array<Record<string, unknown>>;
    include?: Array<"web_search_call.action.sources" | "file_search_call.results">;
    timeoutMs?: number;
    maxAttempts?: number;
  }> = [],
): OpenAIResearchClient {
  return {
    isConfigured() {
      return true;
    },
    async createVectorStore() {
      throw new Error("Not needed");
    },
    async uploadFile() {
      throw new Error("Not needed");
    },
    async attachFileToVectorStoreAndPoll() {
      throw new Error("Not needed");
    },
    async parseStructuredOutput({ schemaName, tools, include, timeoutMs, maxAttempts }) {
      parseCalls.push({
        schemaName,
        tools,
        include,
        timeoutMs,
        maxAttempts,
      });

      if (schemaName === "account_plan_candidate_use_cases") {
        return {
          responseId: "resp_use_cases",
          parsed: {
            useCases: createCandidateUseCases(),
          },
          outputText: "Candidate use cases completed.",
          rawResponse: { id: "resp_use_cases", output: [], usage: {} },
          webSearchSources: [],
          fileSearchResults: [],
        } as never;
      }

      return {
        responseId: "resp_narrative",
        parsed: {
          overallAccountMotion: {
            recommendedMotion: "hybrid",
            rationale: "Top use cases mix knowledge-heavy workflows with integration-oriented execution paths.",
            evidenceSourceIds: [1, 2],
          },
          stakeholderHypotheses: [
            {
              likelyRole: "VP of Engineering",
              department: "engineering",
              hypothesis: "Likely sponsor for internal platform and developer productivity use cases.",
              rationale: "Public platform positioning makes engineering sponsorship plausible.",
              confidence: 81,
              evidenceSourceIds: [1],
            },
            {
              likelyRole: "Head of IT",
              department: "it_security",
              hypothesis: "Likely gatekeeper for rollout and security controls.",
              rationale: "Status and trust signals imply an operational review path.",
              confidence: 76,
              evidenceSourceIds: [1, 2],
            },
            {
              likelyRole: "Revenue Operations leader",
              department: "sales",
              hypothesis: "Likely sponsor for commercial workflow automation pilots.",
              rationale: "Commercial scaling pressure makes measurable seller productivity attractive.",
              confidence: 74,
              evidenceSourceIds: [1],
            },
          ],
          objectionsAndRebuttals: [
            {
              objection: "Security and trust review will slow adoption.",
              rebuttal: "Start with bounded workflows and documented access controls while using public trust evidence to frame the pilot.",
              evidenceSourceIds: [1, 2],
            },
            {
              objection: "Teams already have too many tools.",
              rebuttal: "Prioritize a workflow with a measurable cycle-time gain and a narrow initial user group.",
              evidenceSourceIds: [1],
            },
            {
              objection: "API work may require scarce engineering time.",
              rebuttal: "Sequence a workspace-led pilot first, then expand into API-backed integration where value is proven.",
              evidenceSourceIds: [1],
            },
            {
              objection: "Evidence is still incomplete for some downstream workflows.",
              rebuttal: "Keep low-confidence items as open questions and limit the pilot to the best-supported use cases.",
              evidenceSourceIds: [1, 2],
            },
          ],
          discoveryQuestions: [
            {
              question: "Which team owns the first pilot workflow end to end?",
              whyItMatters: "Execution stalls without a clear business owner.",
              evidenceSourceIds: [1],
            },
            {
              question: "Which internal knowledge repositories are already curated enough to use safely?",
              whyItMatters: "This shapes whether workspace can deliver value quickly.",
              evidenceSourceIds: [1],
            },
            {
              question: "Where do existing security reviews create rollout friction?",
              whyItMatters: "This affects pilot scope and motion choice.",
              evidenceSourceIds: [2],
            },
            {
              question: "Which metrics would define a successful 90-day pilot?",
              whyItMatters: "Expansion requires an agreed business case.",
              evidenceSourceIds: [1],
            },
            {
              question: "Which systems need API integration versus human-in-the-loop workspace use?",
              whyItMatters: "This separates hybrid from single-motion rollout paths.",
              evidenceSourceIds: [1],
            },
            {
              question: "Which executive sponsor will back change management after the pilot?",
              whyItMatters: "Expansion depends on a credible sponsor.",
              evidenceSourceIds: [1, 2],
            },
          ],
          pilotPlan: {
            objective: "Validate one knowledge-centric and one integration-adjacent workflow with clear business metrics.",
            recommendedMotion: "hybrid",
            scope: "Start with a small cross-functional team and two bounded workflows.",
            successMetrics: ["Cycle time reduction", "User adoption", "Quality acceptance rate"],
            phases: [
              {
                name: "Discovery and scope",
                duration: "Weeks 1-2",
                goals: ["Confirm owners", "Map dependencies"],
                deliverables: ["Scoped pilot brief", "Success metrics baseline"],
              },
              {
                name: "Build and launch",
                duration: "Weeks 3-8",
                goals: ["Configure workflow", "Train pilot users"],
                deliverables: ["Pilot workflow", "Security review notes"],
              },
              {
                name: "Measure and expand",
                duration: "Weeks 9-12",
                goals: ["Measure impact", "Decide next rollout"],
                deliverables: ["Pilot readout", "Expansion recommendation"],
              },
            ],
            dependencies: ["Pilot owner", "Security review path", "Baseline metrics"],
            risks: ["Evidence is thinner for some cross-functional workflows", "Integration complexity could stretch timelines"],
            evidenceSourceIds: [1, 2],
          },
          expansionScenarios: {
            low: {
              summary: "Expand only the first successful workflow and keep rollout inside one function.",
              assumptions: ["One sponsor stays engaged"],
              expectedOutcomes: ["Measured productivity gain", "Limited platform expansion"],
              evidenceSourceIds: [1],
            },
            base: {
              summary: "Expand the pilot into adjacent teams with a hybrid motion.",
              assumptions: ["Two functions see measurable value", "Security review path is workable"],
              expectedOutcomes: ["Broader adoption", "Follow-on integration work"],
              evidenceSourceIds: [1, 2],
            },
            high: {
              summary: "Standardize multiple workflows and widen into platform-level rollout.",
              assumptions: ["Executive sponsor emerges", "Pilot metrics clearly exceed baseline"],
              expectedOutcomes: ["Multi-team adoption", "Larger API and workspace footprint"],
              evidenceSourceIds: [1, 2],
            },
          },
        },
        outputText: "Narrative completed.",
        rawResponse: { id: "resp_narrative", output: [], usage: {} },
        webSearchSources: [],
        fileSearchResults: [],
      } as never;
    },
  };
}

describe("createAccountPlanService", () => {
  it("persists ranked use cases, stakeholders, and a final account plan", async () => {
    const stub = createRepositoryStub();
    const parseCalls: Array<{
      schemaName: string;
      tools?: Array<Record<string, unknown>>;
      include?: Array<"web_search_call.action.sources" | "file_search_call.results">;
      timeoutMs?: number;
      maxAttempts?: number;
    }> = [];
    const service = createAccountPlanService({
      repository: stub.repository,
      openAIClient: createOpenAIStub(parseCalls),
    });

    const message = await service.generateAccountPlan(stub.context);

    expect(message).toContain("Overall motion: hybrid");
    expect(stub.useCases).toHaveLength(12);
    expect(stub.stakeholders).toHaveLength(3);
    expect(stub.context.run.accountPlan?.overallAccountMotion.recommendedMotion).toBe("hybrid");
    expect(stub.context.run.accountPlan?.topUseCases).toHaveLength(3);
    expect(stub.context.run.accountPlan?.topUseCases.map((useCase) => useCase.priorityRank)).toEqual([1, 2, 3]);
    expect(stub.context.run.accountPlan?.topUseCases[0]?.scorecard.priorityScore).toBe(87.45);
    expect(stub.events.some((event) => event.eventType === "account_plan.completed")).toBe(true);
    expect(stub.artifacts).toHaveLength(1);
    expect(parseCalls).toEqual([
      {
        schemaName: "account_plan_candidate_use_cases",
        tools: undefined,
        include: undefined,
        timeoutMs: 90_000,
        maxAttempts: 1,
      },
      {
        schemaName: "account_plan_narrative",
        tools: undefined,
        include: undefined,
        timeoutMs: 75_000,
        maxAttempts: 1,
      },
    ]);
  });

  it("skips cleanly when OPENAI_API_KEY is not configured", async () => {
    const stub = createRepositoryStub();
    const service = createAccountPlanService({
      repository: stub.repository,
      openAIClient: {
        isConfigured: () => false,
        createVectorStore: async () => {
          throw new Error("Not needed");
        },
        uploadFile: async () => {
          throw new Error("Not needed");
        },
        attachFileToVectorStoreAndPoll: async () => {
          throw new Error("Not needed");
        },
        parseStructuredOutput: async () => {
          throw new Error("Not needed");
        },
      },
    });

    await expect(service.generateAccountPlan(stub.context)).resolves.toContain("OPENAI_API_KEY");
  });
});
