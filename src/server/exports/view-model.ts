import "server-only";

import { REPORT_SECTION_DEFINITIONS } from "@/lib/report-sections";
import { evaluatePublishableReport, getReadyReportSectionKeys } from "@/lib/report-completion";
import type { ReportSectionKey } from "@/lib/types/report";
import type { ResearchSummary } from "@/lib/types/research";
import type {
  PersistedFact,
  PersistedSource,
  StoredRunContext,
} from "@/server/repositories/report-repository";

export type ExportCitation = {
  sourceId: number;
  label: string;
  title: string;
  url: string;
  sourceTypeLabel: string;
  sourceTier: PersistedSource["sourceTier"];
  mimeType: string | null;
  publishedAt: string | null;
  retrievedAt: string | null;
  summary: string | null;
};

export type ExportLinkedItem = {
  summary: string;
  citationLabels: string[];
};

export type ExportFactItem = {
  id: number;
  sectionKey: ReportSectionKey;
  sectionLabel: string;
  classification: PersistedFact["classification"];
  statement: string;
  rationale: string | null;
  confidence: number;
  freshness: PersistedFact["freshness"];
  sentiment: PersistedFact["sentiment"];
  relevance: number;
  citationLabels: string[];
};

export type ExportSectionAssessment = {
  key: ReportSectionKey;
  label: string;
  status: "pending" | "ready";
  completenessLabel: string;
  confidence: number | null;
  confidenceRationale: string | null;
};

export type ExportThinEvidenceWarning = {
  id: string;
  title: string;
  level: "info" | "warning";
  message: string;
  citationLabels: string[];
};

export type ExportUseCase = {
  priorityRank: number;
  departmentLabel: string;
  workflowName: string;
  summary: string;
  painPoint: string;
  whyNow: string;
  likelyUsers: string[];
  expectedOutcome: string;
  metrics: string[];
  dependencies: string[];
  securityComplianceNotes: string[];
  recommendedMotionLabel: string;
  motionRationale: string;
  openQuestions: string[];
  priorityScore: number;
  scorecard: {
    businessValue: number;
    deploymentReadiness: number;
    expansionPotential: number;
    openaiFit: number;
    sponsorLikelihood: number;
    evidenceConfidence: number;
    riskPenalty: number;
    priorityScore: number;
  };
  citationLabels: string[];
};

export type ReportExportViewModel = {
  publishMode: "full" | "grounded_fallback" | "insufficient";
  reportTitle: string;
  companyName: string;
  canonicalDomain: string;
  inputUrl: string;
  shareId: string;
  reportCreatedAt: string;
  runStartedAt: string;
  overallConfidence: ResearchSummary["overallConfidence"] | null;
  researchCompletenessScore: number | null;
  companyIdentity: {
    archetype: string | null;
    businessModel: string | null;
    industry: string | null;
    headquarters: string | null;
    publicCompany: boolean | null;
    citationLabels: string[];
  };
  overallMotion: {
    label: string;
    rationale: string;
    citationLabels: string[];
  };
  groundedFallbackBrief: {
    summary: string | null;
    opportunityHypothesisNote: string | null;
    citationLabels: string[];
  };
  growthPriorities: ExportLinkedItem[];
  aiMaturityEstimate: {
    level: string | null;
    rationale: string | null;
    citationLabels: string[];
  };
  regulatorySensitivity: {
    level: string | null;
    rationale: string | null;
    citationLabels: string[];
  };
  notableProductSignals: ExportLinkedItem[];
  notableHiringSignals: ExportLinkedItem[];
  notableTrustSignals: ExportLinkedItem[];
  complaintThemes: ExportLinkedItem[];
  leadershipSocialThemes: ExportLinkedItem[];
  sectionAssessments: ExportSectionAssessment[];
  thinEvidenceWarnings: ExportThinEvidenceWarning[];
  facts: ExportFactItem[];
  topUseCases: ExportUseCase[];
  candidateUseCases: ExportUseCase[];
  stakeholders: Array<{
    likelyRole: string;
    department: string | null;
    hypothesis: string;
    rationale: string;
    confidence: number;
    citationLabels: string[];
  }>;
  objectionsAndRebuttals: Array<{
    objection: string;
    rebuttal: string;
    citationLabels: string[];
  }>;
  discoveryQuestions: Array<{
    question: string;
    whyItMatters: string;
    citationLabels: string[];
  }>;
  pilotPlan: {
    objective: string;
    recommendedMotionLabel: string;
    scope: string;
    successMetrics: string[];
    phases: Array<{
      name: string;
      duration: string;
      goals: string[];
      deliverables: string[];
    }>;
    dependencies: string[];
    risks: string[];
    citationLabels: string[];
  } | null;
  expansionScenarios: {
    low: {
      summary: string;
      assumptions: string[];
      expectedOutcomes: string[];
      citationLabels: string[];
    } | null;
    base: {
      summary: string;
      assumptions: string[];
      expectedOutcomes: string[];
      citationLabels: string[];
    } | null;
    high: {
      summary: string;
      assumptions: string[];
      expectedOutcomes: string[];
      citationLabels: string[];
    } | null;
  };
  citations: ExportCitation[];
};

