import { describe, expect, it } from "vitest";

import { createInitialPipelineState } from "@/server/pipeline/pipeline-steps";
import type {
  PersistedArtifact,
  PersistedFact,
  PersistedReport,
  PersistedRun,
  PersistedSource,
  ReportRepository,
  StoredReportShell,
} from "@/server/repositories/report-repository";
import { createDeepResearchReportGenerationService } from "@/server/deep-research/report-generation-service";
import type { CanonicalAccountAtlasReport } from "@/server/deep-research/report-contract";
import type { OpenAIResearchClient, RetrievedBackgroundResponse } from "@/server/openai/client";

type CreateBackgroundStructuredOutputInput = {
  maxOutputTokens?: number;
};

function createCanonicalReportFixture(): CanonicalAccountAtlasReport {
  return {
    company: {
      resolved_name: "Example",
      canonical_domain: "example.com",
      relationship_to_url: "The submitted URL resolves to the corporate site.",
      archetype: "B2B software vendor",
      company_brief: "Example sells enterprise workflow software for commercial and support teams.",
      business_model: "Enterprise SaaS",
      customer_type: "Mid-market and enterprise teams",
      industry: "Software",
      sector: "Technology",
      offerings: "Workflow automation and knowledge tools",
      headquarters: "New York, NY",
      public_company: false,
      citations: [{ source_id: 1, support: "Homepage messaging." }],
    },
    report_metadata: {
      schema_name: "account_atlas_canonical_report",
      schema_version: 1,
      report_type: "seller_facing_account_plan",
      generated_at: "2026-04-12T12:00:00.000Z",
      company_url: "https://example.com/",
      normalized_company_url: "https://example.com/",
      canonical_domain: "example.com",
      report_mode: "full_report",
    },
    executive_summary: {
      summary: "Example has clear workflow scale signals and a practical workspace-first starting point.",
      why_now: "Public positioning and trust content suggest strong demand for faster internal knowledge workflows.",
      strategic_takeaway: "Lead with a workspace pilot for seller and support preparation workflows.",
      citations: [{ source_id: 1, support: "Homepage messaging." }],
    },
    fact_base: [
      {
        classification: "fact",
        statement: "Example sells workflow automation software to enterprise teams.",
        why_it_matters: "The company already frames work in terms of repeatable internal workflows.",
        confidence: {
          confidence_band: "high",
          confidence_score: 86,
          rationale: "This is explicit in first-party copy.",
        },
        citations: [{ source_id: 1, support: "Homepage messaging." }],
      },
      {
        classification: "inference",
        statement: "Knowledge-heavy seller and support workflows are likely to be practical first AI use cases.",
        why_it_matters: "These workflows can start with high-value retrieval and synthesis.",
        confidence: {
          confidence_band: "medium",
          confidence_score: 74,
          rationale: "The public workflow mix supports it.",
        },
        citations: [{ source_id: 1, support: "Homepage messaging." }],
      },
    ],
    ai_maturity_signals: {
      maturity_level: "moderate",
      maturity_summary: "Example shows product, documentation, and trust signals consistent with practical AI adoption.",
      notable_signals: [
        {
          summary: "The company maintains product and trust documentation suitable for a grounded pilot.",
          citations: [{ source_id: 1, support: "Docs and trust copy." }],
        },
      ],
      regulatory_sensitivity: {
        level: "medium",
        rationale: "Enterprise workflow data requires normal trust and security diligence.",
        citations: [{ source_id: 1, support: "Security page." }],
      },
      citations: [{ source_id: 1, support: "Docs and trust copy." }],
    },
    recommended_motion: {
      recommended_motion: "workspace",
      rationale: "The first pilot is retrieval and synthesis heavy, with light operational integration needs.",
      deployment_shape: "Start in a workspace pilot, then add workflow hooks if adoption is strong.",
      citations: [{ source_id: 1, support: "Workflow framing." }],
    },
    top_opportunities: [
      {
        priority_rank: 1,
        department: "sales",
        workflow_name: "Account prep copilot",
        summary: "Prepare commercial teams with target-company context before discovery.",
        pain_point: "Teams lose time gathering fragmented public and internal context.",
        why_now: "The company already emphasizes repeatable workflow execution.",
        likely_users: ["Account executives", "Revenue operations"],
        expected_outcome: "Faster prep and higher-quality discovery.",
        success_metrics: ["Prep time", "Discovery conversion"],
        dependencies: ["Sales enablement owner"],
        security_compliance_notes: ["Limit scope to approved internal notes and public sources."],
        recommended_motion: "workspace",
        motion_rationale: "The pilot is knowledge heavy and does not require deep system writes.",
        open_questions: ["Where is the current account brief assembled?"],
        confidence: {
          confidence_band: "high",
          confidence_score: 82,
          rationale: "Strong first-party workflow evidence supports it.",
        },
        citations: [{ source_id: 1, support: "Workflow framing." }],
      },
      {
        priority_rank: 2,
        department: "customer_support",
        workflow_name: "Support triage assistant",
        summary: "Summarize repeat inbound issues and route them consistently.",
        pain_point: "Support teams spend time triaging repetitive requests.",
        why_now: "Example publicly emphasizes workflow efficiency and knowledge access.",
        likely_users: ["Support leads"],
        expected_outcome: "Faster routing and clearer issue summaries.",
        success_metrics: ["First response time"],
        dependencies: ["Knowledge base owner"],
        security_compliance_notes: ["Validate routing rules before broad automation."],
        recommended_motion: "hybrid",
        motion_rationale: "The workflow starts in a workspace but will benefit from system hooks.",
        open_questions: ["Which systems own routing today?"],
        confidence: {
          confidence_band: "medium",
          confidence_score: 75,
          rationale: "The workflow fit is strong, with modest integration questions.",
        },
        citations: [{ source_id: 1, support: "Workflow framing." }],
      },
      {
        priority_rank: 3,
        department: "engineering",
        workflow_name: "Developer documentation assistant",
        summary: "Improve access to implementation and trust guidance.",
        pain_point: "Engineering teams lose time searching fragmented docs.",
        why_now: "Example publishes product and trust material that can seed a strong assistant.",
        likely_users: ["Developers"],
        expected_outcome: "Faster implementation and fewer repeated documentation questions.",
        success_metrics: ["Documentation resolution time"],
        dependencies: ["Documentation owner"],
        security_compliance_notes: ["Keep source scope limited to approved docs."],
        recommended_motion: "workspace",
        motion_rationale: "This is a retrieval-heavy workflow with light operational risk.",
        open_questions: ["How current is the docs corpus?"],
        confidence: {
          confidence_band: "medium",
          confidence_score: 72,
          rationale: "There is enough public evidence for a directional recommendation.",
        },
        citations: [{ source_id: 1, support: "Docs and trust copy." }],
      },
    ],
    buying_map: {
      stakeholder_hypotheses: [
        {
          likely_role: "Revenue operations lead",
          department: "sales",
          hypothesis: "Likely pilot sponsor for account-prep workflows.",
          rationale: "The first use case ties directly to commercial workflow efficiency.",
          confidence: {
            confidence_band: "medium",
            confidence_score: 73,
            rationale: "The role is a plausible owner based on the workflow surface area.",
          },
          citations: [{ source_id: 1, support: "Workflow framing." }],
        },
      ],
      likely_objections: [
        {
          objection: "The team may worry about rollout burden before ROI is proven.",
          rebuttal: "A workspace-first pilot limits integration scope and validates usage quickly.",
          citations: [{ source_id: 1, support: "Workflow framing." }],
        },
      ],
      discovery_questions: [
        {
          question: "Which workflow has the strongest business owner today?",
          why_it_matters: "The pilot needs a clear operator to move quickly.",
          citations: [{ source_id: 1, support: "Workflow framing." }],
        },
      ],
    },
    pilot_plan: {
      objective: "Validate a workspace-first pilot for commercial and support preparation workflows.",
      recommended_motion: "workspace",
      scope: "Start with seller prep and support summarization against approved public and internal content.",
      success_metrics: ["Prep time", "First response time"],
      phases: [
        {
          name: "Pilot design",
          duration: "Weeks 1-2",
          goals: ["Confirm owners", "Lock source scope"],
          deliverables: ["Pilot brief", "Source list"],
        },
        {
          name: "Pilot execution",
          duration: "Weeks 3-8",
          goals: ["Launch workspace", "Measure usage"],
          deliverables: ["Workspace pilot", "Usage review"],
        },
      ],
      dependencies: ["Business owner", "Approved content sources"],
      risks: ["Thin source freshness in some areas"],
      citations: [{ source_id: 1, support: "Workflow framing." }],
    },
    expansion_scenarios: {
      low: {
        summary: "Keep the pilot focused on seller preparation.",
        assumptions: ["One team adopts first"],
        expected_outcomes: ["Proof of value in a narrow workflow"],
        citations: [{ source_id: 1, support: "Workflow framing." }],
      },
      base: {
        summary: "Expand from seller prep into support summarization.",
        assumptions: ["The pilot owner is stable", "Adoption remains strong"],
        expected_outcomes: ["Broader workflow coverage"],
        citations: [{ source_id: 1, support: "Workflow framing." }],
      },
      high: {
        summary: "Add system hooks after the workspace pilot proves value.",
        assumptions: ["The pilot shows strong adoption", "Integration owners are available"],
        expected_outcomes: ["Hybrid workflow execution"],
        citations: [{ source_id: 1, support: "Workflow framing." }],
      },
    },
    evidence_coverage: {
      overall_confidence: {
        confidence_band: "high",
        confidence_score: 81,
        rationale: "The report has enough first-party evidence for a strong directional brief.",
      },
      overall_coverage: {
        coverage_level: "strong",
        coverage_score: 82,
        rationale: "Core sections are covered with strong enough evidence.",
      },
      research_completeness_score: 83,
      thin_evidence: false,
      evidence_gaps: [],
      section_coverage: [
        "company-brief",
        "fact-base",
        "ai-maturity-signals",
        "prioritized-use-cases",
        "recommended-motion",
        "stakeholder-hypotheses",
        "objections",
        "discovery-questions",
        "pilot-plan",
        "expansion-scenarios",
      ].map((section) => ({
        section,
        coverage: {
          coverage_level: "strong",
          coverage_score: 82,
          rationale: "Covered.",
        },
        confidence: {
          confidence_band: "high",
          confidence_score: 80,
          rationale: "Covered.",
        },
        citations: [{ source_id: 1, support: "Homepage messaging." }],
      })) as CanonicalAccountAtlasReport["evidence_coverage"]["section_coverage"],
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
        retrieved_at: "2026-04-12T11:59:00.000Z",
        summary: "Example homepage describing enterprise workflow software.",
      },
    ],
    grounded_fallback: null,
  };
}

