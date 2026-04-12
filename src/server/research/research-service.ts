import "server-only";

import { createHash } from "node:crypto";

import { REPORT_SECTION_DEFINITIONS } from "@/lib/report-sections";
import type { FactPacket, PersistedFactRecord, ResearchSummary } from "@/lib/types/research";
import { normalizeCanonicalDomain, normalizePublicHttpUrl } from "@/lib/url";
import { OPENAI_EXTRACTION_MODEL, OPENAI_SYNTHESIS_MODEL } from "@/server/openai/models";
import {
  createOpenAIResearchClient,
  type OpenAIResearchClient,
  type ParsedStructuredResponse,
} from "@/server/openai/client";
import {
  entityResolutionSchema,
  entityResolutionSearchSchema,
  externalSourceEnrichmentSchema,
  factNormalizationSchema,
  researchSummarySchema,
} from "@/server/research/schemas";
import {
  buildFactPacket,
  buildSynthesisFactPacketPrompt,
  deriveCompanyNameFromDomain,
  FACT_PACKET_ARTIFACT_FILE_NAME,
  parseFactPacketArtifact,
  preferSourceBackedCompanyName,
  selectResearchBriefMode,
} from "@/server/research/fact-packet";
import { PipelineStepError } from "@/server/pipeline/pipeline-errors";
import {
  buildSourceRegistry,
  buildSourceUrlIndex,
  resolveSourceIdsFromUrls,
} from "@/server/research/source-registry";
import { createRunVectorStoreManager } from "@/server/research/vector-store";
import type {
  PersistedSource,
  ReportRepository,
  StoredRunContext,
  UpsertArtifactInput,
} from "@/server/repositories/report-repository";
import { drizzleReportRepository } from "@/server/repositories/report-repository";
import { maybeStoreBlobArtifact } from "@/server/storage/blob-store";

type ResearchServiceDependencies = {
  repository?: ReportRepository;
  openAIClient?: OpenAIResearchClient;
};

const ENTITY_RESOLUTION_TIMEOUT_MS = 30_000;
const ENTITY_RESOLUTION_RETRY_TIMEOUT_MS = 75_000;
const EXTERNAL_ENRICHMENT_TIMEOUT_MS = 120_000;
const FACT_NORMALIZATION_TIMEOUT_MS = 75_000;
const RESEARCH_SUMMARY_TIMEOUT_MS = 75_000;
const RESEARCH_OPENAI_MAX_ATTEMPTS = 1;
const ENTITY_RESOLUTION_MIN_CONFIDENCE = 80;

const WEB_SEARCH_TOOL = {
  type: "web_search",
  search_context_size: "high",
  user_location: {
    type: "approximate",
    country: "US",
    timezone: "America/New_York",
  },
} as const;

function parseNullableDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp) : null;
}

function compactJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function normalizeOptionalString(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function summarizeSourcesForPrompt(sources: PersistedSource[]) {
  return buildSourceRegistry(sources).map((source) => ({
    ...source,
    summary: source.summary ?? "No normalized summary was stored for this source.",
  }));
}

function dedupeFacts(facts: PersistedFactRecord[], validSourceIds: Set<number>) {
  const seen = new Set<string>();
  const normalizedFacts: PersistedFactRecord[] = [];

  for (const fact of facts) {
    const sourceIds = [...new Set(fact.sourceIds.filter((sourceId) => validSourceIds.has(sourceId)))];

    if (!sourceIds.length) {
      continue;
    }

    const key = `${fact.section}:${fact.claim.trim().toLowerCase()}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalizedFacts.push({
      ...fact,
      sourceIds,
      claim: fact.claim.trim(),
      rationale: fact.rationale?.trim() ?? null,
      evidenceSnippet: fact.evidenceSnippet?.trim() ?? null,
    });
  }

  return normalizedFacts;
}

function buildFactPacketArtifactBundle(input: {
  reportId: number;
  runId: number;
  factPacket: FactPacket;
}): UpsertArtifactInput {
  const body = compactJson(input.factPacket);
  const contentHash = createHash("sha256").update(body).digest("hex");

  return {
    reportId: input.reportId,
    runId: input.runId,
    artifactType: "structured_json",
    mimeType: "application/json",
    fileName: FACT_PACKET_ARTIFACT_FILE_NAME,
    contentHash,
    sizeBytes: Buffer.byteLength(body),
    storagePointers: {
      inlineJson: body,
    },
  };
}

async function appendStructuredDebugEvent(
  repository: ReportRepository,
  context: StoredRunContext,
  eventType: string,
  response: ParsedStructuredResponse<unknown>,
) {
  const stepKey =
    eventType === "research.fact_base.completed"
      ? "build_fact_base"
      : eventType.startsWith("research.entity_resolution")
        ? "resolve_company_entity"
      : eventType.startsWith("research.summary")
        ? "generate_account_plan"
        : "enrich_external_sources";

  await repository.appendRunEvent({
    reportId: context.report.id,
    runId: context.run.id,
    level: "info",
    eventType,
    stepKey,
    message: `${eventType} completed with OpenAI response ${response.responseId}.`,
    metadata: {
      responseId: response.responseId,
      parsed: response.parsed,
      outputText: response.outputText,
      webSearchSources: response.webSearchSources,
      fileSearchResults: response.fileSearchResults,
    },
  });
}

async function maybeWriteResearchArtifact(
  context: StoredRunContext,
  repository: ReportRepository,
  bundle: UpsertArtifactInput,
) {
  const storagePointers = bundle.storagePointers ?? {};
  const inlineJson = typeof storagePointers.inlineJson === "string" ? storagePointers.inlineJson : null;

  if (!inlineJson) {
    await repository.upsertArtifact(bundle);
    return;
  }

  const blob = await maybeStoreBlobArtifact({
    pathname: `reports/${context.report.id}/runs/${context.run.id}/research/${bundle.fileName ?? "structured.json"}`,
    body: inlineJson,
    contentType: "application/json",
    minimumBytes: 0,
  });

  await repository.upsertArtifact({
    ...bundle,
    reportId: context.report.id,
    runId: context.run.id,
    storagePointers: {
      ...storagePointers,
      blob,
    },
  });
}

async function loadStructuredFactPacket(
  repository: ReportRepository,
  context: StoredRunContext,
): Promise<{ factPacket: FactPacket; fallbackApplied: boolean }> {
  const artifacts = await repository.listArtifactsByRunId(context.run.id);
  const persistedFactPacket = parseFactPacketArtifact(artifacts);
  const hasStructuredCompanyProfile =
    Boolean(persistedFactPacket?.companyProfile?.companyDescription) &&
    Boolean(persistedFactPacket?.companyProfile?.keyPublicSignals);

  if (persistedFactPacket && hasStructuredCompanyProfile) {
    return {
      factPacket: persistedFactPacket,
      fallbackApplied: false,
    };
  }

  const [sources, facts] = await Promise.all([
    repository.listSourcesByRunId(context.run.id),
    repository.listFactsByRunId(context.run.id),
  ]);

  if (!sources.length) {
    throw new Error("Research-summary synthesis requires persisted sources or a structured fact packet.");
  }

  return {
    factPacket: buildFactPacket({
      context,
      sources,
      facts,
    }),
    fallbackApplied: true,
  };
}

function buildEntityResolutionPrompt(context: StoredRunContext, sources: PersistedSource[]) {
  return compactJson({
    companyUrl: context.report.normalizedInputUrl,
    canonicalDomain: context.report.canonicalDomain,
    sourceRegistry: summarizeSourcesForPrompt(sources),
    goals: [
      "Resolve the real company behind the target domain.",
      "Prefer a clean display name over a raw acronym or domain label when the sources support it.",
      "Identify any parent, subsidiary, or brand relationship only when the evidence supports it.",
      "Ground industry, sector, offerings, and customer type in the source registry.",
    ],
  });
}

function summarizeEntitySourcePlanCoverage(sources: PersistedSource[], canonicalDomain: string) {
  const hasFirstPartySourceType = (sourceTypes: PersistedSource["sourceType"][]) =>
    sources.some(
      (source) => source.canonicalDomain === canonicalDomain && sourceTypes.includes(source.sourceType),
    );
  const hasPrimaryParentContext = sources.some(
    (source) =>
      source.canonicalDomain !== canonicalDomain &&
      source.sourceTier === "primary" &&
      ["investor_relations_page", "investor_report", "earnings_release", "newsroom_page", "company_site"].includes(
        source.sourceType,
      ),
  );

  return [
    {
      slot: "homepage",
      covered: hasFirstPartySourceType(["company_homepage", "company_site"]),
      preferredSourceTypes: ["company_homepage", "company_site"],
    },
    {
      slot: "about_company",
      covered: hasFirstPartySourceType(["about_page"]),
      preferredSourceTypes: ["about_page"],
    },
    {
      slot: "offerings_and_customer_type",
      covered: hasFirstPartySourceType(["product_page", "solutions_page", "developer_page", "docs_page"]),
      preferredSourceTypes: ["product_page", "solutions_page", "developer_page", "docs_page"],
    },
    {
      slot: "parent_or_investor_context",
      covered:
        hasPrimaryParentContext ||
        hasFirstPartySourceType(["investor_relations_page", "investor_report", "earnings_release", "newsroom_page"]),
      preferredSourceTypes: ["investor_relations_page", "investor_report", "earnings_release", "newsroom_page"],
    },
  ];
}

function buildEntityResolutionSearchPrompt(input: {
  context: StoredRunContext;
  sources: PersistedSource[];
  attemptedCompanyName: string;
  currentConfidence: number;
  sourcePlanCoverage: ReturnType<typeof summarizeEntitySourcePlanCoverage>;
}) {
  return compactJson({
    companyUrl: input.context.report.normalizedInputUrl,
    canonicalDomain: input.context.report.canonicalDomain,
    attemptedCompanyName: input.attemptedCompanyName,
    currentConfidence: input.currentConfidence,
    sourceRegistry: summarizeSourcesForPrompt(input.sources),
    sourcePlanCoverage: input.sourcePlanCoverage,
    searchGoals: [
      "Confirm the official homepage and about/company page for the target business.",
      "If the target appears to be a brand, subsidiary, or product-led domain, find the official parent or investor page that explains that relationship.",
      "Find the best official page that explains what the company sells and who it sells to.",
      "Use reputable public search results only when official pages do not fully answer the identity questions.",
    ],
    returnRules: [
      "Return only URLs supported by the web search tool in this response.",
      "Prefer primary official sources over commentary.",
      "Do not guess a parent, brand, or subsidiary relationship unless a returned source supports it.",
    ],
  });
}

function buildExternalEnrichmentPrompt(input: {
  context: StoredRunContext;
  companyName: string;
  sources: PersistedSource[];
  sourcePlanCoverage: ReturnType<typeof summarizeSourcePlanCoverage>;
  searchMode: "supplemental" | "search_first";
}) {
  return compactJson({
    companyName: input.companyName,
    canonicalDomain: input.context.report.canonicalDomain,
    crawlSourceRegistry: summarizeSourcesForPrompt(input.sources),
    searchMode: input.searchMode,
    sourcePlanCoverage: input.sourcePlanCoverage,
    researchGoals: [
      "Fill missing source-plan slots with official company URLs first.",
      "Prefer homepage, about/company, products/solutions/platform, trust/security/privacy, careers, and investor/newsroom sources when they can be verified.",
      "When official sources are unavailable, add a small set of reputable public sources that directly support visible company claims.",
      "Keep competitor context, complaint themes, and broader market commentary optional and secondary to core brief evidence.",
    ],
    currentDate: new Date().toISOString(),
  });
}

function summarizeSourceCoverage(sources: PersistedSource[], canonicalDomain: string) {
  const firstPartySources = sources.filter((source) => source.canonicalDomain === canonicalDomain);
  const externalSources = sources.length - firstPartySources.length;
  const htmlLikeSources = sources.filter((source) => !source.mimeType?.includes("pdf")).length;
  const pdfSources = sources.filter((source) => source.mimeType?.includes("pdf")).length;

  return {
    totalSources: sources.length,
    firstPartySources: firstPartySources.length,
    externalSources,
    htmlLikeSources,
    pdfSources,
    firstPartyCoverage: firstPartySources.length >= 2 ? "usable" : firstPartySources.length > 0 ? "limited" : "thin",
  };
}

function summarizeSourcePlanCoverage(sources: PersistedSource[], canonicalDomain: string) {
  const firstPartySources = sources.filter((source) => source.canonicalDomain === canonicalDomain);
  const hasSourceType = (sourceTypes: PersistedSource["sourceType"][]) =>
    firstPartySources.some((source) => sourceTypes.includes(source.sourceType));

  return [
    {
      slot: "homepage",
      covered: hasSourceType(["company_homepage", "company_site"]),
      preferredSourceTypes: ["company_homepage", "company_site"],
    },
    {
      slot: "about_company",
      covered: hasSourceType(["about_page"]),
      preferredSourceTypes: ["about_page"],
    },
    {
      slot: "products_solutions_platform",
      covered: hasSourceType(["product_page", "solutions_page", "developer_page", "docs_page"]),
      preferredSourceTypes: ["product_page", "solutions_page", "developer_page", "docs_page"],
    },
    {
      slot: "trust_security_privacy",
      covered: hasSourceType(["security_page", "privacy_page", "status_page", "support_page"]),
      preferredSourceTypes: ["security_page", "privacy_page", "status_page", "support_page"],
    },
    {
      slot: "careers",
      covered: hasSourceType(["careers_page"]),
      preferredSourceTypes: ["careers_page"],
    },
    {
      slot: "investor_newsroom",
      covered: hasSourceType([
        "investor_relations_page",
        "investor_report",
        "earnings_release",
        "newsroom_page",
        "blog_page",
      ]),
      preferredSourceTypes: [
        "investor_relations_page",
        "investor_report",
        "earnings_release",
        "newsroom_page",
        "blog_page",
      ],
    },
  ];
}

function buildFactNormalizationPrompt(
  context: StoredRunContext,
  sources: PersistedSource[],
  briefMode: FactPacket["briefMode"],
) {
  return compactJson({
    companyUrl: context.report.normalizedInputUrl,
    canonicalDomain: context.report.canonicalDomain,
    briefMode,
    sourceRegistry: summarizeSourcesForPrompt(sources),
    instructions: {
      note: "Use only source IDs from the source registry. Uploaded files contain the source ID in the file header.",
      expectedFacts:
        briefMode === "light"
          ? "Return 6 to 14 high-signal claims. Favor the strongest supported claims only and keep uncertainty explicit."
          : "Return 12 to 28 high-signal claims when evidence exists. Prefer authoritative sources and keep uncertainty explicit.",
      structuredCoverage:
        "Prioritize facts that ground company description, industry/sector, products or services, operating model, target customers, and key public signals so the downstream fact packet can stay company-specific.",
    },
  });
}

function buildResearchSummaryPrompt(
  context: StoredRunContext,
  factPacket: FactPacket,
) {
  return compactJson({
    companyUrl: context.report.normalizedInputUrl,
    canonicalDomain: context.report.canonicalDomain,
    companyName: factPacket.companyIdentity.companyName,
    factPacket: buildSynthesisFactPacketPrompt(factPacket),
    requiredSections: REPORT_SECTION_DEFINITIONS.map((section) => section.key),
    synthesisInstructions:
      factPacket.briefMode === "light"
        ? "Prioritize the strongest supported company identity, company profile, opportunity, motion, stakeholder, and discovery/pilot signals from the fact packet. Keep evidence gaps and confidence limits explicit."
        : "Cover the full brief using the structured fact packet as the grounding layer, while keeping evidence gaps and confidence limits explicit.",
    groundingRule:
      "Do not rely on loose crawl text. Use the fact packet's structured company profile and evidence entries as the source of truth. If some fields are missing, stay specific to the company evidence that is present instead of reverting to generic seller-tooling language.",
  });
}

function normalizeAllowedWebUrls(webSearchSources: ParsedStructuredResponse<unknown>["webSearchSources"]) {
  const urls = new Set<string>();

  for (const source of webSearchSources) {
    try {
      urls.add(normalizePublicHttpUrl(source.url));
    } catch {
      continue;
    }
  }

  return urls;
}

async function persistDiscoveredSources(input: {
  repository: ReportRepository;
  context: StoredRunContext;
  responseId: string;
  allowedUrls: Set<string>;
  discoveredSources: Array<{
    url: string;
    title: string;
    sourceType: PersistedSource["sourceType"];
    sourceTier: PersistedSource["sourceTier"];
    publishedAt: string | null;
    summary: string;
    whyItMatters: string;
  }>;
}) {
  let persistedExternalSources = 0;
  let dedupedExternalSources = 0;

  for (const candidate of input.discoveredSources) {
    let normalizedUrl: string;

    try {
      normalizedUrl = normalizePublicHttpUrl(candidate.url);
    } catch {
      continue;
    }

    if (!input.allowedUrls.has(normalizedUrl)) {
      continue;
    }

    const outcome = await input.repository.upsertCrawledSource({
      reportId: input.context.report.id,
      runId: input.context.run.id,
      url: normalizedUrl,
      normalizedUrl,
      canonicalUrl: normalizedUrl,
      canonicalDomain: normalizeCanonicalDomain(new URL(normalizedUrl).hostname),
      title: candidate.title,
      sourceType: candidate.sourceType,
      sourceTier: candidate.sourceTier,
      mimeType: normalizedUrl.endsWith(".pdf") ? "application/pdf" : "text/html",
      publishedAt: parseNullableDate(candidate.publishedAt),
      retrievedAt: new Date(),
      textContent: `${candidate.summary}\n\nWhy it matters: ${candidate.whyItMatters}`,
      markdownContent: `# ${candidate.title}\n\n${candidate.summary}\n\nWhy it matters: ${candidate.whyItMatters}`,
      storagePointers: {
        summary: candidate.summary,
        whyItMatters: candidate.whyItMatters,
        discoveredBy: "openai_web_search",
        openAIResponseId: input.responseId,
      },
    });

    if (outcome.dedupeStrategy === "created") {
      persistedExternalSources += 1;
    } else {
      dedupedExternalSources += 1;
    }
  }

  return {
    persistedExternalSources,
    dedupedExternalSources,
  };
}

