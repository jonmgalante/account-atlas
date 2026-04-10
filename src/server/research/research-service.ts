import "server-only";

import { createHash } from "node:crypto";

import { REPORT_SECTION_DEFINITIONS } from "@/lib/report-sections";
import type { PersistedFactRecord, ResearchSummary } from "@/lib/types/research";
import { normalizeCanonicalDomain, normalizePublicHttpUrl } from "@/lib/url";
import { OPENAI_EXTRACTION_MODEL, OPENAI_SYNTHESIS_MODEL } from "@/server/openai/models";
import {
  createOpenAIResearchClient,
  type OpenAIResearchClient,
  type ParsedStructuredResponse,
} from "@/server/openai/client";
import {
  entityResolutionSchema,
  externalSourceEnrichmentSchema,
  factNormalizationSchema,
  researchSummarySchema,
} from "@/server/research/schemas";
import {
  buildSourceRegistry,
  buildSourceUrlIndex,
  resolveSourceIdsFromUrls,
} from "@/server/research/source-registry";
import { createRunVectorStoreManager } from "@/server/research/vector-store";
import type {
  PersistedFact,
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
const EXTERNAL_ENRICHMENT_TIMEOUT_MS = 120_000;
const FACT_NORMALIZATION_TIMEOUT_MS = 75_000;
const RESEARCH_SUMMARY_TIMEOUT_MS = 75_000;
const RESEARCH_OPENAI_MAX_ATTEMPTS = 1;

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

function buildArtifactBundle(input: {
  researchSummary: ResearchSummary;
  facts: PersistedFact[];
  sources: PersistedSource[];
}): UpsertArtifactInput {
  const body = compactJson({
    researchSummary: input.researchSummary,
    facts: input.facts.map((fact) => ({
      id: fact.id,
      claim: fact.statement,
      section: fact.section,
      classification: fact.classification,
      confidence: fact.confidence,
      freshness: fact.freshness,
      sentiment: fact.sentiment,
      relevance: fact.relevance,
      sourceIds: fact.sourceIds,
    })),
    sourceRegistry: buildSourceRegistry(input.sources),
  });
  const contentHash = createHash("sha256").update(body).digest("hex");

  return {
    reportId: input.facts[0]?.reportId ?? input.sources[0]?.reportId ?? 0,
    runId: input.facts[0]?.runId ?? input.sources[0]?.runId ?? null,
    artifactType: "structured_json",
    mimeType: "application/json",
    fileName: "research-summary.json",
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
    pathname: `reports/${context.report.id}/runs/${context.run.id}/research/summary.json`,
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

function buildEntityResolutionPrompt(context: StoredRunContext, sources: PersistedSource[]) {
  return compactJson({
    companyUrl: context.report.normalizedInputUrl,
    canonicalDomain: context.report.canonicalDomain,
    sourceRegistry: summarizeSourcesForPrompt(sources),
  });
}

function buildExternalEnrichmentPrompt(context: StoredRunContext, companyName: string, sources: PersistedSource[]) {
  return compactJson({
    companyName,
    canonicalDomain: context.report.canonicalDomain,
    crawlSourceRegistry: summarizeSourcesForPrompt(sources),
    researchGoals: [
      "Recent news",
      "Investor materials and recent quarter or earnings sources when public",
      "Official company and executive social signals",
      "Review-platform or complaint themes",
      "Support, status, and incident sources",
      "Competitive and market context",
    ],
    currentDate: new Date().toISOString(),
  });
}

function deriveCompanyNameFromDomain(canonicalDomain: string) {
  const rootLabel = normalizeCanonicalDomain(canonicalDomain).split(".")[0] ?? canonicalDomain;

  return rootLabel
    .split(/[-_]+/)
    .filter(Boolean)
    .map((segment) => {
      if (!/[aeiou]/i.test(segment) && segment.length <= 4) {
        return segment.toUpperCase();
      }

      return segment.charAt(0).toUpperCase() + segment.slice(1);
    })
    .join(" ");
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

function buildFactNormalizationPrompt(context: StoredRunContext, sources: PersistedSource[]) {
  return compactJson({
    companyUrl: context.report.normalizedInputUrl,
    canonicalDomain: context.report.canonicalDomain,
    sourceRegistry: summarizeSourcesForPrompt(sources),
    instructions: {
      note: "Use only source IDs from the source registry. Uploaded files contain the source ID in the file header.",
      expectedFacts: "Return 12 to 28 high-signal claims when evidence exists. Prefer authoritative sources and keep uncertainty explicit.",
    },
  });
}

function buildResearchSummaryPrompt(context: StoredRunContext, sources: PersistedSource[], facts: PersistedFact[]) {
  return compactJson({
    companyUrl: context.report.normalizedInputUrl,
    canonicalDomain: context.report.canonicalDomain,
    sourceRegistry: summarizeSourcesForPrompt(sources),
    facts: facts.map((fact) => ({
      claim: fact.statement,
      section: fact.section,
      classification: fact.classification,
      confidence: fact.confidence,
      freshness: fact.freshness,
      sentiment: fact.sentiment,
      relevance: fact.relevance,
      rationale: fact.rationale,
      sourceIds: fact.sourceIds,
    })),
    requiredSections: REPORT_SECTION_DEFINITIONS.map((section) => section.key),
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

  return {
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

      await vectorStoreManager.ensureRunVectorStore(context, sources, {
        syncSources: false,
      });

      let resolvedCompanyName = deriveCompanyNameFromDomain(context.report.canonicalDomain);

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

          resolvedCompanyName = entityResolution.parsed.companyName;
          await appendStructuredDebugEvent(repository, context, "research.entity_resolution.completed", entityResolution);
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
          "Find current public research signals beyond the company site. Use authoritative sources first, never fabricate a source, and return only URLs supported by the web search tool in this response.",
        input: buildExternalEnrichmentPrompt(context, resolvedCompanyName, sources),
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

      return sourceCoverage.firstPartyCoverage === "thin"
        ? `Stored ${persistedExternalSources} external sources (${dedupedExternalSources} deduped) after first-party site coverage stayed limited.`
        : `Resolved ${enrichment.parsed.entityResolution.companyName} and stored ${persistedExternalSources} external sources (${dedupedExternalSources} deduped).`;
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
      const factResponse = await openAIClient.parseStructuredOutput({
        model: OPENAI_EXTRACTION_MODEL,
        instructions:
          "Normalize a source-backed fact base. Use only source IDs from the registry. Prefer authoritative sources. Mark uncertain conclusions as inferences or hypotheses. Do not invent citations.",
        input: buildFactNormalizationPrompt(context, sources),
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

      await repository.appendRunEvent({
        reportId: context.report.id,
        runId: context.run.id,
        level: "info",
        eventType: "research.fact_base.completed",
        stepKey: "build_fact_base",
        message: `Persisted ${normalizedFacts.length} source-backed facts.`,
        metadata: {
          responseId: factResponse.responseId,
          parsed: factResponse.parsed,
          outputText: factResponse.outputText,
          fileSearchResults: factResponse.fileSearchResults,
        },
      });

      return `Persisted ${normalizedFacts.length} source-backed facts.`;
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
      const facts = await repository.listFactsByRunId(context.run.id);

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

      const sourceUrlIndex = buildSourceUrlIndex(sources);

      const summaryResponse = await openAIClient.parseStructuredOutput({
        model: OPENAI_SYNTHESIS_MODEL,
        instructions:
          "Synthesize an evidence-backed research summary for an enterprise account plan. Use only source IDs present in the registry. Surface uncertainty clearly when evidence is thin and never invent a citation.",
        input: buildResearchSummaryPrompt(context, sources, facts),
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

      await repository.updateRunResearchSummary({
        reportId: context.report.id,
        runId: context.run.id,
        researchSummary: normalizedSummary,
        companyName: normalizedSummary.companyIdentity.companyName,
      });

      await repository.appendRunEvent({
        reportId: context.report.id,
        runId: context.run.id,
        level: "info",
        eventType: "research.summary.completed",
        stepKey: "generate_account_plan",
        message: `Stored research summary for ${normalizedSummary.companyIdentity.companyName}.`,
        metadata: {
          responseId: summaryResponse.responseId,
          parsed: normalizedSummary,
          outputText: summaryResponse.outputText,
          fileSearchResults: summaryResponse.fileSearchResults,
        },
      });

      await maybeWriteResearchArtifact(
        context,
        repository,
        buildArtifactBundle({
          researchSummary: normalizedSummary,
          facts,
          sources,
        }),
      );

      return `Synthesized research summary with completeness ${normalizedSummary.researchCompletenessScore}/100.`;
    },
  };
}