function createRepositoryStub() {
  const report: PersistedReport = {
    id: 1,
    shareId: "atlas12345",
    status: "queued",
    normalizedInputUrl: "https://example.com/",
    canonicalDomain: "example.com",
    companyName: null,
    createdAt: new Date("2026-04-12T11:58:00.000Z"),
    updatedAt: new Date("2026-04-12T11:58:00.000Z"),
    completedAt: null,
    failedAt: null,
  };
  const run: PersistedRun = {
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
    openaiResponseId: null,
    openaiResponseStatus: null,
    openaiResponseMetadata: {},
    openaiOutputText: null,
    canonicalReport: null,
    researchSummary: null,
    accountPlan: null,
    errorCode: null,
    errorMessage: null,
    createdAt: new Date("2026-04-12T11:58:00.000Z"),
    updatedAt: new Date("2026-04-12T11:58:00.000Z"),
    startedAt: null,
    lastHeartbeatAt: null,
    completedAt: null,
    failedAt: null,
  };
  const recentEvents: StoredReportShell["recentEvents"] = [];
  const storedSources: PersistedSource[] = [];
  const storedFacts: PersistedFact[] = [];
  const storedArtifacts: PersistedArtifact[] = [];
  const storedUseCases: Array<{ workflowName: string }> = [];
  const storedStakeholders: Array<{ likelyRole: string }> = [];
  let nextSourceId = 1;

  const repository: ReportRepository = {
    async isShareIdAvailable() {
      return true;
    },
    async createQueuedReport() {
      throw new Error("Not needed in this test");
    },
    async findReportShellByShareId(shareId) {
      if (shareId !== report.shareId) {
        return null;
      }

      return {
        report,
        currentRun: run,
        recentEvents,
      };
    },
    async findLatestReportShellByCanonicalDomain() {
      return null;
    },
    async findLatestReadyReportShellByCanonicalDomain() {
      return null;
    },
    async findRunContextById() {
      return null;
    },
    async listSourcesByRunId() {
      return storedSources;
    },
    async listFactsByRunId() {
      return storedFacts;
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
      return;
    },
    async setRunVectorStore() {
      return;
    },
    async setRunOpenAIState(input) {
      if (input.openaiResponseId !== undefined) {
        run.openaiResponseId = input.openaiResponseId;
      }
      if (input.openaiResponseStatus !== undefined) {
        run.openaiResponseStatus = input.openaiResponseStatus;
      }
      if (input.openaiResponseMetadata !== undefined) {
        run.openaiResponseMetadata = input.openaiResponseMetadata;
      }
      if (input.openaiOutputText !== undefined) {
        run.openaiOutputText = input.openaiOutputText;
      }
      if (input.canonicalReport !== undefined) {
        run.canonicalReport = input.canonicalReport;
      }
      if (input.statusMessage !== undefined) {
        run.statusMessage = input.statusMessage;
      }
      run.updatedAt = new Date("2026-04-12T12:00:00.000Z");
      report.updatedAt = run.updatedAt;
    },
    async updateRunResearchSummary({ researchSummary, companyName }) {
      run.researchSummary = researchSummary;
      report.companyName = companyName ?? report.companyName;
    },
    async updateRunAccountPlan({ accountPlan }) {
      run.accountPlan = accountPlan;
    },
    async claimRunStepExecution() {
      throw new Error("Not needed in this test");
    },
    async touchRunHeartbeat() {
      return;
    },
    async updateRunStepState(input) {
      run.status = input.status;
      run.stepKey = input.stepKey;
      run.progressPercent = input.progressPercent;
      run.statusMessage = input.statusMessage;
      run.executionMode = input.executionMode ?? run.executionMode;
      run.pipelineState = input.pipelineState;
      run.queueMessageId = input.queueMessageId ?? run.queueMessageId;
      run.startedAt = input.startedAt ?? run.startedAt;
      run.completedAt = input.completedAt ?? run.completedAt;
      run.failedAt = input.failedAt ?? run.failedAt;
      run.errorCode = input.errorCode ?? run.errorCode;
      run.errorMessage = input.errorMessage ?? run.errorMessage;
      run.updatedAt = new Date("2026-04-12T12:00:00.000Z");
      report.status = input.reportStatus ?? report.status;
      report.completedAt = input.reportCompletedAt ?? report.completedAt;
      report.failedAt = input.reportFailedAt ?? report.failedAt;
      report.updatedAt = run.updatedAt;
    },
    async appendRunEvent(input) {
      recentEvents.push({
        id: recentEvents.length + 1,
        level: input.level,
        eventType: input.eventType,
        stepKey: input.stepKey ?? null,
        message: input.message,
        occurredAt: new Date("2026-04-12T12:00:00.000Z"),
      });
    },
    async upsertCrawledSource(input) {
      const source: PersistedSource = {
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
        mimeType: input.mimeType ?? null,
        discoveredAt: input.discoveredAt ?? new Date("2026-04-12T12:00:00.000Z"),
        publishedAt: input.publishedAt ?? null,
        updatedAtHint: input.updatedAtHint ?? null,
        retrievedAt: input.retrievedAt ?? null,
        contentHash: input.contentHash ?? null,
        textContent: input.textContent ?? null,
        markdownContent: input.markdownContent ?? null,
        storagePointers: input.storagePointers ?? {},
        createdAt: new Date("2026-04-12T12:00:00.000Z"),
        updatedAt: new Date("2026-04-12T12:00:00.000Z"),
      };

      storedSources.push(source);
      nextSourceId += 1;

      return {
        source,
        dedupeStrategy: "created",
      };
    },
    async updateSourceStoragePointers() {
      return;
    },
    async replaceFactsForRun(input) {
      storedFacts.splice(
        0,
        storedFacts.length,
        ...input.facts.map((fact, index) => ({
          id: index + 1,
          reportId: input.reportId,
          runId: input.runId,
          sourceId: fact.sourceIds[0] ?? null,
          section: fact.section,
          classification: fact.classification,
          statement: fact.claim,
          rationale: fact.rationale,
          confidence: fact.confidence,
          freshness: fact.freshness,
          sentiment: fact.sentiment,
          relevance: fact.relevance,
          evidenceSnippet: fact.evidenceSnippet,
          sourceIds: fact.sourceIds,
          createdAt: new Date("2026-04-12T12:00:00.000Z"),
          updatedAt: new Date("2026-04-12T12:00:00.000Z"),
        })),
      );
    },
    async replaceUseCasesForRun(input) {
      storedUseCases.splice(0, storedUseCases.length, ...input.useCases.map((useCase) => ({ workflowName: useCase.workflowName })));
    },
    async replaceStakeholdersForRun(input) {
      storedStakeholders.splice(
        0,
        storedStakeholders.length,
        ...input.stakeholders.map((stakeholder) => ({ likelyRole: stakeholder.likelyRole })),
      );
    },
    async upsertArtifact(input) {
      const artifact: PersistedArtifact = {
        id: storedArtifacts.length + 1,
        reportId: input.reportId,
        runId: input.runId,
        artifactType: input.artifactType,
        mimeType: input.mimeType,
        fileName: input.fileName ?? null,
        storagePointers: input.storagePointers ?? {},
        contentHash: input.contentHash ?? null,
        sizeBytes: input.sizeBytes ?? null,
        createdAt: new Date("2026-04-12T12:00:00.000Z"),
        updatedAt: new Date("2026-04-12T12:00:00.000Z"),
      };

      storedArtifacts.splice(
        0,
        storedArtifacts.length,
        ...storedArtifacts.filter((existing) => existing.artifactType !== input.artifactType),
        artifact,
      );
    },
  };

  return {
    repository,
    report,
    run,
    recentEvents,
    storedSources,
    storedFacts,
    storedArtifacts,
    storedUseCases,
    storedStakeholders,
  };
}

