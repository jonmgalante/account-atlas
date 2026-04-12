import "server-only";

import type {
  AccountPlanUseCase,
  DiscoveryQuestion,
  ExpansionScenario,
  FinalAccountPlan,
  GroundedFallbackBrief,
  ObjectionAndRebuttal,
  PilotPlan,
  StakeholderHypothesis,
} from "@/lib/types/account-plan";
import {
  evaluatePublishableReport,
  formatMinimumViableRequirement,
  formatOptionalCoverageGap,
} from "@/lib/report-completion";
import type { FactPacket } from "@/lib/types/research";
import { normalizeCanonicalDomain, normalizePublicHttpUrl } from "@/lib/url";
import type { ReportRepository, StoredRunContext } from "@/server/repositories/report-repository";
import { drizzleReportRepository } from "@/server/repositories/report-repository";
import { OPENAI_SYNTHESIS_MODEL } from "@/server/openai/models";
import {
  createOpenAIResearchClient,
  type OpenAIResearchClient,
  type ParsedStructuredResponse,
} from "@/server/openai/client";
import { logServerEvent } from "@/server/observability/logger";
import { recordPipelineEvent } from "@/server/pipeline/pipeline-observability";
import {
  collectSellerWorkflowPatternHits,
  companyBusinessSupportsSellerWorkflow,
  evaluateReportQualityInvariants,
  isTransientOperationalSource,
  useCaseMatchesBusinessContext,
} from "@/server/quality/report-quality";
import { buildFactPacket, buildSynthesisFactPacketPrompt, parseFactPacketArtifact } from "@/server/research/fact-packet";
import { normalizeUseCaseScorecard, rankAccountPlanUseCases } from "@/server/account-plan/scoring";
import {
  type AccountPlanNarrativeOutput,
  type AccountPlanQualityGateOutput,
  type CandidateUseCaseGenerationOutput,
  accountPlanQualityGateSchema,
  accountPlanNarrativeSchema,
  accountPlanTargetedSourceSearchSchema,
  candidateUseCaseGenerationSchema,
} from "@/server/account-plan/schemas";

type AccountPlanServiceDependencies = {
  repository?: ReportRepository;
  openAIClient?: OpenAIResearchClient;
};

const ACCOUNT_PLAN_USE_CASE_TIMEOUT_MS = 150_000;
const ACCOUNT_PLAN_NARRATIVE_TIMEOUT_MS = 75_000;
const ACCOUNT_PLAN_QUALITY_GATE_TIMEOUT_MS = 45_000;
const ACCOUNT_PLAN_TARGETED_SOURCE_TIMEOUT_MS = 60_000;
const ACCOUNT_PLAN_OPENAI_MAX_ATTEMPTS = 1;
const ACCOUNT_PLAN_QUALITY_GATE_MAX_ATTEMPTS = 2;
const GROUNDED_FALLBACK_USE_CASE_MIN_EVIDENCE_CONFIDENCE = 72;

const WEB_SEARCH_TOOL = {
  type: "web_search",
  search_context_size: "high",
  user_location: {
    type: "approximate",
    country: "US",
    timezone: "America/New_York",
  },
} as const;

function compactJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function normalizeStringArray(values: string[]) {
  const deduped = new Set<string>();
  const normalized: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();

    if (!trimmed) {
      continue;
    }

    const key = trimmed.toLowerCase();

    if (deduped.has(key)) {
      continue;
    }

    deduped.add(key);
    normalized.push(trimmed);
  }

  return normalized;
}

function sanitizeSourceIds(sourceIds: number[], validSourceIds: Set<number>) {
  return [...new Set(sourceIds.filter((sourceId) => validSourceIds.has(sourceId)))];
}

type QualityGateSectionKey = AccountPlanQualityGateOutput["sections"][number]["section"];
type QualityGateIssueCode = AccountPlanQualityGateOutput["sections"][number]["issueCodes"][number];

type GenerationRetryNotes = {
  attempt: number;
  guidance: string[];
  sellerPatternHits: string[];
  failedSections: QualityGateSectionKey[];
};

type PublishQualityGateResult = {
  outcome: AccountPlanQualityGateOutput;
  failedSections: QualityGateSectionKey[];
  issueCodes: QualityGateIssueCode[];
  sellerPatternHits: string[];
};

function applyTransientOperationalGuardrail(
  useCases: AccountPlanUseCase[],
  sourceRegistry: FactPacket["sourceRegistry"],
) {
  const sourceById = new Map(sourceRegistry.map((source) => [source.sourceId, source]));
  const downweightedWorkflowNames: string[] = [];

  const adjustedUseCases = useCases.map((useCase) => {
    const evidenceSources = useCase.evidenceSourceIds
      .map((sourceId) => sourceById.get(sourceId))
      .filter((source): source is NonNullable<typeof source> => Boolean(source));
    const transientSources = evidenceSources.filter(isTransientOperationalSource);

    if (transientSources.length === 0) {
      return useCase;
    }

    const stableSources = evidenceSources.filter((source) => !isTransientOperationalSource(source));

    if (stableSources.length >= transientSources.length) {
      return useCase;
    }

    downweightedWorkflowNames.push(useCase.workflowName);

    return {
      ...useCase,
      scorecard: normalizeUseCaseScorecard({
        ...useCase.scorecard,
        businessValue: useCase.scorecard.businessValue - (stableSources.length === 0 ? 32 : 8),
        deploymentReadiness: useCase.scorecard.deploymentReadiness - (stableSources.length === 0 ? 18 : 4),
        expansionPotential: useCase.scorecard.expansionPotential - (stableSources.length === 0 ? 42 : 10),
        openaiFit: useCase.scorecard.openaiFit - (stableSources.length === 0 ? 14 : 0),
        sponsorLikelihood: useCase.scorecard.sponsorLikelihood - (stableSources.length === 0 ? 26 : 6),
        evidenceConfidence: useCase.scorecard.evidenceConfidence - (stableSources.length === 0 ? 62 : 18),
        riskPenalty: useCase.scorecard.riskPenalty + (stableSources.length === 0 ? 48 : 12),
      }),
    };
  });

  return {
    adjustedUseCases,
    downweightedWorkflowNames,
  };
}

function parseNullableDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp) : null;
}

function applySelfReferenceSuppression(
  useCases: AccountPlanUseCase[],
  factPacket: FactPacket,
) {
  if (companyBusinessSupportsSellerWorkflow(factPacket)) {
    return {
      adjustedUseCases: useCases,
      downweightedWorkflowNames: [] as string[],
      sellerPatternHits: [] as string[],
    };
  }

  const downweightedWorkflowNames: string[] = [];
  const sellerPatternHits = new Set<string>();

  const adjustedUseCases = useCases.map((useCase) => {
    const workflowHits = collectSellerWorkflowPatternHits(
      [
        useCase.workflowName,
        useCase.summary,
        useCase.painPoint,
        useCase.whyNow,
        useCase.expectedOutcome,
        useCase.motionRationale,
      ].join(" "),
    );

    if (workflowHits.length === 0) {
      return useCase;
    }

    downweightedWorkflowNames.push(useCase.workflowName);
    workflowHits.forEach((hit) => sellerPatternHits.add(hit));

    return {
      ...useCase,
      scorecard: normalizeUseCaseScorecard({
        ...useCase.scorecard,
        businessValue: useCase.scorecard.businessValue - 28,
        deploymentReadiness: useCase.scorecard.deploymentReadiness - 14,
        expansionPotential: useCase.scorecard.expansionPotential - 32,
        openaiFit: useCase.scorecard.openaiFit - 24,
        sponsorLikelihood: useCase.scorecard.sponsorLikelihood - 20,
        evidenceConfidence: useCase.scorecard.evidenceConfidence - 34,
        riskPenalty: useCase.scorecard.riskPenalty + 26,
      }),
    };
  });

  return {
    adjustedUseCases,
    downweightedWorkflowNames,
    sellerPatternHits: [...sellerPatternHits],
  };
}

