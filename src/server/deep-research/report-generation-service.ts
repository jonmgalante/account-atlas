import "server-only";

import { createHash } from "node:crypto";

import { buildCanonicalOpportunityScorecard } from "@/lib/canonical-report";
import type {
  AccountPlanUseCase,
  FinalAccountPlan,
  PilotPlan,
  StakeholderHypothesis,
} from "@/lib/types/account-plan";
import type { PipelineExecutionMode } from "@/lib/types/report";
import type { PersistedFactRecord, ResearchSummary } from "@/lib/types/research";
import { extractCanonicalDomain, normalizeCanonicalDomain, normalizePublicHttpUrl } from "@/lib/url";
import {
  CANONICAL_ACCOUNT_ATLAS_REPORT_SCHEMA_NAME,
  CANONICAL_ACCOUNT_ATLAS_REPORT_SCHEMA_VERSION,
  canonicalAccountAtlasReportSchema,
  type CanonicalAccountAtlasReport,
  type CanonicalOpportunityCard,
  type CanonicalReportCitation,
  type CanonicalReportSource,
} from "@/server/deep-research/report-contract";
import { buildCanonicalDeepResearchPrompt } from "@/server/deep-research/prompt";
import { OPENAI_SYNTHESIS_MODEL } from "@/server/openai/models";
import {
  createOpenAIResearchClient,
  type OpenAIResearchClient,
  type RetrievedBackgroundResponse,
} from "@/server/openai/client";
import { logServerEvent } from "@/server/observability/logger";
import {
  createInitialPipelineState,
  normalizePipelineState,
  type StoredPipelineState,
} from "@/server/pipeline/pipeline-steps";
import {
  SELLER_WORKFLOW_BUSINESS_SUPPORT_PATTERNS,
  SELLER_WORKFLOW_SELF_REFERENCE_PATTERNS,
  TRANSIENT_OPERATIONAL_SIGNAL_PATTERNS,
} from "@/server/quality/report-quality";
import {
  drizzleReportRepository,
  type PersistedReport,
  type PersistedRun,
  type ReportRepository,
  type StoredReportShell,
} from "@/server/repositories/report-repository";

type DeepResearchReportGenerationServiceDependencies = {
  repository?: ReportRepository;
  openAIClient?: OpenAIResearchClient;
};

type StartReportRunInput = {
  report: PersistedReport;
  run: PersistedRun;
};

type SyncReportRunInput = {
  shareId: string;
  shell?: StoredReportShell | null;
};

export type DeepResearchReportGenerationService = {
  startReportRun(input: StartReportRunInput): Promise<void>;
  syncReportRun(input: SyncReportRunInput): Promise<StoredReportShell | null>;
};

type SourceRegistryEntry = CanonicalReportSource & {
  normalized_url: string;
  canonical_domain: string;
};

type PublishSafetyResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      code: string;
      message: string;
    };

type ThinPublishSafetyIssueCode =
  | "COMPANY_IDENTITY_UNSUPPORTED"
  | "OFF_TARGET_OPPORTUNITIES"
  | "VISIBLE_CLAIMS_MISSING_CITATIONS"
  | "TRANSIENT_SIGNALS_DOMINATE";

type ThinPublishSafetyIssue = {
  code: ThinPublishSafetyIssueCode;
  message: string;
  sourceIds: number[];
};

type ThinPublishSafetyEvaluation = {
  ok: boolean;
  issues: ThinPublishSafetyIssue[];
};

const CREATE_TIMEOUT_MS = 45_000;
const RETRIEVE_TIMEOUT_MS = 20_000;
const DEEP_RESEARCH_MAX_OUTPUT_TOKENS = 25_000;
const STATUS_MESSAGE_STARTED = "Started the deep research background job.";
const STATUS_MESSAGE_RUNNING = "The deep research brief is running in the background.";
const STATUS_MESSAGE_QUEUED = "The deep research brief is queued with OpenAI.";
const STRUCTURED_JSON_ARTIFACT_FILE_NAME = "account-atlas-canonical-report.json";
const WEB_SEARCH_TOOL = {
  type: "web_search",
  search_context_size: "high",
  user_location: {
    type: "approximate",
    country: "US",
    timezone: "America/New_York",
  },
} as const;

function getDeepResearchProgressPercentForResponseStatus(status: string | null | undefined) {
  switch (status) {
    case "in_progress":
      return 55;
    case "completed":
      return 90;
    default:
      return 0;
  }
}

function uniqueNumberList(values: Array<number | null | undefined>) {
  return [...new Set(values.filter((value): value is number => typeof value === "number" && Number.isInteger(value) && value > 0))];
}

function uniqueStringList(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const value of values) {
    const trimmed = value?.trim();

    if (!trimmed) {
      continue;
    }

    const key = trimmed.toLowerCase();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalized.push(trimmed);
  }

  return normalized;
}

function ensureSentence(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ");

  if (!normalized) {
    return "";
  }

  return /[.!?]$/.test(normalized) ? normalized : `${normalized}.`;
}

function truncateText(value: string, maxLength: number) {
  const normalized = value.trim().replace(/\s+/g, " ");

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function buildCompactParagraph(values: Array<string | null | undefined>, maxLength: number) {
  const sentences = uniqueStringList(values.map((value) => (value ? ensureSentence(value) : null)));
  let paragraph = "";

  for (const sentence of sentences) {
    const next = paragraph ? `${paragraph} ${sentence}` : sentence;

    if (next.length > maxLength) {
      return paragraph ? truncateText(paragraph, maxLength) : truncateText(sentence, maxLength);
    }

    paragraph = next;
  }

  return paragraph;
}

function parseNullableDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp) : null;
}

function relateDomains(left: string, right: string) {
  const normalizedLeft = normalizeCanonicalDomain(left);
  const normalizedRight = normalizeCanonicalDomain(right);

  return (
    normalizedLeft === normalizedRight ||
    normalizedLeft.endsWith(`.${normalizedRight}`) ||
    normalizedRight.endsWith(`.${normalizedLeft}`)
  );
}

function citationSourceIds(citations: CanonicalReportCitation[], sourceIdMap: Map<number, number>) {
  return uniqueNumberList(
    citations.map((citation) => sourceIdMap.get(citation.source_id)).filter((value): value is number => typeof value === "number"),
  );
}

function firstCitationSupport(citations: CanonicalReportCitation[]) {
  return citations.find((citation) => citation.support)?.support ?? null;
}

function dedupeCitations(citations: CanonicalReportCitation[]) {
  const seen = new Set<number>();
  const normalized: CanonicalReportCitation[] = [];

  for (const citation of citations) {
    if (seen.has(citation.source_id)) {
      continue;
    }

    seen.add(citation.source_id);
    normalized.push(citation);
  }

  return normalized;
}

function collectSellerWorkflowPatternHits(text: string) {
  const normalized = text.trim();

  if (!normalized) {
    return [];
  }

  return SELLER_WORKFLOW_SELF_REFERENCE_PATTERNS.filter(({ pattern }) => pattern.test(normalized)).map(
    ({ label }) => label,
  );
}

function isTransientOperationalSource(source: SourceRegistryEntry) {
  if (source.source_type === "incident_page") {
    return true;
  }

  const haystack = `${source.title} ${source.summary ?? ""} ${source.url}`;

  return TRANSIENT_OPERATIONAL_SIGNAL_PATTERNS.some((pattern) => pattern.test(haystack));
}

function getCitationSources(
  citations: CanonicalReportCitation[],
  sourceRegistry: Map<number, SourceRegistryEntry>,
) {
  return dedupeCitations(citations)
    .map((citation) => sourceRegistry.get(citation.source_id))
    .filter((source): source is SourceRegistryEntry => Boolean(source));
}

function citationsAreTransientOnly(
  citations: CanonicalReportCitation[],
  sourceRegistry: Map<number, SourceRegistryEntry>,
) {
  const sources = getCitationSources(citations, sourceRegistry);

  return sources.length > 0 && sources.every(isTransientOperationalSource);
}

function citationsHaveNonTransientSupport(
  citations: CanonicalReportCitation[],
  sourceRegistry: Map<number, SourceRegistryEntry>,
) {
  const sources = getCitationSources(citations, sourceRegistry);

  return sources.length > 0 && sources.some((source) => !isTransientOperationalSource(source));
}