function createOpenAIClientStub(
  outputReport: CanonicalAccountAtlasReport,
  overrides: {
    createResponse?: RetrievedBackgroundResponse;
    retrieveResponse?: RetrievedBackgroundResponse;
    onCreateBackgroundStructuredOutput?: (input: CreateBackgroundStructuredOutputInput) => void;
  } = {},
) {
  const outputText = JSON.stringify(outputReport);
  const createResponse: RetrievedBackgroundResponse = overrides.createResponse ?? {
    responseId: "resp_123",
    status: "queued",
    outputText: "",
    rawResponse: {
      id: "resp_123",
      status: "queued",
      output: [],
      usage: {},
      error: null,
      incompleteDetails: null,
      model: "gpt-5.4",
      completedAt: null,
    },
    webSearchSources: [],
    fileSearchResults: [],
  };
  const retrieveResponse: RetrievedBackgroundResponse = overrides.retrieveResponse ?? {
    responseId: "resp_123",
    status: "completed",
    outputText,
    rawResponse: {
      id: "resp_123",
      status: "completed",
      output: [],
      usage: { output_tokens: 1234 },
      error: null,
      incompleteDetails: null,
      model: "gpt-5.4",
      completedAt: 1_776_000_000,
    },
    webSearchSources: [{ url: "https://example.com/" }],
    fileSearchResults: [],
  };

  const client: OpenAIResearchClient = {
    isConfigured() {
      return true;
    },
    async createVectorStore() {
      throw new Error("Not needed in this test");
    },
    async uploadFile() {
      throw new Error("Not needed in this test");
    },
    async attachFileToVectorStoreAndPoll() {
      throw new Error("Not needed in this test");
    },
    async parseStructuredOutput() {
      throw new Error("Not needed in this test");
    },
    async createBackgroundStructuredOutput(input) {
      overrides.onCreateBackgroundStructuredOutput?.(input);
      return createResponse;
    },
    async retrieveBackgroundResponse() {
      return retrieveResponse;
    },
  };

  return client;
}