function buildResolvedCompanyIdentity(input: {
  context: StoredRunContext;
  sources: PersistedSource[];
  parsed: {
    companyName: string;
    canonicalDomain: string;
    relationshipToCanonicalDomain: string | null;
    archetype: string;
    businessModel: string | null;
    customerType: string | null;
    offerings: string | null;
    sector: string | null;
    industry: string | null;
    publicCompany: boolean | null;
    headquarters: string | null;
    confidence: number;
    sourceIds: number[];
  };
}) {
  const validSourceIds = new Set(input.sources.map((source) => source.id));
  const sourceIds = [...new Set(input.parsed.sourceIds.filter((sourceId) => validSourceIds.has(sourceId)))];

  if (!sourceIds.length) {
    throw new Error("Entity resolution returned source IDs outside the known source registry.");
  }

  return {
    canonicalDomain: input.context.report.canonicalDomain,
    companyName: preferSourceBackedCompanyName({
      canonicalDomain: input.context.report.canonicalDomain,
      currentName: input.parsed.companyName,
      sources: input.sources,
    }),
    relationshipToCanonicalDomain: normalizeOptionalString(input.parsed.relationshipToCanonicalDomain),
    archetype: input.parsed.archetype.trim(),
    businessModel: normalizeOptionalString(input.parsed.businessModel),
    customerType: normalizeOptionalString(input.parsed.customerType),
    offerings: normalizeOptionalString(input.parsed.offerings),
    sector: normalizeOptionalString(input.parsed.sector),
    industry: normalizeOptionalString(input.parsed.industry),
    publicCompany: input.parsed.publicCompany,
    headquarters: normalizeOptionalString(input.parsed.headquarters),
    confidence: Math.max(0, Math.min(100, Math.round(input.parsed.confidence))),
    sourceIds,
  } satisfies NonNullable<ResearchSummary["companyIdentity"]>;
}

