import { describe, expect, it } from "vitest";

import type { FinalAccountPlan } from "@/lib/types/account-plan";
import type { ResearchSummary } from "@/lib/types/research";
import type { OpenAIResearchClient } from "@/server/openai/client";
import { createAccountPlanService } from "@/server/account-plan/account-plan-service";
import { createInitialPipelineState } from "@/server/pipeline/pipeline-steps";
import { buildFactPacket } from "@/server/research/fact-packet";
import type {
  PersistedFact,
  PersistedSource,
  ReportRepository,
  StoredRunContext,
} from "@/server/repositories/report-repository";

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
  const facts: PersistedFact[] = [
    {
      id: 1,
      reportId: 1,
      runId: 11,
      sourceId: 1,
      section: "fact-base" as const,
      classification: "fact" as const,
      statement: "OpenAI publicly positions itself as both a platform and enterprise AI provider.",
      rationale: "This is stated in company materials.",
      confidence: 92,
      freshness: "current" as const,
      sentiment: "neutral" as const,
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
      section: "ai-maturity-signals" as const,
      classification: "fact" as const,
      statement: "OpenAI operates a public status page for production services.",
      rationale: "This suggests mature production operations and external trust expectations.",
      confidence: 87,
      freshness: "current" as const,
      sentiment: "neutral" as const,
      relevance: 78,
      evidenceSnippet: "Service status and incident updates.",
      sourceIds: [2],
      createdAt: new Date("2026-04-07T12:00:00.000Z"),
      updatedAt: new Date("2026-04-07T12:00:00.000Z"),
    },
  ];
  let nextSourceId = sources.length + 1;

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
  const persistedFactPacket = buildFactPacket({
    context,
    sources,
    facts,
    briefMode: "standard",
  });
  const storedArtifacts = [
    {
      id: 1,
      reportId: 1,
      runId: 11,
      artifactType: "structured_json" as const,
      mimeType: "application/json",
      fileName: "fact-packet.json",
      storagePointers: {
        inlineJson: JSON.stringify(persistedFactPacket),
      },
      contentHash: "packet-hash",
      sizeBytes: 1024,
      createdAt: new Date("2026-04-07T12:00:00.000Z"),
      updatedAt: new Date("2026-04-07T12:00:00.000Z"),
    },
  ];

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
      return facts;
    },
    async listArtifactsByRunId() {
      return storedArtifacts;
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
    async updateRunResearchSummary({ researchSummary, companyName }) {
      context.run.researchSummary = researchSummary;
      context.report.companyName = companyName ?? context.report.companyName;
    },
    async updateRunAccountPlan({ accountPlan }) {
      context.run.accountPlan = accountPlan;
    },
    async claimRunStepExecution() {
      throw new Error("Not needed");
    },
    async touchRunHeartbeat() {
      return;
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
    async upsertCrawledSource(input) {
      const source = {
        id: nextSourceId,
        reportId: input.reportId,
        runId: input.runId,
        url: input.url,
        normalizedUrl: input.normalizedUrl,
        canonicalUrl: input.canonicalUrl,
        canonicalDomain: input.canonicalDomain,
        title: input.title ?? null,
        sourceType: input.sourceType,
        sourceTier: input.sourceTier,
        mimeType: input.mimeType ?? "text/html",
        discoveredAt: new Date("2026-04-07T12:00:00.000Z"),
        publishedAt: input.publishedAt ?? null,
        updatedAtHint: input.updatedAtHint ?? null,
        retrievedAt: input.retrievedAt ?? new Date("2026-04-07T12:00:00.000Z"),
        contentHash: input.contentHash ?? null,
        textContent: input.textContent ?? null,
        markdownContent: input.markdownContent ?? null,
        storagePointers: input.storagePointers ?? {},
        createdAt: new Date("2026-04-07T12:00:00.000Z"),
        updatedAt: new Date("2026-04-07T12:00:00.000Z"),
      } satisfies PersistedSource;

      sources.push(source);
      nextSourceId += 1;

      return {
        source,
        dedupeStrategy: "created" as const,
      };
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
    storedArtifacts,
    sources,
    facts,
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
  narrativeOverride?: Record<string, unknown>,
  candidateUseCasesOverride?: ReturnType<typeof createCandidateUseCases>,
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
            useCases: candidateUseCasesOverride ?? createCandidateUseCases(),
          },
          outputText: "Candidate use cases completed.",
          rawResponse: { id: "resp_use_cases", output: [], usage: {} },
          webSearchSources: [],
          fileSearchResults: [],
        } as never;
      }

      if (schemaName === "account_plan_publish_quality_gate") {
        return {
          responseId: "resp_quality_gate",
          parsed: {
            overallPass: true,
            sections: [
              {
                section: "executive_summary",
                status: "pass",
                confidence: 88,
                summary: "Executive summary matches the resolved company identity and business model.",
                issueCodes: [],
                supportingSourceIds: [1],
                requiresTargetedSources: false,
                targetedSourceFocus: [],
              },
              {
                section: "motion_recommendation",
                status: "pass",
                confidence: 86,
                summary: "Motion recommendation is grounded in the cited company evidence.",
                issueCodes: [],
                supportingSourceIds: [1, 2],
                requiresTargetedSources: false,
                targetedSourceFocus: [],
              },
              {
                section: "top_opportunities",
                status: "pass",
                confidence: 87,
                summary: "Top opportunities stay aligned with the company's actual business.",
                issueCodes: [],
                supportingSourceIds: [1, 2],
                requiresTargetedSources: false,
                targetedSourceFocus: [],
              },
            ],
            retryPlan: {
              regenerateCandidateUseCases: false,
              regenerateNarrative: false,
              fetchTargetedSources: false,
              rationale: "No retry needed.",
            },
          },
          outputText: "Quality gate completed.",
          rawResponse: { id: "resp_quality_gate", output: [], usage: {} },
          webSearchSources: [],
          fileSearchResults: [],
        } as never;
      }

      if (schemaName === "account_plan_targeted_source_search") {
        return {
          responseId: "resp_targeted_sources",
          parsed: {
            discoveredSources: [],
            retrievalSummary: "No additional targeted sources were needed.",
          },
          outputText: "Targeted sources completed.",
          rawResponse: { id: "resp_targeted_sources", output: [], usage: {} },
          webSearchSources: [],
          fileSearchResults: [],
        } as never;
      }

      const defaultNarrative = {
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
      };

      return {
        responseId: "resp_narrative",
        parsed: {
          ...defaultNarrative,
          ...(narrativeOverride ?? {}),
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
    expect(stub.artifacts).toHaveLength(0);
    expect(parseCalls).toEqual([
      {
        schemaName: "account_plan_candidate_use_cases",
        tools: undefined,
        include: undefined,
        timeoutMs: 150_000,
        maxAttempts: 1,
      },
      {
        schemaName: "account_plan_narrative",
        tools: undefined,
        include: undefined,
        timeoutMs: 75_000,
        maxAttempts: 1,
      },
      {
        schemaName: "account_plan_publish_quality_gate",
        tools: undefined,
        include: undefined,
        timeoutMs: 45_000,
        maxAttempts: 1,
      },
    ]);
  });

  it("builds opportunity and narrative prompts from the structured fact packet instead of loose source blobs", async () => {
    const stub = createRepositoryStub();
    const capturedInputs = new Map<string, Record<string, unknown>>();
    const service = createAccountPlanService({
      repository: stub.repository,
      openAIClient: {
        isConfigured: () => true,
        createVectorStore: async () => {
          throw new Error("Not needed");
        },
        uploadFile: async () => {
          throw new Error("Not needed");
        },
        attachFileToVectorStoreAndPoll: async () => {
          throw new Error("Not needed");
        },
        parseStructuredOutput: async ({ schemaName, input }) => {
          capturedInputs.set(schemaName, JSON.parse(String(input)) as Record<string, unknown>);

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

          if (schemaName === "account_plan_publish_quality_gate") {
            return {
              responseId: "resp_quality_gate",
              parsed: {
                overallPass: true,
                sections: [
                  {
                    section: "executive_summary",
                    status: "pass",
                    confidence: 90,
                    summary: "Executive summary stays grounded in the fact packet.",
                    issueCodes: [],
                    supportingSourceIds: [1],
                    requiresTargetedSources: false,
                    targetedSourceFocus: [],
                  },
                  {
                    section: "motion_recommendation",
                    status: "pass",
                    confidence: 88,
                    summary: "Motion recommendation is grounded in the fact packet.",
                    issueCodes: [],
                    supportingSourceIds: [1, 2],
                    requiresTargetedSources: false,
                    targetedSourceFocus: [],
                  },
                  {
                    section: "top_opportunities",
                    status: "pass",
                    confidence: 89,
                    summary: "Top opportunities match the target company business.",
                    issueCodes: [],
                    supportingSourceIds: [1, 2],
                    requiresTargetedSources: false,
                    targetedSourceFocus: [],
                  },
                ],
                retryPlan: {
                  regenerateCandidateUseCases: false,
                  regenerateNarrative: false,
                  fetchTargetedSources: false,
                  rationale: "No retry needed.",
                },
              },
              outputText: "Quality gate completed.",
              rawResponse: { id: "resp_quality_gate", output: [], usage: {} },
              webSearchSources: [],
              fileSearchResults: [],
            } as never;
          }

          return {
            responseId: "resp_narrative",
            parsed: {
              overallAccountMotion: {
                recommendedMotion: "hybrid",
                rationale: "The fact packet supports both knowledge-heavy and integration-adjacent opportunities.",
                evidenceSourceIds: [1, 2],
              },
              stakeholderHypotheses: [
                {
                  likelyRole: "VP of Engineering",
                  department: "engineering",
                  hypothesis: "Likely sponsor for platform-oriented adoption.",
                  rationale: "The fact packet highlights platform positioning.",
                  confidence: 82,
                  evidenceSourceIds: [1],
                },
                {
                  likelyRole: "Head of IT",
                  department: "it_security",
                  hypothesis: "Likely reviewer for operational rollout.",
                  rationale: "The fact packet includes production trust signals.",
                  confidence: 76,
                  evidenceSourceIds: [2],
                },
                {
                  likelyRole: "Revenue Operations leader",
                  department: "sales",
                  hypothesis: "Could sponsor commercial workflow automation where evidence supports it.",
                  rationale: "The fact packet references enterprise workflow positioning.",
                  confidence: 72,
                  evidenceSourceIds: [1],
                },
              ],
              objectionsAndRebuttals: [
                {
                  objection: "Security review could slow rollout.",
                  rebuttal: "Keep the initial pilot bounded and source-backed.",
                  evidenceSourceIds: [2],
                },
              ],
              discoveryQuestions: [
                {
                  question: "Which workflow owner can sponsor the pilot?",
                  whyItMatters: "A clear owner is needed for execution.",
                  evidenceSourceIds: [1],
                },
              ],
              pilotPlan: {
                objective: "Validate one high-signal workflow grounded in the fact packet.",
                recommendedMotion: "hybrid",
                scope: "One small cross-functional team and one workflow.",
                successMetrics: ["Cycle time reduction", "User adoption"],
                phases: [
                  {
                    name: "Scope",
                    duration: "Weeks 1-2",
                    goals: ["Confirm workflow"],
                    deliverables: ["Pilot brief"],
                  },
                  {
                    name: "Launch",
                    duration: "Weeks 3-8",
                    goals: ["Run pilot"],
                    deliverables: ["Pilot workflow"],
                  },
                  {
                    name: "Review",
                    duration: "Weeks 9-12",
                    goals: ["Measure outcomes"],
                    deliverables: ["Pilot readout"],
                  },
                ],
                dependencies: ["Pilot owner"],
                risks: ["Some profile fields may remain thin"],
                evidenceSourceIds: [1, 2],
              },
              expansionScenarios: {
                low: {
                  summary: "Expand to one adjacent workflow.",
                  assumptions: ["Initial pilot succeeds"],
                  expectedOutcomes: ["Measured value"],
                  evidenceSourceIds: [1],
                },
                base: {
                  summary: "Expand to two adjacent teams.",
                  assumptions: ["Sponsor remains engaged"],
                  expectedOutcomes: ["Broader adoption"],
                  evidenceSourceIds: [1, 2],
                },
                high: {
                  summary: "Scale across multiple workflows.",
                  assumptions: ["Pilot metrics are strong"],
                  expectedOutcomes: ["Larger rollout"],
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
      },
    });

    await service.generateAccountPlan(stub.context);

    const candidateInput = capturedInputs.get("account_plan_candidate_use_cases");
    const narrativeInput = capturedInputs.get("account_plan_narrative");

    expect(candidateInput).toBeDefined();
    expect(candidateInput?.factPacket).toBeDefined();
    expect(candidateInput?.factPacket).not.toHaveProperty("summary");
    expect(candidateInput).not.toHaveProperty("researchSummary");
    expect(candidateInput).not.toHaveProperty("factBase");
    expect(candidateInput).not.toHaveProperty("sourceRegistry");
    expect(
      (candidateInput?.factPacket as { companyProfile: { companyDescription: { value: string } } }).companyProfile
        .companyDescription.value,
    ).toContain("OpenAI");
    expect(
      (
        candidateInput?.factPacket as {
          companyProfile: { keyPublicSignals: Array<{ summary: string }> };
        }
      ).companyProfile.keyPublicSignals.length,
    ).toBeGreaterThan(0);
    expect(narrativeInput?.factPacket).toBeDefined();
    expect(narrativeInput).not.toHaveProperty("researchSummary");
    expect(narrativeInput).not.toHaveProperty("factBase");
    expect(
      (
        narrativeInput?.factPacket as {
          companyProfile: { productsServices: { value: string | null } };
        }
      ).companyProfile.productsServices.value,
    ).toBeTruthy();
  });

  it("downweights transient site-anomaly use cases so they do not dominate the top opportunity by default", async () => {
    const stub = createRepositoryStub();
    stub.sources[1] = {
      ...stub.sources[1],
      title: "OpenAI status: Service temporarily unavailable",
      textContent: "Scheduled maintenance is in progress. Some services are temporarily unavailable.",
      markdownContent: "# Service temporarily unavailable\n\nScheduled maintenance is in progress.",
    };
    stub.storedArtifacts[0] = {
      ...stub.storedArtifacts[0],
      storagePointers: {
        inlineJson: JSON.stringify(
          buildFactPacket({
            context: stub.context,
            sources: stub.sources,
            facts: [
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
                statement: "The website was temporarily unavailable during scheduled maintenance.",
                rationale: "This is a transient operational event rather than a stable product signal.",
                confidence: 74,
                freshness: "current",
                sentiment: "negative",
                relevance: 72,
                evidenceSnippet: "Service temporarily unavailable during scheduled maintenance.",
                sourceIds: [2],
                createdAt: new Date("2026-04-07T12:00:00.000Z"),
                updatedAt: new Date("2026-04-07T12:00:00.000Z"),
              },
            ],
            briefMode: "standard",
          }),
        ),
      },
    };
    const candidateUseCases = createCandidateUseCases();
    candidateUseCases[0] = {
      ...candidateUseCases[0],
      workflowName: "Website outage response copilot",
      summary: "Coordinate temporary outage response and maintenance updates across the website team.",
      painPoint: "Teams scramble during temporary outages and maintenance windows.",
      whyNow: "Recent service unavailable states and maintenance signals can create noisy short-term demand.",
      expectedOutcome: "Faster response playbooks for transient website incidents.",
      evidenceSourceIds: [2],
      scorecard: {
        businessValue: 99,
        deploymentReadiness: 96,
        expansionPotential: 99,
        openaiFit: 93,
        sponsorLikelihood: 92,
        evidenceConfidence: 96,
        riskPenalty: 4,
      },
    };
    candidateUseCases[1] = {
      ...candidateUseCases[1],
      workflowName: "Enterprise knowledge assistant",
      evidenceSourceIds: [1],
      scorecard: {
        businessValue: 92,
        deploymentReadiness: 88,
        expansionPotential: 87,
        openaiFit: 91,
        sponsorLikelihood: 84,
        evidenceConfidence: 86,
        riskPenalty: 9,
      },
    };

    const service = createAccountPlanService({
      repository: stub.repository,
      openAIClient: createOpenAIStub([], undefined, candidateUseCases),
    });

    await service.generateAccountPlan(stub.context);

    const anomalyUseCase = stub.context.run.accountPlan?.candidateUseCases.find(
      (useCase) => useCase.workflowName === "Website outage response copilot",
    );

    expect(stub.context.run.accountPlan?.publishMode).toBe("grounded_fallback");
    expect(stub.context.run.accountPlan?.topUseCases).toHaveLength(0);
    expect(anomalyUseCase).toBeUndefined();
    expect(stub.events.some((event) => event.eventType === "account_plan.transient_operational_signals_downweighted")).toBe(
      true,
    );
  });

  it("rejects BK-style seller-workflow opportunities and retries toward company-specific output", async () => {
    const stub = createRepositoryStub();
    stub.context.report.normalizedInputUrl = "https://bk.com/";
    stub.context.report.canonicalDomain = "bk.com";
    stub.context.report.companyName = "Burger King";
    stub.context.run.researchSummary = {
      companyIdentity: {
        companyName: "Burger King",
        canonicalDomain: "bk.com",
        relationshipToCanonicalDomain: "Official Burger King brand site; parent context is Restaurant Brands International.",
        archetype: "Quick-service restaurant chain",
        businessModel: "Franchised quick-service restaurant brand",
        customerType: "Consumers and franchise operators",
        offerings: "Burgers, chicken, breakfast, restaurant operations, and digital ordering",
        sector: "Consumer services",
        industry: "Quick-service restaurants",
        publicCompany: null,
        headquarters: "Miami, Florida",
        confidence: 94,
        sourceIds: [1, 2, 3],
      },
      growthPriorities: [
        {
          summary: "Digital ordering and franchise-scale restaurant operations are visible priorities.",
          sourceIds: [1, 2, 3],
        },
      ],
      aiMaturityEstimate: {
        level: "moderate",
        rationale: "Public digital and operations signals suggest room for workflow automation, but not a software-seller business model.",
        sourceIds: [1, 2],
      },
      regulatorySensitivity: {
        level: "low",
        rationale: "The public record is weighted toward restaurant operations rather than highly regulated enterprise software.",
        sourceIds: [1, 3],
      },
      notableProductSignals: [
        {
          summary: "Burger King highlights digital ordering and restaurant operations at brand scale.",
          sourceIds: [1, 2],
        },
      ],
      notableHiringSignals: [],
      notableTrustSignals: [],
      complaintThemes: [],
      leadershipSocialThemes: [],
      researchCompletenessScore: 81,
      confidenceBySection: [
        {
          section: "company-brief",
          confidence: 92,
          rationale: "Identity and business model are clear.",
        },
      ],
      evidenceGaps: ["Public technical detail about internal restaurant workflows is still limited."],
      overallConfidence: "medium",
      sourceIds: [1, 2, 3],
    };
    stub.sources.splice(
      0,
      stub.sources.length,
      {
        ...stub.sources[0],
        id: 1,
        url: "https://www.bk.com/",
        normalizedUrl: "https://www.bk.com/",
        canonicalUrl: "https://www.bk.com/",
        canonicalDomain: "bk.com",
        title: "Burger King",
        sourceType: "company_homepage",
        textContent: "Burger King serves burgers, chicken, breakfast, and digital ordering through a global restaurant footprint.",
        markdownContent:
          "# Burger King\n\nBurger King serves burgers, chicken, breakfast, and digital ordering through a global restaurant footprint.",
      },
      {
        ...stub.sources[1],
        id: 2,
        url: "https://www.bk.com/company-and-community",
        normalizedUrl: "https://www.bk.com/company-and-community",
        canonicalUrl: "https://www.bk.com/company-and-community",
        canonicalDomain: "bk.com",
        title: "About Burger King",
        sourceType: "about_page",
        textContent: "Burger King is a quick-service restaurant brand serving guests through company and franchise restaurant operations.",
        markdownContent:
          "# About Burger King\n\nBurger King is a quick-service restaurant brand serving guests through company and franchise restaurant operations.",
      },
      {
        ...stub.sources[1],
        id: 3,
        url: "https://www.rbi.com/English/brands/default.aspx",
        normalizedUrl: "https://www.rbi.com/English/brands/default.aspx",
        canonicalUrl: "https://www.rbi.com/English/brands/default.aspx",
        canonicalDomain: "rbi.com",
        title: "Restaurant Brands International",
        sourceType: "investor_relations_page",
        textContent: "Restaurant Brands International is the parent company of Burger King and its other restaurant brands.",
        markdownContent:
          "# Restaurant Brands International\n\nRestaurant Brands International is the parent company of Burger King and its other restaurant brands.",
      },
    );
    stub.facts.splice(
      0,
      stub.facts.length,
      {
        id: 1,
        reportId: 1,
        runId: 11,
        sourceId: 1,
        section: "company-brief",
        classification: "fact",
        statement: "Burger King is a quick-service restaurant brand focused on burgers, chicken, breakfast, and digital ordering.",
        rationale: "This appears in brand materials.",
        confidence: 94,
        freshness: "current",
        sentiment: "neutral",
        relevance: 97,
        evidenceSnippet: "Burger King serves burgers, chicken, breakfast, and digital ordering.",
        sourceIds: [1, 2],
        createdAt: new Date("2026-04-07T12:00:00.000Z"),
        updatedAt: new Date("2026-04-07T12:00:00.000Z"),
      },
      {
        id: 2,
        reportId: 1,
        runId: 11,
        sourceId: 2,
        section: "fact-base",
        classification: "fact",
        statement: "Burger King operates through a franchised restaurant model with guest-facing digital ordering and restaurant operations at scale.",
        rationale: "The about page and brand materials emphasize restaurant operations and franchise scale.",
        confidence: 90,
        freshness: "current",
        sentiment: "neutral",
        relevance: 93,
        evidenceSnippet: "Quick-service restaurant brand serving guests through company and franchise restaurant operations.",
        sourceIds: [1, 2],
        createdAt: new Date("2026-04-07T12:00:00.000Z"),
        updatedAt: new Date("2026-04-07T12:00:00.000Z"),
      },
      {
        id: 3,
        reportId: 1,
        runId: 11,
        sourceId: 3,
        section: "company-brief",
        classification: "fact",
        statement: "Restaurant Brands International is Burger King's parent company.",
        rationale: "The parent brand page states this relationship directly.",
        confidence: 92,
        freshness: "current",
        sentiment: "neutral",
        relevance: 88,
        evidenceSnippet: "Restaurant Brands International is the parent company of Burger King.",
        sourceIds: [3],
        createdAt: new Date("2026-04-07T12:00:00.000Z"),
        updatedAt: new Date("2026-04-07T12:00:00.000Z"),
      },
    );
    stub.storedArtifacts[0] = {
      ...stub.storedArtifacts[0],
      storagePointers: {
        inlineJson: JSON.stringify(
          buildFactPacket({
            context: stub.context,
            sources: stub.sources,
            facts: stub.facts,
            briefMode: "standard",
          }),
        ),
      },
    };

    const initialCandidateUseCases = createCandidateUseCases();
    initialCandidateUseCases[0] = {
      ...initialCandidateUseCases[0],
      department: "sales",
      workflowName: "Account intelligence workspace",
      summary: "Give sellers an account intelligence workspace for discovery brief creation and research prioritization.",
      painPoint: "Sellers lack a discovery brief builder and account-planning context.",
      whyNow: "A research prioritization copilot could improve seller execution.",
      expectedOutcome: "Faster seller planning and account intelligence coverage.",
      motionRationale: "This should lead with seller/account-planning tooling.",
      evidenceSourceIds: [1],
      scorecard: {
        businessValue: 99,
        deploymentReadiness: 96,
        expansionPotential: 99,
        openaiFit: 95,
        sponsorLikelihood: 94,
        evidenceConfidence: 93,
        riskPenalty: 4,
      },
    };
    initialCandidateUseCases[1] = {
      ...initialCandidateUseCases[1],
      department: "sales",
      workflowName: "Research prioritization copilot",
      summary: "Automate seller research prioritization across strategic accounts.",
      painPoint: "The account-planning motion is still manual.",
      whyNow: "Seller workflow tooling would tighten discovery and sequencing.",
      expectedOutcome: "Higher seller throughput and faster planning.",
      motionRationale: "This is a seller workflow automation opportunity.",
      evidenceSourceIds: [2],
      scorecard: {
        businessValue: 97,
        deploymentReadiness: 93,
        expansionPotential: 95,
        openaiFit: 94,
        sponsorLikelihood: 91,
        evidenceConfidence: 91,
        riskPenalty: 5,
      },
    };

    const retriedCandidateUseCases = createCandidateUseCases();
    retriedCandidateUseCases[0] = {
      ...retriedCandidateUseCases[0],
      department: "operations",
      workflowName: "Restaurant operations knowledge assistant",
      summary: "Help restaurant operators resolve guest, menu, and shift-execution questions with brand-grounded guidance.",
      painPoint: "Restaurant teams need faster answers across menu, service, and store-execution workflows.",
      whyNow: "Burger King's public brand and franchise signals point to multi-location operating consistency and digital ordering demands.",
      expectedOutcome: "Faster restaurant issue resolution and more consistent guest experience.",
      motionRationale: "A workspace-led rollout can start with restaurant knowledge and expand into operational systems later.",
      evidenceSourceIds: [1, 2, 3],
      scorecard: {
        businessValue: 96,
        deploymentReadiness: 88,
        expansionPotential: 89,
        openaiFit: 90,
        sponsorLikelihood: 85,
        evidenceConfidence: 91,
        riskPenalty: 9,
      },
    };
    retriedCandidateUseCases[1] = {
      ...retriedCandidateUseCases[1],
      department: "marketing",
      workflowName: "Menu campaign localization copilot",
      summary: "Support faster menu and promotion adaptation for regional restaurant campaigns.",
      painPoint: "Brand and franchise teams need quicker iteration across menu and campaign content.",
      whyNow: "Public brand and parent context indicate large-scale consumer marketing and franchise coordination.",
      expectedOutcome: "Faster campaign localization and cleaner brand execution.",
      motionRationale: "This starts in workspace and can expand into hybrid execution where systems integration matters.",
      evidenceSourceIds: [1, 2, 3],
      scorecard: {
        businessValue: 90,
        deploymentReadiness: 84,
        expansionPotential: 87,
        openaiFit: 88,
        sponsorLikelihood: 81,
        evidenceConfidence: 89,
        riskPenalty: 10,
      },
    };

    let candidateCallCount = 0;
    let narrativeCallCount = 0;
    let qualityGateCallCount = 0;
    const parseOrder: string[] = [];

    const service = createAccountPlanService({
      repository: stub.repository,
      openAIClient: {
        isConfigured: () => true,
        createVectorStore: async () => {
          throw new Error("Not needed");
        },
        uploadFile: async () => {
          throw new Error("Not needed");
        },
        attachFileToVectorStoreAndPoll: async () => {
          throw new Error("Not needed");
        },
        parseStructuredOutput: async ({ schemaName }) => {
          parseOrder.push(schemaName);

          if (schemaName === "account_plan_candidate_use_cases") {
            candidateCallCount += 1;

            return {
              responseId: `resp_use_cases_${candidateCallCount}`,
              parsed: {
                useCases: candidateCallCount === 1 ? initialCandidateUseCases : retriedCandidateUseCases,
              },
              outputText: "Candidate use cases completed.",
              rawResponse: { id: `resp_use_cases_${candidateCallCount}`, output: [], usage: {} },
              webSearchSources: [],
              fileSearchResults: [],
            } as never;
          }

          if (schemaName === "account_plan_narrative") {
            narrativeCallCount += 1;

            return {
              responseId: `resp_narrative_${narrativeCallCount}`,
              parsed:
                narrativeCallCount === 1
                  ? {
                      overallAccountMotion: {
                        recommendedMotion: "workspace",
                        rationale: "Lead with an account intelligence workspace and discovery brief builder for seller planning.",
                        evidenceSourceIds: [1, 2],
                      },
                      stakeholderHypotheses: [
                        {
                          likelyRole: "Head of Operations",
                          department: "operations",
                          hypothesis: "Could sponsor workflow change if it proves measurable.",
                          rationale: "Operations remains central even though the first draft is misaligned.",
                          confidence: 71,
                          evidenceSourceIds: [1],
                        },
                        {
                          likelyRole: "CMO",
                          department: "marketing",
                          hypothesis: "Could support brand workflow pilots.",
                          rationale: "Marketing signals appear in the public brand presence.",
                          confidence: 70,
                          evidenceSourceIds: [1, 2],
                        },
                        {
                          likelyRole: "Franchise operations leader",
                          department: "operations",
                          hypothesis: "Could review store-level rollout feasibility.",
                          rationale: "Franchise operations are visible in the public business model.",
                          confidence: 76,
                          evidenceSourceIds: [2, 3],
                        },
                      ],
                      objectionsAndRebuttals: [],
                      discoveryQuestions: [
                        {
                          question: "Which restaurant workflow should start first?",
                          whyItMatters: "A bounded first pilot is still needed.",
                          evidenceSourceIds: [1, 2],
                        },
                      ],
                      pilotPlan: {
                        objective: "Validate one restaurant workflow and one guest-support workflow.",
                        recommendedMotion: "workspace",
                        scope: "Two bounded workflows and a small pilot team.",
                        successMetrics: ["Cycle time reduction", "Adoption"],
                        phases: [
                          {
                            name: "Scope",
                            duration: "Weeks 1-2",
                            goals: ["Confirm owners"],
                            deliverables: ["Pilot brief"],
                          },
                          {
                            name: "Launch",
                            duration: "Weeks 3-8",
                            goals: ["Run pilot"],
                            deliverables: ["Pilot workflow"],
                          },
                          {
                            name: "Review",
                            duration: "Weeks 9-12",
                            goals: ["Measure impact"],
                            deliverables: ["Pilot readout"],
                          },
                        ],
                        dependencies: ["Pilot owner"],
                        risks: ["Initial output may be misaligned"],
                        evidenceSourceIds: [1, 2],
                      },
                      expansionScenarios: {
                        low: null,
                        base: null,
                        high: null,
                      },
                    }
                  : {
                      overallAccountMotion: {
                        recommendedMotion: "workspace",
                        rationale:
                          "Start with a workspace-led restaurant operations and brand knowledge pilot, then expand into integrated restaurant workflows where evidence justifies it.",
                        evidenceSourceIds: [1, 2, 3],
                      },
                      stakeholderHypotheses: [
                        {
                          likelyRole: "Restaurant operations leader",
                          department: "operations",
                          hypothesis: "Likely sponsor for restaurant execution and guest-experience workflows.",
                          rationale: "The public business model centers on multi-location restaurant operations.",
                          confidence: 82,
                          evidenceSourceIds: [1, 2, 3],
                        },
                        {
                          likelyRole: "Brand marketing leader",
                          department: "marketing",
                          hypothesis: "Could sponsor menu and promotion workflow pilots.",
                          rationale: "Burger King's public brand presence points to campaign coordination needs.",
                          confidence: 77,
                          evidenceSourceIds: [1, 2],
                        },
                        {
                          likelyRole: "Franchise operations executive",
                          department: "operations",
                          hypothesis: "Could gate wider rollout across franchise operations.",
                          rationale: "Parent and brand sources show franchise-scale operations.",
                          confidence: 79,
                          evidenceSourceIds: [2, 3],
                        },
                      ],
                      objectionsAndRebuttals: [],
                      discoveryQuestions: [
                        {
                          question: "Which restaurant operations workflow creates the clearest guest or staff value first?",
                          whyItMatters: "The first pilot should attach to a measurable operating problem.",
                          evidenceSourceIds: [1, 2],
                        },
                      ],
                      pilotPlan: {
                        objective: "Validate one restaurant-operations workflow with store and franchise stakeholders.",
                        recommendedMotion: "workspace",
                        scope: "One bounded restaurant operations pilot with a small cross-functional team.",
                        successMetrics: ["Issue-resolution time", "Pilot adoption"],
                        phases: [
                          {
                            name: "Scope",
                            duration: "Weeks 1-2",
                            goals: ["Confirm restaurant workflow"],
                            deliverables: ["Pilot brief"],
                          },
                          {
                            name: "Launch",
                            duration: "Weeks 3-8",
                            goals: ["Run pilot"],
                            deliverables: ["Workspace pilot"],
                          },
                          {
                            name: "Review",
                            duration: "Weeks 9-12",
                            goals: ["Measure outcomes"],
                            deliverables: ["Pilot readout"],
                          },
                        ],
                        dependencies: ["Operations sponsor"],
                        risks: ["Public evidence remains directional for some internal workflows"],
                        evidenceSourceIds: [1, 2, 3],
                      },
                      expansionScenarios: {
                        low: null,
                        base: null,
                        high: null,
                      },
                    },
              outputText: "Narrative completed.",
              rawResponse: { id: `resp_narrative_${narrativeCallCount}`, output: [], usage: {} },
              webSearchSources: [],
              fileSearchResults: [],
            } as never;
          }

          if (schemaName === "account_plan_publish_quality_gate") {
            qualityGateCallCount += 1;

            return {
              responseId: `resp_quality_gate_${qualityGateCallCount}`,
              parsed:
                qualityGateCallCount === 1
                  ? {
                      overallPass: false,
                      sections: [
                        {
                          section: "executive_summary",
                          status: "fail",
                          confidence: 24,
                          summary: "The executive summary sounds like seller tooling rather than Burger King's business.",
                          issueCodes: ["seller_workflow_self_reference", "industry_or_business_model_mismatch"],
                          supportingSourceIds: [1, 2],
                          requiresTargetedSources: true,
                          targetedSourceFocus: ["official Burger King about page", "parent brand context"],
                        },
                        {
                          section: "motion_recommendation",
                          status: "fail",
                          confidence: 26,
                          summary: "The motion recommendation is framed around account-planning tooling instead of restaurant operations.",
                          issueCodes: ["seller_workflow_self_reference"],
                          supportingSourceIds: [1, 2],
                          requiresTargetedSources: false,
                          targetedSourceFocus: ["restaurant operations workflow evidence"],
                        },
                        {
                          section: "top_opportunities",
                          status: "fail",
                          confidence: 22,
                          summary: "Top opportunities are self-referential seller-workflow ideas rather than company-specific restaurant opportunities.",
                          issueCodes: ["seller_workflow_self_reference", "generic_language"],
                          supportingSourceIds: [1, 2],
                          requiresTargetedSources: true,
                          targetedSourceFocus: ["Burger King offerings", "franchise and restaurant model", "parent context"],
                        },
                      ],
                      retryPlan: {
                        regenerateCandidateUseCases: true,
                        regenerateNarrative: true,
                        fetchTargetedSources: true,
                        rationale: "Refresh grounding from official brand and parent sources, then regenerate only the failed sections.",
                      },
                    }
                  : {
                      overallPass: true,
                      sections: [
                        {
                          section: "executive_summary",
                          status: "pass",
                          confidence: 89,
                          summary: "The executive summary now matches Burger King's restaurant business.",
                          issueCodes: [],
                          supportingSourceIds: [1, 2, 3],
                          requiresTargetedSources: false,
                          targetedSourceFocus: [],
                        },
                        {
                          section: "motion_recommendation",
                          status: "pass",
                          confidence: 87,
                          summary: "The motion recommendation is grounded in the restaurant operations evidence.",
                          issueCodes: [],
                          supportingSourceIds: [1, 2, 3],
                          requiresTargetedSources: false,
                          targetedSourceFocus: [],
                        },
                        {
                          section: "top_opportunities",
                          status: "pass",
                          confidence: 90,
                          summary: "Top opportunities are now specific to Burger King's operating model.",
                          issueCodes: [],
                          supportingSourceIds: [1, 2, 3],
                          requiresTargetedSources: false,
                          targetedSourceFocus: [],
                        },
                      ],
                      retryPlan: {
                        regenerateCandidateUseCases: false,
                        regenerateNarrative: false,
                        fetchTargetedSources: false,
                        rationale: "No retry needed.",
                      },
                    },
              outputText: "Quality gate completed.",
              rawResponse: { id: `resp_quality_gate_${qualityGateCallCount}`, output: [], usage: {} },
              webSearchSources: [],
              fileSearchResults: [],
            } as never;
          }

          if (schemaName === "account_plan_targeted_source_search") {
            return {
              responseId: "resp_targeted_sources",
              parsed: {
                discoveredSources: [
                  {
                    url: "https://www.bk.com/company-and-community",
                    title: "About Burger King",
                    sourceType: "about_page",
                    sourceTier: "primary",
                    publishedAt: null,
                    summary: "Official Burger King brand page describing the brand and restaurant footprint.",
                    whyItMatters: "This grounds the brand's actual operating model and offerings.",
                  },
                  {
                    url: "https://www.rbi.com/English/brands/default.aspx",
                    title: "Restaurant Brands International",
                    sourceType: "investor_relations_page",
                    sourceTier: "primary",
                    publishedAt: null,
                    summary: "Parent-brand page showing Burger King within Restaurant Brands International.",
                    whyItMatters: "This confirms parent context and franchise-scale business framing.",
                  },
                ],
                retrievalSummary: "Retrieved official Burger King and parent-brand sources to ground the retry.",
              },
              outputText: "Targeted sources completed.",
              rawResponse: { id: "resp_targeted_sources", output: [], usage: {} },
              webSearchSources: [
                { url: "https://www.bk.com/company-and-community" },
                { url: "https://www.rbi.com/English/brands/default.aspx" },
              ],
              fileSearchResults: [],
            } as never;
          }

          throw new Error(`Unexpected schema ${schemaName}`);
        },
      },
    });

    await service.generateAccountPlan(stub.context);

    expect(parseOrder).toEqual([
      "account_plan_candidate_use_cases",
      "account_plan_narrative",
      "account_plan_publish_quality_gate",
      "account_plan_targeted_source_search",
      "account_plan_candidate_use_cases",
      "account_plan_narrative",
      "account_plan_publish_quality_gate",
    ]);
    expect(stub.context.run.accountPlan?.topUseCases[0]?.workflowName).toBe("Restaurant operations knowledge assistant");
    expect(
      stub.context.run.accountPlan?.topUseCases.some((useCase) =>
        /account intelligence|research prioritization|account planning/i.test(
          `${useCase.workflowName} ${useCase.summary} ${useCase.motionRationale}`,
        ),
      ),
    ).toBe(false);
    expect(stub.events.some((event) => event.eventType === "account_plan.relevance_gate.failed")).toBe(true);
    expect(stub.events.some((event) => event.eventType === "account_plan.relevance_gate.targeted_sources_completed")).toBe(
      true,
    );
    expect(stub.events.some((event) => event.eventType === "account_plan.self_reference_suppressed")).toBe(true);
    expect(stub.events.some((event) => event.eventType === "account_plan.relevance_gate.passed")).toBe(true);
    expect(stub.sources.length).toBeGreaterThan(3);
  });

  it("publishes a grounded fallback brief when relevance stays low-confidence after retries", async () => {
    const stub = createRepositoryStub();
    const sellerHeavyUseCases = createCandidateUseCases();
    sellerHeavyUseCases[0] = {
      ...sellerHeavyUseCases[0],
      workflowName: "Account intelligence workspace",
      summary: "Give sellers an account intelligence workspace for discovery brief creation.",
      painPoint: "Sellers need account-planning tooling.",
      whyNow: "A discovery brief builder would streamline seller execution.",
      expectedOutcome: "Faster seller planning.",
      motionRationale: "Lead with seller tooling.",
      evidenceSourceIds: [1],
      scorecard: {
        businessValue: 98,
        deploymentReadiness: 95,
        expansionPotential: 98,
        openaiFit: 94,
        sponsorLikelihood: 93,
        evidenceConfidence: 92,
        riskPenalty: 4,
      },
    };
    sellerHeavyUseCases[1] = {
      ...sellerHeavyUseCases[1],
      workflowName: "Research prioritization copilot",
      summary: "Prioritize seller research across named accounts.",
      painPoint: "Seller workflow research remains manual.",
      whyNow: "Research prioritization could improve seller throughput.",
      expectedOutcome: "More efficient account planning.",
      motionRationale: "This is another seller workflow automation path.",
      evidenceSourceIds: [1],
      scorecard: {
        businessValue: 96,
        deploymentReadiness: 92,
        expansionPotential: 96,
        openaiFit: 92,
        sponsorLikelihood: 91,
        evidenceConfidence: 90,
        riskPenalty: 5,
      },
    };

    let qualityGateCalls = 0;
    const service = createAccountPlanService({
      repository: stub.repository,
      openAIClient: {
        isConfigured: () => true,
        createVectorStore: async () => {
          throw new Error("Not needed");
        },
        uploadFile: async () => {
          throw new Error("Not needed");
        },
        attachFileToVectorStoreAndPoll: async () => {
          throw new Error("Not needed");
        },
        parseStructuredOutput: async ({ schemaName }) => {
          if (schemaName === "account_plan_candidate_use_cases") {
            return {
              responseId: "resp_use_cases",
              parsed: {
                useCases: sellerHeavyUseCases,
              },
              outputText: "Candidate use cases completed.",
              rawResponse: { id: "resp_use_cases", output: [], usage: {} },
              webSearchSources: [],
              fileSearchResults: [],
            } as never;
          }

          if (schemaName === "account_plan_narrative") {
            return {
              responseId: "resp_narrative",
              parsed: {
                overallAccountMotion: {
                  recommendedMotion: "workspace",
                  rationale: "Lead with seller account-planning tooling and discovery brief automation.",
                  evidenceSourceIds: [1],
                },
                stakeholderHypotheses: [
                  {
                    likelyRole: "VP of Engineering",
                    department: "engineering",
                    hypothesis: "Could sponsor platform adoption.",
                    rationale: "The company publicly builds platform products.",
                    confidence: 80,
                    evidenceSourceIds: [1],
                  },
                  {
                    likelyRole: "Head of IT",
                    department: "it_security",
                    hypothesis: "Likely reviewer for rollout controls.",
                    rationale: "Operational review is plausible.",
                    confidence: 74,
                    evidenceSourceIds: [1, 2],
                  },
                  {
                    likelyRole: "Revenue Operations leader",
                    department: "sales",
                    hypothesis: "Could sponsor seller workflow pilots.",
                    rationale: "This still reflects the low-confidence drift.",
                    confidence: 70,
                    evidenceSourceIds: [1],
                  },
                ],
                objectionsAndRebuttals: [],
                discoveryQuestions: [
                  {
                    question: "Which workflow is most important to the business?",
                    whyItMatters: "The first pilot still needs a scoped owner.",
                    evidenceSourceIds: [1],
                  },
                ],
                pilotPlan: {
                  objective: "Validate one workflow.",
                  recommendedMotion: "workspace",
                  scope: "One small pilot.",
                  successMetrics: ["Cycle time reduction", "Adoption"],
                  phases: [
                    {
                      name: "Scope",
                      duration: "Weeks 1-2",
                      goals: ["Confirm owner"],
                      deliverables: ["Pilot brief"],
                    },
                    {
                      name: "Launch",
                      duration: "Weeks 3-8",
                      goals: ["Run pilot"],
                      deliverables: ["Pilot workflow"],
                    },
                    {
                      name: "Review",
                      duration: "Weeks 9-12",
                      goals: ["Measure results"],
                      deliverables: ["Pilot readout"],
                    },
                  ],
                  dependencies: ["Pilot owner"],
                  risks: ["Opportunity fit may remain unclear"],
                  evidenceSourceIds: [1],
                },
                expansionScenarios: {
                  low: null,
                  base: null,
                  high: null,
                },
              },
              outputText: "Narrative completed.",
              rawResponse: { id: "resp_narrative", output: [], usage: {} },
              webSearchSources: [],
              fileSearchResults: [],
            } as never;
          }

          if (schemaName === "account_plan_publish_quality_gate") {
            qualityGateCalls += 1;

            return {
              responseId: `resp_quality_gate_${qualityGateCalls}`,
              parsed: {
                overallPass: false,
                sections: [
                  {
                    section: "executive_summary",
                    status: "fail",
                    confidence: 28,
                    summary: "The executive summary still sounds like seller tooling instead of the target company.",
                    issueCodes: ["seller_workflow_self_reference", "generic_language"],
                    supportingSourceIds: [1],
                    requiresTargetedSources: qualityGateCalls === 1,
                    targetedSourceFocus: ["official company description", "real offerings"],
                  },
                  {
                    section: "motion_recommendation",
                    status: "fail",
                    confidence: 30,
                    summary: "The motion recommendation remains low-confidence and seller-oriented.",
                    issueCodes: ["seller_workflow_self_reference"],
                    supportingSourceIds: [1],
                    requiresTargetedSources: false,
                    targetedSourceFocus: ["business model grounding"],
                  },
                  {
                    section: "top_opportunities",
                    status: "fail",
                    confidence: 25,
                    summary: "Top opportunities still do not show company-specific fit.",
                    issueCodes: ["seller_workflow_self_reference", "industry_or_business_model_mismatch"],
                    supportingSourceIds: [1, 2],
                    requiresTargetedSources: qualityGateCalls === 1,
                    targetedSourceFocus: ["company offerings", "customer type"],
                  },
                ],
                retryPlan: {
                  regenerateCandidateUseCases: true,
                  regenerateNarrative: true,
                  fetchTargetedSources: qualityGateCalls === 1,
                  rationale: "Retry once with stronger grounding.",
                },
              },
              outputText: "Quality gate completed.",
              rawResponse: { id: `resp_quality_gate_${qualityGateCalls}`, output: [], usage: {} },
              webSearchSources: [],
              fileSearchResults: [],
            } as never;
          }

          if (schemaName === "account_plan_targeted_source_search") {
            return {
              responseId: "resp_targeted_sources",
              parsed: {
                discoveredSources: [],
                retrievalSummary: "No additional targeted sources improved grounding enough for a full plan.",
              },
              outputText: "Targeted sources completed.",
              rawResponse: { id: "resp_targeted_sources", output: [], usage: {} },
              webSearchSources: [],
              fileSearchResults: [],
            } as never;
          }

          throw new Error(`Unexpected schema ${schemaName}`);
        },
      },
    });

    const message = await service.generateAccountPlan(stub.context);

    expect(message).toContain("grounded company brief");
    expect(stub.context.run.accountPlan?.publishMode).toBe("grounded_fallback");
    expect(stub.context.run.accountPlan?.topUseCases).toHaveLength(0);
    expect(stub.context.run.accountPlan?.overallAccountMotion.recommendedMotion).toBe("undetermined");
    expect(stub.context.run.accountPlan?.groundedFallbackBrief?.summary).toContain("OpenAI operates in");
    expect(stub.context.run.accountPlan?.groundedFallbackBrief?.summary).toContain("low-confidence");
    expect(stub.context.run.accountPlan?.candidateUseCases.every((useCase) => useCase.evidenceSourceIds.length > 0)).toBe(
      true,
    );
    expect(stub.events.some((event) => event.eventType === "account_plan.grounded_fallback_published")).toBe(true);
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

  it("persists a usable account plan when optional narrative sections are missing", async () => {
    const stub = createRepositoryStub();
    const service = createAccountPlanService({
      repository: stub.repository,
      openAIClient: createOpenAIStub([], {
        objectionsAndRebuttals: [],
        pilotPlan: null,
        expansionScenarios: {
          low: null,
          base: null,
          high: null,
        },
      }),
    });

    const message = await service.generateAccountPlan(stub.context);

    expect(message).toContain("usable account plan");
    expect(stub.context.run.accountPlan?.overallAccountMotion.recommendedMotion).toBe("hybrid");
    expect(stub.context.run.accountPlan?.pilotPlan).toBeNull();
    expect(stub.context.run.accountPlan?.objectionsAndRebuttals).toHaveLength(0);
    expect(stub.context.run.accountPlan?.expansionScenarios.base).toBeNull();
    expect(stub.events.some((event) => event.eventType === "fallback_applied")).toBe(true);
    expect(stub.events.some((event) => event.eventType === "account_plan.completed")).toBe(true);
  });
});
