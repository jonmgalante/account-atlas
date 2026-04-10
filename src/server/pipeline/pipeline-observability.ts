import "server-only";

import type { PipelineStepKey, ReportEventLevel } from "@/lib/types/report";
import { evaluateSellerFacingReport } from "@/lib/report-completion";
import { logServerEvent } from "@/server/observability/logger";
import { normalizePipelineState } from "@/server/pipeline/pipeline-steps";
import type { PersistedArtifact, ReportRepository, StoredRunContext } from "@/server/repositories/report-repository";

type LogLevel = "info" | "warn" | "error";

export async function recordPipelineEvent(input: {
  repository: ReportRepository;
  context: Pick<StoredRunContext, "report" | "run">;
  level: ReportEventLevel;
  eventType: string;
  stepKey?: PipelineStepKey | null;
  message: string;
  metadata?: Record<string, unknown>;
}) {
  const metadata = {
    ...(input.metadata ?? {}),
    shareId: input.context.report.shareId,
    runId: input.context.run.id,
  };

  await input.repository.appendRunEvent({
    reportId: input.context.report.id,
    runId: input.context.run.id,
    level: input.level,
    eventType: input.eventType,
    stepKey: input.stepKey ?? null,
    message: input.message,
    metadata,
  });

  logServerEvent(mapEventLevelToLogLevel(input.level), input.eventType, {
    shareId: input.context.report.shareId,
    runId: input.context.run.id,
    ...(input.stepKey ? { stepKey: input.stepKey } : {}),
    ...(input.metadata ?? {}),
  });
}

export function summarizeRunCoverage(
  context: Pick<StoredRunContext, "run">,
  artifacts: PersistedArtifact[],
) {
  const availableArtifactTypes = [...new Set(artifacts.map((artifact) => artifact.artifactType))];
  const coverageLimitations: string[] = [];
  const pipelineState = normalizePipelineState(context.run.pipelineState);
  const contract = evaluateSellerFacingReport({
    researchSummary: context.run.researchSummary,
    accountPlan: context.run.accountPlan,
  });
  const fallbackSteps = Object.entries(pipelineState.steps)
    .filter(([, stepState]) => stepState.fallbackApplied)
    .map(([stepKey]) => stepKey);

  if (!contract.isSatisfied) {
    coverageLimitations.push(...contract.missingRequirements.map((requirement) => `missing_core:${requirement}`));
  }

  if (!availableArtifactTypes.includes("markdown")) {
    coverageLimitations.push("missing_markdown_export");
  }

  if (!availableArtifactTypes.includes("pdf")) {
    coverageLimitations.push("missing_pdf_export");
  }

  if (fallbackSteps.length) {
    coverageLimitations.push(...fallbackSteps.map((stepKey) => `fallback_applied:${stepKey}`));
  }

  if (contract.optionalGapKeys.length) {
    coverageLimitations.push(...contract.optionalGapKeys.map((gapKey) => `optional_gap:${gapKey}`));
  }

  return {
    availableArtifactTypes,
    coverageLimitations,
    hasLimitedCoverage: contract.isSatisfied && coverageLimitations.length > 0,
    coreContractSatisfied: contract.isSatisfied,
    usableDataAvailable:
      Boolean(context.run.researchSummary) ||
      Boolean(context.run.accountPlan) ||
      availableArtifactTypes.some((artifactType) =>
        ["markdown", "pdf", "structured_json", "source_bundle"].includes(artifactType),
      ),
  };
}

function mapEventLevelToLogLevel(level: ReportEventLevel): LogLevel {
  switch (level) {
    case "warning":
      return "warn";
    case "error":
      return "error";
    default:
      return "info";
  }
}