function evaluateEntityResolution(input: {
  identity: NonNullable<ResearchSummary["companyIdentity"]>;
}) {
  const gaps: string[] = [];

  if ((input.identity.confidence ?? 0) < ENTITY_RESOLUTION_MIN_CONFIDENCE) {
    gaps.push("confidence_below_threshold");
  }

  if (!input.identity.sourceIds.length) {
    gaps.push("missing_source_backing");
  }

  if (!normalizeOptionalString(input.identity.industry) && !normalizeOptionalString(input.identity.sector)) {
    gaps.push("missing_industry_or_sector");
  }

  if (!normalizeOptionalString(input.identity.offerings)) {
    gaps.push("missing_offerings");
  }

  if (!normalizeOptionalString(input.identity.customerType) && !normalizeOptionalString(input.identity.businessModel)) {
    gaps.push("missing_customer_type_or_business_model");
  }

  if (!normalizeOptionalString(input.identity.companyName)) {
    gaps.push("missing_company_name");
  }

  return {
    isResolved: gaps.length === 0,
    gaps,
  };
}

function buildEntityResolutionResearchSummary(identity: NonNullable<ResearchSummary["companyIdentity"]>): ResearchSummary {
  const companyBriefConfidence = Math.max(45, Math.min(100, identity.confidence ?? 45));
  const researchCompletenessScore = Math.max(24, Math.min(46, Math.round(companyBriefConfidence * 0.45)));

  return {
    companyIdentity: identity,
    growthPriorities: [],
    aiMaturityEstimate: {
      level: "low",
      rationale: "Broader AI maturity analysis has not started yet; only entity grounding is complete.",
      sourceIds: identity.sourceIds,
    },
    regulatorySensitivity: {
      level: "low",
      rationale: "Trust and regulatory analysis will be completed after fact extraction.",
      sourceIds: identity.sourceIds,
    },
    notableProductSignals: [],
    notableHiringSignals: [],
    notableTrustSignals: [],
    complaintThemes: [],
    leadershipSocialThemes: [],
    researchCompletenessScore,
    confidenceBySection: REPORT_SECTION_DEFINITIONS.map((section) => ({
      section: section.key,
      confidence: section.key === "company-brief" ? companyBriefConfidence : 20,
      rationale:
        section.key === "company-brief"
          ? "The target company identity is grounded in authoritative public evidence."
          : "This section will be rescored after fact extraction and account-plan synthesis.",
    })),
    evidenceGaps: [
      "Entity resolution completed. Broader fact extraction and opportunity synthesis are still pending.",
    ],
    overallConfidence: researchCompletenessScore >= 55 ? "medium" : "low",
    sourceIds: identity.sourceIds,
  };
}

function sanitizeResearchSummary(summary: ResearchSummary, validSourceIds: Set<number>): ResearchSummary {
  const sanitizeIds = (sourceIds: number[]) => [...new Set(sourceIds.filter((sourceId) => validSourceIds.has(sourceId)))];

  const normalizedSummary: ResearchSummary = {
    ...summary,
    companyIdentity: {
      ...summary.companyIdentity,
      sourceIds: sanitizeIds(summary.companyIdentity.sourceIds),
    },
    growthPriorities: summary.growthPriorities
      .map((item) => ({
        ...item,
        sourceIds: sanitizeIds(item.sourceIds),
      }))
      .filter((item) => item.sourceIds.length > 0),
    aiMaturityEstimate: {
      ...summary.aiMaturityEstimate,
      sourceIds: sanitizeIds(summary.aiMaturityEstimate.sourceIds),
    },
    regulatorySensitivity: {
      ...summary.regulatorySensitivity,
      sourceIds: sanitizeIds(summary.regulatorySensitivity.sourceIds),
    },
    notableProductSignals: summary.notableProductSignals
      .map((item) => ({
        ...item,
        sourceIds: sanitizeIds(item.sourceIds),
      }))
      .filter((item) => item.sourceIds.length > 0),
    notableHiringSignals: summary.notableHiringSignals
      .map((item) => ({
        ...item,
        sourceIds: sanitizeIds(item.sourceIds),
      }))
      .filter((item) => item.sourceIds.length > 0),
    notableTrustSignals: summary.notableTrustSignals
      .map((item) => ({
        ...item,
        sourceIds: sanitizeIds(item.sourceIds),
      }))
      .filter((item) => item.sourceIds.length > 0),
    complaintThemes: summary.complaintThemes
      .map((item) => ({
        ...item,
        sourceIds: sanitizeIds(item.sourceIds),
      }))
      .filter((item) => item.sourceIds.length > 0),
    leadershipSocialThemes: summary.leadershipSocialThemes
      .map((item) => ({
        ...item,
        sourceIds: sanitizeIds(item.sourceIds),
      }))
      .filter((item) => item.sourceIds.length > 0),
    sourceIds: sanitizeIds(summary.sourceIds),
  };

  if (
    !normalizedSummary.companyIdentity.sourceIds.length ||
    !normalizedSummary.aiMaturityEstimate.sourceIds.length ||
    !normalizedSummary.regulatorySensitivity.sourceIds.length ||
    !normalizedSummary.sourceIds.length
  ) {
    throw new Error("Research summary returned source IDs outside the known source registry.");
  }

  return normalizedSummary;
}