function formatMotionLabel(motion: string) {
  return motion === "api_platform" ? "API platform" : motion.replaceAll("_", " ");
}

function formatDepartmentLabel(department: string) {
  return department
    .replace("success_services", "success / services")
    .replace("customer_support", "customer support")
    .replace("it_security", "IT / security")
    .replace("analytics_data", "analytics / data")
    .replaceAll("_", " ");
}

function formatSourceTypeLabel(sourceType: string) {
  return sourceType
    .replace("investor_relations", "investor relations")
    .replace("company_social_profile", "company social")
    .replace("executive_social_profile", "executive social")
    .replace("_page", "")
    .replaceAll("_", " ");
}

function coerceSummary(source: PersistedSource) {
  const summaryCandidate =
    typeof source.storagePointers.summary === "string"
      ? source.storagePointers.summary
      : source.textContent ?? source.markdownContent ?? null;

  return summaryCandidate ? summaryCandidate.replace(/\s+/g, " ").trim().slice(0, 320) : null;
}

function getCitationLabels(sourceIds: number[]) {
  return [...new Set(sourceIds)].sort((left, right) => left - right).map((sourceId) => `S${sourceId}`);
}

function buildSectionAssessments(run: StoredRunContext["run"]): ExportSectionAssessment[] {
  const confidenceBySection = new Map(
    run.researchSummary?.confidenceBySection.map((entry) => [entry.section, entry]) ?? [],
  );
  const readySectionKeys = getReadyReportSectionKeys({
    researchSummary: run.researchSummary,
    accountPlan: run.accountPlan,
  });

  return REPORT_SECTION_DEFINITIONS.map((section) => {
    const confidence = confidenceBySection.get(section.key);
    const status = readySectionKeys.has(section.key) ? "ready" : "pending";

    return {
      key: section.key,
      label: section.label,
      status,
      confidence: confidence?.confidence ?? null,
      confidenceRationale: confidence?.rationale ?? null,
      completenessLabel:
        status === "ready"
          ? confidence?.confidence !== undefined
            ? confidence.confidence >= 75
              ? "Strong evidence"
              : confidence.confidence >= 55
                ? "Usable but incomplete"
                : "Thin evidence"
            : "Available"
          : "Waiting on evidence",
    };
  });
}

function buildThinEvidenceWarnings(run: StoredRunContext["run"]): ExportThinEvidenceWarning[] {
  if (!run.researchSummary) {
    return [];
  }

  const warnings: ExportThinEvidenceWarning[] = [];

  if (run.researchSummary.researchCompletenessScore < 70) {
    warnings.push({
      id: "low-completeness",
      level: "warning",
      title: "Research coverage is still thin",
      message: `Research completeness is ${run.researchSummary.researchCompletenessScore}/100, so some sections should be treated as directional rather than conclusive.`,
      citationLabels: getCitationLabels(run.researchSummary.sourceIds),
    });
  }

  if (run.researchSummary.overallConfidence === "low") {
    warnings.push({
      id: "low-confidence",
      level: "warning",
      title: "Overall confidence is low",
      message: "Available public evidence is limited or mixed, so recommendations and stakeholder hypotheses should be validated in discovery.",
      citationLabels: getCitationLabels(run.researchSummary.sourceIds),
    });
  }

  run.researchSummary.evidenceGaps.slice(0, 3).forEach((gap, index) => {
    warnings.push({
      id: `evidence-gap-${index + 1}`,
      level: "info",
      title: "Open evidence gap",
      message: gap,
      citationLabels: getCitationLabels(run.researchSummary?.sourceIds ?? []),
    });
  });

  if (run.accountPlan?.topUseCases.some((useCase) => useCase.scorecard.evidenceConfidence < 65)) {
    warnings.push({
      id: "top-use-case-thin-evidence",
      level: "warning",
      title: "Some top recommendations still need validation",
      message: "At least one prioritized use case has limited evidence confidence, so discovery questions should be resolved before committing to implementation scope.",
      citationLabels: getCitationLabels(
        run.accountPlan.topUseCases.flatMap((useCase) => useCase.evidenceSourceIds),
      ),
    });
  }

  return warnings;
}

