import "server-only";

import {
  buildCanonicalOpportunityScorecard,
  canonicalCitationSourceIds,
  getCanonicalReadySectionKeys,
  getCanonicalSectionCoverage,
  isCanonicalGroundedFallbackReport,
} from "@/lib/canonical-report";
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

function getCanonicalCitationLabels(
  citations:
    | import("@/server/deep-research/report-contract").CanonicalReportCitation[]
    | null
    | undefined,
) {
  return getCitationLabels(canonicalCitationSourceIds(citations ?? []));
}

function deriveCanonicalFreshness(input: {
  citations:
    | import("@/server/deep-research/report-contract").CanonicalReportCitation[]
    | null
    | undefined;
  canonicalReport:
    | import("@/server/deep-research/report-contract").CanonicalAccountAtlasReport
    | null
    | undefined;
}) {
  const timestamps = (input.citations ?? [])
    .map((citation) =>
      input.canonicalReport?.sources.find((source) => source.source_id === citation.source_id)?.published_at,
    )
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

function buildSectionAssessments(run: StoredRunContext["run"]): ExportSectionAssessment[] {
  if (run.canonicalReport) {
    const readySectionKeys = getCanonicalReadySectionKeys(run.canonicalReport);

    return REPORT_SECTION_DEFINITIONS.map((section) => {
      const coverage = getCanonicalSectionCoverage(run.canonicalReport, section.key);
      const status = readySectionKeys.has(section.key) ? "ready" : "pending";

      return {
        key: section.key,
        label: section.label,
        status,
        confidence: status === "ready" ? coverage?.confidence.confidence_score ?? null : null,
        confidenceRationale:
          status === "ready" ? coverage?.confidence.rationale ?? coverage?.coverage.rationale ?? null : null,
        completenessLabel:
          status === "ready"
            ? coverage?.coverage.coverage_level === "strong"
              ? "Strong evidence"
              : coverage?.coverage.coverage_level === "usable"
                ? "Usable but incomplete"
                : "Thin evidence"
            : "Waiting on evidence",
      };
    });
  }

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
  if (run.canonicalReport) {
    const warnings: ExportThinEvidenceWarning[] = [];
    const canonicalReport = run.canonicalReport;
    const coverage = canonicalReport.evidence_coverage;

    if (coverage.thin_evidence || coverage.overall_coverage.coverage_level === "thin") {
      warnings.push({
        id: "low-completeness",
        level: "warning",
        title: "Research coverage is still thin",
        message: `Evidence coverage is ${coverage.research_completeness_score}/100, so some sections should be treated as directional rather than conclusive.`,
        citationLabels: getCanonicalCitationLabels(
          coverage.section_coverage.flatMap((section) => section.citations),
        ),
      });
    }

    if (coverage.overall_confidence.confidence_band === "low") {
      warnings.push({
        id: "low-confidence",
        level: "warning",
        title: "Overall confidence is low",
        message: coverage.overall_confidence.rationale,
        citationLabels: getCanonicalCitationLabels(canonicalReport.executive_summary.citations),
      });
    }

    run.canonicalReport.confidence_notes.slice(0, 3).forEach((note, index) => {
      warnings.push({
        id: `confidence-note-${index + 1}`,
        level: note.level,
        title: "Confidence note",
        message: note.note,
        citationLabels: getCanonicalCitationLabels(note.citations),
      });
    });

    coverage.evidence_gaps.slice(0, 3).forEach((gap, index) => {
      warnings.push({
        id: `evidence-gap-${index + 1}`,
        level: "info",
        title: "Open evidence gap",
        message: gap,
        citationLabels: getCanonicalCitationLabels(canonicalReport.executive_summary.citations),
      });
    });

    return warnings;
  }

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
  const canonicalReport = context.run.canonicalReport;

  if (canonicalReport) {
    const readySectionKeys = getCanonicalReadySectionKeys(canonicalReport);
    const citations = canonicalReport.sources.map((source) => ({
      sourceId: source.source_id,
      label: `S${source.source_id}`,
      title: source.title,
      url: source.url,
      sourceTypeLabel: formatSourceTypeLabel(source.source_type),
      sourceTier: source.source_tier,
      mimeType: source.url.toLowerCase().endsWith(".pdf") ? "application/pdf" : "text/html",
      publishedAt: source.published_at,
      retrievedAt: source.retrieved_at,
      summary: source.summary,
    }));
    const sortedOpportunities = [...canonicalReport.top_opportunities].sort(
      (left, right) => left.priority_rank - right.priority_rank,
    );
    const topUseCases = sortedOpportunities.slice(0, 3).map((opportunity) => ({
      priorityRank: opportunity.priority_rank,
      departmentLabel: formatDepartmentLabel(opportunity.department),
      workflowName: opportunity.workflow_name,
      summary: opportunity.summary,
      painPoint: opportunity.pain_point,
      whyNow: opportunity.why_now,
      likelyUsers: opportunity.likely_users,
      expectedOutcome: opportunity.expected_outcome,
      metrics: opportunity.success_metrics,
      dependencies: opportunity.dependencies,
      securityComplianceNotes: opportunity.security_compliance_notes,
      recommendedMotionLabel: formatMotionLabel(opportunity.recommended_motion),
      motionRationale: opportunity.motion_rationale,
      openQuestions: opportunity.open_questions,
      priorityScore: buildCanonicalOpportunityScorecard(opportunity).priorityScore,
      scorecard: buildCanonicalOpportunityScorecard(opportunity),
      citationLabels: getCanonicalCitationLabels(opportunity.citations),
    }));
    const candidateUseCases = sortedOpportunities.map((opportunity) => ({
      priorityRank: opportunity.priority_rank,
      departmentLabel: formatDepartmentLabel(opportunity.department),
      workflowName: opportunity.workflow_name,
      summary: opportunity.summary,
      painPoint: opportunity.pain_point,
      whyNow: opportunity.why_now,
      likelyUsers: opportunity.likely_users,
      expectedOutcome: opportunity.expected_outcome,
      metrics: opportunity.success_metrics,
      dependencies: opportunity.dependencies,
      securityComplianceNotes: opportunity.security_compliance_notes,
      recommendedMotionLabel: formatMotionLabel(opportunity.recommended_motion),
      motionRationale: opportunity.motion_rationale,
      openQuestions: opportunity.open_questions,
      priorityScore: buildCanonicalOpportunityScorecard(opportunity).priorityScore,
      scorecard: buildCanonicalOpportunityScorecard(opportunity),
      citationLabels: getCanonicalCitationLabels(opportunity.citations),
    }));

    return {
      publishMode: isCanonicalGroundedFallbackReport(canonicalReport) ? "grounded_fallback" : "full",
      reportTitle: `${canonicalReport.company.resolved_name} account plan`,
      companyName: canonicalReport.company.resolved_name,
      canonicalDomain: canonicalReport.report_metadata.canonical_domain,
      inputUrl: canonicalReport.report_metadata.normalized_company_url,
      shareId: context.report.shareId,
      reportCreatedAt: context.report.createdAt.toISOString(),
      runStartedAt: (context.run.startedAt ?? context.run.createdAt).toISOString(),
      overallConfidence: canonicalReport.evidence_coverage.overall_confidence.confidence_band,
      researchCompletenessScore: canonicalReport.evidence_coverage.research_completeness_score,
      companyIdentity: {
        archetype: canonicalReport.company.archetype,
        businessModel: canonicalReport.company.business_model,
        industry: canonicalReport.company.industry,
        headquarters: canonicalReport.company.headquarters,
        publicCompany: canonicalReport.company.public_company,
        citationLabels: getCanonicalCitationLabels(canonicalReport.company.citations),
      },
      overallMotion: {
        label: formatMotionLabel(canonicalReport.recommended_motion.recommended_motion),
        rationale: canonicalReport.recommended_motion.rationale,
        citationLabels: getCanonicalCitationLabels(canonicalReport.recommended_motion.citations),
      },
      groundedFallbackBrief: {
        summary: canonicalReport.grounded_fallback?.summary ?? null,
        opportunityHypothesisNote: canonicalReport.grounded_fallback?.opportunity_hypothesis_note ?? null,
        citationLabels: getCanonicalCitationLabels(canonicalReport.grounded_fallback?.citations),
      },
      growthPriorities: [
        {
          summary: canonicalReport.executive_summary.why_now,
          citationLabels: getCanonicalCitationLabels(canonicalReport.executive_summary.citations),
        },
        {
          summary: canonicalReport.executive_summary.strategic_takeaway,
          citationLabels: getCanonicalCitationLabels(canonicalReport.executive_summary.citations),
        },
      ],
      aiMaturityEstimate: {
        level: canonicalReport.ai_maturity_signals.maturity_level,
        rationale: canonicalReport.ai_maturity_signals.maturity_summary,
        citationLabels: getCanonicalCitationLabels(canonicalReport.ai_maturity_signals.citations),
      },
      regulatorySensitivity: {
        level: canonicalReport.ai_maturity_signals.regulatory_sensitivity.level,
        rationale: canonicalReport.ai_maturity_signals.regulatory_sensitivity.rationale,
        citationLabels: getCanonicalCitationLabels(canonicalReport.ai_maturity_signals.regulatory_sensitivity.citations),
      },
      notableProductSignals: canonicalReport.ai_maturity_signals.notable_signals.map((signal) => ({
        summary: signal.summary,
        citationLabels: getCanonicalCitationLabels(signal.citations),
      })),
      notableHiringSignals: [],
      notableTrustSignals: [],
      complaintThemes: [],
      leadershipSocialThemes: [],
      sectionAssessments: REPORT_SECTION_DEFINITIONS.map((section) => {
        const coverage = getCanonicalSectionCoverage(canonicalReport, section.key);
        const status = readySectionKeys.has(section.key) ? "ready" : "pending";

        return {
          key: section.key,
          label: section.label,
          status,
          completenessLabel:
            status === "ready"
              ? coverage?.coverage.coverage_level === "strong"
                ? "Strong evidence"
                : coverage?.coverage.coverage_level === "usable"
                  ? "Usable but incomplete"
                  : "Thin evidence"
              : "Waiting on evidence",
          confidence: status === "ready" ? coverage?.confidence.confidence_score ?? null : null,
          confidenceRationale:
            status === "ready" ? coverage?.confidence.rationale ?? coverage?.coverage.rationale ?? null : null,
        };
      }),
      thinEvidenceWarnings: buildThinEvidenceWarnings(context.run),
      facts: [
        {
          id: 1,
          sectionKey: "company-brief",
          sectionLabel: "Company brief",
          classification: "fact",
          statement: canonicalReport.company.company_brief,
          rationale: canonicalReport.company.relationship_to_url,
          confidence:
            getCanonicalSectionCoverage(canonicalReport, "company-brief")?.confidence.confidence_score ?? 70,
          freshness: deriveCanonicalFreshness({
            citations: canonicalReport.company.citations,
            canonicalReport,
          }),
          sentiment: "neutral",
          relevance: 92,
          citationLabels: getCanonicalCitationLabels(canonicalReport.company.citations),
        },
        ...canonicalReport.fact_base.map((fact, index) => ({
          id: index + 2,
          sectionKey: "fact-base" as const,
          sectionLabel: "Fact base",
          classification: fact.classification,
          statement: fact.statement,
          rationale: fact.why_it_matters,
          confidence: fact.confidence.confidence_score,
          freshness: deriveCanonicalFreshness({
            citations: fact.citations,
            canonicalReport,
          }),
          sentiment: "neutral" as const,
          relevance: 90,
          citationLabels: getCanonicalCitationLabels(fact.citations),
        })),
        ...canonicalReport.ai_maturity_signals.notable_signals.map((signal, index) => ({
          id: index + 200,
          sectionKey: "ai-maturity-signals" as const,
          sectionLabel: "AI maturity signals",
          classification: "inference" as const,
          statement: signal.summary,
          rationale: canonicalReport.ai_maturity_signals.maturity_summary,
          confidence:
            getCanonicalSectionCoverage(canonicalReport, "ai-maturity-signals")?.confidence.confidence_score ??
            canonicalReport.evidence_coverage.overall_confidence.confidence_score,
          freshness: deriveCanonicalFreshness({
            citations: signal.citations,
            canonicalReport,
          }),
          sentiment: "neutral" as const,
          relevance: 84,
          citationLabels: getCanonicalCitationLabels(signal.citations),
        })),
      ],
      topUseCases,
      candidateUseCases,
      stakeholders: canonicalReport.buying_map.stakeholder_hypotheses.map((stakeholder) => ({
        likelyRole: stakeholder.likely_role,
        department: stakeholder.department ? formatDepartmentLabel(stakeholder.department) : null,
        hypothesis: stakeholder.hypothesis,
        rationale: stakeholder.rationale,
        confidence: stakeholder.confidence.confidence_score,
        citationLabels: getCanonicalCitationLabels(stakeholder.citations),
      })),
      objectionsAndRebuttals: canonicalReport.buying_map.likely_objections.map((item) => ({
        objection: item.objection,
        rebuttal: item.rebuttal,
        citationLabels: getCanonicalCitationLabels(item.citations),
      })),
      discoveryQuestions: canonicalReport.buying_map.discovery_questions.map((item) => ({
        question: item.question,
        whyItMatters: item.why_it_matters,
        citationLabels: getCanonicalCitationLabels(item.citations),
      })),
      pilotPlan: canonicalReport.pilot_plan
        ? {
            objective: canonicalReport.pilot_plan.objective,
            recommendedMotionLabel: formatMotionLabel(canonicalReport.pilot_plan.recommended_motion),
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
            citationLabels: getCanonicalCitationLabels(canonicalReport.pilot_plan.citations),
          }
        : null,
      expansionScenarios: {
        low: canonicalReport.expansion_scenarios.low
          ? {
              summary: canonicalReport.expansion_scenarios.low.summary,
              assumptions: canonicalReport.expansion_scenarios.low.assumptions,
              expectedOutcomes: canonicalReport.expansion_scenarios.low.expected_outcomes,
              citationLabels: getCanonicalCitationLabels(canonicalReport.expansion_scenarios.low.citations),
            }
          : null,
        base: canonicalReport.expansion_scenarios.base
          ? {
              summary: canonicalReport.expansion_scenarios.base.summary,
              assumptions: canonicalReport.expansion_scenarios.base.assumptions,
              expectedOutcomes: canonicalReport.expansion_scenarios.base.expected_outcomes,
              citationLabels: getCanonicalCitationLabels(canonicalReport.expansion_scenarios.base.citations),
            }
          : null,
        high: canonicalReport.expansion_scenarios.high
          ? {
              summary: canonicalReport.expansion_scenarios.high.summary,
              assumptions: canonicalReport.expansion_scenarios.high.assumptions,
              expectedOutcomes: canonicalReport.expansion_scenarios.high.expected_outcomes,
              citationLabels: getCanonicalCitationLabels(canonicalReport.expansion_scenarios.high.citations),
            }
          : null,
      },
      citations,
    };
  }

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