function buildExecutiveSummarySnapshot(
  factPacket: FactPacket,
  topUseCases: AccountPlanUseCase[],
  overallAccountMotion: FinalAccountPlan["overallAccountMotion"],
) {
  const topOpportunity = topUseCases[0] ?? null;

  return {
    companyName: factPacket.companyIdentity.companyName,
    businessContext:
      factPacket.companyProfile.companyDescription.value ??
      factPacket.companyProfile.productsServices.value ??
      factPacket.companyIdentity.offerings ??
      factPacket.companyIdentity.industry ??
      factPacket.companyIdentity.sector,
    recommendedMotion: overallAccountMotion.recommendedMotion,
    motionRationale: overallAccountMotion.rationale,
    topOpportunity: topOpportunity
      ? {
          workflowName: topOpportunity.workflowName,
          summary: topOpportunity.summary,
          painPoint: topOpportunity.painPoint,
          expectedOutcome: topOpportunity.expectedOutcome,
          evidenceSourceIds: topOpportunity.evidenceSourceIds,
        }
      : null,
    evidenceGaps: factPacket.evidenceGaps.slice(0, 3),
  };
}

function buildQualityGatePrompt(input: {
  context: StoredRunContext;
  factPacket: FactPacket;
  topUseCases: AccountPlanUseCase[];
  overallAccountMotion: FinalAccountPlan["overallAccountMotion"];
  sellerPatternHits: string[];
}) {
  return compactJson({
    companyUrl: input.context.report.normalizedInputUrl,
    canonicalDomain: input.context.report.canonicalDomain,
    companyIdentity: input.factPacket.companyIdentity,
    companyProfile: input.factPacket.companyProfile,
    sectionCoverage: input.factPacket.sectionCoverage,
    evidenceGaps: input.factPacket.evidenceGaps,
    citationRegistry: input.factPacket.sourceRegistry,
    executiveSummary: buildExecutiveSummarySnapshot(
      input.factPacket,
      input.topUseCases,
      input.overallAccountMotion,
    ),
    motionRecommendation: input.overallAccountMotion,
    topOpportunities: input.topUseCases.map((useCase) => ({
      priorityRank: useCase.priorityRank,
      department: useCase.department,
      workflowName: useCase.workflowName,
      summary: useCase.summary,
      painPoint: useCase.painPoint,
      whyNow: useCase.whyNow,
      expectedOutcome: useCase.expectedOutcome,
      motionRationale: useCase.motionRationale,
      evidenceSourceIds: useCase.evidenceSourceIds,
    })),
    deterministicGuardrails: {
      sellerWorkflowBusinessSupported: companyBusinessSupportsSellerWorkflow(input.factPacket),
      sellerPatternHits: input.sellerPatternHits,
      transientOperationalSignals:
        "Treat maintenance pages, outage/status incidents, and temporary site errors as weak evidence unless corroborated by stable non-incident sources.",
    },
    reviewQuestions: [
      "Does each section clearly match the resolved company identity?",
      "Does it fit the resolved industry, offerings, operating model, and customer type?",
      "Are the cited source IDs plausibly supportive given the fact packet and citation registry?",
      "Does any section accidentally describe internal seller workflow tooling instead of a company-specific opportunity?",
      "Does any section appear overfit to temporary maintenance or outage signals?",
    ],
  });
}

function buildTargetedSupportingSourcePrompt(input: {
  context: StoredRunContext;
  factPacket: FactPacket;
  qualityGate: PublishQualityGateResult;
}) {
  return compactJson({
    companyUrl: input.context.report.normalizedInputUrl,
    canonicalDomain: input.context.report.canonicalDomain,
    companyIdentity: input.factPacket.companyIdentity,
    companyProfile: input.factPacket.companyProfile,
    currentTopOpportunities: input.qualityGate.outcome.sections
      .filter((section) => section.section === "top_opportunities" || section.section === "executive_summary")
      .map((section) => ({
        section: section.section,
        summary: section.summary,
        targetedSourceFocus: section.targetedSourceFocus,
      })),
    searchGoals: [
      "Find authoritative public sources that better ground the target company's real business, products or services, operating model, customers, and current public signals.",
      "Prioritize official homepage, about/company, offerings, parent or investor, and newsroom sources when they exist.",
      "Use reputable public sources only when official sources do not sufficiently cover the failed sections.",
    ],
    failedSections: input.qualityGate.outcome.sections
      .filter((section) => section.status === "fail")
      .map((section) => ({
        section: section.section,
        summary: section.summary,
        issueCodes: section.issueCodes,
        targetedSourceFocus: section.targetedSourceFocus,
      })),
    returnRules: [
      "Return only URLs supported by the web search tool in this response.",
      "Do not return maintenance, outage, or status-only pages unless they are directly relevant to the target company business.",
      "Prefer primary official sources over commentary.",
    ],
  });
}