function sortFacts(facts: PersistedFact[]) {
  const sectionOrder = new Map(REPORT_SECTION_DEFINITIONS.map((section, index) => [section.key, index]));

  return [...facts].sort((left, right) => {
    const sectionDelta =
      (sectionOrder.get(left.section) ?? Number.MAX_SAFE_INTEGER) -
      (sectionOrder.get(right.section) ?? Number.MAX_SAFE_INTEGER);

    if (sectionDelta !== 0) {
      return sectionDelta;
    }

    if (left.relevance !== right.relevance) {
      return right.relevance - left.relevance;
    }

    return left.id - right.id;
  });
}

function sortUseCases(useCases: NonNullable<StoredRunContext["run"]["accountPlan"]>["candidateUseCases"]) {
  return [...useCases].sort((left, right) => {
    if (left.priorityRank !== right.priorityRank) {
      return left.priorityRank - right.priorityRank;
    }

    return left.workflowName.localeCompare(right.workflowName);
  });
}

function sortSources(sources: PersistedSource[]) {
  return [...sources].sort((left, right) => left.id - right.id);
}

export function buildReportExportViewModel(input: {
  context: StoredRunContext;
  sources: PersistedSource[];
  facts: PersistedFact[];
}): ReportExportViewModel {
  const { context } = input;
  const researchSummary = context.run.researchSummary;
  const accountPlan = context.run.accountPlan;
  const publishability = evaluatePublishableReport({
    researchSummary,
    accountPlan,
  });
  const sources = sortSources(input.sources);
  const facts = sortFacts(input.facts);
  const citations = sources.map((source) => ({
    sourceId: source.id,
    label: `S${source.id}`,
    title: source.title ?? source.canonicalUrl,
    url: source.canonicalUrl,
    sourceTypeLabel: formatSourceTypeLabel(source.sourceType),
    sourceTier: source.sourceTier,
    mimeType: source.mimeType,
    publishedAt: source.publishedAt?.toISOString() ?? null,
    retrievedAt: source.retrievedAt?.toISOString() ?? null,
    summary: coerceSummary(source),
  }));

  return {
    publishMode: publishability.publishMode,
    reportTitle: context.report.companyName
      ? `${context.report.companyName} account plan`
      : `${context.report.canonicalDomain} account plan`,
    companyName:
      researchSummary?.companyIdentity.companyName ??
      context.report.companyName ??
      context.report.canonicalDomain,
    canonicalDomain: context.report.canonicalDomain,
    inputUrl: context.report.normalizedInputUrl,
    shareId: context.report.shareId,
    reportCreatedAt: context.report.createdAt.toISOString(),
    runStartedAt: (context.run.startedAt ?? context.run.createdAt).toISOString(),
    overallConfidence: researchSummary?.overallConfidence ?? null,
    researchCompletenessScore: researchSummary?.researchCompletenessScore ?? null,
    companyIdentity: {
      archetype: researchSummary?.companyIdentity.archetype ?? null,
      businessModel: researchSummary?.companyIdentity.businessModel ?? null,
      industry: researchSummary?.companyIdentity.industry ?? null,
      headquarters: researchSummary?.companyIdentity.headquarters ?? null,
      publicCompany: researchSummary?.companyIdentity.publicCompany ?? null,
      citationLabels: getCitationLabels(researchSummary?.companyIdentity.sourceIds ?? []),
    },
    overallMotion: {
      label: formatMotionLabel(accountPlan?.overallAccountMotion.recommendedMotion ?? "undetermined"),
      rationale:
        publishability.publishMode === "grounded_fallback"
          ? accountPlan?.groundedFallbackBrief?.opportunityHypothesisNote ??
            "Account Atlas did not establish enough company-specific evidence to recommend workspace, API platform, or hybrid with confidence."
          : accountPlan?.overallAccountMotion.rationale ??
        "The report does not yet contain enough evidence to recommend workspace, API platform, or hybrid with confidence.",
      citationLabels: getCitationLabels(accountPlan?.overallAccountMotion.evidenceSourceIds ?? []),
    },
    groundedFallbackBrief: {
      summary: accountPlan?.groundedFallbackBrief?.summary ?? null,
      opportunityHypothesisNote: accountPlan?.groundedFallbackBrief?.opportunityHypothesisNote ?? null,
      citationLabels: getCitationLabels(accountPlan?.groundedFallbackBrief?.sourceIds ?? []),
    },
    growthPriorities:
      researchSummary?.growthPriorities.map((item) => ({
        summary: item.summary,
        citationLabels: getCitationLabels(item.sourceIds),
      })) ?? [],
    aiMaturityEstimate: {
      level: researchSummary?.aiMaturityEstimate.level ?? null,
      rationale: researchSummary?.aiMaturityEstimate.rationale ?? null,
      citationLabels: getCitationLabels(researchSummary?.aiMaturityEstimate.sourceIds ?? []),
    },
    regulatorySensitivity: {
      level: researchSummary?.regulatorySensitivity.level ?? null,
      rationale: researchSummary?.regulatorySensitivity.rationale ?? null,
      citationLabels: getCitationLabels(researchSummary?.regulatorySensitivity.sourceIds ?? []),
    },
    notableProductSignals:
      researchSummary?.notableProductSignals.map((item) => ({
        summary: item.summary,
        citationLabels: getCitationLabels(item.sourceIds),
      })) ?? [],
    notableHiringSignals:
      researchSummary?.notableHiringSignals.map((item) => ({
        summary: item.summary,
        citationLabels: getCitationLabels(item.sourceIds),
      })) ?? [],
    notableTrustSignals:
      researchSummary?.notableTrustSignals.map((item) => ({
        summary: item.summary,
        citationLabels: getCitationLabels(item.sourceIds),
      })) ?? [],
    complaintThemes:
      researchSummary?.complaintThemes.map((item) => ({
        summary: item.summary,
        citationLabels: getCitationLabels(item.sourceIds),
      })) ?? [],
    leadershipSocialThemes:
      researchSummary?.leadershipSocialThemes.map((item) => ({
        summary: item.summary,
        citationLabels: getCitationLabels(item.sourceIds),
      })) ?? [],
    sectionAssessments: buildSectionAssessments(context.run),
    thinEvidenceWarnings: buildThinEvidenceWarnings(context.run),
    facts: facts.map((fact) => ({
      id: fact.id,
      sectionKey: fact.section,
      sectionLabel: REPORT_SECTION_DEFINITIONS.find((section) => section.key === fact.section)?.label ?? fact.section,
      classification: fact.classification,
      statement: fact.statement,
      rationale: fact.rationale,
      confidence: fact.confidence,
      freshness: fact.freshness,
      sentiment: fact.sentiment,
      relevance: fact.relevance,
      citationLabels: getCitationLabels(fact.sourceIds),
    })),
    topUseCases: sortUseCases(
      publishability.publishMode === "grounded_fallback"
        ? accountPlan?.topUseCases ?? []
        : accountPlan?.topUseCases ?? accountPlan?.candidateUseCases.slice(0, 3) ?? [],
    ).map((useCase) => ({
      priorityRank: useCase.priorityRank,
      departmentLabel: formatDepartmentLabel(useCase.department),
      workflowName: useCase.workflowName,
      summary: useCase.summary,
      painPoint: useCase.painPoint,
      whyNow: useCase.whyNow,
      likelyUsers: useCase.likelyUsers,
      expectedOutcome: useCase.expectedOutcome,
      metrics: useCase.metrics,
      dependencies: useCase.dependencies,
      securityComplianceNotes: useCase.securityComplianceNotes,
      recommendedMotionLabel: formatMotionLabel(useCase.recommendedMotion),
      motionRationale: useCase.motionRationale,
      openQuestions: useCase.openQuestions,
      priorityScore: useCase.scorecard.priorityScore,
      scorecard: useCase.scorecard,
      citationLabels: getCitationLabels(useCase.evidenceSourceIds),
    })),
    candidateUseCases: sortUseCases(accountPlan?.candidateUseCases ?? []).map((useCase) => ({
      priorityRank: useCase.priorityRank,
      departmentLabel: formatDepartmentLabel(useCase.department),
      workflowName: useCase.workflowName,
      summary: useCase.summary,
      painPoint: useCase.painPoint,
      whyNow: useCase.whyNow,
      likelyUsers: useCase.likelyUsers,
      expectedOutcome: useCase.expectedOutcome,
      metrics: useCase.metrics,
      dependencies: useCase.dependencies,
      securityComplianceNotes: useCase.securityComplianceNotes,
      recommendedMotionLabel: formatMotionLabel(useCase.recommendedMotion),
      motionRationale: useCase.motionRationale,
      openQuestions: useCase.openQuestions,
      priorityScore: useCase.scorecard.priorityScore,
      scorecard: useCase.scorecard,
      citationLabels: getCitationLabels(useCase.evidenceSourceIds),
    })),
    stakeholders:
      accountPlan?.stakeholderHypotheses.map((stakeholder) => ({
        likelyRole: stakeholder.likelyRole,
        department: stakeholder.department ? formatDepartmentLabel(stakeholder.department) : null,
        hypothesis: stakeholder.hypothesis,
        rationale: stakeholder.rationale,
        confidence: stakeholder.confidence,
        citationLabels: getCitationLabels(stakeholder.evidenceSourceIds),
      })) ?? [],
    objectionsAndRebuttals:
      accountPlan?.objectionsAndRebuttals.map((item) => ({
        objection: item.objection,
        rebuttal: item.rebuttal,
        citationLabels: getCitationLabels(item.evidenceSourceIds),
      })) ?? [],
    discoveryQuestions:
      accountPlan?.discoveryQuestions.map((item) => ({
        question: item.question,
        whyItMatters: item.whyItMatters,
        citationLabels: getCitationLabels(item.evidenceSourceIds),
      })) ?? [],
    pilotPlan: accountPlan?.pilotPlan
      ? {
          objective: accountPlan.pilotPlan.objective,
          recommendedMotionLabel: formatMotionLabel(accountPlan.pilotPlan.recommendedMotion),
          scope: accountPlan.pilotPlan.scope,
          successMetrics: accountPlan.pilotPlan.successMetrics,
          phases: accountPlan.pilotPlan.phases,
          dependencies: accountPlan.pilotPlan.dependencies,
          risks: accountPlan.pilotPlan.risks,
          citationLabels: getCitationLabels(accountPlan.pilotPlan.evidenceSourceIds),
        }
      : null,
    expansionScenarios: {
      low: accountPlan?.expansionScenarios.low
        ? {
            summary: accountPlan.expansionScenarios.low.summary,
            assumptions: accountPlan.expansionScenarios.low.assumptions,
            expectedOutcomes: accountPlan.expansionScenarios.low.expectedOutcomes,
            citationLabels: getCitationLabels(accountPlan.expansionScenarios.low.evidenceSourceIds),
          }
        : null,
      base: accountPlan?.expansionScenarios.base
        ? {
            summary: accountPlan.expansionScenarios.base.summary,
            assumptions: accountPlan.expansionScenarios.base.assumptions,
            expectedOutcomes: accountPlan.expansionScenarios.base.expectedOutcomes,
            citationLabels: getCitationLabels(accountPlan.expansionScenarios.base.evidenceSourceIds),
          }
        : null,
      high: accountPlan?.expansionScenarios.high
        ? {
            summary: accountPlan.expansionScenarios.high.summary,
            assumptions: accountPlan.expansionScenarios.high.assumptions,
            expectedOutcomes: accountPlan.expansionScenarios.high.expectedOutcomes,
            citationLabels: getCitationLabels(accountPlan.expansionScenarios.high.evidenceSourceIds),
          }
        : null,
    },
    citations,
  };
}
