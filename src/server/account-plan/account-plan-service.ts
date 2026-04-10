import "server-only";

import type {
  AccountPlanUseCase,
  DiscoveryQuestion,
  ExpansionScenario,
  FinalAccountPlan,
  ObjectionAndRebuttal,
  PilotPlan,
  StakeholderHypothesis,
} from "@/lib/types/account-plan";
import {
  evaluateSellerFacingReport,
  formatMinimumViableRequirement,
  formatOptionalCoverageGap,
} from "@/lib/report-completion";
import type { FactPacket } from "@/lib/types/research";
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
import { buildFactPacket, parseFactPacketArtifact } from "@/server/research/fact-packet";
import { normalizeUseCaseScorecard, rankAccountPlanUseCases } from "@/server/account-plan/scoring";
import {
  type AccountPlanNarrativeOutput,
  type CandidateUseCaseGenerationOutput,
  accountPlanNarrativeSchema,
  candidateUseCaseGenerationSchema,
} from "@/server/account-plan/schemas";

type AccountPlanServiceDependencies = {
  repository?: ReportRepository;
  openAIClient?: OpenAIResearchClient;
};

const ACCOUNT_PLAN_USE_CASE_TIMEOUT_MS = 150_000;
const ACCOUNT_PLAN_NARRATIVE_TIMEOUT_MS = 75_000;
const ACCOUNT_PLAN_OPENAI_MAX_ATTEMPTS = 1;

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

function summarizeSourcesForPrompt(packet: FactPacket) {
  return packet.sourceRegistry.map((source) => ({
    ...source,
    summary: source.summary ?? "No normalized summary was stored for this source.",
  }));
}

function summarizeFactsForPrompt(packet: FactPacket) {
  return packet.evidence.map((fact) => ({
    id: fact.factId,
    claim: fact.claim,
    section: fact.section,
    classification: fact.classification,
    confidence: fact.confidence,
    freshness: fact.freshness,
    sentiment: fact.sentiment,
    relevance: fact.relevance,
    rationale: fact.rationale,
    sourceIds: fact.sourceIds,
  }));
}

function buildCandidateUseCasePrompt(
  context: StoredRunContext,
  factPacket: FactPacket,
) {
  return compactJson({
    companyUrl: context.report.normalizedInputUrl,
    canonicalDomain: context.report.canonicalDomain,
    companyName: factPacket.summary.companyIdentity.companyName,
    researchSummary: factPacket.summary,
    sourceRegistry: summarizeSourcesForPrompt(factPacket),
    factBase: summarizeFactsForPrompt(factPacket),
    factPacket: {
      briefMode: factPacket.briefMode,
      sectionCoverage: factPacket.sectionCoverage,
      evidenceGaps: factPacket.evidenceGaps,
      researchCompletenessScore: factPacket.researchCompletenessScore,
      overallConfidence: factPacket.overallConfidence,
    },
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
      evidenceRule: "Every use case must cite one or more valid source IDs from the source registry.",
      tone: "Prefer practical, measurable use cases first. Keep uncertainty explicit when evidence is thin.",
    },
  });
}

