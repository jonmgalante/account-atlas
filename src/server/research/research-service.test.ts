import { describe, expect, it } from "vitest";

import type { PersistedSource, ReportRepository, StoredRunContext } from "@/server/repositories/report-repository";
import { createResearchPipelineService } from "@/server/research/research-service";
import type { OpenAIResearchClient } from "@/server/openai/client";
import type { ResearchSummary } from "@/lib/types/research";
import { createInitialPipelineState } from "@/server/pipeline/pipeline-steps";

function createRepositoryStub() {
  const events: Array<{ eventType: string; message: string }> = [];
  const artifacts: Array<Record<string, unknown>> = [];
  const facts: Array<{
    claim: string;
    sourceIds: number[];
  }> = [];
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
      throw new Error("Not needed");
    },
    async listSourcesByRunId() {
      return sources;
    },
    async listFactsByRunId() {
      return facts.map((fact, index) => ({
        id: index + 1,
        reportId: 1,
        runId: 11,
        sourceId: fact.sourceIds[0] ?? null,
        section: "fact-base",
        classification: "fact",
        statement: fact.claim,
        rationale: null,
        confidence: 80,
        freshness: "current",
        sentiment: "neutral",
        relevance: 85,
        evidenceSnippet: null,
        sourceIds: fact.sourceIds,
        createdAt: new Date("2026-04-07T12:00:00.000Z"),
        updatedAt: new Date("2026-04-07T12:00:00.000Z"),
      }));
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
    async setRunVectorStore({ vectorStoreId }) {
      context.run.vectorStoreId = vectorStoreId;
    },
    async updateRunResearchSummary({ researchSummary, companyName }) {
      context.run.researchSummary = researchSummary;
      context.report.companyName = companyName ?? context.report.companyName;
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
    async upsertCrawledSource(input) {
      const existing = sources.find((source) => source.canonicalUrl === input.canonicalUrl);

      if (existing) {
        existing.storagePointers = {
          ...existing.storagePointers,
          ...(input.storagePointers ?? {}),
        };

        return {
          source: existing,
          dedupeStrategy: "canonical_url" as const,
        };
      }

      const source: PersistedSource = {
        id: sources.length + 1,
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

      sources.push(source);

      return {
        source,
        dedupeStrategy: "created" as const,
      };
    },
    async updateSourceStoragePointers({ sourceId, storagePointers }) {
      const source = sources.find((entry) => entry.id === sourceId);

      if (!source) {
        return;
      }

      source.storagePointers = {
        ...source.storagePointers,
        ...storagePointers,
      };
    },
    async replaceFactsForRun(input) {
      facts.splice(0, facts.length, ...input.facts.map((fact) => ({ claim: fact.claim, sourceIds: fact.sourceIds })));
    },
    async replaceUseCasesForRun() {
      throw new Error("Not needed");
    },
    async replaceStakeholdersForRun() {
      throw new Error("Not needed");
    },
    async upsertArtifact(input) {
      artifacts.push(input.storagePointers ?? {});
    },
  };

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
      progressPercent: 0,
      stepKey: "enrich_external_sources",
      statusMessage: "Running research.",
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

  return {
    repository,
    context,
    events,
    facts,
    sources,
    artifacts,
  };
}

function createOpenAIStub(): OpenAIResearchClient {
  return {
    isConfigured() {
      return true;
    },
    async createVectorStore() {
      return {
        id: "vs_test_123",
        status: "completed",
      };
    },
    async uploadFile() {
      return {
        id: `file_${Math.random().toString(36).slice(2, 8)}`,
      };
    },
    async attachFileToVectorStoreAndPoll() {
      return {
        id: "vsf_test_123",
        status: "completed",
        lastError: null,
      };
    },
    async parseStructuredOutput({ schemaName }) {
      if (schemaName === "entity_resolution") {
        return {
          responseId: "resp_entity",
          parsed: {
            companyName: "OpenAI",
            canonicalDomain: "openai.com",
            archetype: "AI platform provider",
            businessModel: "API and enterprise software",
            industry: "Artificial intelligence",
            publicCompany: false,
            headquarters: "San Francisco, California",
            confidence: 92,
            sourceIds: [1],
          },
          outputText: "Entity resolved.",
          rawResponse: { id: "resp_entity", output: [], usage: {} },
          webSearchSources: [],
          fileSearchResults: [],
        } as never;
      }

      if (schemaName === "external_source_enrichment") {
        return {
          responseId: "resp_enrichment",
          parsed: {
            entityResolution: {
              companyName: "OpenAI",
              canonicalDomain: "openai.com",
              archetype: "AI platform provider",
              businessModel: "API and enterprise software",
              industry: "Artificial intelligence",
              publicCompany: false,
              headquarters: "San Francisco, California",
              confidence: 92,
              sourceIds: [1],
            },
            discoveredSources: [
              {
                url: "https://news.example.com/openai-expands-enterprise",
                title: "OpenAI expands enterprise program",
                sourceType: "news_article",
                sourceTier: "secondary",
                publishedAt: "2026-04-01T00:00:00.000Z",
                summary: "OpenAI is expanding enterprise distribution and partnerships.",
                whyItMatters: "Signals growth focus and commercial momentum.",
              },
            ],
            growthPriorities: [
              {
                summary: "Expand enterprise adoption.",
                sourceUrls: ["https://news.example.com/openai-expands-enterprise"],
              },
            ],
            aiMaturitySignals: [],
            regulatorySignals: [],
            notableProductSignals: [],
            notableHiringSignals: [],
            notableTrustSignals: [],
            complaintThemes: [],
            leadershipSocialThemes: [],
            researchCompletenessScore: 72,
            evidenceGaps: ["Limited public pricing detail."],
          },
          outputText: "Enrichment completed.",
          rawResponse: { id: "resp_enrichment", output: [], usage: {} },
          webSearchSources: [{ url: "https://news.example.com/openai-expands-enterprise" }],
          fileSearchResults: [],
        } as never;
      }

      if (schemaName === "fact_normalization") {
        return {
          responseId: "resp_facts",
          parsed: {
            facts: [
              {
                claim: "OpenAI positions itself as an AI platform for developers and enterprises.",
                rationale: "This is directly stated across the company homepage and platform materials.",
                section: "fact-base",
                classification: "fact",
                confidence: 91,
                freshness: "current",
                sentiment: "neutral",
                relevance: 95,
                evidenceSnippet: "OpenAI builds AI models and developer platforms.",
                sourceIds: [1],
              },
            ],
          },
          outputText: "Facts completed.",
          rawResponse: { id: "resp_facts", output: [], usage: {} },
          webSearchSources: [],
          fileSearchResults: [],
        } as never;
      }

      const parsed: ResearchSummary = {
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
            summary: "Enterprise expansion remains a visible commercial priority.",
            sourceIds: [1, 2],
          },
        ],
        aiMaturityEstimate: {
          level: "advanced",
          rationale: "The company demonstrates both platform and enterprise product depth.",
          sourceIds: [1],
        },
        regulatorySensitivity: {
          level: "medium",
          rationale: "AI platform providers face emerging policy scrutiny and enterprise trust requirements.",
          sourceIds: [1, 2],
        },
        notableProductSignals: [
          {
            summary: "Platform positioning remains central to the public product narrative.",
            sourceIds: [1],
          },
        ],
        notableHiringSignals: [],
        notableTrustSignals: [],
        complaintThemes: [],
        leadershipSocialThemes: [],
        researchCompletenessScore: 76,
        confidenceBySection: [
          {
            section: "company-brief",
            confidence: 86,
            rationale: "Identity and positioning are well supported by current sources.",
          },
        ],
        evidenceGaps: ["Limited public details on implementation dependencies."],
        overallConfidence: "medium",
        sourceIds: [1, 2],
      };

      return {
        responseId: "resp_summary",
        parsed,
        outputText: "Summary completed.",
        rawResponse: { id: "resp_summary", output: [], usage: {} },
        webSearchSources: [],
        fileSearchResults: [],
      } as never;
    },
  };
}

