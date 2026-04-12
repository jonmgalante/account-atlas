import type { FinalAccountPlan } from "@/lib/types/account-plan";
import type { ReportSectionKey } from "@/lib/types/report";
import type { ResearchSummary } from "@/lib/types/research";

export type MinimumViableReportRequirement =
  | "executive_summary"
  | "company_snapshot"
  | "top_opportunities"
  | "recommended_motion"
  | "stakeholder_hypotheses"
  | "discovery_or_pilot"
  | "visible_citations";

export type OptionalCoverageGap =
  | "missing_discovery_questions"
  | "missing_pilot_plan"
  | "missing_objections"
  | "missing_expansion_scenarios";

export type PublishableReportMode = "full" | "grounded_fallback" | "insufficient";

function hasSourceIds(sourceIds: number[] | null | undefined) {
  return Array.isArray(sourceIds) && sourceIds.length > 0;
}

export function getPrimaryUseCases(accountPlan: FinalAccountPlan | null | undefined) {
  if (!accountPlan) {
    return [];
  }

  return accountPlan.topUseCases.length > 0 ? accountPlan.topUseCases : accountPlan.candidateUseCases.slice(0, 3);
}

export function hasAnyExpansionScenario(accountPlan: FinalAccountPlan | null | undefined) {
  return Boolean(
    accountPlan?.expansionScenarios.low ??
      accountPlan?.expansionScenarios.base ??
      accountPlan?.expansionScenarios.high,
  );
}

export function getReadyReportSectionKeys(input: {
  researchSummary: ResearchSummary | null | undefined;
  accountPlan: FinalAccountPlan | null | undefined;
}) {
  const readySectionKeys = new Set<ReportSectionKey>();
  const prioritizedUseCases = getPrimaryUseCases(input.accountPlan);

  if (input.researchSummary) {
    readySectionKeys.add("company-brief");
    readySectionKeys.add("fact-base");
    readySectionKeys.add("ai-maturity-signals");
  }

  if (prioritizedUseCases.length > 0) {
    readySectionKeys.add("prioritized-use-cases");
  }

  if (input.accountPlan?.overallAccountMotion && hasSourceIds(input.accountPlan.overallAccountMotion.evidenceSourceIds)) {
    readySectionKeys.add("recommended-motion");
  }

  if ((input.accountPlan?.stakeholderHypotheses.length ?? 0) > 0) {
    readySectionKeys.add("stakeholder-hypotheses");
  }

  if ((input.accountPlan?.objectionsAndRebuttals.length ?? 0) > 0) {
    readySectionKeys.add("objections");
  }

  if ((input.accountPlan?.discoveryQuestions.length ?? 0) > 0) {
    readySectionKeys.add("discovery-questions");
  }

  if (input.accountPlan?.pilotPlan) {
    readySectionKeys.add("pilot-plan");
  }

  if (hasAnyExpansionScenario(input.accountPlan)) {
    readySectionKeys.add("expansion-scenarios");
  }

  return readySectionKeys;
}

export function evaluateSellerFacingReport(input: {
  researchSummary: ResearchSummary | null | undefined;
  accountPlan: FinalAccountPlan | null | undefined;
}) {
  const prioritizedUseCases = getPrimaryUseCases(input.accountPlan);
  const hasCompanySnapshot = Boolean(
    input.researchSummary?.companyIdentity.companyName && hasSourceIds(input.researchSummary.companyIdentity.sourceIds),
  );
  const hasTopOpportunities =
    prioritizedUseCases.length >= 3 && prioritizedUseCases.every((useCase) => hasSourceIds(useCase.evidenceSourceIds));
  const hasRecommendedMotion = Boolean(
    input.accountPlan?.overallAccountMotion.rationale &&
      hasSourceIds(input.accountPlan.overallAccountMotion.evidenceSourceIds),
  );
  const hasStakeholderHypotheses = Boolean(
    input.accountPlan?.stakeholderHypotheses.length &&
      input.accountPlan.stakeholderHypotheses.every((stakeholder) => hasSourceIds(stakeholder.evidenceSourceIds)),
  );
  const hasDiscoveryQuestions = Boolean(
    input.accountPlan?.discoveryQuestions.length &&
      input.accountPlan.discoveryQuestions.every((question) => hasSourceIds(question.evidenceSourceIds)),
  );
  const hasPilotPlan = Boolean(
    input.accountPlan?.pilotPlan && hasSourceIds(input.accountPlan.pilotPlan.evidenceSourceIds),
  );
  const hasDerivedExecutiveSummary = hasCompanySnapshot && hasTopOpportunities && hasRecommendedMotion;
  const hasVisibleCitations =
    hasCompanySnapshot &&
    hasRecommendedMotion &&
    hasTopOpportunities &&
    hasStakeholderHypotheses &&
    (hasDiscoveryQuestions || hasPilotPlan);
  const missingRequirements: MinimumViableReportRequirement[] = [];

  if (!hasDerivedExecutiveSummary) {
    missingRequirements.push("executive_summary");
  }

  if (!hasCompanySnapshot) {
    missingRequirements.push("company_snapshot");
  }

  if (!hasTopOpportunities) {
    missingRequirements.push("top_opportunities");
  }

  if (!hasRecommendedMotion) {
    missingRequirements.push("recommended_motion");
  }

  if (!hasStakeholderHypotheses) {
    missingRequirements.push("stakeholder_hypotheses");
  }

  if (!hasDiscoveryQuestions && !hasPilotPlan) {
    missingRequirements.push("discovery_or_pilot");
  }

  if (!hasVisibleCitations) {
    missingRequirements.push("visible_citations");
  }

  const optionalGapKeys: OptionalCoverageGap[] = [];

  if (!hasDiscoveryQuestions) {
    optionalGapKeys.push("missing_discovery_questions");
  }

  if (!hasPilotPlan) {
    optionalGapKeys.push("missing_pilot_plan");
  }

  if ((input.accountPlan?.objectionsAndRebuttals.length ?? 0) === 0) {
    optionalGapKeys.push("missing_objections");
  }

  if (!hasAnyExpansionScenario(input.accountPlan)) {
    optionalGapKeys.push("missing_expansion_scenarios");
  }

  return {
    isSatisfied: missingRequirements.length === 0,
    missingRequirements,
    optionalGapKeys,
    readySectionKeys: getReadyReportSectionKeys(input),
    prioritizedUseCases,
  };
}

