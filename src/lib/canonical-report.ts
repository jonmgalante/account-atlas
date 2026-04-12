import type { UseCaseScorecard } from "@/lib/types/account-plan";

export type CanonicalAccountAtlasReportShape =
  import("@/server/deep-research/report-contract").CanonicalAccountAtlasReport;
export type CanonicalReportCitationShape =
  import("@/server/deep-research/report-contract").CanonicalReportCitation;
export type CanonicalOpportunityCardShape =
  import("@/server/deep-research/report-contract").CanonicalOpportunityCard;

type CanonicalSectionKey =
  CanonicalAccountAtlasReportShape["evidence_coverage"]["section_coverage"][number]["section"];

type CanonicalSourceLike = {
  id: number;
  canonicalSourceId: number | null;
};

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function canonicalCitationSourceIds(
  citations: CanonicalReportCitationShape[] | null | undefined,
) {
  return [...new Set((citations ?? []).map((citation) => citation.source_id))];
}

export function isCanonicalGroundedFallbackReport(
  report: CanonicalAccountAtlasReportShape | null | undefined,
) {
  return report?.report_metadata.report_mode === "grounded_fallback";
}

export function hasCanonicalExpansionScenario(
  report: CanonicalAccountAtlasReportShape | null | undefined,
) {
  return Boolean(
    report?.expansion_scenarios.low ??
      report?.expansion_scenarios.base ??
      report?.expansion_scenarios.high,
  );
}

function hasContentForSection(report: CanonicalAccountAtlasReportShape, section: CanonicalSectionKey) {
  switch (section) {
    case "company-brief":
      return Boolean(report.company.company_brief && report.company.citations.length > 0);
    case "fact-base":
      return report.fact_base.length > 0;
    case "ai-maturity-signals":
      return Boolean(report.ai_maturity_signals.maturity_summary);
    case "prioritized-use-cases":
      return report.top_opportunities.length > 0;
    case "recommended-motion":
      return Boolean(report.recommended_motion.rationale && report.recommended_motion.citations.length > 0);
    case "stakeholder-hypotheses":
      return report.buying_map.stakeholder_hypotheses.length > 0;
    case "objections":
      return report.buying_map.likely_objections.length > 0;
    case "discovery-questions":
      return report.buying_map.discovery_questions.length > 0;
    case "pilot-plan":
      return report.pilot_plan !== null;
    case "expansion-scenarios":
      return hasCanonicalExpansionScenario(report);
  }
}

export function getCanonicalReadySectionKeys(
  report: CanonicalAccountAtlasReportShape | null | undefined,
) {
  const readySectionKeys = new Set<CanonicalSectionKey>();

  if (!report) {
    return readySectionKeys;
  }

  for (const entry of report.evidence_coverage.section_coverage) {
    if (hasContentForSection(report, entry.section)) {
      readySectionKeys.add(entry.section);
    }
  }

  return readySectionKeys;
}

export function getCanonicalSectionCoverage(
  report: CanonicalAccountAtlasReportShape | null | undefined,
  section: CanonicalSectionKey,
) {
  return report?.evidence_coverage.section_coverage.find((entry) => entry.section === section) ?? null;
}

export function buildCanonicalOpportunityScorecard(
  opportunity: CanonicalOpportunityCardShape,
): UseCaseScorecard {
  const evidenceConfidence = clampScore(opportunity.confidence.confidence_score);
  const businessValue = clampScore(94 - (opportunity.priority_rank - 1) * 6);
  const deploymentBase =
    opportunity.recommended_motion === "workspace"
      ? 84
      : opportunity.recommended_motion === "hybrid"
        ? 76
        : opportunity.recommended_motion === "api_platform"
          ? 72
          : 68;
  const dependencyPenalty = Math.min(14, opportunity.dependencies.length * 2);
  const securityPenalty = Math.min(10, opportunity.security_compliance_notes.length * 2);
  const deploymentReadiness = clampScore(
    deploymentBase - dependencyPenalty - securityPenalty + Math.round(evidenceConfidence * 0.08),
  );
  const expansionPotential = clampScore(Math.round((businessValue + evidenceConfidence) / 2));
  const openaiFit = clampScore(
    opportunity.recommended_motion === "workspace"
      ? 89
      : opportunity.recommended_motion === "hybrid"
        ? 83
        : opportunity.recommended_motion === "api_platform"
          ? 78
          : 70,
  );
  const sponsorLikelihood = clampScore(
    58 + Math.round(evidenceConfidence * 0.28) + Math.max(0, 10 - opportunity.open_questions.length),
  );
  const riskPenalty = clampScore(
    Math.min(
      30,
      opportunity.dependencies.length * 3 +
        opportunity.security_compliance_notes.length * 4 +
        (opportunity.recommended_motion === "hybrid"
          ? 4
          : opportunity.recommended_motion === "api_platform"
            ? 6
            : 2),
    ),
  );
  const priorityScore = Number(
    (
      businessValue * 0.24 +
      deploymentReadiness * 0.16 +
      expansionPotential * 0.15 +
      openaiFit * 0.15 +
      sponsorLikelihood * 0.12 +
      evidenceConfidence * 0.22 -
      riskPenalty * 0.12
    ).toFixed(1),
  );

  return {
    businessValue,
    deploymentReadiness,
    expansionPotential,
    openaiFit,
    sponsorLikelihood,
    evidenceConfidence,
    riskPenalty,
    priorityScore,
  };
}

export function resolveSourceByCitationId<TSource extends CanonicalSourceLike>(
  sources: TSource[],
  sourceId: number,
) {
  return sources.find((source) => source.id === sourceId || source.canonicalSourceId === sourceId) ?? null;
}

export function getDisplaySourceId(source: CanonicalSourceLike) {
  return source.canonicalSourceId ?? source.id;
}