function buildAccountPlanNarrativePrompt(
  context: StoredRunContext,
  factPacket: FactPacket,
  rankedUseCases: AccountPlanUseCase[],
) {
  return compactJson({
    companyUrl: context.report.normalizedInputUrl,
    canonicalDomain: context.report.canonicalDomain,
    companyName: factPacket.summary.companyIdentity.companyName,
    researchSummary: factPacket.summary,
    sourceRegistry: summarizeSourcesForPrompt(factPacket),
    factBase: summarizeFactsForPrompt(factPacket),
    factPacket: {
      briefMode: factPacket.briefMode,
      sectionCoverage: factPacket.sectionCoverage,
      evidenceGaps: factPacket.evidenceGaps,
      researchCompletenessScore: factPacket.researchCompletenessScore,
      overallConfidence: factPacket.overallConfidence,
    },
    candidateUseCases: rankedUseCases,
    topUseCases: rankedUseCases.slice(0, 3),
    requirements: {
      overallMotion: "Recommend exactly one of workspace, api_platform, or hybrid for the overall account.",
      stakeholders: "Return stakeholder hypotheses, not asserted named people.",
      uncertainty: "When evidence is thin, state that clearly in rationale, open questions, and pilot scope.",
    },
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

  if (persistedFactPacket) {
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

  return rankAccountPlanUseCases(normalized);
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

export function createAccountPlanService(dependencies: AccountPlanServiceDependencies = {}) {
  const repository = dependencies.repository ?? drizzleReportRepository;
  const openAIClient = dependencies.openAIClient ?? createOpenAIResearchClient();

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
      const { factPacket, fallbackApplied: factPacketFallbackApplied } = await loadFactPacket(repository, workingContext);
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

      const validSourceIds = new Set(factPacket.sourceRegistry.map((source) => source.sourceId));
      const candidateUseCaseInput = buildCandidateUseCasePrompt(workingContext, factPacket);

      logServerEvent("info", "account_plan.openai.requested", {
        shareId: workingContext.report.shareId,
        runId: workingContext.run.id,
        operation: "candidate_use_cases",
        timeoutMs: ACCOUNT_PLAN_USE_CASE_TIMEOUT_MS,
        maxOutputTokens: 7_000,
        briefMode: factPacket.briefMode,
        factCount: factPacket.evidence.length,
        inputChars: candidateUseCaseInput.length,
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
        workingContext,
        "account_plan.candidate_use_cases.completed",
        useCaseResponse,
      );

      const rankedUseCases = sanitizeCandidateUseCases(useCaseResponse.parsed.useCases, validSourceIds);
      const topUseCases = rankedUseCases.slice(0, 3);

      if (topUseCases.length < 3) {
        throw new Error("Account-plan synthesis requires at least three valid use cases after ranking.");
      }

      await repository.replaceUseCasesForRun({
        reportId: workingContext.report.id,
        runId: workingContext.run.id,
        useCases: rankedUseCases,
      });

      const narrativeInput = buildAccountPlanNarrativePrompt(workingContext, factPacket, rankedUseCases);

      logServerEvent("info", "account_plan.openai.requested", {
        shareId: workingContext.report.shareId,
        runId: workingContext.run.id,
        operation: "narrative",
        timeoutMs: ACCOUNT_PLAN_NARRATIVE_TIMEOUT_MS,
        maxOutputTokens: 6_000,
        briefMode: factPacket.briefMode,
        factCount: factPacket.evidence.length,
        rankedUseCaseCount: rankedUseCases.length,
        inputChars: narrativeInput.length,
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

      await appendStructuredDebugEvent(
        repository,
        workingContext,
        "account_plan.narrative.completed",
        narrativeResponse,
      );

      const narrative = sanitizeAccountPlanNarrative(narrativeResponse.parsed, validSourceIds);
      const accountPlan: FinalAccountPlan = {
        overallAccountMotion: narrative.overallAccountMotion,
        candidateUseCases: rankedUseCases,
        topUseCases,
        stakeholderHypotheses: narrative.stakeholderHypotheses,
        objectionsAndRebuttals: narrative.objectionsAndRebuttals,
        discoveryQuestions: narrative.discoveryQuestions,
        pilotPlan: narrative.pilotPlan,
        expansionScenarios: narrative.expansionScenarios,
      };

      await repository.replaceStakeholdersForRun({
        reportId: workingContext.report.id,
        runId: workingContext.run.id,
        stakeholders: narrative.stakeholderHypotheses,
      });

      await repository.updateRunAccountPlan({
        reportId: workingContext.report.id,
        runId: workingContext.run.id,
        accountPlan,
      });

      const contract = evaluateSellerFacingReport({
        researchSummary,
        accountPlan,
      });

      if (!contract.isSatisfied) {
        throw new Error(
          `Persisted account plan did not satisfy the minimum viable seller-facing contract: ${contract.missingRequirements.map(formatMinimumViableRequirement).join(", ")}.`,
        );
      }

      const optionalGapKeys = [...contract.optionalGapKeys];
      const limitedCoverageAreas: string[] = [...optionalGapKeys.map(formatOptionalCoverageGap)];

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
          message: `Core seller-facing sections were persisted, but optional coverage remained limited in ${limitedCoverageAreas.join(", ")}.`,
          metadata: {
            optionalGapKeys,
            factPacketFallbackApplied,
            briefMode: factPacket.briefMode,
            candidateUseCaseCount: rankedUseCases.length,
          },
        });
      }

      await repository.appendRunEvent({
        reportId: workingContext.report.id,
        runId: workingContext.run.id,
        level: "info",
        eventType: "account_plan.completed",
        stepKey: "generate_account_plan",
        message: `Stored an account plan with ${rankedUseCases.length} candidate use cases and ${topUseCases.length} prioritized recommendations.`,
        metadata: {
          briefMode: factPacket.briefMode,
          factPacketFallbackApplied,
          overallMotion: accountPlan.overallAccountMotion.recommendedMotion,
          optionalGapKeys,
          topUseCases: topUseCases.map((useCase) => ({
            priorityRank: useCase.priorityRank,
            department: useCase.department,
            workflowName: useCase.workflowName,
            priorityScore: useCase.scorecard.priorityScore,
          })),
        },
      });

      return limitedCoverageAreas.length > 0
        ? `Generated a usable account plan with ${rankedUseCases.length} candidate use cases. Overall motion: ${accountPlan.overallAccountMotion.recommendedMotion}. Optional coverage remained limited in ${limitedCoverageAreas.join(", ")}.`
        : `Generated an account plan with ${rankedUseCases.length} candidate use cases. Overall motion: ${accountPlan.overallAccountMotion.recommendedMotion}.`;
    },
  };
}