describe("createResearchPipelineService", () => {
  it("persists external sources, facts, and a research summary with known source IDs", async () => {
    const stub = createRepositoryStub();
    const service = createResearchPipelineService({
      repository: stub.repository,
      openAIClient: createOpenAIStub(),
    });

    const enrichMessage = await service.enrichExternalSources(stub.context);
    const factMessage = await service.buildFactBase(stub.context);
    const summaryMessage = await service.generateResearchSummary(stub.context);

    expect(enrichMessage).toContain("stored 1 external sources");
    expect(factMessage).toContain("Persisted 1 source-backed facts");
    expect(summaryMessage).toContain("completeness 76/100");
    expect(stub.context.run.vectorStoreId).toBe("vs_test_123");
    expect(stub.sources).toHaveLength(2);
    expect(stub.facts).toHaveLength(1);
    expect(stub.context.run.researchSummary?.companyIdentity.companyName).toBe("OpenAI");
    expect(stub.events.some((event) => event.eventType === "research.summary.completed")).toBe(true);
    expect(stub.artifacts).toHaveLength(1);
  });

  it("skips research work cleanly when OpenAI is not configured", async () => {
    const stub = createRepositoryStub();
    const service = createResearchPipelineService({
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

    await expect(service.enrichExternalSources(stub.context)).resolves.toContain("OPENAI_API_KEY");
    await expect(service.buildFactBase(stub.context)).resolves.toContain("OPENAI_API_KEY");
    await expect(service.generateResearchSummary(stub.context)).resolves.toContain("OPENAI_API_KEY");
  });
});
