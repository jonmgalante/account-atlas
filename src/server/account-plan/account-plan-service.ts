import "server-only";

import { createHash } from "node:crypto";

import type {
  AccountPlanUseCase,
  ExpansionScenario,
  FinalAccountPlan,
  StakeholderHypothesis,
} from "@/lib/types/account-plan";
import type { PersistedFact, PersistedSource, ReportRepository, StoredRunContext, UpsertArtifactInput } from "@/server/repositories/report-repository";
import { drizzleReportRepository } from "@/server/repositories/report-repository";
import { maybeStoreBlobArtifact } from "@/server/storage/blob-store";
import { OPENAI_SYNTHESIS_MODEL } from "@/server/openai/models";
import {
  createOpenAIResearchClient,
  type OpenAIResearchClient,
  type ParsedStructuredResponse,
} from "@/server/openai/client";
import { createResearchPipelineService } from "@/server/research/research-service";
import { buildSourceRegistry } from "@/server/research/source-registry";
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
  researchService?: ReturnType<typeof createResearchPipelineService>;
};

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

function summarizeSourcesForPrompt(sources: PersistedSource[]) {
  return buildSourceRegistry(sources).map((source) => ({
    ...source,
    summary: source.summary ?? "No normalized summary was stored for this source.",
  }));
}