function buildCompanyContextText(canonicalReport: CanonicalAccountAtlasReport) {
  return [
    canonicalReport.company.resolved_name,
    canonicalReport.company.relationship_to_url,
    canonicalReport.company.archetype,
    canonicalReport.company.company_brief,
    canonicalReport.company.business_model,
    canonicalReport.company.customer_type,
    canonicalReport.company.industry,
    canonicalReport.company.sector,
    canonicalReport.company.offerings,
    canonicalReport.executive_summary.summary,
    canonicalReport.executive_summary.why_now,
    canonicalReport.executive_summary.strategic_takeaway,
    canonicalReport.ai_maturity_signals.maturity_summary,
    ...canonicalReport.fact_base.map((fact) => fact.statement),
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ");
}

function companyContextSupportsSellerWorkflow(canonicalReport: CanonicalAccountAtlasReport) {
  const businessContext = buildCompanyContextText(canonicalReport);

  return SELLER_WORKFLOW_BUSINESS_SUPPORT_PATTERNS.some((pattern) => pattern.test(businessContext));
}

function chooseGroundedFallbackCitations(
  canonicalReport: CanonicalAccountAtlasReport,
  sourceRegistry: Map<number, SourceRegistryEntry>,
) {
  const prioritized = [
    ...canonicalReport.company.citations,
    ...canonicalReport.executive_summary.citations,
    ...canonicalReport.fact_base.flatMap((fact) => fact.citations),
    ...canonicalReport.ai_maturity_signals.citations,
    ...canonicalReport.ai_maturity_signals.regulatory_sensitivity.citations,
  ];
  const nonTransient = prioritized.filter((citation) => {
    const source = sourceRegistry.get(citation.source_id);
    return source ? !isTransientOperationalSource(source) : false;
  });
  const selected = dedupeCitations(nonTransient.length > 0 ? nonTransient : prioritized);

  return selected.slice(0, 4);
}

function buildResponseDebugMetadata(response: RetrievedBackgroundResponse) {
  return {
    model: response.rawResponse.model,
    status: response.status,
    completedAt: response.rawResponse.completedAt,
    usage: response.rawResponse.usage,
    webSearchSources: response.webSearchSources,
    fileSearchResults: response.fileSearchResults.map((result) => ({
      fileId: result.fileId,
      filename: result.filename,
      score: result.score,
    })),
    error: response.rawResponse.error,
    incompleteDetails: response.rawResponse.incompleteDetails,
  } satisfies Record<string, unknown>;
}

function getIncompleteResponseReason(response: RetrievedBackgroundResponse) {
  const incompleteDetails = response.rawResponse.incompleteDetails;

  if (!incompleteDetails || typeof incompleteDetails !== "object") {
    return null;
  }

  const reason = (incompleteDetails as { reason?: unknown }).reason;

  return reason === "max_output_tokens" || reason === "content_filter" ? reason : null;
}

function buildIncompleteResponseMessage(response: RetrievedBackgroundResponse) {
  switch (getIncompleteResponseReason(response)) {
    case "max_output_tokens":
      return "The background response hit the max output token limit before the saved brief finished.";
    case "content_filter":
      return "The background response was stopped by content filtering before the saved brief finished.";
    default:
      return "The background response ended before the saved brief finished.";
  }
}

async function persistOpenAIState(
  repository: ReportRepository,
  input: Parameters<NonNullable<ReportRepository["setRunOpenAIState"]>>[0],
) {
  if (!repository.setRunOpenAIState) {
    return;
  }

  await repository.setRunOpenAIState(input);
}

function requireClientMethod<T>(
  method: T | undefined,
  methodName: "createBackgroundStructuredOutput" | "retrieveBackgroundResponse",
) {
  if (!method) {
    throw new Error(`OpenAI client does not support ${methodName}.`);
  }

  return method;
}

function buildRunningPipelineState(startedAt: Date) {
  const state = createInitialPipelineState();
  const startedAtIso = startedAt.toISOString();

  state.currentStepKey = "generate_account_plan";
  state.steps.normalize_target = {
    ...state.steps.normalize_target,
    status: "completed",
    attemptCount: 1,
    startedAt: startedAtIso,
    completedAt: startedAtIso,
    lastAttemptedAt: startedAtIso,
    lastDeliveryCount: 1,
  };
  state.steps.generate_account_plan = {
    ...state.steps.generate_account_plan,
    status: "running",
    attemptCount: 1,
    startedAt: startedAtIso,
    completedAt: null,
    lastAttemptedAt: startedAtIso,
    lastDeliveryCount: 1,
  };

  return state;
}

function buildCompletedPipelineState(existingState: PersistedRun["pipelineState"], completedAt: Date) {
  const state = normalizePipelineState(existingState);
  const completedAtIso = completedAt.toISOString();
  const startedAtIso = state.steps.generate_account_plan.startedAt ?? completedAtIso;

  for (const key of [
    "normalize_target",
    "crawl_company_site",
    "resolve_company_entity",
    "build_fact_base",
    "generate_account_plan",
    "enrich_external_sources",
    "finalize_report",
  ] as const) {
    state.steps[key] = {
      ...state.steps[key],
      status: "completed",
      attemptCount: Math.max(1, state.steps[key].attemptCount),
      startedAt: state.steps[key].startedAt ?? startedAtIso,
      completedAt: completedAtIso,
      lastAttemptedAt: completedAtIso,
      lastDeliveryCount: 1,
      errorCode: null,
      errorMessage: null,
      fallbackApplied: false,
      retryExhausted: false,
    };
  }

  state.currentStepKey = null;

  return state;
}

function buildFailedPipelineState(input: {
  existingState: PersistedRun["pipelineState"];
  failedAt: Date;
  errorCode: string;
  errorMessage: string;
}) {
  const state = normalizePipelineState(input.existingState);
  const failedAtIso = input.failedAt.toISOString();
  const startedAtIso = state.steps.generate_account_plan.startedAt ?? failedAtIso;

  state.currentStepKey = "generate_account_plan";
  state.steps.normalize_target = {
    ...state.steps.normalize_target,
    status: "completed",
    attemptCount: Math.max(1, state.steps.normalize_target.attemptCount),
    startedAt: state.steps.normalize_target.startedAt ?? startedAtIso,
    completedAt: state.steps.normalize_target.completedAt ?? startedAtIso,
    lastAttemptedAt: failedAtIso,
    lastDeliveryCount: 1,
  };
  state.steps.generate_account_plan = {
    ...state.steps.generate_account_plan,
    status: "failed",
    attemptCount: Math.max(1, state.steps.generate_account_plan.attemptCount),
    startedAt: state.steps.generate_account_plan.startedAt ?? startedAtIso,
    completedAt: null,
    lastAttemptedAt: failedAtIso,
    lastDeliveryCount: 1,
    errorCode: input.errorCode,
    errorMessage: input.errorMessage,
    fallbackApplied: false,
    retryExhausted: true,
  };

  return state;
}

function buildCancelledPipelineState(existingState: PersistedRun["pipelineState"], cancelledAt: Date) {
  const state = normalizePipelineState(existingState);
  const cancelledAtIso = cancelledAt.toISOString();
  const startedAtIso = state.steps.generate_account_plan.startedAt ?? cancelledAtIso;

  state.currentStepKey = null;
  state.steps.generate_account_plan = {
    ...state.steps.generate_account_plan,
    status: "failed",
    attemptCount: Math.max(1, state.steps.generate_account_plan.attemptCount),
    startedAt: state.steps.generate_account_plan.startedAt ?? startedAtIso,
    completedAt: null,
    lastAttemptedAt: cancelledAtIso,
    lastDeliveryCount: 1,
    errorCode: "OPENAI_RESPONSE_CANCELLED",
    errorMessage: "The background response was cancelled before the report completed.",
    fallbackApplied: false,
    retryExhausted: true,
  };

  return state;
}

function normalizeSourceRegistry(report: CanonicalAccountAtlasReport) {
  return report.sources.map((source) => {
    const normalizedUrl = normalizePublicHttpUrl(source.url);

    return {
      ...source,
      normalized_url: normalizedUrl,
      canonical_domain: extractCanonicalDomain(normalizedUrl),
    } satisfies SourceRegistryEntry;
  });
}

function collectCitationSourceIds(value: unknown): number[] {
  if (Array.isArray(value)) {
    return uniqueNumberList(value.flatMap((entry) => collectCitationSourceIds(entry)));
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  const record = value as Record<string, unknown>;
  const ownId = typeof record.source_id === "number" ? [record.source_id] : [];

  return uniqueNumberList([
    ...ownId,
    ...Object.values(record).flatMap((entry) => collectCitationSourceIds(entry)),
  ]);
}

function validateCanonicalReport(input: {
  canonicalReport: CanonicalAccountAtlasReport;
  expectedCanonicalDomain: string;
  expectedCompanyUrl: string;
}) {
  const sourceIds = input.canonicalReport.sources.map((source) => source.source_id);
  const sourceIdSet = new Set<number>(sourceIds);

  if (sourceIdSet.size !== sourceIds.length) {
    return {
      ok: false,
      code: "CANONICAL_REPORT_DUPLICATE_SOURCE_IDS",
      message: "The canonical report returned duplicate source registry IDs.",
    } satisfies PublishSafetyResult;
  }

  const referencedSourceIds = collectCitationSourceIds(input.canonicalReport);

  if (referencedSourceIds.some((sourceId) => !sourceIdSet.has(sourceId))) {
    return {
      ok: false,
      code: "CANONICAL_REPORT_INVALID_CITATIONS",
      message: "The canonical report referenced source IDs that were not present in the source registry.",
    } satisfies PublishSafetyResult;
  }

  const expectedDomain = normalizeCanonicalDomain(input.expectedCanonicalDomain);
  const metadataDomain = normalizeCanonicalDomain(input.canonicalReport.report_metadata.canonical_domain);
  const companyDomain = normalizeCanonicalDomain(input.canonicalReport.company.canonical_domain);

  if (!relateDomains(expectedDomain, metadataDomain) && !relateDomains(expectedDomain, companyDomain)) {
    return {
      ok: false,
      code: "CANONICAL_REPORT_DOMAIN_MISMATCH",
      message: `The canonical report resolved a different company domain (${metadataDomain}) than the requested target (${expectedDomain}).`,
    } satisfies PublishSafetyResult;
  }

  if (
    extractCanonicalDomain(input.canonicalReport.report_metadata.normalized_company_url) !== expectedDomain ||
    extractCanonicalDomain(input.canonicalReport.report_metadata.company_url) !== expectedDomain
  ) {
    return {
      ok: false,
      code: "CANONICAL_REPORT_URL_MISMATCH",
      message: "The canonical report metadata did not stay anchored to the requested company URL.",
    } satisfies PublishSafetyResult;
  }

  if (
    input.canonicalReport.report_metadata.schema_name !== CANONICAL_ACCOUNT_ATLAS_REPORT_SCHEMA_NAME ||
    input.canonicalReport.report_metadata.schema_version !== CANONICAL_ACCOUNT_ATLAS_REPORT_SCHEMA_VERSION
  ) {
    return {
      ok: false,
      code: "CANONICAL_REPORT_SCHEMA_MISMATCH",
      message: "The canonical report used an unexpected schema identifier or version.",
    } satisfies PublishSafetyResult;
  }

  if (
    input.canonicalReport.report_metadata.report_mode === "grounded_fallback" &&
    !input.canonicalReport.grounded_fallback
  ) {
    return {
      ok: false,
      code: "CANONICAL_REPORT_FALLBACK_MISSING",
      message: "The canonical report declared grounded fallback mode without grounded fallback content.",
    } satisfies PublishSafetyResult;
  }

  return {
    ok: true,
  } satisfies PublishSafetyResult;
}

function evaluateThinPublishSafety(input: {
  canonicalReport: CanonicalAccountAtlasReport;
  expectedCanonicalDomain: string;
}) {
  const sourceRegistry = new Map<number, SourceRegistryEntry>(
    normalizeSourceRegistry(input.canonicalReport).map((source) => [source.source_id, source]),
  );
  const issues: ThinPublishSafetyIssue[] = [];
  const expectedDomain = normalizeCanonicalDomain(input.expectedCanonicalDomain);
  const identitySourceIds = uniqueNumberList([
    ...input.canonicalReport.company.citations.map((citation) => citation.source_id),
    ...input.canonicalReport.executive_summary.citations.map((citation) => citation.source_id),
  ]);
  const hasCanonicalIdentitySupport = identitySourceIds.some((sourceId) => {
    const source = sourceRegistry.get(sourceId);
    return source ? relateDomains(source.canonical_domain, expectedDomain) : false;
  });

  if (!hasCanonicalIdentitySupport) {
    issues.push({
      code: "COMPANY_IDENTITY_UNSUPPORTED",
      message: `The company identity was not clearly supported by sources anchored to ${expectedDomain}.`,
      sourceIds: identitySourceIds,
    });
  }

  const missingCitationSections = uniqueStringList([
    input.canonicalReport.company.citations.length === 0 ? "company context" : null,
    input.canonicalReport.executive_summary.citations.length === 0 ? "executive summary" : null,
    input.canonicalReport.recommended_motion.citations.length === 0 ? "recommended motion" : null,
    input.canonicalReport.top_opportunities.some((opportunity) => opportunity.citations.length === 0)
      ? "top opportunities"
      : null,
    input.canonicalReport.buying_map.stakeholder_hypotheses.some((stakeholder) => stakeholder.citations.length === 0)
      ? "stakeholder hypotheses"
      : null,
    input.canonicalReport.buying_map.likely_objections.some((item) => item.citations.length === 0)
      ? "objections"
      : null,
    input.canonicalReport.buying_map.discovery_questions.some((item) => item.citations.length === 0)
      ? "discovery questions"
      : null,
    input.canonicalReport.pilot_plan && input.canonicalReport.pilot_plan.citations.length === 0 ? "pilot plan" : null,
    (input.canonicalReport.expansion_scenarios.low && input.canonicalReport.expansion_scenarios.low.citations.length === 0) ||
    (input.canonicalReport.expansion_scenarios.base &&
      input.canonicalReport.expansion_scenarios.base.citations.length === 0) ||
    (input.canonicalReport.expansion_scenarios.high &&
      input.canonicalReport.expansion_scenarios.high.citations.length === 0)
      ? "expansion scenarios"
      : null,
    input.canonicalReport.report_metadata.report_mode === "grounded_fallback" &&
    !input.canonicalReport.grounded_fallback?.citations.length
      ? "grounded fallback summary"
      : null,
  ]);

  if (missingCitationSections.length > 0) {
    issues.push({
      code: "VISIBLE_CLAIMS_MISSING_CITATIONS",
      message: `Visible report sections were missing supporting citations: ${missingCitationSections.join(", ")}.`,
      sourceIds: [],
    });
  }

  if (!companyContextSupportsSellerWorkflow(input.canonicalReport)) {
    const flaggedOpportunities = input.canonicalReport.top_opportunities.filter((opportunity) => {
      const workflowText = [
        opportunity.workflow_name,
        opportunity.summary,
        opportunity.pain_point,
        opportunity.why_now,
        opportunity.expected_outcome,
        opportunity.motion_rationale,
      ].join(" ");

      return collectSellerWorkflowPatternHits(workflowText).length > 0;
    });
    const topOpportunityOffTarget =
      input.canonicalReport.top_opportunities.length > 0 &&
      flaggedOpportunities.some(
        (opportunity) => opportunity.priority_rank === input.canonicalReport.top_opportunities[0]?.priority_rank,
      );

    if (
      flaggedOpportunities.length > 0 &&
      (topOpportunityOffTarget || flaggedOpportunities.length >= Math.ceil(input.canonicalReport.top_opportunities.length / 2))
    ) {
      issues.push({
        code: "OFF_TARGET_OPPORTUNITIES",
        message:
          "The top opportunities focused on seller-side or internal account-planning workflows instead of the target company's own business workflows.",
        sourceIds: uniqueNumberList(flaggedOpportunities.flatMap((opportunity) => opportunity.citations.map((citation) => citation.source_id))),
      });
    }
  }

  const transientOpportunitySourceIds = input.canonicalReport.top_opportunities
    .filter((opportunity) => citationsAreTransientOnly(opportunity.citations, sourceRegistry))
    .flatMap((opportunity) => opportunity.citations.map((citation) => citation.source_id));
  const transientOpportunityCount =
    transientOpportunitySourceIds.length === 0
      ? 0
      : input.canonicalReport.top_opportunities.filter((opportunity) =>
          citationsAreTransientOnly(opportunity.citations, sourceRegistry),
        ).length;
  const transientMotion = citationsAreTransientOnly(input.canonicalReport.recommended_motion.citations, sourceRegistry);
  const transientSummary = citationsAreTransientOnly(input.canonicalReport.executive_summary.citations, sourceRegistry);

  if (
    (input.canonicalReport.top_opportunities.length > 0 &&
      transientOpportunityCount >= Math.ceil(input.canonicalReport.top_opportunities.length / 2)) ||
    (transientMotion && transientOpportunityCount > 0) ||
    (transientSummary && transientMotion)
  ) {
    issues.push({
      code: "TRANSIENT_SIGNALS_DOMINATE",
      message:
        "Transient maintenance or outage signals dominated the visible recommendations, so the report was downgraded to a grounded brief.",
      sourceIds: uniqueNumberList([
        ...transientOpportunitySourceIds,
        ...(transientMotion ? input.canonicalReport.recommended_motion.citations.map((citation) => citation.source_id) : []),
        ...(transientSummary ? input.canonicalReport.executive_summary.citations.map((citation) => citation.source_id) : []),
      ]),
    });
  }

  return {
    ok: issues.length === 0,
    issues,
  } satisfies ThinPublishSafetyEvaluation;
}

function buildGroundedFallbackCanonicalReport(input: {
  canonicalReport: CanonicalAccountAtlasReport;
  safetyEvaluation: ThinPublishSafetyEvaluation;
}) {
  const sourceRegistry = new Map<number, SourceRegistryEntry>(
    normalizeSourceRegistry(input.canonicalReport).map((source) => [source.source_id, source]),
  );
  const fallbackCitations =
    chooseGroundedFallbackCitations(input.canonicalReport, sourceRegistry).length > 0
      ? chooseGroundedFallbackCitations(input.canonicalReport, sourceRegistry)
      : dedupeCitations(input.canonicalReport.company.citations).slice(0, 4);
  const safetyReason = truncateText(
    uniqueStringList(input.safetyEvaluation.issues.map((issue) => issue.message)).join(" "),
    420,
  );
  const fallbackSummary =
    buildCompactParagraph(
      [
        input.canonicalReport.company.company_brief,
        citationsHaveNonTransientSupport(input.canonicalReport.executive_summary.citations, sourceRegistry)
          ? input.canonicalReport.executive_summary.why_now
          : null,
      ],
      420,
    ) || input.canonicalReport.company.company_brief;
  const opportunityHypothesisNote = truncateText(
    buildCompactParagraph(
      [
        `Directional opportunities were withheld because ${safetyReason.charAt(0).toLowerCase()}${safetyReason.slice(1)}`,
        "Use the grounded company context and citations below to confirm one specific business workflow before recommending workspace, API platform, or hybrid.",
      ],
      420,
    ) ||
      "Directional opportunities were withheld until stronger company-specific evidence is available.",
    420,
  );
  const fallbackFactBase = input.canonicalReport.fact_base
    .filter((fact) => {
      const factText = `${fact.statement} ${fact.why_it_matters ?? ""}`;
      return (
        fact.citations.length > 0 &&
        !citationsAreTransientOnly(fact.citations, sourceRegistry) &&
        collectSellerWorkflowPatternHits(factText).length === 0
      );
    })
    .slice(0, 6);
  const fallbackNotableSignals = input.canonicalReport.ai_maturity_signals.notable_signals
    .filter(
      (signal) =>
        signal.citations.length > 0 &&
        !citationsAreTransientOnly(signal.citations, sourceRegistry) &&
        collectSellerWorkflowPatternHits(signal.summary).length === 0,
    )
    .slice(0, 4);
  const stableSectionCoverage = new Set([
    "company-brief",
    ...(fallbackFactBase.length > 0 ? (["fact-base"] as const) : []),
    ...(fallbackNotableSignals.length > 0 ? (["ai-maturity-signals"] as const) : []),
  ]);

  return {
    ...input.canonicalReport,
    report_metadata: {
      ...input.canonicalReport.report_metadata,
      report_mode: "grounded_fallback",
    },
    executive_summary: {
      summary: fallbackSummary,
      why_now:
        citationsHaveNonTransientSupport(input.canonicalReport.executive_summary.citations, sourceRegistry) &&
        collectSellerWorkflowPatternHits(
          `${input.canonicalReport.executive_summary.why_now} ${input.canonicalReport.executive_summary.strategic_takeaway}`,
        ).length === 0
          ? input.canonicalReport.executive_summary.why_now
          : "Public evidence supports a grounded company snapshot, but stronger workflow-specific evidence is still needed before ranking opportunities.",
      strategic_takeaway:
        "Use this grounded brief to confirm a specific business owner, workflow, and evidence base before choosing workspace, API platform, or hybrid.",
      citations: fallbackCitations,
    },
    fact_base: fallbackFactBase,
    ai_maturity_signals: {
      ...input.canonicalReport.ai_maturity_signals,
      maturity_summary:
        citationsHaveNonTransientSupport(input.canonicalReport.ai_maturity_signals.citations, sourceRegistry) &&
        collectSellerWorkflowPatternHits(input.canonicalReport.ai_maturity_signals.maturity_summary).length === 0
          ? input.canonicalReport.ai_maturity_signals.maturity_summary
          : "Public evidence supports only a limited AI-maturity read; stronger company-specific workflow evidence is still needed for directional recommendations.",
      notable_signals: fallbackNotableSignals,
      citations: citationsHaveNonTransientSupport(input.canonicalReport.ai_maturity_signals.citations, sourceRegistry)
        ? input.canonicalReport.ai_maturity_signals.citations
        : fallbackCitations,
      regulatory_sensitivity: {
        ...input.canonicalReport.ai_maturity_signals.regulatory_sensitivity,
        citations: citationsHaveNonTransientSupport(
          input.canonicalReport.ai_maturity_signals.regulatory_sensitivity.citations,
          sourceRegistry,
        )
          ? input.canonicalReport.ai_maturity_signals.regulatory_sensitivity.citations
          : fallbackCitations,
      },
    },
    recommended_motion: {
      recommended_motion: "undetermined",
      rationale:
        "Public evidence confirms the company context, but it does not yet support a directional workspace, API platform, or hybrid recommendation with enough confidence to publish as a full report.",
      deployment_shape: null,
      citations: fallbackCitations,
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
        confidence_band: "low",
        confidence_score: Math.min(input.canonicalReport.evidence_coverage.overall_confidence.confidence_score, 48),
        rationale: truncateText(
          `The publish safety check kept the grounded company context but downgraded the report because ${safetyReason.charAt(0).toLowerCase()}${safetyReason.slice(1)}`,
          420,
        ),
      },
      overall_coverage: {
        coverage_level: stableSectionCoverage.size >= 2 ? "usable" : "thin",
        coverage_score: stableSectionCoverage.size >= 2 ? 56 : 42,
        rationale:
          stableSectionCoverage.size >= 2
            ? "The company snapshot remains usable, but directional opportunity sections were withheld until stronger evidence is available."
            : "Only a thin grounded company snapshot cleared the publish safety check.",
      },
      research_completeness_score: Math.min(input.canonicalReport.evidence_coverage.research_completeness_score, 58),
      thin_evidence: true,
      evidence_gaps: uniqueStringList([
        ...input.canonicalReport.evidence_coverage.evidence_gaps,
        ...input.safetyEvaluation.issues.map((issue) => issue.message),
        "Directional opportunity ranking was withheld until stronger company-specific evidence is available.",
      ]).slice(0, 12),
      section_coverage: input.canonicalReport.evidence_coverage.section_coverage.map((entry) => {
        if (stableSectionCoverage.has(entry.section)) {
          return {
            ...entry,
            citations:
              entry.section === "company-brief"
                ? fallbackCitations
                : entry.section === "ai-maturity-signals"
                  ? citationsHaveNonTransientSupport(input.canonicalReport.ai_maturity_signals.citations, sourceRegistry)
                    ? input.canonicalReport.ai_maturity_signals.citations
                    : fallbackCitations
                  : entry.citations,
          };
        }

        return {
          ...entry,
          coverage: {
            coverage_level: "thin",
            coverage_score: Math.min(entry.coverage.coverage_score, 35),
            rationale: "This section was withheld or reduced after the publish safety check to keep the report grounded.",
          },
          confidence: {
            confidence_band: "low",
            confidence_score: Math.min(entry.confidence.confidence_score, 40),
            rationale: "This section did not clear the thin publish safety check for a full account plan.",
          },
          citations: fallbackCitations,
        };
      }),
    },
    confidence_notes: [
      {
        level: "warning",
        related_sections: [
          "prioritized-use-cases",
          "recommended-motion",
          "stakeholder-hypotheses",
          "pilot-plan",
          "expansion-scenarios",
        ],
        note: truncateText(
          "Account Atlas published a grounded fallback brief because the opportunity and motion sections did not clear the thin publish safety check.",
          420,
        ),
        citations: fallbackCitations,
      },
    ],
    grounded_fallback: {
      reason: safetyReason,
      summary: fallbackSummary,
      opportunity_hypothesis_note: opportunityHypothesisNote,
      citations: fallbackCitations,
    },
  } satisfies CanonicalAccountAtlasReport;
}

function buildResearchSummary(input: {
  canonicalReport: CanonicalAccountAtlasReport;
  sourceIdMap: Map<number, number>;
  sourceRegistry: SourceRegistryEntry[];
}) {
  const companyBriefSection =
    input.canonicalReport.evidence_coverage.section_coverage.find((section) => section.section === "company-brief") ??
    null;
  const allSourceIds = uniqueNumberList(input.sourceRegistry.map((source) => input.sourceIdMap.get(source.source_id)));

  const researchSummary: ResearchSummary = {
    companyIdentity: {
      canonicalDomain:
        normalizeCanonicalDomain(input.canonicalReport.company.canonical_domain) ||
        normalizeCanonicalDomain(input.canonicalReport.report_metadata.canonical_domain),
      companyName: input.canonicalReport.company.resolved_name,
      relationshipToCanonicalDomain: input.canonicalReport.company.relationship_to_url,
      archetype: input.canonicalReport.company.archetype,
      businessModel: input.canonicalReport.company.business_model,
      customerType: input.canonicalReport.company.customer_type,
      offerings: input.canonicalReport.company.offerings,
      sector: input.canonicalReport.company.sector,
      industry: input.canonicalReport.company.industry,
      publicCompany: input.canonicalReport.company.public_company,
      headquarters: input.canonicalReport.company.headquarters,
      confidence: companyBriefSection?.confidence.confidence_score,
      sourceIds: citationSourceIds(input.canonicalReport.company.citations, input.sourceIdMap),
    },
    growthPriorities: uniqueStringList([
      input.canonicalReport.executive_summary.why_now,
      input.canonicalReport.executive_summary.strategic_takeaway,
      ...input.canonicalReport.top_opportunities.slice(0, 3).map((opportunity) => opportunity.why_now),
    ]).map((summary) => ({
      summary,
      sourceIds: uniqueNumberList([
        ...citationSourceIds(input.canonicalReport.executive_summary.citations, input.sourceIdMap),
        ...input.canonicalReport.top_opportunities
          .filter((opportunity) => opportunity.why_now === summary)
          .flatMap((opportunity) => citationSourceIds(opportunity.citations, input.sourceIdMap)),
      ]),
    })),
    aiMaturityEstimate: {
      level: input.canonicalReport.ai_maturity_signals.maturity_level,
      rationale: input.canonicalReport.ai_maturity_signals.maturity_summary,
      sourceIds: citationSourceIds(input.canonicalReport.ai_maturity_signals.citations, input.sourceIdMap),
    },
    regulatorySensitivity: {
      level: input.canonicalReport.ai_maturity_signals.regulatory_sensitivity.level,
      rationale: input.canonicalReport.ai_maturity_signals.regulatory_sensitivity.rationale,
      sourceIds: citationSourceIds(
        input.canonicalReport.ai_maturity_signals.regulatory_sensitivity.citations,
        input.sourceIdMap,
      ),
    },
    notableProductSignals: input.canonicalReport.ai_maturity_signals.notable_signals.map((signal) => ({
      summary: signal.summary,
      sourceIds: citationSourceIds(signal.citations, input.sourceIdMap),
    })),
    notableHiringSignals: [],
    notableTrustSignals: [],
    complaintThemes: [],
    leadershipSocialThemes: [],
    researchCompletenessScore: input.canonicalReport.evidence_coverage.research_completeness_score,
    confidenceBySection: input.canonicalReport.evidence_coverage.section_coverage.map((entry) => ({
      section: entry.section,
      confidence: entry.confidence.confidence_score,
      rationale: entry.confidence.rationale,
    })),
    evidenceGaps: uniqueStringList([
      ...input.canonicalReport.evidence_coverage.evidence_gaps,
      ...input.canonicalReport.confidence_notes
        .filter((note) => note.level === "warning")
        .map((note) => note.note),
    ]),
    overallConfidence: input.canonicalReport.evidence_coverage.overall_confidence.confidence_band,
    sourceIds: allSourceIds,
  };

  return researchSummary;
}

function buildUseCase(
  opportunity: CanonicalOpportunityCard,
  sourceIdMap: Map<number, number>,
): AccountPlanUseCase {
  return {
    priorityRank: opportunity.priority_rank,
    department: opportunity.department,
    workflowName: opportunity.workflow_name,
    summary: opportunity.summary,
    painPoint: opportunity.pain_point,
    whyNow: opportunity.why_now,
    likelyUsers: opportunity.likely_users,
    expectedOutcome: opportunity.expected_outcome,
    metrics: opportunity.success_metrics,
    dependencies: opportunity.dependencies,
    securityComplianceNotes: opportunity.security_compliance_notes,
    recommendedMotion: opportunity.recommended_motion,
    motionRationale: opportunity.motion_rationale,
    evidenceSourceIds: citationSourceIds(opportunity.citations, sourceIdMap),
    openQuestions: opportunity.open_questions,
    scorecard: buildCanonicalOpportunityScorecard(opportunity),
  };
}

function buildPilotPlan(
  canonicalReport: CanonicalAccountAtlasReport,
  sourceIdMap: Map<number, number>,
): PilotPlan | null {
  if (!canonicalReport.pilot_plan) {
    return null;
  }

  return {
    objective: canonicalReport.pilot_plan.objective,
    recommendedMotion: canonicalReport.pilot_plan.recommended_motion,
    scope: canonicalReport.pilot_plan.scope,
    successMetrics: canonicalReport.pilot_plan.success_metrics,
    phases: canonicalReport.pilot_plan.phases.map((phase) => ({
      name: phase.name,
      duration: phase.duration,
      goals: phase.goals,
      deliverables: phase.deliverables,
    })),
    dependencies: canonicalReport.pilot_plan.dependencies,
    risks: canonicalReport.pilot_plan.risks,
    evidenceSourceIds: citationSourceIds(canonicalReport.pilot_plan.citations, sourceIdMap),
  };
}

function buildAccountPlan(input: {
  canonicalReport: CanonicalAccountAtlasReport;
  sourceIdMap: Map<number, number>;
}) {
  const sortedOpportunities = [...input.canonicalReport.top_opportunities].sort(
    (left, right) => left.priority_rank - right.priority_rank,
  );
  const candidateUseCases = sortedOpportunities.map((opportunity) => buildUseCase(opportunity, input.sourceIdMap));
  const topUseCases = candidateUseCases.slice(0, 3);
  const accountPlan: FinalAccountPlan = {
    publishMode:
      input.canonicalReport.report_metadata.report_mode === "grounded_fallback" ? "grounded_fallback" : "full",
    groundedFallbackBrief: input.canonicalReport.grounded_fallback
      ? {
          summary: input.canonicalReport.grounded_fallback.summary,
          sourceIds: citationSourceIds(input.canonicalReport.grounded_fallback.citations, input.sourceIdMap),
          opportunityHypothesisNote: input.canonicalReport.grounded_fallback.opportunity_hypothesis_note,
        }
      : null,
    overallAccountMotion: {
      recommendedMotion: input.canonicalReport.recommended_motion.recommended_motion,
      rationale: input.canonicalReport.recommended_motion.rationale,
      evidenceSourceIds: citationSourceIds(input.canonicalReport.recommended_motion.citations, input.sourceIdMap),
    },
    candidateUseCases,
    topUseCases,
    stakeholderHypotheses: input.canonicalReport.buying_map.stakeholder_hypotheses.map((stakeholder) => ({
      likelyRole: stakeholder.likely_role,
      department: stakeholder.department,
      hypothesis: stakeholder.hypothesis,
      rationale: stakeholder.rationale,
      confidence: stakeholder.confidence.confidence_score,
      evidenceSourceIds: citationSourceIds(stakeholder.citations, input.sourceIdMap),
    })) satisfies StakeholderHypothesis[],
    objectionsAndRebuttals: input.canonicalReport.buying_map.likely_objections.map((item) => ({
      objection: item.objection,
      rebuttal: item.rebuttal,
      evidenceSourceIds: citationSourceIds(item.citations, input.sourceIdMap),
    })),
    discoveryQuestions: input.canonicalReport.buying_map.discovery_questions.map((item) => ({
      question: item.question,
      whyItMatters: item.why_it_matters,
      evidenceSourceIds: citationSourceIds(item.citations, input.sourceIdMap),
    })),
    pilotPlan: buildPilotPlan(input.canonicalReport, input.sourceIdMap),
    expansionScenarios: {
      low: input.canonicalReport.expansion_scenarios.low
        ? {
            summary: input.canonicalReport.expansion_scenarios.low.summary,
            assumptions: input.canonicalReport.expansion_scenarios.low.assumptions,
            expectedOutcomes: input.canonicalReport.expansion_scenarios.low.expected_outcomes,
            evidenceSourceIds: citationSourceIds(input.canonicalReport.expansion_scenarios.low.citations, input.sourceIdMap),
          }
        : null,
      base: input.canonicalReport.expansion_scenarios.base
        ? {
            summary: input.canonicalReport.expansion_scenarios.base.summary,
            assumptions: input.canonicalReport.expansion_scenarios.base.assumptions,
            expectedOutcomes: input.canonicalReport.expansion_scenarios.base.expected_outcomes,
            evidenceSourceIds: citationSourceIds(
              input.canonicalReport.expansion_scenarios.base.citations,
              input.sourceIdMap,
            ),
          }
        : null,
      high: input.canonicalReport.expansion_scenarios.high
        ? {
            summary: input.canonicalReport.expansion_scenarios.high.summary,
            assumptions: input.canonicalReport.expansion_scenarios.high.assumptions,
            expectedOutcomes: input.canonicalReport.expansion_scenarios.high.expected_outcomes,
            evidenceSourceIds: citationSourceIds(
              input.canonicalReport.expansion_scenarios.high.citations,
              input.sourceIdMap,
            ),
          }
        : null,
    },
  };

  return accountPlan;
}

function deriveFreshness(citations: CanonicalReportCitation[], sourceRegistry: Map<number, SourceRegistryEntry>) {
  const timestamps = citations
    .map((citation) => sourceRegistry.get(citation.source_id)?.published_at)
    .filter((value): value is string => Boolean(value))
    .map((value) => Date.parse(value))
    .filter((value) => Number.isFinite(value));

  if (!timestamps.length) {
    return "unknown" as const;
  }

  const newest = Math.max(...timestamps);
  const ageDays = (Date.now() - newest) / (24 * 60 * 60 * 1000);

  if (ageDays <= 30) {
    return "current" as const;
  }

  if (ageDays <= 365) {
    return "recent" as const;
  }

  return "stale" as const;
}

function buildPersistedFacts(input: {
  canonicalReport: CanonicalAccountAtlasReport;
  sourceIdMap: Map<number, number>;
  sourceRegistry: Map<number, SourceRegistryEntry>;
}) {
  const facts: PersistedFactRecord[] = [
    {
      section: "company-brief",
      classification: "fact",
      claim: input.canonicalReport.company.company_brief,
      rationale: input.canonicalReport.company.relationship_to_url,
      confidence:
        input.canonicalReport.evidence_coverage.section_coverage.find((entry) => entry.section === "company-brief")
          ?.confidence.confidence_score ?? 70,
      freshness: deriveFreshness(input.canonicalReport.company.citations, input.sourceRegistry),
      sentiment: "neutral",
      relevance: 92,
      evidenceSnippet: firstCitationSupport(input.canonicalReport.company.citations),
      sourceIds: citationSourceIds(input.canonicalReport.company.citations, input.sourceIdMap),
    },
    ...input.canonicalReport.fact_base.map((fact) => ({
      section: "fact-base" as const,
      classification: fact.classification,
      claim: fact.statement,
      rationale: fact.why_it_matters,
      confidence: fact.confidence.confidence_score,
      freshness: deriveFreshness(fact.citations, input.sourceRegistry),
      sentiment: "neutral" as const,
      relevance: 90,
      evidenceSnippet: firstCitationSupport(fact.citations),
      sourceIds: citationSourceIds(fact.citations, input.sourceIdMap),
    })),
    ...input.canonicalReport.ai_maturity_signals.notable_signals.map((signal) => ({
      section: "ai-maturity-signals" as const,
      classification: "inference" as const,
      claim: signal.summary,
      rationale: input.canonicalReport.ai_maturity_signals.maturity_summary,
      confidence:
        input.canonicalReport.evidence_coverage.section_coverage.find((entry) => entry.section === "ai-maturity-signals")
          ?.confidence.confidence_score ?? input.canonicalReport.evidence_coverage.overall_confidence.confidence_score,
      freshness: deriveFreshness(signal.citations, input.sourceRegistry),
      sentiment: "neutral" as const,
      relevance: 84,
      evidenceSnippet: firstCitationSupport(signal.citations),
      sourceIds: citationSourceIds(signal.citations, input.sourceIdMap),
    })),
    {
      section: "recommended-motion",
      classification: "inference",
      claim: input.canonicalReport.recommended_motion.rationale,
      rationale: input.canonicalReport.recommended_motion.deployment_shape,
      confidence:
        input.canonicalReport.evidence_coverage.section_coverage.find((entry) => entry.section === "recommended-motion")
          ?.confidence.confidence_score ?? input.canonicalReport.evidence_coverage.overall_confidence.confidence_score,
      freshness: deriveFreshness(input.canonicalReport.recommended_motion.citations, input.sourceRegistry),
      sentiment: "neutral",
      relevance: 88,
      evidenceSnippet: firstCitationSupport(input.canonicalReport.recommended_motion.citations),
      sourceIds: citationSourceIds(input.canonicalReport.recommended_motion.citations, input.sourceIdMap),
    },
  ];

  return facts.filter((fact) => fact.sourceIds.length > 0);
}

function publishStatusFromCoverage(input: { canonicalReport: CanonicalAccountAtlasReport }) {
  const groundedFallback = input.canonicalReport.report_metadata.report_mode === "grounded_fallback";
  const limitedCoverage =
    groundedFallback ||
    input.canonicalReport.evidence_coverage.thin_evidence ||
    input.canonicalReport.evidence_coverage.overall_coverage.coverage_level !== "strong";

  return {
    reportStatus: limitedCoverage ? "ready_with_limited_coverage" : "ready",
    statusMessage: groundedFallback
      ? `The deep research background job completed with a grounded company brief for ${input.canonicalReport.company.resolved_name}.`
      : limitedCoverage
        ? "The deep research background job completed with a source-backed account brief and limited coverage in some sections."
        : "The deep research background job completed with a source-backed account plan.",
  } as const;
}

async function persistCanonicalReportMaterialization(input: {
  repository: ReportRepository;
  report: PersistedReport;
  run: PersistedRun;
  canonicalReport: CanonicalAccountAtlasReport;
  rawOutputText: string;
  responseMetadata: Record<string, unknown>;
}) {
  const sourceRegistry = normalizeSourceRegistry(input.canonicalReport);
  const sourceIdMap = new Map<number, number>();
  const publishedOutputText = JSON.stringify(input.canonicalReport);

  for (const source of sourceRegistry) {
    const stored = await input.repository.upsertCrawledSource({
      reportId: input.report.id,
      runId: input.run.id,
      url: source.url,
      normalizedUrl: source.normalized_url,
      canonicalUrl: source.normalized_url,
      canonicalDomain: source.canonical_domain,
      title: source.title,
      sourceType: source.source_type,
      sourceTier: source.source_tier,
      mimeType: source.url.toLowerCase().endsWith(".pdf") ? "application/pdf" : "text/html",
      publishedAt: parseNullableDate(source.published_at),
      retrievedAt: parseNullableDate(source.retrieved_at) ?? new Date(),
      textContent: source.summary,
      storagePointers: {
        summary: source.summary,
        publisher: source.publisher,
        canonicalSourceId: source.source_id,
      },
    });

    sourceIdMap.set(source.source_id, stored.source.id);
  }

  const sourceRegistryMap = new Map<number, SourceRegistryEntry>(sourceRegistry.map((source) => [source.source_id, source]));
  const researchSummary = buildResearchSummary({
    canonicalReport: input.canonicalReport,
    sourceIdMap,
    sourceRegistry,
  });
  const accountPlan = buildAccountPlan({
    canonicalReport: input.canonicalReport,
    sourceIdMap,
  });
  const facts = buildPersistedFacts({
    canonicalReport: input.canonicalReport,
    sourceIdMap,
    sourceRegistry: sourceRegistryMap,
  });

  await persistOpenAIState(input.repository, {
    reportId: input.report.id,
    runId: input.run.id,
    openaiOutputText: input.rawOutputText,
    canonicalReport: input.canonicalReport,
    openaiResponseMetadata: input.responseMetadata,
  });
  await input.repository.updateRunResearchSummary({
    reportId: input.report.id,
    runId: input.run.id,
    researchSummary,
    companyName: researchSummary.companyIdentity.companyName,
  });
  await input.repository.updateRunAccountPlan({
    reportId: input.report.id,
    runId: input.run.id,
    accountPlan,
  });
  await input.repository.replaceFactsForRun({
    reportId: input.report.id,
    runId: input.run.id,
    facts,
  });
  await input.repository.replaceUseCasesForRun({
    reportId: input.report.id,
    runId: input.run.id,
    useCases: accountPlan.candidateUseCases,
  });
  await input.repository.replaceStakeholdersForRun({
    reportId: input.report.id,
    runId: input.run.id,
    stakeholders: accountPlan.stakeholderHypotheses,
  });
  await input.repository.upsertArtifact({
    reportId: input.report.id,
    runId: input.run.id,
    artifactType: "structured_json",
    mimeType: "application/json; charset=utf-8",
    fileName: STRUCTURED_JSON_ARTIFACT_FILE_NAME,
    storagePointers: {
      storageMode: "inline_text",
      inlineText: publishedOutputText,
    },
    contentHash: createHash("sha256").update(publishedOutputText).digest("hex"),
    sizeBytes: Buffer.byteLength(publishedOutputText, "utf8"),
  });

  return {
    researchSummary,
    accountPlan,
  };
}

async function failRun(input: {
  repository: ReportRepository;
  report: PersistedReport;
  run: PersistedRun;
  errorCode: string;
  errorMessage: string;
  pipelineState?: StoredPipelineState;
}) {
  const failedAt = new Date();
  const pipelineState =
    input.pipelineState ??
    buildFailedPipelineState({
      existingState: input.run.pipelineState,
      failedAt,
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
    });

  await input.repository.updateRunStepState({
    reportId: input.report.id,
    runId: input.run.id,
    status: "failed",
    stepKey: "generate_account_plan",
    progressPercent: getDeepResearchProgressPercentForResponseStatus(input.run.openaiResponseStatus),
    statusMessage: input.errorMessage,
    executionMode: input.run.executionMode,
    pipelineState,
    queueMessageId: input.run.queueMessageId,
    startedAt: input.run.startedAt ?? failedAt,
    failedAt,
    errorCode: input.errorCode,
    errorMessage: input.errorMessage,
    reportStatus: "failed",
    reportFailedAt: failedAt,
  });
  await input.repository.appendRunEvent({
    reportId: input.report.id,
    runId: input.run.id,
    level: "error",
    eventType: "deep_research.failed",
    stepKey: "generate_account_plan",
    message: input.errorMessage,
    metadata: {
      errorCode: input.errorCode,
    },
  });
}

async function cancelRun(input: {
  repository: ReportRepository;
  report: PersistedReport;
  run: PersistedRun;
}) {
  const cancelledAt = new Date();

  await input.repository.updateRunStepState({
    reportId: input.report.id,
    runId: input.run.id,
    status: "cancelled",
    stepKey: null,
    progressPercent: getDeepResearchProgressPercentForResponseStatus(input.run.openaiResponseStatus),
    statusMessage: "The deep research background job was cancelled.",
    executionMode: input.run.executionMode,
    pipelineState: buildCancelledPipelineState(input.run.pipelineState, cancelledAt),
    queueMessageId: input.run.queueMessageId,
    startedAt: input.run.startedAt ?? cancelledAt,
    failedAt: cancelledAt,
    errorCode: "OPENAI_RESPONSE_CANCELLED",
    errorMessage: "The background response was cancelled before the report completed.",
    reportStatus: "failed",
    reportFailedAt: cancelledAt,
  });
  await input.repository.appendRunEvent({
    reportId: input.report.id,
    runId: input.run.id,
    level: "error",
    eventType: "deep_research.cancelled",
    stepKey: "generate_account_plan",
    message: "The deep research background response was cancelled.",
  });
}

export function createDeepResearchReportGenerationService(
  dependencies: DeepResearchReportGenerationServiceDependencies = {},
): DeepResearchReportGenerationService {
  const repository = dependencies.repository ?? drizzleReportRepository;
  const openAIClient = dependencies.openAIClient ?? createOpenAIResearchClient();

  return {
    async startReportRun(input) {
      const startedAt = new Date();
      const pipelineState = buildRunningPipelineState(startedAt);

      await repository.updateRunStepState({
        reportId: input.report.id,
        runId: input.run.id,
        status: "synthesizing",
        stepKey: "generate_account_plan",
        progressPercent: 0,
        statusMessage: STATUS_MESSAGE_STARTED,
        executionMode: "inline" satisfies PipelineExecutionMode,
        pipelineState,
        queueMessageId: null,
        startedAt,
        reportStatus: "running",
      });

      await repository.appendRunEvent({
        reportId: input.report.id,
        runId: input.run.id,
        level: "info",
        eventType: "deep_research.started",
        stepKey: "generate_account_plan",
        message: STATUS_MESSAGE_STARTED,
      });

      try {
        const prompt = buildCanonicalDeepResearchPrompt({
          companyUrl: input.report.normalizedInputUrl,
          preflight: {
            normalizedCompanyUrl: input.report.normalizedInputUrl,
            canonicalDomain: input.report.canonicalDomain,
            companyNameHint: input.report.companyName,
            currentDate: new Date().toISOString(),
          },
        });
        const createBackgroundStructuredOutput = requireClientMethod(
          openAIClient.createBackgroundStructuredOutput,
          "createBackgroundStructuredOutput",
        );
        const response = await createBackgroundStructuredOutput({
          model: OPENAI_SYNTHESIS_MODEL,
          instructions: `${prompt.systemPrompt}\n\n${prompt.developerPrompt}`,
          input: prompt.input,
          schema: canonicalAccountAtlasReportSchema,
          schemaName: CANONICAL_ACCOUNT_ATLAS_REPORT_SCHEMA_NAME,
          tools: [WEB_SEARCH_TOOL],
          include: ["web_search_call.action.sources"],
          metadata: {
            share_id: input.report.shareId,
            report_id: String(input.report.id),
            run_id: String(input.run.id),
            canonical_domain: input.report.canonicalDomain,
            generation_path: "single_deep_research",
          },
          // Large structured reports need room for both reasoning and the final JSON payload.
          maxOutputTokens: DEEP_RESEARCH_MAX_OUTPUT_TOKENS,
          timeoutMs: CREATE_TIMEOUT_MS,
          maxAttempts: 1,
        });

        await persistOpenAIState(repository, {
          reportId: input.report.id,
          runId: input.run.id,
          openaiResponseId: response.responseId,
          openaiResponseStatus: response.status,
          openaiResponseMetadata: buildResponseDebugMetadata(response),
          statusMessage: response.status === "queued" ? STATUS_MESSAGE_QUEUED : STATUS_MESSAGE_RUNNING,
        });

        logServerEvent("info", "deep_research.started", {
          shareId: input.report.shareId,
          runId: input.run.id,
          responseId: response.responseId,
          responseStatus: response.status,
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "The deep research background job could not be started.";

        await failRun({
          repository,
          report: input.report,
          run: input.run,
          errorCode: "DEEP_RESEARCH_START_FAILED",
          errorMessage,
          pipelineState: buildFailedPipelineState({
            existingState: pipelineState,
            failedAt: new Date(),
            errorCode: "DEEP_RESEARCH_START_FAILED",
            errorMessage,
          }),
        });

        throw error;
      }
    },

    async syncReportRun(input) {
      const shell = input.shell ?? (await repository.findReportShellByShareId(input.shareId));

      if (!shell?.currentRun?.openaiResponseId) {
        return shell;
      }

      if (
        shell.currentRun.status === "completed" ||
        shell.currentRun.status === "failed" ||
        shell.currentRun.status === "cancelled"
      ) {
        return shell;
      }

      const retrieveBackgroundResponse = requireClientMethod(
        openAIClient.retrieveBackgroundResponse,
        "retrieveBackgroundResponse",
      );
      const response = await retrieveBackgroundResponse({
        responseId: shell.currentRun.openaiResponseId,
        include: ["web_search_call.action.sources"],
        timeoutMs: RETRIEVE_TIMEOUT_MS,
        maxAttempts: 1,
      });
      const responseMetadata = buildResponseDebugMetadata(response);

      await persistOpenAIState(repository, {
        reportId: shell.report.id,
        runId: shell.currentRun.id,
        openaiResponseStatus: response.status,
        openaiResponseMetadata: responseMetadata,
      });

      if (!response.status) {
        return repository.findReportShellByShareId(input.shareId);
      }

      if (response.status === "queued" || response.status === "in_progress") {
        await repository.updateRunStepState({
          reportId: shell.report.id,
          runId: shell.currentRun.id,
          status: "synthesizing",
          stepKey: "generate_account_plan",
          progressPercent: getDeepResearchProgressPercentForResponseStatus(response.status),
          statusMessage: response.status === "queued" ? STATUS_MESSAGE_QUEUED : STATUS_MESSAGE_RUNNING,
          executionMode: shell.currentRun.executionMode,
          pipelineState: normalizePipelineState(shell.currentRun.pipelineState),
          queueMessageId: shell.currentRun.queueMessageId,
          startedAt: shell.currentRun.startedAt ?? new Date(),
          reportStatus: "running",
        });

        return repository.findReportShellByShareId(input.shareId);
      }

      if (response.status === "cancelled") {
        await cancelRun({
          repository,
          report: shell.report,
          run: shell.currentRun,
        });

        return repository.findReportShellByShareId(input.shareId);
      }

      if (response.status === "failed" || response.status === "incomplete") {
        if (response.status === "incomplete") {
          logServerEvent("warn", "deep_research.incomplete", {
            shareId: shell.report.shareId,
            runId: shell.currentRun.id,
            responseId: response.responseId,
            incompleteReason: getIncompleteResponseReason(response),
            incompleteDetails: response.rawResponse.incompleteDetails,
            usage: response.rawResponse.usage,
          });
        }

        const errorMessage =
          typeof response.rawResponse.error === "object" &&
          response.rawResponse.error &&
          "message" in (response.rawResponse.error as Record<string, unknown>) &&
          typeof (response.rawResponse.error as Record<string, unknown>).message === "string"
            ? ((response.rawResponse.error as Record<string, unknown>).message as string)
            : response.status === "incomplete"
              ? buildIncompleteResponseMessage(response)
              : "The background response failed before the saved brief finished.";

        await failRun({
          repository,
          report: shell.report,
          run: shell.currentRun,
          errorCode: response.status === "incomplete" ? "OPENAI_RESPONSE_INCOMPLETE" : "OPENAI_RESPONSE_FAILED",
          errorMessage,
        });

        return repository.findReportShellByShareId(input.shareId);
      }

      try {
        const parsed = canonicalAccountAtlasReportSchema.parse(JSON.parse(response.outputText));
        const structuralSafety = validateCanonicalReport({
          canonicalReport: parsed,
          expectedCanonicalDomain: shell.report.canonicalDomain,
          expectedCompanyUrl: shell.report.normalizedInputUrl,
        });

        if (!structuralSafety.ok) {
          await failRun({
            repository,
            report: shell.report,
            run: shell.currentRun,
            errorCode: structuralSafety.code,
            errorMessage: structuralSafety.message,
          });

          return repository.findReportShellByShareId(input.shareId);
        }

        const thinSafety = evaluateThinPublishSafety({
          canonicalReport: parsed,
          expectedCanonicalDomain: shell.report.canonicalDomain,
        });
        const publishedCanonicalReport = thinSafety.ok
          ? parsed
          : buildGroundedFallbackCanonicalReport({
              canonicalReport: parsed,
              safetyEvaluation: thinSafety,
            });
        const persistedResponseMetadata = {
          ...responseMetadata,
          publishSafety: {
            outcome: thinSafety.ok ? "published_direct" : "grounded_fallback",
            publishedReportMode: publishedCanonicalReport.report_metadata.report_mode,
            issues: thinSafety.issues.map((issue) => ({
              code: issue.code,
              message: issue.message,
              sourceIds: issue.sourceIds,
            })),
          },
        } satisfies Record<string, unknown>;

        const materialized = await persistCanonicalReportMaterialization({
          repository,
          report: shell.report,
          run: shell.currentRun,
          canonicalReport: publishedCanonicalReport,
          rawOutputText: response.outputText,
          responseMetadata: persistedResponseMetadata,
        });
        const publishStatus = publishStatusFromCoverage({
          canonicalReport: publishedCanonicalReport,
        });

        const completedAt = new Date();

        await repository.updateRunStepState({
          reportId: shell.report.id,
          runId: shell.currentRun.id,
          status: "completed",
          stepKey: null,
          progressPercent: 100,
          statusMessage: publishStatus.statusMessage,
          executionMode: shell.currentRun.executionMode,
          pipelineState: buildCompletedPipelineState(shell.currentRun.pipelineState, completedAt),
          queueMessageId: shell.currentRun.queueMessageId,
          startedAt: shell.currentRun.startedAt ?? completedAt,
          completedAt,
          reportStatus: publishStatus.reportStatus,
          reportCompletedAt: completedAt,
        });
        await repository.appendRunEvent({
          reportId: shell.report.id,
          runId: shell.currentRun.id,
          level: publishStatus.reportStatus === "ready_with_limited_coverage" ? "warning" : "info",
          eventType: "deep_research.completed",
          stepKey: "finalize_report",
          message: publishStatus.statusMessage,
          metadata: {
            publishMode: materialized.accountPlan.publishMode ?? "full",
            reportStatus: publishStatus.reportStatus,
            safetyDowngraded: !thinSafety.ok,
            safetyIssueCodes: thinSafety.issues.map((issue) => issue.code),
            responseId: shell.currentRun.openaiResponseId,
          },
        });

        logServerEvent(
          publishStatus.reportStatus === "ready_with_limited_coverage" ? "warn" : "info",
          "deep_research.completed",
          {
            shareId: shell.report.shareId,
            runId: shell.currentRun.id,
            reportStatus: publishStatus.reportStatus,
            responseId: shell.currentRun.openaiResponseId,
          },
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "The canonical report could not be parsed or persisted.";

        await failRun({
          repository,
          report: shell.report,
          run: shell.currentRun,
          errorCode: "CANONICAL_REPORT_PARSE_FAILED",
          errorMessage,
        });
      }

      return repository.findReportShellByShareId(input.shareId);
    },
  };
}