export function createResearchPipelineService(dependencies: ResearchServiceDependencies = {}) {
  const repository = dependencies.repository ?? drizzleReportRepository;
  const openAIClient = dependencies.openAIClient ?? createOpenAIResearchClient();
  const vectorStoreManager = createRunVectorStoreManager({
    openAIClient,
    repository,
  });

  async function resolveCompanyEntityProfile(context: StoredRunContext) {
    let sources = await repository.listSourcesByRunId(context.run.id);
    let identity: NonNullable<ResearchSummary["companyIdentity"]> | null = null;
    let assessment = {
      isResolved: false,
      gaps: ["not_attempted"],
    };
    let broadenedRetrieval = false;
    let persistedExternalSources = 0;
    let dedupedExternalSources = 0;

    if (sources.length > 0) {
      try {
        const entityResolution = await openAIClient.parseStructuredOutput({
          model: OPENAI_EXTRACTION_MODEL,
          instructions:
            "Resolve the real company behind the target domain using only the provided source registry. Prefer clean official company names over acronyms when supported. Identify parent, subsidiary, or brand relationships only when the source registry supports them. Never invent a source ID.",
          input: buildEntityResolutionPrompt(context, sources),
          schema: entityResolutionSchema,
          schemaName: "entity_resolution",
          maxOutputTokens: 1_500,
          timeoutMs: ENTITY_RESOLUTION_TIMEOUT_MS,
          maxAttempts: RESEARCH_OPENAI_MAX_ATTEMPTS,
        });

        identity = buildResolvedCompanyIdentity({
          context,
          sources,
          parsed: entityResolution.parsed,
        });
        assessment = evaluateEntityResolution({
          identity,
        });
        await appendStructuredDebugEvent(repository, context, "research.entity_resolution.completed", entityResolution);
      } catch (error) {
        await repository.appendRunEvent({
          reportId: context.report.id,
          runId: context.run.id,
          level: "warning",
          eventType: "research.entity_resolution.fallback",
          stepKey: "resolve_company_entity",
          message: "Initial entity resolution from crawl sources did not produce a reliable company match.",
          metadata: {
            errorMessage: error instanceof Error ? error.message : "Unknown entity-resolution failure.",
            sourceCount: sources.length,
          },
        });
      }
    }

    if (!assessment.isResolved) {
      broadenedRetrieval = true;

      await repository.appendRunEvent({
        reportId: context.report.id,
        runId: context.run.id,
        level: "warning",
        eventType: "research.entity_resolution.low_confidence",
        stepKey: "resolve_company_entity",
        message:
          "Entity confidence stayed below the report gate, so Account Atlas broadened retrieval toward official homepage, about/company, offerings, and parent/investor evidence before retrying.",
        metadata: {
          currentConfidence: identity?.confidence ?? 0,
          currentCompanyName:
            identity?.companyName ??
            context.report.companyName ??
            deriveCompanyNameFromDomain(context.report.canonicalDomain),
          gaps: assessment.gaps,
          sourcePlanCoverage: summarizeEntitySourcePlanCoverage(sources, context.report.canonicalDomain),
        },
      });

      const entitySearch = await openAIClient.parseStructuredOutput({
        model: OPENAI_EXTRACTION_MODEL,
        instructions:
          "Find authoritative public sources that verify the company behind the target domain. Prioritize official homepage, about/company, offerings, and parent or investor pages. Return only URLs supported by the web search tool in this response.",
        input: buildEntityResolutionSearchPrompt({
          context,
          sources,
          attemptedCompanyName:
            identity?.companyName ??
            context.report.companyName ??
            deriveCompanyNameFromDomain(context.report.canonicalDomain),
          currentConfidence: identity?.confidence ?? 0,
          sourcePlanCoverage: summarizeEntitySourcePlanCoverage(sources, context.report.canonicalDomain),
        }),
        schema: entityResolutionSearchSchema,
        schemaName: "entity_resolution_search",
        tools: [WEB_SEARCH_TOOL],
        include: ["web_search_call.action.sources"],
        maxOutputTokens: 2_500,
        timeoutMs: ENTITY_RESOLUTION_RETRY_TIMEOUT_MS,
        maxAttempts: RESEARCH_OPENAI_MAX_ATTEMPTS,
      });

      await appendStructuredDebugEvent(repository, context, "research.entity_resolution.search.completed", entitySearch);

      const persistenceOutcome = await persistDiscoveredSources({
        repository,
        context,
        responseId: entitySearch.responseId,
        allowedUrls: normalizeAllowedWebUrls(entitySearch.webSearchSources),
        discoveredSources: entitySearch.parsed.discoveredSources,
      });

      persistedExternalSources = persistenceOutcome.persistedExternalSources;
      dedupedExternalSources = persistenceOutcome.dedupedExternalSources;
      sources = await repository.listSourcesByRunId(context.run.id);

      const retriedEntityResolution = await openAIClient.parseStructuredOutput({
        model: OPENAI_EXTRACTION_MODEL,
        instructions:
          "Resolve the real company behind the target domain using the refreshed source registry. Prefer clean official company names over acronyms when supported. Identify parent, subsidiary, or brand relationships only when the registry supports them. Never invent a source ID.",
        input: buildEntityResolutionPrompt(context, sources),
        schema: entityResolutionSchema,
        schemaName: "entity_resolution",
        maxOutputTokens: 1_500,
        timeoutMs: ENTITY_RESOLUTION_TIMEOUT_MS,
        maxAttempts: RESEARCH_OPENAI_MAX_ATTEMPTS,
      });

      identity = buildResolvedCompanyIdentity({
        context,
        sources,
        parsed: retriedEntityResolution.parsed,
      });
      assessment = evaluateEntityResolution({
        identity,
      });
      await appendStructuredDebugEvent(
        repository,
        context,
        "research.entity_resolution.retry_completed",
        retriedEntityResolution,
      );
    }

    if (!identity || !assessment.isResolved) {
      await repository.appendRunEvent({
        reportId: context.report.id,
        runId: context.run.id,
        level: "error",
        eventType: "research.entity_resolution.blocked",
        stepKey: "resolve_company_entity",
        message:
          "Account Atlas could not confidently identify and ground the target company, so report generation was blocked before opportunity synthesis.",
        metadata: {
          currentCompanyName: identity?.companyName ?? null,
          currentConfidence: identity?.confidence ?? 0,
          gaps: assessment.gaps,
        },
      });

      throw new PipelineStepError(
        "ENTITY_RESOLUTION_UNVERIFIED",
        `Unable to confidently resolve the company behind ${context.report.canonicalDomain} after targeted official/public retrieval.`,
      );
    }

    return {
      identity,
      broadenedRetrieval,
      persistedExternalSources,
      dedupedExternalSources,
    };
  }

  return {
    async resolveCompanyEntity(context: StoredRunContext) {
      if (!openAIClient.isConfigured()) {
        await repository.appendRunEvent({
          reportId: context.report.id,
          runId: context.run.id,
          level: "warning",
          eventType: "research.openai.unconfigured",
          stepKey: "resolve_company_entity",
          message: "OPENAI_API_KEY is not configured. Entity resolution was skipped for local development.",
        });

        return "Skipped entity resolution because OPENAI_API_KEY is not configured.";
      }

      const resolved = await resolveCompanyEntityProfile(context);
      const researchSummary = buildEntityResolutionResearchSummary(resolved.identity);

      await repository.updateRunResearchSummary({
        reportId: context.report.id,
        runId: context.run.id,
        researchSummary,
        companyName: resolved.identity.companyName,
      });

      await repository.appendRunEvent({
        reportId: context.report.id,
        runId: context.run.id,
        level: "info",
        eventType: "research.entity_resolution.gate_passed",
        stepKey: "resolve_company_entity",
        message: `Entity resolution verified ${resolved.identity.companyName} before fact extraction and opportunity generation.`,
        metadata: {
          canonicalDomain: resolved.identity.canonicalDomain,
          relationshipToCanonicalDomain: resolved.identity.relationshipToCanonicalDomain,
          industry: resolved.identity.industry,
          sector: resolved.identity.sector,
          offerings: resolved.identity.offerings,
          customerType: resolved.identity.customerType,
          businessModel: resolved.identity.businessModel,
          confidence: resolved.identity.confidence,
          sourceIds: resolved.identity.sourceIds,
          broadenedRetrieval: resolved.broadenedRetrieval,
          persistedExternalSources: resolved.persistedExternalSources,
          dedupedExternalSources: resolved.dedupedExternalSources,
        },
      });

      return resolved.broadenedRetrieval
        ? `Resolved ${resolved.identity.companyName} with confidence ${resolved.identity.confidence}/100 after broadening identity-source retrieval and persisting ${resolved.persistedExternalSources} supporting sources (${resolved.dedupedExternalSources} deduped).`
        : `Resolved ${resolved.identity.companyName} with confidence ${resolved.identity.confidence}/100 and cleared the entity gate for fact extraction.`;
    },

    async enrichExternalSources(context: StoredRunContext) {
      if (!openAIClient.isConfigured()) {
        await repository.appendRunEvent({
          reportId: context.report.id,
          runId: context.run.id,
          level: "warning",
          eventType: "research.openai.unconfigured",
          stepKey: "enrich_external_sources",
          message: "OPENAI_API_KEY is not configured. External enrichment was skipped for local development.",
        });

        return "Skipped external enrichment because OPENAI_API_KEY is not configured.";
      }

      const sources = await repository.listSourcesByRunId(context.run.id);
      const sourceCoverage = summarizeSourceCoverage(sources, context.report.canonicalDomain);
      const sourcePlanCoverage = summarizeSourcePlanCoverage(sources, context.report.canonicalDomain);

      await repository.appendRunEvent({
        reportId: context.report.id,
        runId: context.run.id,
        level: sourceCoverage.firstPartyCoverage === "usable" ? "info" : "warning",
        eventType: "research.source_coverage.summary",
        stepKey: "enrich_external_sources",
        message:
          sourceCoverage.firstPartyCoverage === "usable"
            ? `Source coverage includes ${sourceCoverage.firstPartySources} first-party sources and ${sourceCoverage.externalSources} external sources before enrichment.`
            : "First-party source coverage is limited, so Account Atlas will lean more heavily on verified public-web enrichment.",
        metadata: sourceCoverage,
      });

      const searchMode = sourceCoverage.firstPartyCoverage === "thin" ? "search_first" : "supplemental";

      if (searchMode === "search_first") {
        await repository.appendRunEvent({
          reportId: context.report.id,
          runId: context.run.id,
          level: "warning",
          eventType: "research.fallback_plan_selected",
          stepKey: "enrich_external_sources",
          message:
            "First-party sources remained thin, so Account Atlas switched to search-first mode and targeted official/public web sources.",
          metadata: {
            sourceCoverage,
            sourcePlanCoverage,
          },
        });
      }

      await vectorStoreManager.ensureRunVectorStore(context, sources, {
        syncSources: false,
      });

      let resolvedCompanyName = preferSourceBackedCompanyName({
        canonicalDomain: context.report.canonicalDomain,
        currentName: context.report.companyName ?? deriveCompanyNameFromDomain(context.report.canonicalDomain),
        sources,
      });

      if (sources.length > 0) {
        try {
          const entityResolution = await openAIClient.parseStructuredOutput({
            model: OPENAI_EXTRACTION_MODEL,
            instructions:
              "Resolve the company identity from the provided crawl sources. Use only evidence grounded in the source registry. Never invent a source ID.",
            input: buildEntityResolutionPrompt(context, sources),
            schema: entityResolutionSchema,
            schemaName: "entity_resolution",
            maxOutputTokens: 1_500,
            timeoutMs: ENTITY_RESOLUTION_TIMEOUT_MS,
            maxAttempts: RESEARCH_OPENAI_MAX_ATTEMPTS,
          });

          resolvedCompanyName = preferSourceBackedCompanyName({
            canonicalDomain: context.report.canonicalDomain,
            currentName: entityResolution.parsed.companyName,
            sources,
          });
          await appendStructuredDebugEvent(
            repository,
            context,
            "research.enrichment.entity_resolution.completed",
            entityResolution,
          );
        } catch (error) {
          await repository.appendRunEvent({
            reportId: context.report.id,
            runId: context.run.id,
            level: "warning",
            eventType: "research.entity_resolution.fallback",
            stepKey: "enrich_external_sources",
            message:
              "First-party sources were too thin to fully resolve company identity, so Account Atlas continued with domain-based enrichment.",
            metadata: {
              fallbackCompanyName: resolvedCompanyName,
              errorMessage: error instanceof Error ? error.message : "Unknown entity-resolution failure.",
              sourceCount: sources.length,
            },
          });
        }
      } else {
        await repository.appendRunEvent({
          reportId: context.report.id,
          runId: context.run.id,
          level: "warning",
          eventType: "research.entity_resolution.fallback",
          stepKey: "enrich_external_sources",
          message:
            "No first-party crawl sources were available, so Account Atlas continued with domain-based public-web enrichment.",
          metadata: {
            fallbackCompanyName: resolvedCompanyName,
            sourceCount: 0,
          },
        });
      }

      const enrichment = await openAIClient.parseStructuredOutput({
        model: OPENAI_EXTRACTION_MODEL,
        instructions:
          "Find current public research signals beyond the currently persisted company sources. Fill missing official company source-plan slots first, use authoritative public sources second, never fabricate a source, and return only URLs supported by the web search tool in this response.",
        input: buildExternalEnrichmentPrompt({
          context,
          companyName: resolvedCompanyName,
          sources,
          sourcePlanCoverage,
          searchMode,
        }),
        schema: externalSourceEnrichmentSchema,
        schemaName: "external_source_enrichment",
        tools: [WEB_SEARCH_TOOL],
        include: ["web_search_call.action.sources"],
        maxOutputTokens: 3_500,
        timeoutMs: EXTERNAL_ENRICHMENT_TIMEOUT_MS,
        maxAttempts: RESEARCH_OPENAI_MAX_ATTEMPTS,
      });

      await appendStructuredDebugEvent(repository, context, "research.external_enrichment.completed", enrichment);

      const allowedUrls = normalizeAllowedWebUrls(enrichment.webSearchSources);
      let persistedExternalSources = 0;
      let dedupedExternalSources = 0;

      for (const candidate of enrichment.parsed.discoveredSources) {
        let normalizedUrl: string;

        try {
          normalizedUrl = normalizePublicHttpUrl(candidate.url);
        } catch {
          continue;
        }

        if (!allowedUrls.has(normalizedUrl)) {
          continue;
        }

        const outcome = await repository.upsertCrawledSource({
          reportId: context.report.id,
          runId: context.run.id,
          url: normalizedUrl,
          normalizedUrl,
          canonicalUrl: normalizedUrl,
          canonicalDomain: normalizeCanonicalDomain(new URL(normalizedUrl).hostname),
          title: candidate.title,
          sourceType: candidate.sourceType,
          sourceTier: candidate.sourceTier,
          mimeType: normalizedUrl.endsWith(".pdf") ? "application/pdf" : "text/html",
          publishedAt: parseNullableDate(candidate.publishedAt),
          retrievedAt: new Date(),
          textContent: `${candidate.summary}\n\nWhy it matters: ${candidate.whyItMatters}`,
          markdownContent: `# ${candidate.title}\n\n${candidate.summary}\n\nWhy it matters: ${candidate.whyItMatters}`,
          storagePointers: {
            summary: candidate.summary,
            whyItMatters: candidate.whyItMatters,
            discoveredBy: "openai_web_search",
            openAIResponseId: enrichment.responseId,
          },
        });

        if (outcome.dedupeStrategy === "created") {
          persistedExternalSources += 1;
        } else {
          dedupedExternalSources += 1;
        }
      }

      const totalSourcesAfterEnrichment = sources.length + persistedExternalSources;
      const refreshedSources = await repository.listSourcesByRunId(context.run.id);
      const briefMode = selectResearchBriefMode(refreshedSources, context.report.canonicalDomain);

      await repository.appendRunEvent({
        reportId: context.report.id,
        runId: context.run.id,
        level: totalSourcesAfterEnrichment > 0 ? "info" : "warning",
        eventType: "research.source_coverage.summary",
        stepKey: "enrich_external_sources",
        message:
          totalSourcesAfterEnrichment > 0
            ? `Source coverage after enrichment includes ${totalSourcesAfterEnrichment} persisted sources.`
            : "Source coverage remained too thin after enrichment, so later synthesis may stay limited.",
        metadata: {
          dedupedExternalSources,
          persistedExternalSources,
          totalSourcesAfterEnrichment,
        },
      });

      if (briefMode === "light") {
        await repository.appendRunEvent({
          reportId: context.report.id,
          runId: context.run.id,
          level: "warning",
          eventType: "research.light_brief_mode_selected",
          stepKey: "enrich_external_sources",
          message:
            "Evidence coverage remains sparse, so later synthesis will stay in light brief mode with explicit confidence labels.",
          metadata: {
            sourceCoverage: summarizeSourceCoverage(refreshedSources, context.report.canonicalDomain),
            sourcePlanCoverage: summarizeSourcePlanCoverage(refreshedSources, context.report.canonicalDomain),
          },
        });
      }

      const summarySuffix =
        briefMode === "light"
          ? " The report will continue in light brief mode with explicit confidence labels."
          : "";

      return sourceCoverage.firstPartyCoverage === "thin"
        ? `Stored ${persistedExternalSources} external sources (${dedupedExternalSources} deduped) after first-party site coverage stayed limited in search-first mode.${summarySuffix}`
        : `Resolved ${enrichment.parsed.entityResolution.companyName} and stored ${persistedExternalSources} external sources (${dedupedExternalSources} deduped).${summarySuffix}`;
    },

    async buildFactBase(context: StoredRunContext) {
      if (!openAIClient.isConfigured()) {
        await repository.replaceFactsForRun({
          reportId: context.report.id,
          runId: context.run.id,
          facts: [],
        });

        await repository.appendRunEvent({
          reportId: context.report.id,
          runId: context.run.id,
          level: "warning",
          eventType: "research.fact_base.skipped",
          stepKey: "build_fact_base",
          message: "OPENAI_API_KEY is not configured. Fact normalization was skipped.",
        });

        return "Skipped fact normalization because OPENAI_API_KEY is not configured.";
      }

      const sources = await repository.listSourcesByRunId(context.run.id);
      if (!sources.length) {
        await repository.replaceFactsForRun({
          reportId: context.report.id,
          runId: context.run.id,
          facts: [],
        });

        await repository.appendRunEvent({
          reportId: context.report.id,
          runId: context.run.id,
          level: "warning",
          eventType: "research.fact_base.skipped",
          stepKey: "build_fact_base",
          message: "Source coverage remained too thin to build a reliable fact base.",
        });

        return "Skipped fact normalization because source coverage remained too thin.";
      }

      const sourceRegistry = buildSourceRegistry(sources);
      const validSourceIds = new Set(sourceRegistry.map((source) => source.sourceId));
      const briefMode = selectResearchBriefMode(sources, context.report.canonicalDomain);
      const factResponse = await openAIClient.parseStructuredOutput({
        model: OPENAI_EXTRACTION_MODEL,
        instructions:
          "Normalize a source-backed fact base. Use only source IDs from the registry. Prefer authoritative sources. Mark uncertain conclusions as inferences or hypotheses. Do not invent citations.",
        input: buildFactNormalizationPrompt(context, sources, briefMode),
        schema: factNormalizationSchema,
        schemaName: "fact_normalization",
        maxOutputTokens: 4_500,
        timeoutMs: FACT_NORMALIZATION_TIMEOUT_MS,
        maxAttempts: RESEARCH_OPENAI_MAX_ATTEMPTS,
      });

      const normalizedFacts = dedupeFacts(
        factResponse.parsed.facts,
        validSourceIds,
      );

      await repository.replaceFactsForRun({
        reportId: context.report.id,
        runId: context.run.id,
        facts: normalizedFacts,
      });

      const persistedFacts = await repository.listFactsByRunId(context.run.id);
      const factPacket = buildFactPacket({
        context,
        sources,
        facts: persistedFacts,
        briefMode,
      });

      await repository.updateRunResearchSummary({
        reportId: context.report.id,
        runId: context.run.id,
        researchSummary: factPacket.summary,
        companyName: factPacket.summary.companyIdentity.companyName,
      });

      let factPacketArtifactFallbackApplied = false;

      try {
        await maybeWriteResearchArtifact(
          context,
          repository,
          buildFactPacketArtifactBundle({
            reportId: context.report.id,
            runId: context.run.id,
            factPacket,
          }),
        );
      } catch (error) {
        factPacketArtifactFallbackApplied = true;

        await repository.appendRunEvent({
          reportId: context.report.id,
          runId: context.run.id,
          level: "warning",
          eventType: "fallback_applied",
          stepKey: "build_fact_base",
          message:
            "The structured fact packet could not be stored as an artifact, so Account Atlas will continue from the persisted fact base and summary only.",
          metadata: {
            fallbackType: "fact_packet_artifact",
            errorMessage: error instanceof Error ? error.message : "Unknown fact packet persistence failure.",
          },
        });
      }

      await repository.appendRunEvent({
        reportId: context.report.id,
        runId: context.run.id,
        level: "info",
        eventType: "research.fact_base.completed",
        stepKey: "build_fact_base",
        message: `Persisted ${normalizedFacts.length} source-backed facts and a compact fact packet.`,
        metadata: {
          briefMode: factPacket.briefMode,
          factPacketArtifactFallbackApplied,
          parsedFactPacket: factPacket,
          responseId: factResponse.responseId,
          parsed: factResponse.parsed,
          outputText: factResponse.outputText,
          fileSearchResults: factResponse.fileSearchResults,
        },
      });

      return `Persisted ${normalizedFacts.length} source-backed facts and built a structured fact packet for report generation.`;
    },

    async generateResearchSummary(context: StoredRunContext) {
      if (!openAIClient.isConfigured()) {
        await repository.appendRunEvent({
          reportId: context.report.id,
          runId: context.run.id,
          level: "warning",
          eventType: "research.summary.skipped",
          stepKey: "generate_account_plan",
          message: "OPENAI_API_KEY is not configured. Research summary synthesis was skipped.",
        });

        return "Skipped research summary synthesis because OPENAI_API_KEY is not configured.";
      }

      const sources = await repository.listSourcesByRunId(context.run.id);

      if (!sources.length) {
        await repository.appendRunEvent({
          reportId: context.report.id,
          runId: context.run.id,
          level: "warning",
          eventType: "research.summary.skipped",
          stepKey: "generate_account_plan",
          message: "Source coverage remained too thin to synthesize a reliable research summary.",
        });

        return "Skipped research summary synthesis because source coverage remained too thin.";
      }

      const { factPacket, fallbackApplied: factPacketFallbackApplied } = await loadStructuredFactPacket(repository, context);
      const sourceUrlIndex = buildSourceUrlIndex(sources);

      const summaryResponse = await openAIClient.parseStructuredOutput({
        model: OPENAI_SYNTHESIS_MODEL,
        instructions:
          "Synthesize an evidence-backed research summary for an enterprise account plan from the structured fact packet. Use only source IDs present in the packet, keep the company profile grounded in the packet, surface uncertainty clearly when evidence is thin, and never invent a citation.",
        input: buildResearchSummaryPrompt(context, factPacket),
        schema: researchSummarySchema,
        schemaName: "research_summary",
        maxOutputTokens: 4_500,
        timeoutMs: RESEARCH_SUMMARY_TIMEOUT_MS,
        maxAttempts: RESEARCH_OPENAI_MAX_ATTEMPTS,
      });

      const summary = summaryResponse.parsed;
      const linkedSourceIds = resolveSourceIdsFromUrls(
        summaryResponse.webSearchSources.map((source) => source.url),
        sourceUrlIndex,
      );
      const validSourceIds = new Set(sources.map((source) => source.id));
      const normalizedSummary = sanitizeResearchSummary(
        {
          ...summary,
          sourceIds: [...new Set([...summary.sourceIds, ...linkedSourceIds])],
        },
        validSourceIds,
      );
      const preferredCompanyName = preferSourceBackedCompanyName({
        canonicalDomain: context.report.canonicalDomain,
        currentName: normalizedSummary.companyIdentity.companyName,
        sources,
      });
      const preferredSummary =
        preferredCompanyName === normalizedSummary.companyIdentity.companyName &&
        normalizedSummary.companyIdentity.companyName === factPacket.companyIdentity.companyName
          ? {
              ...normalizedSummary,
              companyIdentity: {
                ...normalizedSummary.companyIdentity,
                ...factPacket.companyIdentity,
                sourceIds: factPacket.companyIdentity.sourceIds,
              },
            }
          : {
              ...normalizedSummary,
              companyIdentity: {
                ...normalizedSummary.companyIdentity,
                ...factPacket.companyIdentity,
                companyName: preferredCompanyName || factPacket.companyIdentity.companyName,
                sourceIds: factPacket.companyIdentity.sourceIds,
              },
            };

      if (factPacketFallbackApplied) {
        await repository.appendRunEvent({
          reportId: context.report.id,
          runId: context.run.id,
          level: "warning",
          eventType: "fallback_applied",
          stepKey: "generate_account_plan",
          message:
            "The persisted structured fact packet was unavailable or outdated, so research-summary synthesis rebuilt it from persisted facts and sources first.",
          metadata: {
            fallbackType: "fact_packet_rebuild",
          },
        });
      }

      await repository.updateRunResearchSummary({
        reportId: context.report.id,
        runId: context.run.id,
        researchSummary: preferredSummary,
        companyName: preferredSummary.companyIdentity.companyName,
      });

      await repository.appendRunEvent({
        reportId: context.report.id,
        runId: context.run.id,
        level: "info",
        eventType: "research.summary.completed",
        stepKey: "generate_account_plan",
        message: `Stored research summary for ${preferredSummary.companyIdentity.companyName}.`,
        metadata: {
          responseId: summaryResponse.responseId,
          parsed: preferredSummary,
          outputText: summaryResponse.outputText,
          fileSearchResults: summaryResponse.fileSearchResults,
        },
      });

      return `Synthesized research summary with completeness ${preferredSummary.researchCompletenessScore}/100.`;
    },
  };
}