function summarizeFactsForPrompt(facts: PersistedFact[]) {
  return facts.map((fact) => ({
    id: fact.id,
    claim: fact.statement,
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
  sources: PersistedSource[],
  facts: PersistedFact[],
  researchSummary: NonNullable<StoredRunContext["run"]["researchSummary"]>,
) {
  return compactJson({
    companyUrl: context.report.normalizedInputUrl,
    canonicalDomain: context.report.canonicalDomain,
    companyName: researchSummary.companyIdentity.companyName,
    researchSummary,
    sourceRegistry: summarizeSourcesForPrompt(sources),
    factBase: summarizeFactsForPrompt(facts),
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
      useCaseCount: "Return between 12 and 15 candidate use cases.",
      evidenceRule: "Every use case must cite one or more valid source IDs from the source registry.",
      tone: "Prefer practical, measurable use cases first. Keep uncertainty explicit when evidence is thin.",
    },
  });
}

function buildAccountPlanNarrativePrompt(
  context: StoredRunContext,
  sources: PersistedSource[],
  facts: PersistedFact[],
  researchSummary: NonNullable<StoredRunContext["run"]["researchSummary"]>,
  rankedUseCases: AccountPlanUseCase[],
) {
  return compactJson({
    companyUrl: context.report.normalizedInputUrl,
    canonicalDomain: context.report.canonicalDomain,
    companyName: researchSummary.companyIdentity.companyName,
    researchSummary,
    sourceRegistry: summarizeSourcesForPrompt(sources),
    factBase: summarizeFactsForPrompt(facts),
    candidateUseCases: rankedUseCases,
    topUseCases: rankedUseCases.slice(0, 3),
    requirements: {
      overallMotion: "Recommend exactly one of workspace, api_platform, or hybrid for the overall account.",
      stakeholders: "Return stakeholder hypotheses, not asserted named people.",
      uncertainty: "When evidence is thin, state that clearly in rationale, open questions, and pilot scope.",
    },
  });
}

function buildAccountPlanArtifactBundle(input: {
  reportId: number;
  runId: number;
  accountPlan: FinalAccountPlan;
  researchSummary: NonNullable<StoredRunContext["run"]["researchSummary"]>;
  facts: PersistedFact[];
  sources: PersistedSource[];
}): UpsertArtifactInput {
  const body = compactJson({
    accountPlan: input.accountPlan,
    researchSummary: input.researchSummary,
    factBase: input.facts.map((fact) => ({
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
    reportId: input.reportId,
    runId: input.runId,
    artifactType: "structured_json",
    mimeType: "application/json",
    fileName: "account-plan.json",
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

async function maybeWriteAccountPlanArtifact(
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
    pathname: `reports/${context.report.id}/runs/${context.run.id}/account-plan/account-plan.json`,
    body: inlineJson,
    contentType: "application/json",
    minimumBytes: 0,
  });

  await repository.upsertArtifact({
    ...bundle,
    storagePointers: {
      ...storagePointers,
      blob,
    },
  });
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

  if (normalized.length < 12 || normalized.length > 15) {
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

function sanitizeExpansionScenario(scenario: ExpansionScenario, validSourceIds: Set<number>): ExpansionScenario {
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
    throw new Error("Account-plan expansion scenarios returned invalid evidence references.");
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

  const objectionsAndRebuttals = narrative.objectionsAndRebuttals
    .map((item) => ({
      objection: item.objection.trim(),
      rebuttal: item.rebuttal.trim(),
      evidenceSourceIds: sanitizeSourceIds(item.evidenceSourceIds, validSourceIds),
    }))
    .filter((item) => item.objection && item.rebuttal && item.evidenceSourceIds.length > 0);

  const discoveryQuestions = narrative.discoveryQuestions
    .map((item) => ({
      question: item.question.trim(),
      whyItMatters: item.whyItMatters.trim(),
      evidenceSourceIds: sanitizeSourceIds(item.evidenceSourceIds, validSourceIds),
    }))
    .filter((item) => item.question && item.whyItMatters && item.evidenceSourceIds.length > 0);

  const pilotPlan = {
    objective: narrative.pilotPlan.objective.trim(),
    recommendedMotion: narrative.pilotPlan.recommendedMotion,
    scope: narrative.pilotPlan.scope.trim(),
    successMetrics: normalizeStringArray(narrative.pilotPlan.successMetrics),
    phases: narrative.pilotPlan.phases.map((phase) => ({
      name: phase.name.trim(),
      duration: phase.duration.trim(),
      goals: normalizeStringArray(phase.goals),
      deliverables: normalizeStringArray(phase.deliverables),
    })),
    dependencies: normalizeStringArray(narrative.pilotPlan.dependencies),
    risks: normalizeStringArray(narrative.pilotPlan.risks),
    evidenceSourceIds: sanitizeSourceIds(narrative.pilotPlan.evidenceSourceIds, validSourceIds),
  };

  if (
    !pilotPlan.objective ||
    !pilotPlan.scope ||
    pilotPlan.successMetrics.length < 2 ||
    pilotPlan.phases.length < 3 ||
    !pilotPlan.evidenceSourceIds.length
  ) {
    throw new Error("Account-plan pilot plan returned invalid evidence references or missing required content.");
  }

  if (objectionsAndRebuttals.length < 4) {
    throw new Error("Account-plan objections synthesis returned too few valid objection entries.");
  }

  if (discoveryQuestions.length < 6) {
    throw new Error("Account-plan discovery question synthesis returned too few valid questions.");
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
  const researchService =
    dependencies.researchService ??
    createResearchPipelineService({
      repository,
      openAIClient,
    });

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

      let workingContext = context;

      if (!workingContext.run.researchSummary) {
        await researchService.generateResearchSummary(workingContext);
        const refreshed = await repository.findRunContextById(workingContext.run.id);

        if (!refreshed) {
          throw new Error(`Report run ${workingContext.run.id} could not be reloaded after research summary synthesis.`);
        }

        workingContext = refreshed;
      }

      const researchSummary = workingContext.run.researchSummary;

      if (!researchSummary) {
        throw new Error("Account-plan generation requires a persisted research summary.");
      }

      const [sources, facts] = await Promise.all([
        repository.listSourcesByRunId(workingContext.run.id),
        repository.listFactsByRunId(workingContext.run.id),
      ]);

      if (!sources.length) {
        throw new Error("Account-plan generation requires at least one persisted source.");
      }

      const validSourceIds = new Set(sources.map((source) => source.id));
      const useCaseResponse = await openAIClient.parseStructuredOutput({
        model: OPENAI_SYNTHESIS_MODEL,
        instructions:
          "Generate 12 to 15 evidence-backed enterprise AI use cases from the provided research summary and fact base. Use only source IDs from the registry. Prefer practical, measurable use cases and keep uncertainty explicit when evidence is thin.",
        input: buildCandidateUseCasePrompt(workingContext, sources, facts, researchSummary),
        schema: candidateUseCaseGenerationSchema,
        schemaName: "account_plan_candidate_use_cases",
        tools: workingContext.run.vectorStoreId
          ? [
              {
                type: "file_search",
                vector_store_ids: [workingContext.run.vectorStoreId],
                max_num_results: 10,
              },
            ]
          : undefined,
        include: workingContext.run.vectorStoreId ? ["file_search_call.results"] : undefined,
        maxOutputTokens: 7_000,
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

      const narrativeResponse = await openAIClient.parseStructuredOutput({
        model: OPENAI_SYNTHESIS_MODEL,
        instructions:
          "Generate the final evidence-backed account plan narrative. Use only valid source IDs from the registry, recommend a clear motion, keep stakeholder entries hypothetical, and do not imply certainty when evidence is weak.",
        input: buildAccountPlanNarrativePrompt(workingContext, sources, facts, researchSummary, rankedUseCases),
        schema: accountPlanNarrativeSchema,
        schemaName: "account_plan_narrative",
        tools: workingContext.run.vectorStoreId
          ? [
              {
                type: "file_search",
                vector_store_ids: [workingContext.run.vectorStoreId],
                max_num_results: 8,
              },
            ]
          : undefined,
        include: workingContext.run.vectorStoreId ? ["file_search_call.results"] : undefined,
        maxOutputTokens: 6_000,
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

      await repository.replaceUseCasesForRun({
        reportId: workingContext.report.id,
        runId: workingContext.run.id,
        useCases: rankedUseCases,
      });

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

      await maybeWriteAccountPlanArtifact(
        workingContext,
        repository,
        buildAccountPlanArtifactBundle({
          reportId: workingContext.report.id,
          runId: workingContext.run.id,
          accountPlan,
          researchSummary,
          facts,
          sources,
        }),
      );

      await repository.appendRunEvent({
        reportId: workingContext.report.id,
        runId: workingContext.run.id,
        level: "info",
        eventType: "account_plan.completed",
        stepKey: "generate_account_plan",
        message: `Stored an account plan with ${rankedUseCases.length} candidate use cases and ${topUseCases.length} prioritized recommendations.`,
        metadata: {
          overallMotion: accountPlan.overallAccountMotion.recommendedMotion,
          topUseCases: topUseCases.map((useCase) => ({
            priorityRank: useCase.priorityRank,
            department: useCase.department,
            workflowName: useCase.workflowName,
            priorityScore: useCase.scorecard.priorityScore,
          })),
        },
      });

      return `Generated an account plan with ${rankedUseCases.length} candidate use cases. Overall motion: ${accountPlan.overallAccountMotion.recommendedMotion}.`;
    },
  };
}
