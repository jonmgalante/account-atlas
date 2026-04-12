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

function createOpenAIStub(
  telemetry: {
    parseCalls: Array<{
      schemaName: string;
      tools?: Array<Record<string, unknown>>;
      include?: Array<"web_search_call.action.sources" | "file_search_call.results">;
      timeoutMs?: number;
      maxAttempts?: number;
    }>;
    createVectorStoreCalls: number;
    uploadFileCalls: number;
    attachFileCalls: number;
  } = {
    parseCalls: [],
    createVectorStoreCalls: 0,
    uploadFileCalls: 0,
    attachFileCalls: 0,
  },
): OpenAIResearchClient {
  return {
    isConfigured() {
      return true;
    },
    async createVectorStore() {
      telemetry.createVectorStoreCalls += 1;
      return {
        id: "vs_test_123",
        status: "completed",
      };
    },
    async uploadFile() {
      telemetry.uploadFileCalls += 1;
      return {
        id: `file_${Math.random().toString(36).slice(2, 8)}`,
      };
    },
    async attachFileToVectorStoreAndPoll() {
      telemetry.attachFileCalls += 1;
      return {
        id: "vsf_test_123",
        status: "completed",
        lastError: null,
      };
    },
    async parseStructuredOutput({ schemaName, tools, include, timeoutMs, maxAttempts }) {
      telemetry.parseCalls.push({
        schemaName,
        tools,
        include,
        timeoutMs,
        maxAttempts,
      });

      if (schemaName === "entity_resolution") {
        return {
          responseId: "resp_entity",
          parsed: {
            companyName: "OpenAI",
            canonicalDomain: "openai.com",
            relationshipToCanonicalDomain: null,
            archetype: "AI platform provider",
            businessModel: "API and enterprise software",
            customerType: "Developers and enterprise teams",
            offerings: "AI models, API access, and enterprise AI software",
            sector: "Software",
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
              relationshipToCanonicalDomain: null,
              archetype: "AI platform provider",
              businessModel: "API and enterprise software",
              customerType: "Developers and enterprise teams",
              offerings: "AI models, API access, and enterprise AI software",
              sector: "Software",
              industry: "Artificial intelligence",
              publicCompany: false,
              headquarters: "San Francisco, California",
              confidence: 92,
              sourceUrls: ["https://news.example.com/openai-expands-enterprise"],
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
          canonicalDomain: "openai.com",
          relationshipToCanonicalDomain: null,
          archetype: "AI platform provider",
          businessModel: "API and enterprise software",
          customerType: "Developers and enterprise teams",
          offerings: "AI models, API access, and enterprise AI software",
          sector: "Software",
          industry: "Artificial intelligence",
          publicCompany: false,
          headquarters: "San Francisco, California",
          confidence: 92,
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
  it("resolves gm.com to a clean company name instead of leaving a raw acronym when better evidence exists", async () => {
    const stub = createRepositoryStub();
    stub.context.report.normalizedInputUrl = "https://gm.com/";
    stub.context.report.canonicalDomain = "gm.com";
    stub.sources[0] = {
      ...stub.sources[0],
      url: "https://gm.com/",
      normalizedUrl: "https://gm.com/",
      canonicalUrl: "https://gm.com/",
      canonicalDomain: "gm.com",
      title: "General Motors: Pushing the Limits of Transportation & Technology",
      textContent: "General Motors designs, builds, and sells vehicles and software-enabled mobility products.",
      markdownContent:
        "# General Motors\n\nGeneral Motors designs, builds, and sells vehicles and software-enabled mobility products.",
    };

    const service = createResearchPipelineService({
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
          if (schemaName !== "entity_resolution") {
            throw new Error(`Unexpected schema ${schemaName}`);
          }

          return {
            responseId: "resp_gm_entity",
            parsed: {
              companyName: "GM",
              canonicalDomain: "gm.com",
              relationshipToCanonicalDomain: null,
              archetype: "Automotive manufacturer",
              businessModel: "Manufactures and sells vehicles, fleet solutions, and related services",
              customerType: "Consumers, dealers, and commercial fleets",
              offerings: "Vehicles, financing, software, and mobility services",
              sector: "Automotive",
              industry: "Automotive",
              publicCompany: true,
              headquarters: "Detroit, Michigan",
              confidence: 91,
              sourceIds: [1],
            },
            outputText: "GM resolved from official sources.",
            rawResponse: { id: "resp_gm_entity", output: [], usage: {} },
            webSearchSources: [],
            fileSearchResults: [],
          } as never;
        },
      },
    });

    const message = await service.resolveCompanyEntity(stub.context);

    expect(message).toContain("General Motors");
    expect(stub.context.report.companyName).toBe("General Motors");
    expect(stub.context.run.researchSummary?.companyIdentity.companyName).toBe("General Motors");
    expect(stub.context.run.researchSummary?.companyIdentity.businessModel).toContain("vehicles");
    expect(stub.context.run.researchSummary?.companyIdentity.confidence).toBe(91);
    expect(stub.events.some((event) => event.eventType === "research.entity_resolution.gate_passed")).toBe(true);
  });

  it("broadens retrieval and retries entity resolution for bk.com before allowing the report to proceed", async () => {
    const stub = createRepositoryStub();
    stub.context.report.normalizedInputUrl = "https://bk.com/";
    stub.context.report.canonicalDomain = "bk.com";
    stub.sources[0] = {
      ...stub.sources[0],
      url: "https://bk.com/",
      normalizedUrl: "https://bk.com/",
      canonicalUrl: "https://bk.com/",
      canonicalDomain: "bk.com",
      title: "BK",
      textContent: "Welcome to BK.",
      markdownContent: "# BK\n\nWelcome to BK.",
    };

    let entityResolutionAttempts = 0;

    const service = createResearchPipelineService({
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
          if (schemaName === "entity_resolution") {
            entityResolutionAttempts += 1;

            if (entityResolutionAttempts === 1) {
              return {
                responseId: "resp_bk_entity_1",
                parsed: {
                  companyName: "BK",
                  canonicalDomain: "bk.com",
                  relationshipToCanonicalDomain: null,
                  archetype: "Restaurant brand",
                  businessModel: null,
                  customerType: null,
                  offerings: null,
                  sector: null,
                  industry: null,
                  publicCompany: null,
                  headquarters: null,
                  confidence: 52,
                  sourceIds: [1],
                },
                outputText: "Initial BK resolution is ambiguous.",
                rawResponse: { id: "resp_bk_entity_1", output: [], usage: {} },
                webSearchSources: [],
                fileSearchResults: [],
              } as never;
            }

            return {
              responseId: "resp_bk_entity_2",
              parsed: {
                companyName: "Burger King",
                canonicalDomain: "bk.com",
                relationshipToCanonicalDomain: "Brand of Restaurant Brands International Inc.",
                archetype: "Global quick-service restaurant brand",
                businessModel: "Franchised quick-service restaurant brand",
                customerType: "Consumers and franchise operators",
                offerings: "Burgers, chicken, fries, beverages, and restaurant franchising",
                sector: "Consumer",
                industry: "Quick-service restaurants",
                publicCompany: false,
                headquarters: "Miami, Florida",
                confidence: 93,
                sourceIds: [1, 2, 3],
              },
              outputText: "Burger King resolved with parent context.",
              rawResponse: { id: "resp_bk_entity_2", output: [], usage: {} },
              webSearchSources: [],
              fileSearchResults: [],
            } as never;
          }

          if (schemaName === "entity_resolution_search") {
            return {
              responseId: "resp_bk_search",
              parsed: {
                entityResolution: {
                  companyName: "Burger King",
                  canonicalDomain: "bk.com",
                  relationshipToCanonicalDomain: "Brand of Restaurant Brands International Inc.",
                  archetype: "Global quick-service restaurant brand",
                  businessModel: "Franchised quick-service restaurant brand",
                  customerType: "Consumers and franchise operators",
                  offerings: "Burgers, chicken, fries, beverages, and restaurant franchising",
                  sector: "Consumer",
                  industry: "Quick-service restaurants",
                  publicCompany: false,
                  headquarters: "Miami, Florida",
                  confidence: 89,
                  sourceUrls: [
                    "https://www.bk.com/about-us",
                    "https://www.rbi.com/English/brands/default.aspx",
                  ],
                },
                discoveredSources: [
                  {
                    url: "https://www.bk.com/about-us",
                    title: "About Burger King",
                    sourceType: "about_page",
                    sourceTier: "primary",
                    publishedAt: null,
                    summary: "Burger King is a global quick-service restaurant brand known for flame-grilled burgers.",
                    whyItMatters: "Confirms the clean display name, industry, and consumer-facing restaurant business.",
                  },
                  {
                    url: "https://www.rbi.com/English/brands/default.aspx",
                    title: "Our Brands | Restaurant Brands International",
                    sourceType: "investor_relations_page",
                    sourceTier: "primary",
                    publishedAt: null,
                    summary: "Restaurant Brands International lists Burger King among its core restaurant brands.",
                    whyItMatters: "Provides official parent-brand context for the bk.com entity.",
                  },
                ],
                retryRationale:
                  "Official about and parent pages clarify that bk.com represents Burger King, a Restaurant Brands International brand.",
              },
              outputText: "Broadened identity retrieval completed.",
              rawResponse: { id: "resp_bk_search", output: [], usage: {} },
              webSearchSources: [
                { url: "https://www.bk.com/about-us" },
                { url: "https://www.rbi.com/English/brands/default.aspx" },
              ],
              fileSearchResults: [],
            } as never;
          }

          throw new Error(`Unexpected schema ${schemaName}`);
        },
      },
    });

    const message = await service.resolveCompanyEntity(stub.context);

    expect(message).toContain("Burger King");
    expect(message).toContain("broadening identity-source retrieval");
    expect(entityResolutionAttempts).toBe(2);
    expect(stub.context.report.companyName).toBe("Burger King");
    expect(stub.context.run.researchSummary?.companyIdentity.companyName).toBe("Burger King");
    expect(stub.context.run.researchSummary?.companyIdentity.relationshipToCanonicalDomain).toContain(
      "Restaurant Brands International",
    );
    expect(stub.context.run.researchSummary?.companyIdentity.industry).toBe("Quick-service restaurants");
    expect(stub.context.run.researchSummary?.companyIdentity.confidence).toBe(93);
    expect(stub.sources.some((source) => source.title === "About Burger King")).toBe(true);
    expect(
      stub.events.some((event) => event.eventType === "research.entity_resolution.low_confidence"),
    ).toBe(true);
    expect(stub.events.some((event) => event.eventType === "research.entity_resolution.gate_passed")).toBe(true);
  });

  it("persists external sources, facts, and a research summary with known source IDs", async () => {
    const stub = createRepositoryStub();
    const telemetry = {
      parseCalls: [] as Array<{
        schemaName: string;
        tools?: Array<Record<string, unknown>>;
        include?: Array<"web_search_call.action.sources" | "file_search_call.results">;
        timeoutMs?: number;
        maxAttempts?: number;
      }>,
      createVectorStoreCalls: 0,
      uploadFileCalls: 0,
      attachFileCalls: 0,
    };
    const service = createResearchPipelineService({
      repository: stub.repository,
      openAIClient: createOpenAIStub(telemetry),
    });

    const enrichMessage = await service.enrichExternalSources(stub.context);
    const factMessage = await service.buildFactBase(stub.context);
    const summaryMessage = await service.generateResearchSummary(stub.context);
    const factPacket = JSON.parse(String(stub.artifacts[0]?.inlineJson ?? "{}"));

    expect(enrichMessage).toContain("stored 1 external sources");
    expect(factMessage).toContain("Persisted 1 source-backed facts");
    expect(summaryMessage).toContain("completeness 76/100");
    expect(stub.context.run.vectorStoreId).toBe("vs_test_123");
    expect(stub.sources).toHaveLength(2);
    expect(stub.facts).toHaveLength(1);
    expect(stub.context.run.researchSummary?.companyIdentity.companyName).toBe("OpenAI");
    expect(factPacket.packetType).toBe("fact_packet");
    expect(factPacket.evidence).toHaveLength(1);
    expect(factPacket.companyProfile.companyDescription.value).toContain("OpenAI");
    expect(factPacket.companyProfile.industry.value).toContain("AI");
    expect(factPacket.companyProfile.productsServices.value).toContain("AI");
    expect(factPacket.companyProfile.operatingModel.value).toContain("platform");
    expect(factPacket.companyProfile.targetCustomers.value).toContain("enterprise");
    expect(factPacket.companyProfile.keyPublicSignals.length).toBeGreaterThan(0);
    expect(stub.events.some((event) => event.eventType === "research.summary.completed")).toBe(true);
    expect(stub.artifacts).toHaveLength(1);
    expect(telemetry.createVectorStoreCalls).toBe(1);
    expect(telemetry.uploadFileCalls).toBe(0);
    expect(telemetry.attachFileCalls).toBe(0);
    expect(telemetry.parseCalls).toEqual([
      {
        schemaName: "entity_resolution",
        tools: undefined,
        include: undefined,
        timeoutMs: 30_000,
        maxAttempts: 1,
      },
      {
        schemaName: "external_source_enrichment",
        tools: [
          {
            type: "web_search",
            search_context_size: "high",
            user_location: {
              type: "approximate",
              country: "US",
              timezone: "America/New_York",
            },
          },
        ],
        include: ["web_search_call.action.sources"],
        timeoutMs: 120_000,
        maxAttempts: 1,
      },
      {
        schemaName: "fact_normalization",
        tools: undefined,
        include: undefined,
        timeoutMs: 75_000,
        maxAttempts: 1,
      },
      {
        schemaName: "research_summary",
        tools: undefined,
        include: undefined,
        timeoutMs: 75_000,
        maxAttempts: 1,
      },
    ]);
  });

  it("builds research-summary prompts from the structured fact packet instead of loose source blobs", async () => {
    const stub = createRepositoryStub();
    const capturedInputs = new Map<string, Record<string, unknown>>();
    const service = createResearchPipelineService({
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

          if (schemaName === "fact_normalization") {
            return {
              responseId: "resp_facts",
              parsed: {
                facts: [
                  {
                    claim: "OpenAI publicly positions itself as an AI platform for developers and enterprises.",
                    rationale: "This is directly stated in company materials.",
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

          if (schemaName === "research_summary") {
            return {
              responseId: "resp_summary",
              parsed: {
                companyIdentity: {
                  companyName: "OpenAI",
                  canonicalDomain: "openai.com",
                  relationshipToCanonicalDomain: null,
                  archetype: "AI platform provider",
                  businessModel: "API and enterprise software",
                  customerType: "Developers and enterprise teams",
                  offerings: "AI models, API access, and enterprise AI software",
                  sector: "Software",
                  industry: "Artificial intelligence",
                  publicCompany: false,
                  headquarters: "San Francisco, California",
                  confidence: 92,
                  sourceIds: [1],
                },
                growthPriorities: [],
                aiMaturityEstimate: {
                  level: "advanced",
                  rationale: "Platform and product evidence are present in the fact packet.",
                  sourceIds: [1],
                },
                regulatorySensitivity: {
                  level: "low",
                  rationale: "Trust signals remain limited in this narrow fixture.",
                  sourceIds: [1],
                },
                notableProductSignals: [],
                notableHiringSignals: [],
                notableTrustSignals: [],
                complaintThemes: [],
                leadershipSocialThemes: [],
                researchCompletenessScore: 70,
                confidenceBySection: [
                  {
                    section: "company-brief",
                    confidence: 82,
                    rationale: "The fact packet grounds the company profile.",
                  },
                ],
                evidenceGaps: ["Limited additional trust evidence."],
                overallConfidence: "medium",
                sourceIds: [1],
              },
              outputText: "Summary completed.",
              rawResponse: { id: "resp_summary", output: [], usage: {} },
              webSearchSources: [],
              fileSearchResults: [],
            } as never;
          }

          throw new Error(`Unexpected schema ${schemaName}`);
        },
      },
    });

    await service.buildFactBase(stub.context);
    await service.generateResearchSummary(stub.context);

    const summaryInput = capturedInputs.get("research_summary");

    expect(summaryInput?.factPacket).toBeDefined();
    expect(summaryInput).not.toHaveProperty("sourceRegistry");
    expect(summaryInput).not.toHaveProperty("facts");
    expect(
      (
        summaryInput?.factPacket as {
          companyProfile: { companyDescription: { value: string }; keyPublicSignals: Array<{ summary: string }> };
        }
      ).companyProfile.companyDescription.value,
    ).toContain("OpenAI");
    expect(
      (
        summaryInput?.factPacket as {
          companyProfile: { productsServices: { value: string | null } };
        }
      ).companyProfile.productsServices.value,
    ).toBeTruthy();
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

  it("falls back to domain-based public-web enrichment when first-party crawl sources are missing", async () => {
    const stub = createRepositoryStub();
    stub.sources.splice(0, stub.sources.length);
    const telemetry = {
      parseCalls: [] as Array<{
        schemaName: string;
        tools?: Array<Record<string, unknown>>;
        include?: Array<"web_search_call.action.sources" | "file_search_call.results">;
        timeoutMs?: number;
        maxAttempts?: number;
      }>,
      createVectorStoreCalls: 0,
      uploadFileCalls: 0,
      attachFileCalls: 0,
    };
    const service = createResearchPipelineService({
      repository: stub.repository,
      openAIClient: createOpenAIStub(telemetry),
    });

    const enrichMessage = await service.enrichExternalSources(stub.context);

    expect(enrichMessage).toContain("after first-party site coverage stayed limited in search-first mode");
    expect(enrichMessage).toContain("light brief mode");
    expect(stub.sources).toHaveLength(1);
    expect(stub.events.some((event) => event.eventType === "research.entity_resolution.fallback")).toBe(true);
    expect(stub.events.some((event) => event.eventType === "research.fallback_plan_selected")).toBe(true);
    expect(stub.events.some((event) => event.eventType === "research.light_brief_mode_selected")).toBe(true);
    expect(telemetry.parseCalls).toEqual([
      {
        schemaName: "external_source_enrichment",
        tools: [
          {
            type: "web_search",
            search_context_size: "high",
            user_location: {
              type: "approximate",
              country: "US",
              timezone: "America/New_York",
            },
          },
        ],
        include: ["web_search_call.action.sources"],
        timeoutMs: 120_000,
        maxAttempts: 1,
      },
    ]);
  });
});