function evaluateGroundedFallbackReport(input: {
  researchSummary: ResearchSummary | null | undefined;
  accountPlan: FinalAccountPlan | null | undefined;
}) {
  const prioritizedUseCases = getPrimaryUseCases(input.accountPlan);
  const hasCompanySnapshot = Boolean(
    input.researchSummary?.companyIdentity.companyName && hasSourceIds(input.researchSummary.companyIdentity.sourceIds),
  );
  const hasGroundedFallbackSummary = Boolean(
    input.accountPlan?.publishMode === "grounded_fallback" &&
      input.accountPlan.groundedFallbackBrief?.summary &&
      hasSourceIds(input.accountPlan.groundedFallbackBrief.sourceIds),
  );
  const hasGroundedHypotheses =
    prioritizedUseCases.length === 0 || prioritizedUseCases.every((useCase) => hasSourceIds(useCase.evidenceSourceIds));
  const hasVisibleCitations = hasCompanySnapshot && hasGroundedFallbackSummary && hasGroundedHypotheses;
  const missingRequirements: MinimumViableReportRequirement[] = [];

  if (!hasGroundedFallbackSummary) {
    missingRequirements.push("executive_summary");
  }

  if (!hasCompanySnapshot) {
    missingRequirements.push("company_snapshot");
  }

  if (!hasVisibleCitations) {
    missingRequirements.push("visible_citations");
  }

  return {
    isSatisfied:
      input.accountPlan?.publishMode === "grounded_fallback" &&
      hasCompanySnapshot &&
      hasGroundedFallbackSummary &&
      hasVisibleCitations,
    missingRequirements,
    optionalGapKeys: [] as OptionalCoverageGap[],
    readySectionKeys: getReadyReportSectionKeys(input),
    prioritizedUseCases,
  };
}

export function evaluatePublishableReport(input: {
  researchSummary: ResearchSummary | null | undefined;
  accountPlan: FinalAccountPlan | null | undefined;
}) {
  const sellerFacing = evaluateSellerFacingReport(input);

  if (sellerFacing.isSatisfied) {
    return {
      ...sellerFacing,
      publishMode: "full" as const satisfies PublishableReportMode,
      isFullSellerFacing: true,
      isGroundedFallback: false,
    };
  }

  const groundedFallback = evaluateGroundedFallbackReport(input);

  if (groundedFallback.isSatisfied) {
    return {
      ...groundedFallback,
      publishMode: "grounded_fallback" as const satisfies PublishableReportMode,
      isFullSellerFacing: false,
      isGroundedFallback: true,
    };
  }

  return {
    ...(input.accountPlan?.publishMode === "grounded_fallback" ? groundedFallback : sellerFacing),
    publishMode: "insufficient" as const satisfies PublishableReportMode,
    isFullSellerFacing: false,
    isGroundedFallback: false,
  };
}

export function formatMinimumViableRequirement(requirement: MinimumViableReportRequirement) {
  switch (requirement) {
    case "executive_summary":
      return "executive summary";
    case "company_snapshot":
      return "company snapshot";
    case "top_opportunities":
      return "top opportunities";
    case "recommended_motion":
      return "recommended motion";
    case "stakeholder_hypotheses":
      return "stakeholder hypotheses";
    case "discovery_or_pilot":
      return "discovery questions or pilot framing";
    case "visible_citations":
      return "visible citations";
  }
}

export function formatOptionalCoverageGap(gap: OptionalCoverageGap) {
  switch (gap) {
    case "missing_discovery_questions":
      return "discovery questions";
    case "missing_pilot_plan":
      return "pilot framing";
    case "missing_objections":
      return "objection handling";
    case "missing_expansion_scenarios":
      return "expansion scenarios";
  }
}