describe("createDeepResearchReportGenerationService", () => {
  it("starts a background response, polls it to completion, and stores the canonical report output", async () => {
    const fixture = createCanonicalReportFixture();
    const stub = createRepositoryStub();
    const service = createDeepResearchReportGenerationService({
      repository: stub.repository,
      openAIClient: createOpenAIClientStub(fixture),
    });

    await service.startReportRun({
      report: stub.report,
      run: stub.run,
    });

    expect(stub.run.status).toBe("synthesizing");
    expect(stub.run.progressPercent).toBe(0);
    expect(stub.run.openaiResponseId).toBe("resp_123");
    expect(stub.run.openaiResponseStatus).toBe("queued");

    const shell = await service.syncReportRun({
      shareId: stub.report.shareId,
    });

    expect(shell?.report.status).toBe("ready");
    expect(shell?.currentRun?.status).toBe("completed");
    expect(stub.run.openaiResponseStatus).toBe("completed");
    expect(stub.run.openaiOutputText).toBe(JSON.stringify(fixture));
    expect(stub.run.canonicalReport?.report_metadata.schema_name).toBe("account_atlas_canonical_report");
    expect(stub.run.researchSummary?.companyIdentity.companyName).toBe("Example");
    expect(stub.run.accountPlan?.topUseCases).toHaveLength(3);
    expect(stub.storedSources).toHaveLength(1);
    expect(stub.storedFacts.length).toBeGreaterThan(0);
    expect(stub.storedUseCases).toHaveLength(3);
    expect(stub.storedStakeholders).toHaveLength(1);
    expect(stub.storedArtifacts.find((artifact) => artifact.artifactType === "structured_json")).toBeTruthy();
  });

  it("fails with a precise message when the background response hits the max output token limit", async () => {
    const fixture = createCanonicalReportFixture();
    let createInput: CreateBackgroundStructuredOutputInput | null = null;
    const stub = createRepositoryStub();
    const service = createDeepResearchReportGenerationService({
      repository: stub.repository,
      openAIClient: createOpenAIClientStub(fixture, {
        retrieveResponse: {
          responseId: "resp_123",
          status: "incomplete",
          outputText: "",
          rawResponse: {
            id: "resp_123",
            status: "incomplete",
            output: [],
            usage: { output_tokens: 25_000 },
            error: null,
            incompleteDetails: { reason: "max_output_tokens" },
            model: "gpt-5.4",
            completedAt: 1_776_000_000,
          },
          webSearchSources: [],
          fileSearchResults: [],
        },
        onCreateBackgroundStructuredOutput(input) {
          createInput = input;
        },
      }),
    });

    await service.startReportRun({
      report: stub.report,
      run: stub.run,
    });

    expect(createInput).not.toBeNull();
    const startedCreateInput: CreateBackgroundStructuredOutputInput = createInput ?? {};
    expect(startedCreateInput.maxOutputTokens).toBe(25_000);

    const shell = await service.syncReportRun({
      shareId: stub.report.shareId,
    });

    expect(shell?.report.status).toBe("failed");
    expect(shell?.currentRun?.status).toBe("failed");
    expect(stub.run.openaiResponseStatus).toBe("incomplete");
    expect(stub.run.errorCode).toBe("OPENAI_RESPONSE_INCOMPLETE");
    expect(stub.run.errorMessage).toBe(
      "The background response hit the max output token limit before the saved brief finished.",
    );
    expect(stub.run.openaiResponseMetadata).toMatchObject({
      incompleteDetails: {
        reason: "max_output_tokens",
      },
    });
    expect(stub.recentEvents.at(-1)?.eventType).toBe("deep_research.failed");
    expect(stub.recentEvents.at(-1)?.message).toBe(
      "The background response hit the max output token limit before the saved brief finished.",
    );
  });

  it("downgrades off-target seller-workflow opportunities into a grounded fallback brief", async () => {
    const fixture = createCanonicalReportFixture();

    fixture.top_opportunities = fixture.top_opportunities.map((opportunity, index) => ({
      ...opportunity,
      priority_rank: index + 1,
      workflow_name:
        index === 0 ? "Account planning copilot" : index === 1 ? "Seller workflow assistant" : "Research brief builder",
      summary: "Help internal sellers assemble account plans and discovery briefs faster.",
      pain_point: "Seller teams spend too much time stitching together internal account-planning context.",
      why_now: "Account planning and seller workflow preparation remain manual and repetitive.",
      likely_users: ["Account executives", "Sales managers"],
      expected_outcome: "Faster seller preparation and more consistent internal account plans.",
      success_metrics: ["Prep time", "Brief completion rate"],
      dependencies: ["Seller tooling owner"],
      security_compliance_notes: ["Limit the workflow to approved seller tooling."],
      recommended_motion: "workspace",
      motion_rationale: "This seller workflow is retrieval-heavy and best handled in a workspace first.",
      open_questions: ["Which seller workflow owner would operate the account-planning flow?"],
    }));

    const stub = createRepositoryStub();
    const service = createDeepResearchReportGenerationService({
      repository: stub.repository,
      openAIClient: createOpenAIClientStub(fixture),
    });

    await service.startReportRun({
      report: stub.report,
      run: stub.run,
    });

    const shell = await service.syncReportRun({
      shareId: stub.report.shareId,
    });
    const structuredJsonArtifact = stub.storedArtifacts.find((artifact) => artifact.artifactType === "structured_json");

    expect(shell?.report.status).toBe("ready_with_limited_coverage");
    expect(shell?.currentRun?.status).toBe("completed");
    expect(stub.run.errorCode).toBeNull();
    expect(stub.run.canonicalReport?.report_metadata.report_mode).toBe("grounded_fallback");
    expect(stub.run.accountPlan?.publishMode).toBe("grounded_fallback");
    expect(stub.run.accountPlan?.overallAccountMotion.recommendedMotion).toBe("undetermined");
    expect(stub.run.accountPlan?.candidateUseCases).toHaveLength(0);
    expect(stub.run.accountPlan?.groundedFallbackBrief?.summary).toContain("Example");
    expect(stub.run.accountPlan?.groundedFallbackBrief?.opportunityHypothesisNote).toContain(
      "Directional opportunities were withheld",
    );
    expect(stub.run.openaiOutputText).toBe(JSON.stringify(fixture));
    expect(stub.run.openaiResponseMetadata).toMatchObject({
      publishSafety: {
        outcome: "grounded_fallback",
        issues: [expect.objectContaining({ code: "OFF_TARGET_OPPORTUNITIES" })],
      },
    });
    expect(structuredJsonArtifact).toBeTruthy();
    expect(
      JSON.parse(String((structuredJsonArtifact?.storagePointers as { inlineText?: string }).inlineText)).report_metadata
        .report_mode,
    ).toBe("grounded_fallback");
    expect(stub.recentEvents.at(-1)?.eventType).toBe("deep_research.completed");
  });

  it("downgrades transient outage-dominated recommendations into a grounded fallback brief", async () => {
    const fixture = createCanonicalReportFixture();

    fixture.sources = [
      ...fixture.sources,
      {
        source_id: 2,
        title: "Example status page",
        url: "https://status.example.com/maintenance",
        source_type: "incident_page",
        source_tier: "primary",
        publisher: null,
        published_at: "2026-04-12T11:30:00.000Z",
        retrieved_at: "2026-04-12T11:59:00.000Z",
        summary: "Scheduled maintenance. Service temporarily unavailable while a platform outage is resolved.",
      },
    ];
    fixture.executive_summary = {
      ...fixture.executive_summary,
      summary: "A live maintenance event is the dominant visible signal on the public web right now.",
      why_now: "The company is in scheduled maintenance and its service is temporarily unavailable.",
      strategic_takeaway: "Center the brief around the maintenance response while the outage is active.",
      citations: [{ source_id: 2, support: "Scheduled maintenance notice." }],
    };
    fixture.recommended_motion = {
      ...fixture.recommended_motion,
      rationale: "The outage signal suggests an immediate internal response workflow should be prioritized first.",
      deployment_shape: "Handle the maintenance response in a workspace while the incident is active.",
      citations: [{ source_id: 2, support: "Scheduled maintenance notice." }],
    };
    fixture.top_opportunities = fixture.top_opportunities.map((opportunity, index) => ({
      ...opportunity,
      priority_rank: index + 1,
      workflow_name: index === 0 ? "Outage response assistant" : `${opportunity.workflow_name} during outage`,
      summary: "Coordinate the current maintenance response and summarize incident updates internally.",
      pain_point: "The maintenance event is disrupting service and creating reactive internal work.",
      why_now: "Public signals are dominated by a live scheduled maintenance window.",
      expected_outcome: "Faster maintenance communications while the service issue is active.",
      motion_rationale: "The incident page is the dominant source signal right now.",
      citations: [{ source_id: 2, support: "Scheduled maintenance notice." }],
    }));

    const stub = createRepositoryStub();
    const service = createDeepResearchReportGenerationService({
      repository: stub.repository,
      openAIClient: createOpenAIClientStub(fixture),
    });

    await service.startReportRun({
      report: stub.report,
      run: stub.run,
    });

    const shell = await service.syncReportRun({
      shareId: stub.report.shareId,
    });
    const structuredJsonArtifact = stub.storedArtifacts.find((artifact) => artifact.artifactType === "structured_json");
    const publishedStructuredJson = JSON.parse(
      String((structuredJsonArtifact?.storagePointers as { inlineText?: string }).inlineText),
    ) as CanonicalAccountAtlasReport;

    expect(shell?.report.status).toBe("ready_with_limited_coverage");
    expect(shell?.currentRun?.status).toBe("completed");
    expect(stub.run.canonicalReport?.report_metadata.report_mode).toBe("grounded_fallback");
    expect(stub.run.accountPlan?.publishMode).toBe("grounded_fallback");
    expect(stub.run.accountPlan?.candidateUseCases).toHaveLength(0);
    expect(stub.run.accountPlan?.groundedFallbackBrief?.summary).toContain("Example sells enterprise workflow software");
    expect(stub.run.accountPlan?.groundedFallbackBrief?.summary).not.toContain("maintenance");
    expect(stub.run.openaiResponseMetadata).toMatchObject({
      publishSafety: {
        outcome: "grounded_fallback",
        issues: [expect.objectContaining({ code: "TRANSIENT_SIGNALS_DOMINATE" })],
      },
    });
    expect(publishedStructuredJson.report_metadata.report_mode).toBe("grounded_fallback");
    expect(publishedStructuredJson.top_opportunities).toHaveLength(0);
    expect(publishedStructuredJson.grounded_fallback?.summary).toContain("Example sells enterprise workflow software");
    expect(stub.storedFacts.length).toBeGreaterThan(0);
  });
});