function buildRetryNotes(qualityGate: PublishQualityGateResult, attempt: number): GenerationRetryNotes {
  const guidance = qualityGate.outcome.sections
    .filter((section) => section.status === "fail")
    .flatMap((section) => {
      const notes = [`${section.section}: ${section.summary}`];

      if (section.targetedSourceFocus.length > 0) {
        notes.push(`${section.section} evidence focus: ${section.targetedSourceFocus.join(", ")}`);
      }

      return notes;
    });

  return {
    attempt,
    guidance,
    sellerPatternHits: qualityGate.sellerPatternHits,
    failedSections: qualityGate.failedSections,
  };
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
    sourceType: FactPacket["sourceRegistry"][number]["sourceType"];
    sourceTier: FactPacket["sourceRegistry"][number]["sourceTier"];
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
        discoveredBy: "account_plan_quality_gate",
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

function buildCandidateUseCasePrompt(
  context: StoredRunContext,
  factPacket: FactPacket,
  retryNotes?: GenerationRetryNotes,
) {
  return compactJson({
    companyUrl: context.report.normalizedInputUrl,
    canonicalDomain: context.report.canonicalDomain,
    companyName: factPacket.companyIdentity.companyName,
    factPacket: buildSynthesisFactPacketPrompt(factPacket),
    fixedTaxonomy: [
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
    ],
    scoringRubric: {
      businessValue: "Commercial or operational upside if solved well.",
      deploymentReadiness: "How feasible a near-term pilot is with public evidence and likely dependencies.",
      expansionPotential: "How likely the use case expands into broader platform or multi-team usage.",
      openaiFit: "How strongly OpenAI workspace, API platform, or hybrid offerings fit the workflow.",
      sponsorLikelihood: "How likely a credible executive or functional sponsor exists.",
      evidenceConfidence: "How well the recommendation is supported by known sources.",
      riskPenalty: "Security, compliance, change-management, or implementation risk that should reduce priority.",
    },
    requirements: {
      useCaseCount: "Prefer 12 to 15 candidate use cases, but return at least 3 evidence-backed options when public evidence is thin.",
      evidenceRule: "Every use case must cite one or more valid source IDs from the fact packet citation registry.",
      tone: "Prefer practical, measurable use cases first. Keep uncertainty explicit when evidence is thin.",
      grounding:
        "Ground every opportunity in the structured company profile and evidence entries from the fact packet. If some profile fields are missing, narrow the list to the strongest company-specific evidence instead of defaulting to generic seller-tooling or horizontal productivity language.",
      selfReferenceSuppression:
        "Heavily penalize seller/account-planning/account-intelligence tooling ideas unless the fact packet clearly shows the company sells that business. Do not default to internal seller workflow recommendations for companies whose business is something else.",
      transientOperationalSignals:
        "Treat temporary outages, maintenance pages, CDN/server errors, or brief site inaccessibility as low-weight unless corroborated by stable non-incident evidence.",
    },
    retryNotes:
      retryNotes && retryNotes.guidance.length > 0
        ? {
            attempt: retryNotes.attempt,
            failedSections: retryNotes.failedSections,
            sellerPatternHits: retryNotes.sellerPatternHits,
            guidance: retryNotes.guidance,
          }
        : null,
  });
}

function buildAccountPlanNarrativePrompt(
  context: StoredRunContext,
  factPacket: FactPacket,
  rankedUseCases: AccountPlanUseCase[],
  retryNotes?: GenerationRetryNotes,
) {
  return compactJson({
    companyUrl: context.report.normalizedInputUrl,
    canonicalDomain: context.report.canonicalDomain,
    companyName: factPacket.companyIdentity.companyName,
    factPacket: buildSynthesisFactPacketPrompt(factPacket),
    candidateUseCases: rankedUseCases,
    topUseCases: rankedUseCases.slice(0, 3),
    requirements: {
      overallMotion: "Recommend exactly one of workspace, api_platform, or hybrid for the overall account.",
      stakeholders: "Return stakeholder hypotheses, not asserted named people.",
      uncertainty: "When evidence is thin, state that clearly in rationale, open questions, and pilot scope.",
      grounding:
        "Use the structured company profile and fact-packet evidence as the grounding layer for summaries, motion, objections, and pilot framing. If profile fields are missing, stay anchored to the known company business rather than falling back to generic seller-tooling language.",
      selfReferenceSuppression:
        "Do not summarize the account as a seller workflow, account-intelligence, or account-planning tooling opportunity unless the fact packet clearly shows the company sells that business.",
      transientOperationalSignals:
        "Do not let temporary outages, maintenance pages, CDN/server errors, or brief site inaccessibility dominate top opportunities or the overall motion unless corroborated by stable non-incident evidence.",
    },
    retryNotes:
      retryNotes && retryNotes.guidance.length > 0
        ? {
            attempt: retryNotes.attempt,
            failedSections: retryNotes.failedSections,
            sellerPatternHits: retryNotes.sellerPatternHits,
            guidance: retryNotes.guidance,
          }
        : null,
  });
}

async function appendStructuredDebugEvent(
  repository: ReportRepository,
  context: StoredRunContext,
  eventType: string,
  response: ParsedStructuredResponse<unknown>,
) {
  await repository.appendRunEvent({
    reportId: context.report.id,
    runId: context.run.id,
    level: "info",
    eventType,
    stepKey: "generate_account_plan",
    message: `${eventType} completed with OpenAI response ${response.responseId}.`,
    metadata: {
      responseId: response.responseId,
      parsed: response.parsed,
      outputText: response.outputText,
      fileSearchResults: response.fileSearchResults,
      webSearchSources: response.webSearchSources,
    },
  });
}

async function loadFactPacket(
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

  if (!sources.length || !facts.length) {
    throw new Error("Account-plan generation requires a persisted fact packet or enough facts and sources to rebuild one.");
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

function sanitizeCandidateUseCases(
  useCases: CandidateUseCaseGenerationOutput["useCases"],
  validSourceIds: Set<number>,
  factPacket: FactPacket,
) {
  const deduped = new Set<string>();
  const normalized: AccountPlanUseCase[] = [];

  for (const useCase of useCases) {
    const workflowName = useCase.workflowName.trim();
    const summary = useCase.summary.trim();
    const painPoint = useCase.painPoint.trim();
    const whyNow = useCase.whyNow.trim();
    const expectedOutcome = useCase.expectedOutcome.trim();
    const motionRationale = useCase.motionRationale.trim();
    const evidenceSourceIds = sanitizeSourceIds(useCase.evidenceSourceIds, validSourceIds);
    const likelyUsers = normalizeStringArray(useCase.likelyUsers);
    const metrics = normalizeStringArray(useCase.metrics);
    const dependencies = normalizeStringArray(useCase.dependencies);
    const securityComplianceNotes = normalizeStringArray(useCase.securityComplianceNotes);
    const openQuestions = normalizeStringArray(useCase.openQuestions);

    if (!workflowName || !summary || !painPoint || !whyNow || !expectedOutcome || !motionRationale) {
      continue;
    }

    if (!evidenceSourceIds.length || !likelyUsers.length || !metrics.length || !openQuestions.length) {
      continue;
    }

    const dedupeKey = `${useCase.department}:${workflowName.toLowerCase()}`;

    if (deduped.has(dedupeKey)) {
      continue;
    }

    deduped.add(dedupeKey);
    normalized.push({
      priorityRank: 0,
      department: useCase.department,
      workflowName,
      summary,
      painPoint,
      whyNow,
      likelyUsers,
      expectedOutcome,
      metrics,
      dependencies,
      securityComplianceNotes,
      recommendedMotion: useCase.recommendedMotion,
      motionRationale,
      evidenceSourceIds,
      openQuestions,
      scorecard: normalizeUseCaseScorecard(useCase.scorecard),
    });
  }

  if (normalized.length < 3 || normalized.length > 15) {
    throw new Error(`Account-plan candidate generation returned ${normalized.length} valid use cases after validation.`);
  }

  const transientAdjustment = applyTransientOperationalGuardrail(normalized, factPacket.sourceRegistry);
  const selfReferenceAdjustment = applySelfReferenceSuppression(transientAdjustment.adjustedUseCases, factPacket);

  return {
    rankedUseCases: rankAccountPlanUseCases(selfReferenceAdjustment.adjustedUseCases),
    transientDownweightedWorkflowNames: transientAdjustment.downweightedWorkflowNames,
    sellerWorkflowDownweightedWorkflowNames: selfReferenceAdjustment.downweightedWorkflowNames,
    sellerPatternHits: selfReferenceAdjustment.sellerPatternHits,
  };
}

function sanitizeStakeholderHypotheses(
  hypotheses: StakeholderHypothesis[],
  validSourceIds: Set<number>,
) {
  const normalized = hypotheses
    .map((hypothesis) => ({
      likelyRole: hypothesis.likelyRole.trim(),
      department: hypothesis.department?.trim() || null,
      hypothesis: hypothesis.hypothesis.trim(),
      rationale: hypothesis.rationale.trim(),
      confidence: Math.min(100, Math.max(0, Math.round(hypothesis.confidence))),
      evidenceSourceIds: sanitizeSourceIds(hypothesis.evidenceSourceIds, validSourceIds),
    }))
    .filter(
      (hypothesis) =>
        Boolean(hypothesis.likelyRole) &&
        Boolean(hypothesis.hypothesis) &&
        Boolean(hypothesis.rationale) &&
        hypothesis.evidenceSourceIds.length > 0,
    );

  if (normalized.length < 3) {
    throw new Error("Account-plan stakeholder synthesis returned too few valid stakeholder hypotheses.");
  }

  return normalized;
}

function sanitizeObjectionsAndRebuttals(
  objections: ObjectionAndRebuttal[],
  validSourceIds: Set<number>,
) {
  return objections
    .map((item) => ({
      objection: item.objection.trim(),
      rebuttal: item.rebuttal.trim(),
      evidenceSourceIds: sanitizeSourceIds(item.evidenceSourceIds, validSourceIds),
    }))
    .filter((item) => item.objection && item.rebuttal && item.evidenceSourceIds.length > 0);
}

function sanitizeDiscoveryQuestions(
  questions: DiscoveryQuestion[],
  validSourceIds: Set<number>,
) {
  return questions
    .map((item) => ({
      question: item.question.trim(),
      whyItMatters: item.whyItMatters.trim(),
      evidenceSourceIds: sanitizeSourceIds(item.evidenceSourceIds, validSourceIds),
    }))
    .filter((item) => item.question && item.whyItMatters && item.evidenceSourceIds.length > 0);
}

function sanitizePilotPlan(
  pilotPlan: AccountPlanNarrativeOutput["pilotPlan"],
  validSourceIds: Set<number>,
): PilotPlan | null {
  if (!pilotPlan) {
    return null;
  }

  const normalizedPilotPlan = {
    objective: pilotPlan.objective.trim(),
    recommendedMotion: pilotPlan.recommendedMotion,
    scope: pilotPlan.scope.trim(),
    successMetrics: normalizeStringArray(pilotPlan.successMetrics),
    phases: pilotPlan.phases.map((phase) => ({
      name: phase.name.trim(),
      duration: phase.duration.trim(),
      goals: normalizeStringArray(phase.goals),
      deliverables: normalizeStringArray(phase.deliverables),
    })),
    dependencies: normalizeStringArray(pilotPlan.dependencies),
    risks: normalizeStringArray(pilotPlan.risks),
    evidenceSourceIds: sanitizeSourceIds(pilotPlan.evidenceSourceIds, validSourceIds),
  };

  if (
    !normalizedPilotPlan.objective ||
    !normalizedPilotPlan.scope ||
    normalizedPilotPlan.successMetrics.length < 2 ||
    normalizedPilotPlan.phases.length < 3 ||
    !normalizedPilotPlan.evidenceSourceIds.length
  ) {
    return null;
  }

  return normalizedPilotPlan;
}

function sanitizeExpansionScenario(
  scenario: ExpansionScenario | null,
  validSourceIds: Set<number>,
): ExpansionScenario | null {
  if (!scenario) {
    return null;
  }

  const normalizedScenario = {
    summary: scenario.summary.trim(),
    assumptions: normalizeStringArray(scenario.assumptions),
    expectedOutcomes: normalizeStringArray(scenario.expectedOutcomes),
    evidenceSourceIds: sanitizeSourceIds(scenario.evidenceSourceIds, validSourceIds),
  };

  if (
    !normalizedScenario.summary ||
    !normalizedScenario.assumptions.length ||
    !normalizedScenario.expectedOutcomes.length ||
    !normalizedScenario.evidenceSourceIds.length
  ) {
    return null;
  }

  return normalizedScenario;
}

function sanitizeAccountPlanNarrative(
  narrative: AccountPlanNarrativeOutput,
  validSourceIds: Set<number>,
) {
  const overallAccountMotion = {
    recommendedMotion: narrative.overallAccountMotion.recommendedMotion,
    rationale: narrative.overallAccountMotion.rationale.trim(),
    evidenceSourceIds: sanitizeSourceIds(narrative.overallAccountMotion.evidenceSourceIds, validSourceIds),
  };

  if (!overallAccountMotion.rationale || !overallAccountMotion.evidenceSourceIds.length) {
    throw new Error("Account-plan motion recommendation did not keep valid evidence references.");
  }

  const objectionsAndRebuttals = sanitizeObjectionsAndRebuttals(narrative.objectionsAndRebuttals, validSourceIds);
  const discoveryQuestions = sanitizeDiscoveryQuestions(narrative.discoveryQuestions, validSourceIds);
  const pilotPlan = sanitizePilotPlan(narrative.pilotPlan, validSourceIds);

  if (!discoveryQuestions.length && !pilotPlan) {
    throw new Error("Account-plan synthesis must persist discovery questions or a pilot framing.");
  }

  return {
    overallAccountMotion,
    stakeholderHypotheses: sanitizeStakeholderHypotheses(narrative.stakeholderHypotheses, validSourceIds),
    objectionsAndRebuttals,
    discoveryQuestions,
    pilotPlan,
    expansionScenarios: {
      low: sanitizeExpansionScenario(narrative.expansionScenarios.low, validSourceIds),
      base: sanitizeExpansionScenario(narrative.expansionScenarios.base, validSourceIds),
      high: sanitizeExpansionScenario(narrative.expansionScenarios.high, validSourceIds),
    },
  };
}

function buildDeterministicQualityGateFindings(input: {
  factPacket: FactPacket;
  topUseCases: AccountPlanUseCase[];
  overallAccountMotion: FinalAccountPlan["overallAccountMotion"];
}) {
  const findings: Array<{
    section: QualityGateSectionKey;
    issueCode: QualityGateIssueCode;
    summary: string;
    supportingSourceIds: number[];
    requiresTargetedSources: boolean;
  }> = [];
  const sellerPatternHits = new Set<string>();
  const sellerWorkflowSupported = companyBusinessSupportsSellerWorkflow(input.factPacket);
  const sourceById = new Map(input.factPacket.sourceRegistry.map((source) => [source.sourceId, source]));
  const topOpportunity = input.topUseCases[0] ?? null;
  const topOpportunityText = input.topUseCases
    .map((useCase) => [useCase.workflowName, useCase.summary, useCase.painPoint, useCase.expectedOutcome].join(" "))
    .join(" ");
  const motionText = input.overallAccountMotion.rationale;
  const executiveSummaryText = [
    input.factPacket.companyIdentity.companyName,
    input.factPacket.companyProfile.companyDescription.value,
    topOpportunity?.workflowName ?? null,
    topOpportunity?.summary ?? null,
    input.overallAccountMotion.rationale,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ");

  if (!sellerWorkflowSupported) {
    const topOpportunityHits = collectSellerWorkflowPatternHits(topOpportunityText);
    const motionHits = collectSellerWorkflowPatternHits(motionText);
    const executiveSummaryHits = collectSellerWorkflowPatternHits(executiveSummaryText);
    [...topOpportunityHits, ...motionHits, ...executiveSummaryHits].forEach((hit) => sellerPatternHits.add(hit));

    if (topOpportunityHits.length > 0) {
      findings.push({
        section: "top_opportunities",
        issueCode: "seller_workflow_self_reference",
        summary: `Top opportunities drifted into seller-workflow language (${topOpportunityHits.join(", ")}) instead of the target company's business.`,
        supportingSourceIds: input.topUseCases.flatMap((useCase) => useCase.evidenceSourceIds),
        requiresTargetedSources: false,
      });
    }

    if (topOpportunityHits.length > 0 || executiveSummaryHits.length > 0) {
      findings.push({
        section: "executive_summary",
        issueCode: "seller_workflow_self_reference",
        summary: "The executive summary inherited seller-workflow framing that does not match the resolved company business.",
        supportingSourceIds: topOpportunity?.evidenceSourceIds ?? input.overallAccountMotion.evidenceSourceIds,
        requiresTargetedSources: false,
      });
    }

    if (motionHits.length > 0 || executiveSummaryHits.length > 0) {
      findings.push({
        section: "motion_recommendation",
        issueCode: "seller_workflow_self_reference",
        summary: "The motion rationale references seller or account-planning tooling rather than a company-specific deployment motion.",
        supportingSourceIds: input.overallAccountMotion.evidenceSourceIds,
        requiresTargetedSources: false,
      });
    }
  }

  const topOpportunitySources = input.topUseCases
    .flatMap((useCase) => useCase.evidenceSourceIds)
    .map((sourceId) => sourceById.get(sourceId))
    .filter((source): source is NonNullable<typeof source> => Boolean(source));
  const motionSources = input.overallAccountMotion.evidenceSourceIds
    .map((sourceId) => sourceById.get(sourceId))
    .filter((source): source is NonNullable<typeof source> => Boolean(source));

  if (topOpportunitySources.length > 0 && topOpportunitySources.every(isTransientOperationalSource)) {
    findings.push({
      section: "top_opportunities",
      issueCode: "maintenance_page_overfit",
      summary: "Top opportunities rely primarily on maintenance, outage, or other transient operational pages.",
      supportingSourceIds: input.topUseCases.flatMap((useCase) => useCase.evidenceSourceIds),
      requiresTargetedSources: true,
    });
    findings.push({
      section: "executive_summary",
      issueCode: "transient_operational_anomaly",
      summary: "The executive summary is anchored to transient operational anomaly evidence instead of stable company signals.",
      supportingSourceIds: topOpportunity?.evidenceSourceIds ?? [],
      requiresTargetedSources: true,
    });
  }

  if (motionSources.length > 0 && motionSources.every(isTransientOperationalSource)) {
    findings.push({
      section: "motion_recommendation",
      issueCode: "transient_operational_anomaly",
      summary: "The motion rationale is grounded only in transient operational anomaly sources.",
      supportingSourceIds: input.overallAccountMotion.evidenceSourceIds,
      requiresTargetedSources: true,
    });
  }

  return {
    findings,
    sellerPatternHits: [...sellerPatternHits],
  };
}

function selectGroundedFallbackUseCases(
  useCases: AccountPlanUseCase[],
  factPacket: FactPacket,
) {
  const sellerWorkflowSupported = companyBusinessSupportsSellerWorkflow(factPacket);
  const sourceById = new Map(factPacket.sourceRegistry.map((source) => [source.sourceId, source]));

  return useCases
    .filter((useCase) => {
      if (
        useCase.evidenceSourceIds.length === 0 ||
        useCase.scorecard.evidenceConfidence < GROUNDED_FALLBACK_USE_CASE_MIN_EVIDENCE_CONFIDENCE
      ) {
        return false;
      }

      if (!sellerWorkflowSupported && collectSellerWorkflowPatternHits(`${useCase.workflowName} ${useCase.summary}`).length > 0) {
        return false;
      }

      if (!useCaseMatchesBusinessContext(useCase, factPacket)) {
        return false;
      }

      const evidenceSources = useCase.evidenceSourceIds
        .map((sourceId) => sourceById.get(sourceId))
        .filter((source): source is NonNullable<typeof source> => Boolean(source));

      return evidenceSources.length === 0 || !evidenceSources.every(isTransientOperationalSource);
    })
    .slice(0, 3);
}

function buildGroundedFallbackSummary(input: {
  factPacket: FactPacket;
  qualityGate: PublishQualityGateResult | null;
  groundedHypothesisCount: number;
}) {
  const identity = input.factPacket.companyIdentity;
  const profile = input.factPacket.companyProfile;
  const companyDescription =
    profile.companyDescription.value ??
    [profile.productsServices.value, profile.operatingModel.value, profile.targetCustomers.value].filter(Boolean).join(". ");
  const industryDescription = profile.industry.value ?? identity.industry ?? identity.sector ?? "its market";
  const signalSummary = input.factPacket.companyProfile.keyPublicSignals[0]?.summary ?? null;
  const caution =
    input.qualityGate && input.qualityGate.failedSections.length > 0
      ? `Company-specific opportunity fit remained low-confidence after reviewing ${input.qualityGate.failedSections.join(", ")}.`
      : "Company understanding remained too thin to publish a full prioritized opportunity set with confidence.";
  const hypothesisNote =
    input.groundedHypothesisCount > 0
      ? `Included ${input.groundedHypothesisCount} lower-confidence opportunity hypothesis${input.groundedHypothesisCount === 1 ? "" : "es"} that still cleared the minimum grounding bar.`
      : "No opportunity hypotheses cleared the minimum grounding bar, so the brief stays focused on the grounded company snapshot.";

  return [companyDescription, `The company operates in ${industryDescription}.`, signalSummary, caution, hypothesisNote]
    .filter((value): value is string => Boolean(value))
    .join(" ");
}

function buildGroundedFallbackSourceIds(factPacket: FactPacket) {
  return sanitizeSourceIds(
    [
      ...factPacket.companyIdentity.sourceIds,
      ...factPacket.companyProfile.companyDescription.sourceIds,
      ...factPacket.companyProfile.industry.sourceIds,
      ...factPacket.companyProfile.productsServices.sourceIds,
      ...factPacket.companyProfile.operatingModel.sourceIds,
      ...factPacket.companyProfile.targetCustomers.sourceIds,
      ...factPacket.companyProfile.keyPublicSignals.flatMap((signal) => signal.sourceIds),
    ],
    new Set(factPacket.sourceRegistry.map((source) => source.sourceId)),
  ).slice(0, 12);
}

function buildGroundedFallbackAccountPlan(input: {
  factPacket: FactPacket;
  rankedUseCases: AccountPlanUseCase[];
  qualityGate: PublishQualityGateResult | null;
}): FinalAccountPlan {
  const groundedHypotheses = selectGroundedFallbackUseCases(input.rankedUseCases, input.factPacket);
  const sourceIds = buildGroundedFallbackSourceIds(input.factPacket);
  const groundedFallbackBrief: GroundedFallbackBrief = {
    summary: buildGroundedFallbackSummary({
      factPacket: input.factPacket,
      qualityGate: input.qualityGate,
      groundedHypothesisCount: groundedHypotheses.length,
    }),
    sourceIds,
    opportunityHypothesisNote:
      groundedHypotheses.length > 0
        ? "The hypotheses below remain lower-confidence than a normal prioritized brief and should be validated before treating them as account-plan recommendations."
        : "Opportunity recommendations were held back because company-specific fit remained low-confidence.",
  };

  return {
    publishMode: "grounded_fallback",
    groundedFallbackBrief,
    overallAccountMotion: {
      recommendedMotion: "undetermined",
      rationale:
        "Account Atlas did not establish enough company-specific evidence to recommend workspace, API platform, or hybrid with confidence.",
      evidenceSourceIds: [],
    },
    candidateUseCases: groundedHypotheses,
    topUseCases: [],
    stakeholderHypotheses: [],
    objectionsAndRebuttals: [],
    discoveryQuestions: [],
    pilotPlan: null,
    expansionScenarios: {
      low: null,
      base: null,
      high: null,
    },
  };
}

export function createAccountPlanService(dependencies: AccountPlanServiceDependencies = {}) {
  const repository = dependencies.repository ?? drizzleReportRepository;
  const openAIClient = dependencies.openAIClient ?? createOpenAIResearchClient();

  async function rebuildFactPacketFromCurrentSources(context: StoredRunContext, previousFactPacket: FactPacket) {
    const [sources, facts] = await Promise.all([
      repository.listSourcesByRunId(context.run.id),
      repository.listFactsByRunId(context.run.id),
    ]);

    if (!sources.length) {
      return previousFactPacket;
    }

    return buildFactPacket({
      context,
      sources,
      facts,
      briefMode: previousFactPacket.briefMode,
    });
  }

  async function generateRankedUseCases(input: {
    context: StoredRunContext;
    factPacket: FactPacket;
    validSourceIds: Set<number>;
    retryNotes?: GenerationRetryNotes;
  }) {
    const candidateUseCaseInput = buildCandidateUseCasePrompt(input.context, input.factPacket, input.retryNotes);

    logServerEvent("info", "account_plan.openai.requested", {
      shareId: input.context.report.shareId,
      runId: input.context.run.id,
      operation: "candidate_use_cases",
      timeoutMs: ACCOUNT_PLAN_USE_CASE_TIMEOUT_MS,
      maxOutputTokens: 7_000,
      briefMode: input.factPacket.briefMode,
      factCount: input.factPacket.evidence.length,
      inputChars: candidateUseCaseInput.length,
      retryAttempt: input.retryNotes?.attempt ?? 0,
    });

    const useCaseResponse = await openAIClient.parseStructuredOutput({
      model: OPENAI_SYNTHESIS_MODEL,
      instructions:
        "Generate 12 to 15 evidence-backed enterprise AI use cases from the provided fact packet. Use only source IDs from the registry. Prefer practical, measurable use cases and keep uncertainty explicit when evidence is thin.",
      input: candidateUseCaseInput,
      schema: candidateUseCaseGenerationSchema,
      schemaName: "account_plan_candidate_use_cases",
      maxOutputTokens: 7_000,
      timeoutMs: ACCOUNT_PLAN_USE_CASE_TIMEOUT_MS,
      maxAttempts: ACCOUNT_PLAN_OPENAI_MAX_ATTEMPTS,
    });

    await appendStructuredDebugEvent(
      repository,
      input.context,
      "account_plan.candidate_use_cases.completed",
      useCaseResponse,
    );

    return sanitizeCandidateUseCases(useCaseResponse.parsed.useCases, input.validSourceIds, input.factPacket);
  }

  async function generateNarrative(input: {
    context: StoredRunContext;
    factPacket: FactPacket;
    rankedUseCases: AccountPlanUseCase[];
    validSourceIds: Set<number>;
    retryNotes?: GenerationRetryNotes;
  }) {
    const narrativeInput = buildAccountPlanNarrativePrompt(
      input.context,
      input.factPacket,
      input.rankedUseCases,
      input.retryNotes,
    );

    logServerEvent("info", "account_plan.openai.requested", {
      shareId: input.context.report.shareId,
      runId: input.context.run.id,
      operation: "narrative",
      timeoutMs: ACCOUNT_PLAN_NARRATIVE_TIMEOUT_MS,
      maxOutputTokens: 6_000,
      briefMode: input.factPacket.briefMode,
      factCount: input.factPacket.evidence.length,
      rankedUseCaseCount: input.rankedUseCases.length,
      inputChars: narrativeInput.length,
      retryAttempt: input.retryNotes?.attempt ?? 0,
    });

    const narrativeResponse = await openAIClient.parseStructuredOutput({
      model: OPENAI_SYNTHESIS_MODEL,
      instructions:
        "Generate the final evidence-backed account plan narrative. Use only valid source IDs from the registry, recommend a clear motion, keep stakeholder entries hypothetical, and do not imply certainty when evidence is weak.",
      input: narrativeInput,
      schema: accountPlanNarrativeSchema,
      schemaName: "account_plan_narrative",
      maxOutputTokens: 6_000,
      timeoutMs: ACCOUNT_PLAN_NARRATIVE_TIMEOUT_MS,
      maxAttempts: ACCOUNT_PLAN_OPENAI_MAX_ATTEMPTS,
    });

    await appendStructuredDebugEvent(repository, input.context, "account_plan.narrative.completed", narrativeResponse);

    return sanitizeAccountPlanNarrative(narrativeResponse.parsed, input.validSourceIds);
  }

  async function runPublishQualityGate(input: {
    context: StoredRunContext;
    factPacket: FactPacket;
    topUseCases: AccountPlanUseCase[];
    narrative: ReturnType<typeof sanitizeAccountPlanNarrative>;
  }): Promise<PublishQualityGateResult> {
    const deterministic = buildDeterministicQualityGateFindings({
      factPacket: input.factPacket,
      topUseCases: input.topUseCases,
      overallAccountMotion: input.narrative.overallAccountMotion,
    });
    const judgeInput = buildQualityGatePrompt({
      context: input.context,
      factPacket: input.factPacket,
      topUseCases: input.topUseCases,
      overallAccountMotion: input.narrative.overallAccountMotion,
      sellerPatternHits: deterministic.sellerPatternHits,
    });

    logServerEvent("info", "account_plan.openai.requested", {
      shareId: input.context.report.shareId,
      runId: input.context.run.id,
      operation: "publish_quality_gate",
      timeoutMs: ACCOUNT_PLAN_QUALITY_GATE_TIMEOUT_MS,
      maxOutputTokens: 2_500,
      inputChars: judgeInput.length,
    });

    const judgeResponse = await openAIClient.parseStructuredOutput({
      model: OPENAI_SYNTHESIS_MODEL,
      instructions:
        "Judge whether the executive summary, motion recommendation, and top opportunities are publishable. Fail any section that does not match the resolved company identity, does not fit the resolved industry or business model, lacks plausible citation support, drifts into seller/account-planning tooling, or overfits to maintenance or outage pages. Be conservative: when uncertain, fail and request a targeted retry rather than passing generic output.",
      input: judgeInput,
      schema: accountPlanQualityGateSchema,
      schemaName: "account_plan_publish_quality_gate",
      maxOutputTokens: 2_500,
      timeoutMs: ACCOUNT_PLAN_QUALITY_GATE_TIMEOUT_MS,
      maxAttempts: ACCOUNT_PLAN_OPENAI_MAX_ATTEMPTS,
    });

    await appendStructuredDebugEvent(
      repository,
      input.context,
      "account_plan.publish_quality_gate.completed",
      judgeResponse,
    );

    const sectionsByKey = new Map(
      judgeResponse.parsed.sections.map((section) => [
        section.section,
        {
          ...section,
          issueCodes: [...section.issueCodes],
          supportingSourceIds: [...section.supportingSourceIds],
          targetedSourceFocus: [...section.targetedSourceFocus],
        },
      ]),
    );

    for (const key of ["executive_summary", "motion_recommendation", "top_opportunities"] as const) {
      if (!sectionsByKey.has(key)) {
        sectionsByKey.set(key, {
          section: key,
          status: "fail",
          confidence: 0,
          summary: "The publish-time relevance judge did not return a verdict for this section.",
          issueCodes: ["unsupported_citations"],
          supportingSourceIds: [],
          requiresTargetedSources: false,
          targetedSourceFocus: [],
        });
      }
    }

    for (const finding of deterministic.findings) {
      const current = sectionsByKey.get(finding.section);

      if (!current) {
        continue;
      }

      current.status = "fail";
      current.confidence = Math.min(current.confidence, 45);
      current.summary = finding.summary;
      if (!current.issueCodes.includes(finding.issueCode)) {
        current.issueCodes.push(finding.issueCode);
      }
      current.supportingSourceIds = sanitizeSourceIds(
        [...current.supportingSourceIds, ...finding.supportingSourceIds],
        new Set(input.factPacket.sourceRegistry.map((source) => source.sourceId)),
      );
      current.requiresTargetedSources = current.requiresTargetedSources || finding.requiresTargetedSources;
    }

    const sections = [...sectionsByKey.values()];
    const failedSections = sections.filter((section) => section.status === "fail").map((section) => section.section);
    const issueCodes = [...new Set(sections.flatMap((section) => section.issueCodes))];
    const overallPass =
      judgeResponse.parsed.overallPass &&
      failedSections.length === 0 &&
      deterministic.findings.length === 0;

    return {
      outcome: {
        ...judgeResponse.parsed,
        overallPass,
        sections,
      },
      failedSections,
      issueCodes,
      sellerPatternHits: deterministic.sellerPatternHits,
    };
  }

  async function fetchTargetedSupportingSources(input: {
    context: StoredRunContext;
    factPacket: FactPacket;
    qualityGate: PublishQualityGateResult;
  }) {
    const targetedSourceResponse = await openAIClient.parseStructuredOutput({
      model: OPENAI_SYNTHESIS_MODEL,
      instructions:
        "Find authoritative public sources that better ground the target company's real business and the failed report sections. Prioritize official homepage, about/company, offerings, parent or investor, and newsroom pages. Return only URLs supported by the web search tool in this response.",
      input: buildTargetedSupportingSourcePrompt(input),
      schema: accountPlanTargetedSourceSearchSchema,
      schemaName: "account_plan_targeted_source_search",
      tools: [WEB_SEARCH_TOOL],
      include: ["web_search_call.action.sources"],
      maxOutputTokens: 2_000,
      timeoutMs: ACCOUNT_PLAN_TARGETED_SOURCE_TIMEOUT_MS,
      maxAttempts: ACCOUNT_PLAN_OPENAI_MAX_ATTEMPTS,
    });

    await appendStructuredDebugEvent(
      repository,
      input.context,
      "account_plan.targeted_source_search.completed",
      targetedSourceResponse,
    );

    const persistenceOutcome = await persistDiscoveredSources({
      repository,
      context: input.context,
      responseId: targetedSourceResponse.responseId,
      allowedUrls: normalizeAllowedWebUrls(targetedSourceResponse.webSearchSources),
      discoveredSources: targetedSourceResponse.parsed.discoveredSources,
    });

    return {
      ...persistenceOutcome,
      retrievalSummary: targetedSourceResponse.parsed.retrievalSummary,
    };
  }

  return {
    async generateAccountPlan(context: StoredRunContext) {
      if (!openAIClient.isConfigured()) {
        await repository.appendRunEvent({
          reportId: context.report.id,
          runId: context.run.id,
          level: "warning",
          eventType: "account_plan.skipped",
          stepKey: "generate_account_plan",
          message: "OPENAI_API_KEY is not configured. Account-plan synthesis was skipped for local development.",
        });

        return "Skipped account-plan synthesis because OPENAI_API_KEY is not configured.";
      }

      const workingContext = context;
      const { factPacket: loadedFactPacket, fallbackApplied: factPacketFallbackApplied } = await loadFactPacket(
        repository,
        workingContext,
      );
      let factPacket = loadedFactPacket;
      const researchSummary = factPacket.summary;

      if (
        factPacketFallbackApplied ||
        !workingContext.run.researchSummary ||
        workingContext.run.researchSummary.companyIdentity.companyName !== researchSummary.companyIdentity.companyName
      ) {
        await repository.updateRunResearchSummary({
          reportId: workingContext.report.id,
          runId: workingContext.run.id,
          researchSummary,
          companyName: researchSummary.companyIdentity.companyName,
        });
      }

      let validSourceIds = new Set(factPacket.sourceRegistry.map((source) => source.sourceId));
      const transientDownweightedWorkflowNames = new Set<string>();
      const sellerWorkflowDownweightedWorkflowNames = new Set<string>();
      const sellerPatternHits = new Set<string>();
      let targetedSourceFetches = 0;
      let targetedPersistedSources = 0;
      let targetedDedupedSources = 0;

      const initialUseCaseGeneration = await generateRankedUseCases({
        context: workingContext,
        factPacket,
        validSourceIds,
      });

      initialUseCaseGeneration.transientDownweightedWorkflowNames.forEach((name) =>
        transientDownweightedWorkflowNames.add(name),
      );
      initialUseCaseGeneration.sellerWorkflowDownweightedWorkflowNames.forEach((name) =>
        sellerWorkflowDownweightedWorkflowNames.add(name),
      );
      initialUseCaseGeneration.sellerPatternHits.forEach((hit) => sellerPatternHits.add(hit));

      let rankedUseCases = initialUseCaseGeneration.rankedUseCases;
      let topUseCases = rankedUseCases.slice(0, 3);

      if (topUseCases.length < 3) {
        throw new Error("Account-plan synthesis requires at least three valid use cases after ranking.");
      }

      let narrative = await generateNarrative({
        context: workingContext,
        factPacket,
        rankedUseCases,
        validSourceIds,
      });

      let qualityGate = await runPublishQualityGate({
        context: workingContext,
        factPacket,
        topUseCases,
        narrative,
      });
      qualityGate.sellerPatternHits.forEach((hit) => sellerPatternHits.add(hit));

      for (
        let gateAttempt = 1;
        !qualityGate.outcome.overallPass && gateAttempt < ACCOUNT_PLAN_QUALITY_GATE_MAX_ATTEMPTS;
        gateAttempt += 1
      ) {
        await repository.appendRunEvent({
          reportId: workingContext.report.id,
          runId: workingContext.run.id,
          level: "warning",
          eventType: "account_plan.relevance_gate.failed",
          stepKey: "generate_account_plan",
          message: `Publish-time relevance gate rejected ${qualityGate.failedSections.join(", ")} and triggered a targeted regeneration pass.`,
          metadata: {
            attempt: gateAttempt,
            failedSections: qualityGate.failedSections,
            issueCodes: qualityGate.issueCodes,
            sellerPatternHits: qualityGate.sellerPatternHits,
            retryPlan: qualityGate.outcome.retryPlan,
            safeSummaries: qualityGate.outcome.sections.map((section) => ({
              section: section.section,
              status: section.status,
              summary: section.summary,
            })),
          },
        });

        const shouldFetchTargetedSources =
          qualityGate.outcome.retryPlan.fetchTargetedSources ||
          qualityGate.outcome.sections.some((section) => section.requiresTargetedSources);

        if (shouldFetchTargetedSources) {
          const targetedFetchOutcome = await fetchTargetedSupportingSources({
            context: workingContext,
            factPacket,
            qualityGate,
          });
          targetedSourceFetches += 1;
          targetedPersistedSources += targetedFetchOutcome.persistedExternalSources;
          targetedDedupedSources += targetedFetchOutcome.dedupedExternalSources;

          await repository.appendRunEvent({
            reportId: workingContext.report.id,
            runId: workingContext.run.id,
            level: targetedFetchOutcome.persistedExternalSources > 0 ? "info" : "warning",
            eventType: "account_plan.relevance_gate.targeted_sources_completed",
            stepKey: "generate_account_plan",
            message:
              targetedFetchOutcome.persistedExternalSources > 0
                ? `Fetched ${targetedFetchOutcome.persistedExternalSources} targeted supporting source(s) for the failed publish-time sections.`
                : "Tried targeted supporting-source retrieval for the failed publish-time sections, but no new sources were persisted.",
            metadata: {
              attempt: gateAttempt,
              failedSections: qualityGate.failedSections,
              persistedExternalSources: targetedFetchOutcome.persistedExternalSources,
              dedupedExternalSources: targetedFetchOutcome.dedupedExternalSources,
              retrievalSummary: targetedFetchOutcome.retrievalSummary,
            },
          });

          if (targetedFetchOutcome.persistedExternalSources > 0) {
            factPacket = await rebuildFactPacketFromCurrentSources(workingContext, factPacket);
            validSourceIds = new Set(factPacket.sourceRegistry.map((source) => source.sourceId));
          }
        }

        const retryNotes = buildRetryNotes(qualityGate, gateAttempt);
        const shouldRegenerateUseCases =
          qualityGate.outcome.retryPlan.regenerateCandidateUseCases ||
          qualityGate.failedSections.includes("top_opportunities");
        const shouldRegenerateNarrative =
          shouldRegenerateUseCases ||
          qualityGate.outcome.retryPlan.regenerateNarrative ||
          qualityGate.failedSections.includes("motion_recommendation") ||
          qualityGate.failedSections.includes("executive_summary");

        if (shouldRegenerateUseCases) {
          const retriedUseCaseGeneration = await generateRankedUseCases({
            context: workingContext,
            factPacket,
            validSourceIds,
            retryNotes,
          });

          retriedUseCaseGeneration.transientDownweightedWorkflowNames.forEach((name) =>
            transientDownweightedWorkflowNames.add(name),
          );
          retriedUseCaseGeneration.sellerWorkflowDownweightedWorkflowNames.forEach((name) =>
            sellerWorkflowDownweightedWorkflowNames.add(name),
          );
          retriedUseCaseGeneration.sellerPatternHits.forEach((hit) => sellerPatternHits.add(hit));

          rankedUseCases = retriedUseCaseGeneration.rankedUseCases;
          topUseCases = rankedUseCases.slice(0, 3);

          if (topUseCases.length < 3) {
            throw new Error("Account-plan synthesis requires at least three valid use cases after regeneration.");
          }
        }

        if (shouldRegenerateNarrative) {
          narrative = await generateNarrative({
            context: workingContext,
            factPacket,
            rankedUseCases,
            validSourceIds,
            retryNotes,
          });
        }

        qualityGate = await runPublishQualityGate({
          context: workingContext,
          factPacket,
          topUseCases,
          narrative,
        });
        qualityGate.sellerPatternHits.forEach((hit) => sellerPatternHits.add(hit));
      }

      const shouldPublishGroundedFallback = !qualityGate.outcome.overallPass || factPacket.overallConfidence === "low";

      if (qualityGate.outcome.overallPass && !shouldPublishGroundedFallback) {
        await repository.appendRunEvent({
          reportId: workingContext.report.id,
          runId: workingContext.run.id,
          level: "info",
          eventType: "account_plan.relevance_gate.passed",
          stepKey: "generate_account_plan",
          message: "Publish-time relevance gate passed for the executive summary, motion recommendation, and top opportunities.",
          metadata: {
            sellerPatternHits: [...sellerPatternHits],
            targetedSourceFetches,
            targetedPersistedSources,
            targetedDedupedSources,
            safeSummaries: qualityGate.outcome.sections.map((section) => ({
              section: section.section,
              status: section.status,
              summary: section.summary,
            })),
          },
        });
      }

      if (transientDownweightedWorkflowNames.size > 0) {
        await repository.appendRunEvent({
          reportId: workingContext.report.id,
          runId: workingContext.run.id,
          level: "info",
          eventType: "account_plan.transient_operational_signals_downweighted",
          stepKey: "generate_account_plan",
          message: `Downweighted ${transientDownweightedWorkflowNames.size} use case(s) that relied primarily on transient operational anomaly signals.`,
          metadata: {
            workflowNames: [...transientDownweightedWorkflowNames],
          },
        });
      }

      if (sellerWorkflowDownweightedWorkflowNames.size > 0) {
        await repository.appendRunEvent({
          reportId: workingContext.report.id,
          runId: workingContext.run.id,
          level: "info",
          eventType: "account_plan.self_reference_suppressed",
          stepKey: "generate_account_plan",
          message: `Downweighted ${sellerWorkflowDownweightedWorkflowNames.size} self-referential seller-workflow use case(s) before ranking top opportunities.`,
          metadata: {
            workflowNames: [...sellerWorkflowDownweightedWorkflowNames],
            sellerPatternHits: [...sellerPatternHits],
          },
        });
      }

      const refreshedResearchSummary = factPacket.summary;

      if (
        factPacketFallbackApplied ||
        targetedPersistedSources > 0 ||
        !workingContext.run.researchSummary ||
        workingContext.run.researchSummary.companyIdentity.companyName !== refreshedResearchSummary.companyIdentity.companyName
      ) {
        await repository.updateRunResearchSummary({
          reportId: workingContext.report.id,
          runId: workingContext.run.id,
          researchSummary: refreshedResearchSummary,
          companyName: refreshedResearchSummary.companyIdentity.companyName,
        });
      }

      let accountPlan: FinalAccountPlan = shouldPublishGroundedFallback
        ? buildGroundedFallbackAccountPlan({
            factPacket,
            rankedUseCases,
            qualityGate,
          })
        : {
            publishMode: "full",
            groundedFallbackBrief: null,
            overallAccountMotion: narrative.overallAccountMotion,
            candidateUseCases: rankedUseCases,
            topUseCases,
            stakeholderHypotheses: narrative.stakeholderHypotheses,
            objectionsAndRebuttals: narrative.objectionsAndRebuttals,
            discoveryQuestions: narrative.discoveryQuestions,
            pilotPlan: narrative.pilotPlan,
            expansionScenarios: narrative.expansionScenarios,
          };
      let qualityEvaluation = evaluateReportQualityInvariants({
        canonicalDomain: workingContext.report.canonicalDomain,
        factPacket,
        accountPlan,
      });
      const invariantGateTriggeredFallback =
        accountPlan.publishMode !== "grounded_fallback" && qualityEvaluation.shouldPublishFallback;

      if (invariantGateTriggeredFallback) {
        accountPlan = buildGroundedFallbackAccountPlan({
          factPacket,
          rankedUseCases,
          qualityGate,
        });
        qualityEvaluation = evaluateReportQualityInvariants({
          canonicalDomain: workingContext.report.canonicalDomain,
          factPacket,
          accountPlan,
        });
      }

      if (qualityEvaluation.shouldReject) {
        throw new Error(
          `Persisted account plan did not satisfy the runtime quality invariants: ${qualityEvaluation.failedInvariantKeys.join(", ")}.`,
        );
      }

      await repository.replaceUseCasesForRun({
        reportId: workingContext.report.id,
        runId: workingContext.run.id,
        useCases: accountPlan.candidateUseCases,
      });

      await repository.replaceStakeholdersForRun({
        reportId: workingContext.report.id,
        runId: workingContext.run.id,
        stakeholders: accountPlan.stakeholderHypotheses,
      });

      await repository.updateRunAccountPlan({
        reportId: workingContext.report.id,
        runId: workingContext.run.id,
        accountPlan,
      });

      const contract = evaluatePublishableReport({
        researchSummary: refreshedResearchSummary,
        accountPlan,
      });

      if (!contract.isSatisfied) {
        throw new Error(
          `Persisted account plan did not satisfy the minimum viable publish contract: ${contract.missingRequirements.map(formatMinimumViableRequirement).join(", ")}.`,
        );
      }

      const optionalGapKeys = [...contract.optionalGapKeys];
      const limitedCoverageAreas: string[] = [...optionalGapKeys.map(formatOptionalCoverageGap)];

      if (contract.publishMode === "grounded_fallback") {
        limitedCoverageAreas.push("full prioritized opportunities");
      }

      if (factPacketFallbackApplied) {
        limitedCoverageAreas.push("persisted fact packet");
      }

      if (limitedCoverageAreas.length > 0) {
        await recordPipelineEvent({
          repository,
          context: workingContext,
          level: "warning",
          eventType: "fallback_applied",
          stepKey: "generate_account_plan",
          message:
            contract.publishMode === "grounded_fallback"
              ? `Published a grounded company brief because company-specific opportunity fit remained low-confidence. Coverage is intentionally limited to ${limitedCoverageAreas.join(", ")}.`
              : `Core seller-facing sections were persisted, but optional coverage remained limited in ${limitedCoverageAreas.join(", ")}.`,
          metadata: {
            optionalGapKeys,
            factPacketFallbackApplied,
            briefMode: factPacket.briefMode,
            candidateUseCaseCount: accountPlan.candidateUseCases.length,
            publishMode: contract.publishMode,
            invariantGateTriggeredFallback,
            qualityRecommendation: qualityEvaluation.recommendation,
            qualityFailedInvariantKeys: qualityEvaluation.failedInvariantKeys,
            qualityScorecard: qualityEvaluation.scorecard.map((entry) => ({
              section: entry.section,
              status: entry.status,
              summary: entry.summary,
            })),
          },
        });
      }

      if (contract.publishMode === "grounded_fallback") {
        await repository.appendRunEvent({
          reportId: workingContext.report.id,
          runId: workingContext.run.id,
          level: "warning",
          eventType: "account_plan.grounded_fallback_published",
          stepKey: "generate_account_plan",
          message:
            "Published a grounded fallback brief because company-specific opportunities did not clear the confidence bar for a full account plan.",
          metadata: {
            failedSections: qualityGate.failedSections,
            issueCodes: qualityGate.issueCodes,
            sellerPatternHits: qualityGate.sellerPatternHits,
            targetedSourceFetches,
            targetedPersistedSources,
            targetedDedupedSources,
            groundedHypothesisCount: accountPlan.candidateUseCases.length,
            groundedFallbackSummary: accountPlan.groundedFallbackBrief?.summary,
            invariantGateTriggeredFallback,
            qualityRecommendation: qualityEvaluation.recommendation,
            qualityFailedInvariantKeys: qualityEvaluation.failedInvariantKeys,
            qualityScorecard: qualityEvaluation.scorecard.map((entry) => ({
              section: entry.section,
              status: entry.status,
              summary: entry.summary,
            })),
          },
        });
      }

      await repository.appendRunEvent({
        reportId: workingContext.report.id,
        runId: workingContext.run.id,
        level: "info",
        eventType: "account_plan.completed",
        stepKey: "generate_account_plan",
        message:
          contract.publishMode === "grounded_fallback"
            ? `Stored a grounded fallback brief with ${accountPlan.candidateUseCases.length} lower-confidence opportunity hypothesis${accountPlan.candidateUseCases.length === 1 ? "" : "es"}.`
            : `Stored an account plan with ${rankedUseCases.length} candidate use cases and ${topUseCases.length} prioritized recommendations.`,
        metadata: {
          briefMode: factPacket.briefMode,
          factPacketFallbackApplied,
          targetedSourceFetches,
          targetedPersistedSources,
          targetedDedupedSources,
          publishMode: contract.publishMode,
          overallMotion: accountPlan.overallAccountMotion.recommendedMotion,
          optionalGapKeys,
          invariantGateTriggeredFallback,
          qualityRecommendation: qualityEvaluation.recommendation,
          qualityFailedInvariantKeys: qualityEvaluation.failedInvariantKeys,
          qualityScorecard: qualityEvaluation.scorecard.map((entry) => ({
            section: entry.section,
            status: entry.status,
            summary: entry.summary,
          })),
          topUseCases: accountPlan.topUseCases.map((useCase) => ({
            priorityRank: useCase.priorityRank,
            department: useCase.department,
            workflowName: useCase.workflowName,
            priorityScore: useCase.scorecard.priorityScore,
          })),
        },
      });

      if (contract.publishMode === "grounded_fallback") {
        return `Generated a grounded company brief for ${factPacket.companyIdentity.companyName}. Company-specific opportunity fit remained low-confidence, so the published brief stays focused on the citation-backed company snapshot${accountPlan.candidateUseCases.length > 0 ? ` and ${accountPlan.candidateUseCases.length} grounded hypothesis${accountPlan.candidateUseCases.length === 1 ? "" : "es"}` : ""}.`;
      }

      return limitedCoverageAreas.length > 0
        ? `Generated a usable account plan with ${rankedUseCases.length} candidate use cases. Overall motion: ${accountPlan.overallAccountMotion.recommendedMotion}. Optional coverage remained limited in ${limitedCoverageAreas.join(", ")}.`
        : `Generated an account plan with ${rankedUseCases.length} candidate use cases. Overall motion: ${accountPlan.overallAccountMotion.recommendedMotion}.`;
    },
  };
}
