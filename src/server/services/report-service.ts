import "server-only";

import {
  canonicalCitationSourceIds,
  getCanonicalReadySectionKeys,
  getCanonicalSectionCoverage,
  isCanonicalGroundedFallbackReport,
} from "@/lib/canonical-report";
import { createPendingReportSections } from "@/lib/report-sections";
import { evaluatePublishableReport, getReadyReportSectionKeys } from "@/lib/report-completion";
import type { FinalAccountPlan } from "@/lib/types/account-plan";
import type {
  CreateReportResponse,
  ReportArtifactRecord,
  ReportContentState,
  ReportDocument,
  ReportFactRecord,
  ReportPageModel,
  ReportProgressEvent,
  ReportSectionShell,
  ReportSourceRecord,
  ReportRunSummary,
  ReportShell,
  ReportThinEvidenceWarning,
  ReportStatusShell,
  ReportSummary,
} from "@/lib/types/report";
import type { ResearchSummary } from "@/lib/types/research";
import { createShareId } from "@/lib/id";
import { extractCanonicalDomain, normalizeCompanyUrl } from "@/lib/url";
import { isDatabaseConfigError } from "@/server/db/client";
import {
  createDeepResearchReportGenerationService,
  type DeepResearchReportGenerationService,
} from "@/server/deep-research/report-generation-service";
import { serverEnv } from "@/env/server";
import { createReportExportService } from "@/server/exports/export-service";
import { logServerEvent } from "@/server/observability/logger";
import { coercePipelineStepKey, normalizePipelineState, serializePipelineProgress } from "@/server/pipeline/pipeline-steps";
import { ReportCreatePolicyError } from "@/server/reporting/report-create-policy";
import {
  drizzleReportRepository,
  type CreatedQueuedReportRecord,
  type PersistedArtifact,
  type ReportRepository,
  type StoredReportShell,
} from "@/server/repositories/report-repository";

const MAX_SHARE_ID_ATTEMPTS = 12;
const STATUS_POLL_INTERVAL_MS = 2_000;
const STATUS_POLL_INTERVAL_SLOW_MS = 4_000;
const STATUS_POLL_INTERVAL_RETRY_MS = 6_000;
const NOT_FOUND_MESSAGE = "No saved report was found for this share link.";
const DB_UNAVAILABLE_MESSAGE =
  "Server-side persistence is not configured yet. Set DATABASE_URL and run the Drizzle migration to activate reports.";

type ReportServiceDependencies = {
  repository?: ReportRepository;
  shareIdGenerator?: () => string;
  reportGenerationService?: DeepResearchReportGenerationService;
  exportService?: ReturnType<typeof createReportExportService>;
};

type CreateReportOptions = {
  requesterHash?: string | null;
};

type BackgroundRefreshResult = {
  shareId: string;
  runId: number;
  executionMode: CreateReportResponse["executionMode"];
} | null;

function createStatusUrl(shareId: string) {
  return `/api/reports/${shareId}/status`;
}

function createArtifactDownloadPath(shareId: string, artifactType: PersistedArtifact["artifactType"]) {
  return `/api/reports/${shareId}/artifacts/${artifactType}`;
}

function serializeReport(report: StoredReportShell["report"] | CreatedQueuedReportRecord["report"]): ReportSummary {
  return {
    shareId: report.shareId,
    status: report.status,
    normalizedInputUrl: report.normalizedInputUrl,
    canonicalDomain: report.canonicalDomain,
    companyName: report.companyName,
    createdAt: report.createdAt.toISOString(),
    updatedAt: report.updatedAt.toISOString(),
    completedAt: report.completedAt?.toISOString() ?? null,
  };
}

function buildRunDisplayStatus(input: {
  run: StoredReportShell["currentRun"] | CreatedQueuedReportRecord["currentRun"] | null;
  reportStatus: StoredReportShell["report"]["status"] | CreatedQueuedReportRecord["report"]["status"];
}): ReportRunSummary["displayStatus"] {
  const { run, reportStatus } = input;

  if (reportStatus === "failed" || run?.status === "failed" || run?.status === "cancelled") {
    return "failed";
  }

  if (
    isCanonicalGroundedFallbackReport(run?.canonicalReport) &&
    (reportStatus === "ready" || reportStatus === "ready_with_limited_coverage" || run?.status === "completed")
  ) {
    return "completed_with_grounded_fallback";
  }

  if (reportStatus === "ready" || reportStatus === "ready_with_limited_coverage" || run?.status === "completed") {
    return "completed";
  }

  if (reportStatus === "queued" || run?.status === "queued" || !run) {
    return "queued";
  }

  return "in_progress";
}

function isDeepResearchRun(
  run: NonNullable<StoredReportShell["currentRun"]> | ReportRunSummary | null,
) {
  if (!run) {
    return false;
  }

  if (run.canonicalReport) {
    return true;
  }

  const hasLegacyMaterialization = Boolean(run.researchSummary || run.accountPlan);

  if (hasLegacyMaterialization) {
    return false;
  }

  return Boolean(run.openaiResponseId || run.openaiResponseStatus);
}

function buildDeepResearchProgress(
  run: NonNullable<StoredReportShell["currentRun"]>,
  displayStatus: ReportRunSummary["displayStatus"],
): ReportRunSummary["progress"] {
  const startedAt = run.startedAt?.toISOString() ?? null;
  const updatedAt = run.updatedAt.toISOString();
  const completedAt = run.completedAt?.toISOString() ?? null;
  const failedState = run.status === "failed" || run.status === "cancelled" || displayStatus === "failed";
  const completedState =
    run.status === "completed" ||
    displayStatus === "completed" ||
    displayStatus === "completed_with_grounded_fallback";
  const activeState = !failedState && !completedState && displayStatus === "in_progress";

  const steps: ReportRunSummary["progress"]["steps"] = [
    {
      key: "normalize_target",
      label: "Preflight",
      progressPercent: 12,
      attemptCount: 1,
      startedAt,
      completedAt: startedAt,
      lastAttemptedAt: startedAt,
      lastDeliveryCount: 1,
      errorCode: null,
      errorMessage: null,
      fallbackApplied: false,
      retryExhausted: false,
      status: "completed" as const,
    },
    {
      key: "generate_account_plan",
      label: "Deep research",
      progressPercent: 68,
      attemptCount: run.startedAt ? 1 : 0,
      startedAt,
      completedAt: completedState ? completedAt ?? updatedAt : null,
      lastAttemptedAt: updatedAt,
      lastDeliveryCount: 1,
      errorCode: failedState ? run.errorCode : null,
      errorMessage: failedState ? run.errorMessage : null,
      fallbackApplied: false,
      retryExhausted: failedState,
      status: failedState ? "failed" : completedState ? "completed" : activeState ? "running" : "pending",
    },
    {
      key: "finalize_report",
      label: "Publish report",
      progressPercent: 100,
      attemptCount: completedState || failedState ? 1 : 0,
      startedAt: completedState || failedState ? startedAt : null,
      completedAt: completedState ? completedAt ?? updatedAt : null,
      lastAttemptedAt: completedState || failedState ? updatedAt : null,
      lastDeliveryCount: completedState || failedState ? 1 : null,
      errorCode: null,
      errorMessage: null,
      fallbackApplied: displayStatus === "completed_with_grounded_fallback",
      retryExhausted: false,
      status: completedState ? "completed" : "pending",
    },
  ];
  const currentStepKey = completedState || failedState ? null : "generate_account_plan";

  return {
    totalSteps: steps.length,
    completedSteps: steps.filter((step) => step.status === "completed").length,
    currentStepKey,
    currentStepLabel: currentStepKey ? steps.find((step) => step.key === currentStepKey)?.label ?? null : null,
    steps,
  };
}

function serializeRun(
  input: {
    run: StoredReportShell["currentRun"] | CreatedQueuedReportRecord["currentRun"];
    reportStatus: StoredReportShell["report"]["status"] | CreatedQueuedReportRecord["report"]["status"];
  },
): ReportRunSummary | null {
  const { run, reportStatus } = input;

  if (!run) {
    return null;
  }

  const displayStatus = buildRunDisplayStatus({
    run,
    reportStatus,
  });
  const progress = isDeepResearchRun(run)
    ? buildDeepResearchProgress(run, displayStatus)
    : serializePipelineProgress(normalizePipelineState(run.pipelineState));

  return {
    id: run.id,
    status: run.status,
    displayStatus,
    progressPercent: run.progressPercent,
    stepKey: progress.currentStepKey ?? (isDeepResearchRun(run) ? null : coercePipelineStepKey(run.stepKey)),
    stepLabel: progress.currentStepLabel,
    executionMode: run.executionMode,
    statusMessage: run.statusMessage,
    openaiResponseId: run.openaiResponseId ?? null,
    openaiResponseStatus: run.openaiResponseStatus ?? null,
    errorCode: run.errorCode,
    errorMessage: run.errorMessage,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
    startedAt: run.startedAt?.toISOString() ?? null,
    completedAt: run.completedAt?.toISOString() ?? null,
    failedAt: run.failedAt?.toISOString() ?? null,
    progress,
    canonicalReport: run.canonicalReport ?? null,
    researchSummary: (run.researchSummary ?? null) as ResearchSummary | null,
    accountPlan: (run.accountPlan ?? null) as FinalAccountPlan | null,
  };
}

function serializeEvent(event: StoredReportShell["recentEvents"][number]): ReportProgressEvent {
  return {
    id: event.id,
    level: event.level,
    eventType: event.eventType,
    stepKey: coercePipelineStepKey(event.stepKey),
    message: event.message,
    occurredAt: event.occurredAt.toISOString(),
  };
}

function serializeSource(source: Awaited<ReturnType<ReportRepository["listSourcesByRunId"]>>[number]): ReportSourceRecord {
  const summaryCandidate =
    typeof source.storagePointers.summary === "string"
      ? source.storagePointers.summary
      : source.textContent ?? source.markdownContent ?? null;
  const canonicalSourceId =
    typeof source.storagePointers.canonicalSourceId === "number" && Number.isInteger(source.storagePointers.canonicalSourceId)
      ? source.storagePointers.canonicalSourceId
      : null;

  return {
    id: source.id,
    canonicalSourceId,
    title: source.title ?? source.canonicalUrl,
    url: source.canonicalUrl,
    canonicalDomain: source.canonicalDomain,
    sourceType: source.sourceType,
    sourceTier: source.sourceTier,
    mimeType: source.mimeType,
    publishedAt: source.publishedAt?.toISOString() ?? null,
    retrievedAt: source.retrievedAt?.toISOString() ?? null,
    discoveredAt: source.discoveredAt.toISOString(),
    summary: summaryCandidate ? summaryCandidate.replace(/\s+/g, " ").trim().slice(0, 420) : null,
  };
}

function serializeFact(fact: Awaited<ReturnType<ReportRepository["listFactsByRunId"]>>[number]): ReportFactRecord {
  return {
    id: fact.id,
    section: fact.section,
    classification: fact.classification,
    statement: fact.statement,
    rationale: fact.rationale,
    confidence: fact.confidence,
    freshness: fact.freshness,
    sentiment: fact.sentiment,
    relevance: fact.relevance,
    evidenceSnippet: fact.evidenceSnippet,
    sourceIds: fact.sourceIds,
  };
}

function serializeArtifact(
  artifact: Awaited<ReturnType<ReportRepository["listArtifactsByRunId"]>>[number],
  shareId: string,
): ReportArtifactRecord {
  const downloadPath =
    artifact.artifactType === "markdown" || artifact.artifactType === "pdf"
      ? createArtifactDownloadPath(shareId, artifact.artifactType)
      : null;

  return {
    id: artifact.id,
    artifactType: artifact.artifactType,
    mimeType: artifact.mimeType,
    fileName: artifact.fileName,
    sizeBytes: artifact.sizeBytes,
    contentHash: artifact.contentHash,
    createdAt: artifact.createdAt.toISOString(),
    updatedAt: artifact.updatedAt.toISOString(),
    downloadPath,
  };
}

type ArtifactDownloadPayload =
  | {
      kind: "redirect";
      url: string;
      fileName: string;
      mimeType: string;
    }
  | {
      kind: "inline";
      body: string | Buffer;
      fileName: string;
      mimeType: string;
    };

function getBlobUrl(storagePointers: Record<string, unknown>) {
  const blob = storagePointers.blob;

  if (!blob || typeof blob !== "object") {
    return null;
  }

  const candidate = blob as Record<string, unknown>;
  const downloadUrl = typeof candidate.downloadUrl === "string" ? candidate.downloadUrl : null;
  const url = typeof candidate.url === "string" ? candidate.url : null;

  return downloadUrl ?? url;
}

function resolveArtifactInlineBody(
  artifact: PersistedArtifact,
): ArtifactDownloadPayload | null {
  const fileName = artifact.fileName ?? `${artifact.artifactType}.${artifact.artifactType === "markdown" ? "md" : "pdf"}`;
  const storageMode =
    typeof artifact.storagePointers.storageMode === "string" ? artifact.storagePointers.storageMode : null;

  if (storageMode === "inline_text" && typeof artifact.storagePointers.inlineText === "string") {
    return {
      kind: "inline",
      body: artifact.storagePointers.inlineText,
      fileName,
      mimeType: artifact.mimeType,
    };
  }

  if (storageMode === "inline_base64" && typeof artifact.storagePointers.inlineBase64 === "string") {
    return {
      kind: "inline",
      body: Buffer.from(artifact.storagePointers.inlineBase64, "base64"),
      fileName,
      mimeType: artifact.mimeType,
    };
  }

  const redirectUrl = getBlobUrl(artifact.storagePointers);

  if (redirectUrl) {
    return {
      kind: "redirect",
      url: redirectUrl,
      fileName,
      mimeType: artifact.mimeType,
    };
  }

  return null;
}

function isTerminalRunStatus(status: ReportRunSummary["status"]) {
  return status === "completed" || status === "failed" || status === "cancelled";
}

function isActiveRunStatus(status: ReportRunSummary["status"]) {
  return !isTerminalRunStatus(status);
}

function isReadyLikeReportStatus(status: ReportSummary["status"]) {
  return status === "ready" || status === "ready_with_limited_coverage";
}

function isTerminalReportStatus(status: ReportSummary["status"]) {
  return isReadyLikeReportStatus(status) || status === "failed";
}

function hasUsableCoreBrief(shell: StoredReportShell | null) {
  if (!shell?.currentRun || !shell.report.completedAt || !isReadyLikeReportStatus(shell.report.status)) {
    return false;
  }

  return evaluatePublishableReport({
    researchSummary: shell.currentRun.researchSummary,
    accountPlan: shell.currentRun.accountPlan,
  }).isSatisfied;
}

function getDomainActivityTimestamp(shell: StoredReportShell | null) {
  return shell?.currentRun?.updatedAt ?? shell?.report.updatedAt ?? null;
}

function shouldReuseRecentFailedReport(shell: StoredReportShell) {
  const run = shell.currentRun;

  if (shell.report.status !== "failed" || !run) {
    return false;
  }

  if (run.errorCode === "DEEP_RESEARCH_START_FAILED") {
    return false;
  }

  return Boolean(run.openaiResponseId || run.canonicalReport || run.researchSummary || run.accountPlan);
}

function buildShellMessage(shell: StoredReportShell) {
  if (!shell.currentRun) {
    return "The report exists, but no run record is attached yet.";
  }

  if (shell.currentRun.canonicalReport) {
    if (shell.currentRun.status === "failed") {
      return shell.currentRun.statusMessage;
    }

    if (shell.currentRun.status === "queued") {
      return "The deep research brief is queued and waiting for OpenAI to start the background job.";
    }

    if (shell.report.status === "running" || shell.currentRun.status === "synthesizing") {
      return shell.currentRun.statusMessage || "The deep research brief is running in the background.";
    }

    if (isCanonicalGroundedFallbackReport(shell.currentRun.canonicalReport)) {
      return "This report completed with a grounded company brief. Account Atlas kept the company snapshot and citations, while holding back stronger opportunity claims until evidence improves.";
    }

    if (shell.report.status === "ready_with_limited_coverage") {
      return buildLimitedCoverageShellMessage({
        researchCompletenessScore: shell.currentRun.canonicalReport.evidence_coverage.research_completeness_score,
        runCompleted: true,
      });
    }

    if (shell.currentRun.status === "completed") {
      return "This report completed with a source-backed seller-facing brief generated from one deep research run.";
    }
  }

  if (isDeepResearchRun(shell.currentRun)) {
    if (shell.currentRun.status === "queued") {
      return "The deep research brief is queued and waiting for the background job to start.";
    }

    if (shell.currentRun.status === "synthesizing" || shell.report.status === "running") {
      return shell.currentRun.statusMessage || "The deep research brief is running in the background.";
    }

    if (shell.currentRun.status === "failed") {
      return shell.currentRun.statusMessage;
    }
  }

  const contract = evaluatePublishableReport({
    researchSummary: shell.currentRun.researchSummary,
    accountPlan: shell.currentRun.accountPlan,
  });

  if (isReadyLikeReportStatus(shell.report.status) && shell.currentRun.status !== "completed") {
    if (contract.publishMode === "grounded_fallback") {
      return "A grounded company brief is ready. Account Atlas may still finish optional enrichment or exports in the background.";
    }

    return shell.report.status === "ready_with_limited_coverage"
      ? buildLimitedCoverageShellMessage({
          researchCompletenessScore: shell.currentRun.researchSummary?.researchCompletenessScore ?? null,
          runCompleted: false,
        })
      : "A usable core brief is ready. Optional enrichment or export work may still complete in the background.";
  }

  if (shell.currentRun.status === "failed") {
    return shell.currentRun.statusMessage;
  }

  if (shell.currentRun.status === "completed") {
    if (contract.publishMode === "grounded_fallback") {
      return "This report run completed with a grounded company brief. Company-specific opportunity recommendations remained low-confidence, so Account Atlas published the shorter citation-backed fallback brief.";
    }

    if (shell.report.status === "ready_with_limited_coverage") {
      return buildLimitedCoverageShellMessage({
        researchCompletenessScore: shell.currentRun.researchSummary?.researchCompletenessScore ?? null,
        runCompleted: true,
      });
    }

    return shell.currentRun.statusMessage;
  }

  return shell.currentRun.statusMessage;
}

function hasThinEvidence(currentRun: ReportRunSummary | null) {
  return buildThinEvidenceWarnings(currentRun).some((warning) => warning.level === "warning");
}

function hasHighEvidenceCoverage(researchCompletenessScore: number | null) {
  return (researchCompletenessScore ?? 0) >= 75;
}

function buildLimitedCoverageResultLabel(researchCompletenessScore: number | null) {
  return hasHighEvidenceCoverage(researchCompletenessScore) ? "Focused coverage" : "Limited coverage";
}

function buildLimitedCoverageResultSummary(researchCompletenessScore: number | null) {
  if (hasHighEvidenceCoverage(researchCompletenessScore)) {
    return "The report is ready with focused source coverage. The core brief is usable, with lighter coverage in some optional areas or exports.";
  }

  return "The report is ready with a usable seller-facing brief, with lighter coverage in some optional areas or exports.";
}

function buildLimitedCoverageShellMessage(input: {
  researchCompletenessScore: number | null;
  runCompleted: boolean;
}) {
  const { researchCompletenessScore, runCompleted } = input;

  if (runCompleted) {
    return hasHighEvidenceCoverage(researchCompletenessScore)
      ? "This report run completed with focused source coverage. The core brief is usable, with lighter coverage in some optional areas or export files."
      : "This report run completed with a usable seller-facing brief, with lighter coverage in some optional areas or export files.";
  }

  return hasHighEvidenceCoverage(researchCompletenessScore)
    ? "A usable core brief is ready with focused source coverage. Export files may still finish in the background."
    : "A usable core brief is ready. Export files may still finish in the background, and some optional areas may remain lighter coverage.";
}

function buildResultMeta(input: {
  currentRun: ReportRunSummary | null;
  reportStatus: ReportSummary["status"];
}) {
  const { currentRun, reportStatus } = input;

  if (currentRun?.canonicalReport) {
    if (reportStatus === "failed" || currentRun.status === "failed") {
      return {
        state: currentRun.canonicalReport ? "partial" : "failed",
        label: "Failed",
        summary: "The deep research run failed before a stable shareable brief could be finalized.",
        hasThinEvidence: hasThinEvidence(currentRun),
        hasPartialData: false,
      } satisfies ReportDocument["result"];
    }

    if (isCanonicalGroundedFallbackReport(currentRun.canonicalReport)) {
      return {
        state: "ready",
        label: "Grounded brief",
        summary:
          "The report is ready with a grounded company brief. Opportunity recommendations were held back until company-specific evidence improves.",
        hasThinEvidence: hasThinEvidence(currentRun),
        hasPartialData: reportStatus === "ready_with_limited_coverage",
      } satisfies ReportDocument["result"];
    }

    if (reportStatus === "ready_with_limited_coverage") {
      const researchCompletenessScore = currentRun.canonicalReport.evidence_coverage.research_completeness_score;

      return {
        state: "ready",
        label: buildLimitedCoverageResultLabel(researchCompletenessScore),
        summary: buildLimitedCoverageResultSummary(researchCompletenessScore),
        hasThinEvidence: hasThinEvidence(currentRun),
        hasPartialData: true,
      } satisfies ReportDocument["result"];
    }

    if (reportStatus === "ready" || currentRun.status === "completed") {
      return {
        state: "ready",
        label: "Complete",
        summary: "The report includes a coherent seller-facing brief rendered from the saved report.",
        hasThinEvidence: hasThinEvidence(currentRun),
        hasPartialData: false,
      } satisfies ReportDocument["result"];
    }

    return {
      state: "pending",
      label: currentRun.displayStatus === "queued" ? "Queued" : "In progress",
      summary: "The deep research brief is still gathering public evidence and preparing the saved brief.",
      hasThinEvidence: false,
      hasPartialData: false,
    } satisfies ReportDocument["result"];
  }

  if (isDeepResearchRun(currentRun)) {
    if (currentRun?.status === "completed") {
      return {
        state: "failed",
        label: "Incomplete",
        summary: "The deep research run completed without enough persisted report content to render a reliable brief.",
        hasThinEvidence: false,
        hasPartialData: false,
      } satisfies ReportDocument["result"];
    }

    if (currentRun?.status === "failed") {
      return {
        state: "failed",
        label: "Failed",
        summary: "The deep research run failed before a stable shareable brief could be finalized.",
        hasThinEvidence: false,
        hasPartialData: false,
      } satisfies ReportDocument["result"];
    }

    return {
      state: "pending",
      label: currentRun?.displayStatus === "queued" ? "Queued" : "In progress",
      summary: "The deep research brief is still gathering public evidence and preparing the saved brief.",
      hasThinEvidence: false,
      hasPartialData: false,
    } satisfies ReportDocument["result"];
  }

  const contract = evaluatePublishableReport({
    researchSummary: currentRun?.researchSummary,
    accountPlan: currentRun?.accountPlan,
  });
  const researchCompletenessScore = currentRun?.researchSummary?.researchCompletenessScore ?? null;
  const partialDataAvailable = Boolean(currentRun?.researchSummary || currentRun?.accountPlan);
  let state: ReportContentState = "pending";
  let label = "In progress";
  let summary = "The report is still gathering public evidence for this company.";

  if (reportStatus === "ready_with_limited_coverage" && contract.isSatisfied) {
    state = "ready";
    label =
      contract.publishMode === "grounded_fallback"
        ? "Grounded brief"
        : buildLimitedCoverageResultLabel(researchCompletenessScore);
    summary =
      contract.publishMode === "grounded_fallback"
        ? "The report is ready with a grounded company snapshot. Company-specific opportunity fit stayed low-confidence, so Account Atlas published a shorter citation-backed brief instead of a full prioritized plan."
        : buildLimitedCoverageResultSummary(researchCompletenessScore);
  } else if (currentRun?.status === "failed" && partialDataAvailable) {
    state = "partial";
    label = "Partial report";
    summary = "This run failed after persisting some research. Treat visible sections as partial and validate them before acting.";
  } else if (currentRun?.status === "failed") {
    state = "failed";
    label = "Failed";
    summary = "The latest run failed before any reliable report sections were persisted.";
  } else if (contract.isSatisfied) {
    state = "ready";
    label = "Complete";
    summary = "The report includes a usable seller-facing brief with source-backed recommendations.";
  } else if (currentRun?.researchSummary) {
    state = "partial";
    label = "Research only";
    summary = "Research completed, but the minimum seller-facing brief did not fully persist. Treat the report as partial.";
  } else if (currentRun?.status === "completed") {
    state = "failed";
    label = "Incomplete";
    summary = "The pipeline completed without enough persisted seller-facing content to render a reliable report.";
  }

  return {
    state,
    label,
    summary,
    hasThinEvidence: hasThinEvidence(currentRun),
    hasPartialData: partialDataAvailable && (state === "partial" || reportStatus === "ready_with_limited_coverage"),
  };
}

function buildReportTitle(report: ReportSummary) {
  return report.companyName ? `${report.companyName} account plan` : `${report.canonicalDomain} account plan`;
}

function buildReportSummary(shell: ReportShell) {
  if (shell.currentRun?.canonicalReport) {
    if (shell.currentRun.displayStatus === "completed_with_grounded_fallback") {
      return `This report completed with a grounded company brief for ${
        shell.currentRun.canonicalReport.company.resolved_name
      }. Full opportunity recommendations were held back until stronger company-specific evidence is available.`;
    }

    if (shell.report.status === "ready_with_limited_coverage") {
      return buildLimitedCoverageShellMessage({
        researchCompletenessScore: shell.currentRun.canonicalReport.evidence_coverage.research_completeness_score,
        runCompleted: true,
      });
    }

    if (shell.currentRun.displayStatus === "completed") {
      return `This report completed with a saved brief for ${
        shell.currentRun.canonicalReport.company.resolved_name
      }, ${shell.currentRun.canonicalReport.top_opportunities.length} evidence-backed opportunity ${
        shell.currentRun.canonicalReport.top_opportunities.length === 1 ? "card" : "cards"
      }, and an explicit ${shell.currentRun.canonicalReport.recommended_motion.recommended_motion} motion recommendation.`;
    }

    if (shell.currentRun.displayStatus === "failed") {
      return "This report record exists, but the deep research run failed before a stable shareable brief was finalized.";
    }

    return "This shareable report is being prepared from one deep research background job.";
  }

  if (isDeepResearchRun(shell.currentRun)) {
    if (shell.currentRun?.status === "failed") {
      return "This report record exists, but the deep research run failed before evidence-backed sections were finalized.";
    }

    return "This shareable report exists server-side and is being prepared from one deep research background job.";
  }

  const contract = evaluatePublishableReport({
    researchSummary: shell.currentRun?.researchSummary,
    accountPlan: shell.currentRun?.accountPlan,
  });

  if (isReadyLikeReportStatus(shell.report.status) && shell.currentRun?.status !== "completed") {
    return shell.report.status === "ready_with_limited_coverage"
      ? buildLimitedCoverageShellMessage({
          researchCompletenessScore: shell.currentRun?.researchSummary?.researchCompletenessScore ?? null,
          runCompleted: false,
        })
      : "This report already includes a usable seller-facing brief. Export files may still finish in the background.";
  }

  if (shell.currentRun?.status === "completed" && shell.report.status === "ready_with_limited_coverage") {
    return contract.publishMode === "grounded_fallback"
      ? "This report run completed with a grounded company brief. Account Atlas preserved the verified company snapshot and citations, while holding back full prioritized opportunities until company-specific fit could be established."
      : contract.isSatisfied
      ? buildLimitedCoverageShellMessage({
          researchCompletenessScore: shell.currentRun.researchSummary?.researchCompletenessScore ?? null,
          runCompleted: true,
        })
      : "This report run completed with limited coverage. Review the available sections and notes before using it as a full account brief.";
  }

  if (
    shell.currentRun?.status === "completed" &&
    contract.publishMode === "grounded_fallback" &&
    shell.currentRun.accountPlan
  ) {
    return `This report run completed with a grounded company brief for ${shell.currentRun.researchSummary?.companyIdentity.companyName ?? shell.report.canonicalDomain}. Opportunity recommendations remained low-confidence, so the published brief stays focused on company identity, public evidence, and any cautiously grounded hypotheses.`;
  }

  if (shell.currentRun?.status === "completed" && contract.isSatisfied && shell.currentRun.accountPlan) {
    return `This report run completed with a source-backed brief, ${shell.currentRun.accountPlan.candidateUseCases.length} scored opportunities, and an explicit ${shell.currentRun.accountPlan.overallAccountMotion.recommendedMotion} motion recommendation.`;
  }

  if (shell.currentRun?.status === "failed") {
    return shell.result.hasPartialData
      ? "This report contains partial evidence from a failed run. Treat visible sections as directional until a fresh run succeeds."
      : "This report record exists, but the latest run failed before evidence-backed sections were produced.";
  }

  if (shell.currentRun?.status === "completed" && shell.currentRun.researchSummary) {
    return "This report run completed with source-backed research, but the minimum seller-facing brief did not fully persist. Treat it as a partial report.";
  }

  if (shell.currentRun?.status === "completed") {
    return "This report run completed, but no persisted research summary was available for the share view.";
  }

  return "This shareable report exists server-side and is still being prepared from public evidence. No findings are shown until usable evidence is available.";
}

function buildReportSections(currentRun: ReportRunSummary | null): ReportSectionShell[] {
  const sections = createPendingReportSections();
  const readySectionKeys = currentRun?.canonicalReport
    ? getCanonicalReadySectionKeys(currentRun.canonicalReport)
    : getReadyReportSectionKeys({
        researchSummary: currentRun?.researchSummary,
        accountPlan: currentRun?.accountPlan,
      });

  for (const section of sections) {
    if (readySectionKeys.has(section.key)) {
      section.status = "ready";
    }
  }

  return sections;
}

function buildSectionAssessments(sections: ReportSectionShell[], currentRun: ReportRunSummary | null) {
  if (currentRun?.canonicalReport) {
    return sections.map((section) => {
      const coverage = getCanonicalSectionCoverage(currentRun.canonicalReport, section.key);

      return {
        ...section,
        confidence: section.status === "ready" ? coverage?.confidence.confidence_score ?? null : null,
        confidenceRationale:
          section.status === "ready"
            ? coverage?.confidence.rationale ?? coverage?.coverage.rationale ?? null
            : null,
        completenessLabel:
          section.status === "ready"
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
    currentRun?.researchSummary?.confidenceBySection.map((entry) => [entry.section, entry]) ?? [],
  );

  return sections.map((section) => {
    const confidence = confidenceBySection.get(section.key);

    return {
      ...section,
      confidence: confidence?.confidence ?? null,
      confidenceRationale: confidence?.rationale ?? null,
      completenessLabel:
        section.status === "ready"
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

function buildCompletenessSummary(sections: ReportSectionShell[], currentRun: ReportRunSummary | null) {
  const readySections = sections.filter((section) => section.status === "ready").length;

  if (readySections > 0) {
    return `${readySections} of ${sections.length} major sections populated`;
  }

  if (currentRun?.canonicalReport) {
    return `${currentRun.canonicalReport.evidence_coverage.research_completeness_score}/100 evidence coverage`;
  }

  if (currentRun?.researchSummary) {
    return `${currentRun.researchSummary.researchCompletenessScore}/100 research completeness`;
  }

  return `0 of ${sections.length} major sections populated`;
}

function buildConfidenceSummary(currentRun: ReportRunSummary | null) {
  if (currentRun?.canonicalReport) {
    const overallConfidence = currentRun.canonicalReport.evidence_coverage.overall_confidence;
    const firstNote = currentRun.canonicalReport.confidence_notes[0]?.note;

    return firstNote
      ? `Overall confidence: ${overallConfidence.confidence_band} (${overallConfidence.confidence_score}/100). ${firstNote}`
      : `Overall confidence: ${overallConfidence.confidence_band} (${overallConfidence.confidence_score}/100). ${overallConfidence.rationale}`;
  }

  if (currentRun?.accountPlan && currentRun.researchSummary) {
    const evidenceConfidenceScores = currentRun.accountPlan.topUseCases.map(
      (useCase) => useCase.scorecard.evidenceConfidence,
    );

    if (evidenceConfidenceScores.length > 0) {
      return `Overall research confidence: ${currentRun.researchSummary.overallConfidence}. Top use-case evidence confidence ranges from ${Math.min(...evidenceConfidenceScores)} to ${Math.max(...evidenceConfidenceScores)}.`;
    }

    return `Overall confidence: ${currentRun.researchSummary.overallConfidence}`;
  }

  if (currentRun?.researchSummary) {
    return `Overall confidence: ${currentRun.researchSummary.overallConfidence}`;
  }

  if (currentRun?.status === "completed") {
    return isDeepResearchRun(currentRun)
      ? "The deep research run completed, but confidence remains thin because evidence coverage was incomplete."
      : "The orchestration completed, but confidence remains thin because evidence coverage was incomplete.";
  }

  return "Not scored yet because source collection and synthesis have not started.";
}

function buildThinEvidenceWarnings(currentRun: ReportRunSummary | null): ReportThinEvidenceWarning[] {
  if (currentRun?.canonicalReport) {
    const warnings: ReportThinEvidenceWarning[] = [];
    const canonicalReport = currentRun.canonicalReport;
    const coverage = canonicalReport.evidence_coverage;

    if (coverage.thin_evidence || coverage.overall_coverage.coverage_level === "thin") {
      warnings.push({
        id: "low-coverage",
        level: "warning",
        title: "Evidence coverage is still thin",
        message: `Evidence coverage is ${coverage.research_completeness_score}/100, so some sections should be treated as directional rather than conclusive.`,
        sourceIds: canonicalCitationSourceIds(
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
        sourceIds: canonicalCitationSourceIds(canonicalReport.executive_summary.citations),
      });
    }

    coverage.evidence_gaps.slice(0, 3).forEach((gap, index) => {
      warnings.push({
        id: `evidence-gap-${index + 1}`,
        level: "info",
        title: "Open evidence gap",
        message: gap,
        sourceIds: canonicalCitationSourceIds(canonicalReport.executive_summary.citations),
      });
    });

    canonicalReport.confidence_notes.slice(0, 3).forEach((note, index) => {
      warnings.push({
        id: `confidence-note-${index + 1}`,
        level: note.level,
        title: note.related_sections.length > 0 ? "Confidence note" : "Evidence note",
        message: note.note,
        sourceIds: canonicalCitationSourceIds(note.citations),
      });
    });

    return warnings;
  }

  if (!currentRun?.researchSummary) {
    return currentRun?.status === "completed"
      ? [
          {
            id: "missing-research-summary",
            level: "warning",
            title: "Research output is incomplete",
            message: isDeepResearchRun(currentRun)
              ? "The deep research run completed, but no canonical research summary was persisted for the public report view."
              : "The run completed, but no research summary was persisted for the public report view.",
            sourceIds: [],
          },
        ]
      : [];
  }

  const warnings: ReportThinEvidenceWarning[] = [];
  const researchSummary = currentRun.researchSummary;

  if (researchSummary.researchCompletenessScore < 70) {
    warnings.push({
      id: "low-completeness",
      level: "warning",
      title: "Research coverage is still thin",
      message: `Research completeness is ${researchSummary.researchCompletenessScore}/100, so some sections should be treated as directional rather than conclusive.`,
      sourceIds: researchSummary.sourceIds,
    });
  }

  if (researchSummary.overallConfidence === "low") {
    warnings.push({
      id: "low-confidence",
      level: "warning",
      title: "Overall confidence is low",
      message: "Available public evidence is limited or mixed, so recommendations and stakeholder hypotheses should be validated in discovery.",
      sourceIds: researchSummary.sourceIds,
    });
  }

  researchSummary.evidenceGaps.slice(0, 3).forEach((gap, index) => {
    warnings.push({
      id: `evidence-gap-${index + 1}`,
      level: "info",
      title: "Open evidence gap",
      message: gap,
      sourceIds: researchSummary.sourceIds,
    });
  });

  const topUseCases = currentRun.accountPlan?.topUseCases ?? [];

  if (topUseCases.some((useCase) => useCase.scorecard.evidenceConfidence < 65)) {
    warnings.push({
      id: "top-use-case-thin-evidence",
      level: "warning",
      title: "Some top recommendations still need validation",
      message: "At least one prioritized use case has limited evidence confidence, so discovery questions should be resolved before committing to implementation scope.",
      sourceIds: [...new Set(topUseCases.flatMap((useCase) => useCase.evidenceSourceIds))],
    });
  }

  return warnings;
}

async function generateAvailableShareId(repository: ReportRepository, shareIdGenerator: () => string) {
  for (let attempt = 0; attempt < MAX_SHARE_ID_ATTEMPTS; attempt += 1) {
    const shareId = shareIdGenerator();

    if (await repository.isShareIdAvailable(shareId)) {
      return shareId;
    }
  }

  throw new Error("Unable to allocate a unique report share ID.");
}

function serializeCreateResponse(input: {
  shell: StoredReportShell;
  disposition: CreateReportResponse["disposition"];
  reuseReason: CreateReportResponse["reuseReason"];
}) {
  if (!input.shell.currentRun) {
    throw new Error("Expected a current run when serializing a create-report response.");
  }

  return {
    shareId: input.shell.report.shareId,
    runId: input.shell.currentRun.id,
    executionMode: input.shell.currentRun.executionMode,
    disposition: input.disposition,
    reuseReason: input.reuseReason,
    report: serializeReport(input.shell.report),
    currentRun: serializeRun({
      run: input.shell.currentRun,
      reportStatus: input.shell.report.status,
    })!,
    message: buildShellMessage(input.shell),
  } satisfies Omit<CreateReportResponse, "shareUrl" | "statusUrl">;
}

function getStatusPollInterval(currentRun: ReportRunSummary | null, reportStatus: ReportSummary["status"]) {
  if (isReadyLikeReportStatus(reportStatus)) {
    return 0;
  }

  if (!currentRun) {
    return STATUS_POLL_INTERVAL_MS;
  }

  if (currentRun.displayStatus === "failed" || currentRun.displayStatus === "completed") {
    return 0;
  }

  if (currentRun.displayStatus === "queued") {
    return STATUS_POLL_INTERVAL_MS;
  }

  if (currentRun.openaiResponseStatus === "in_progress") {
    return STATUS_POLL_INTERVAL_SLOW_MS;
  }

  if (currentRun.openaiResponseStatus === "queued") {
    return STATUS_POLL_INTERVAL_MS;
  }

  const currentStepState = currentRun.stepKey
    ? currentRun.progress.steps.find((step) => step.key === currentRun.stepKey)?.status
    : null;

  if (currentStepState === "retrying") {
    return STATUS_POLL_INTERVAL_RETRY_MS;
  }

  if (currentRun.progressPercent >= 84) {
    return STATUS_POLL_INTERVAL_SLOW_MS;
  }

  return STATUS_POLL_INTERVAL_MS;
}

async function startBackgroundRefresh(input: {
  repository: ReportRepository;
  reportGenerationService: DeepResearchReportGenerationService;
  shareIdGenerator: () => string;
  normalizedInputUrl: string;
  canonicalDomain: string;
  companyName: string | null;
}): Promise<BackgroundRefreshResult> {
  const shareId = await generateAvailableShareId(input.repository, input.shareIdGenerator);
  const created = await input.repository.createQueuedReport({
    shareId,
    normalizedInputUrl: input.normalizedInputUrl,
    canonicalDomain: input.canonicalDomain,
    companyName: input.companyName,
    executionMode: "inline",
  });

  try {
    await input.reportGenerationService.startReportRun({
      report: created.report,
      run: created.currentRun,
    });

    logServerEvent("info", "report.cache_refresh.started", {
      canonicalDomain: input.canonicalDomain,
      shareId,
      runId: created.currentRun.id,
      executionMode: "inline",
    });

    return {
      shareId,
      runId: created.currentRun.id,
      executionMode: "inline",
    };
  } catch (error) {
    logServerEvent("warn", "report.cache_refresh.dispatch_failed", {
      canonicalDomain: input.canonicalDomain,
      shareId,
      runId: created.currentRun.id,
      error,
    });

    return null;
  }
}

export function createReportService(dependencies: ReportServiceDependencies = {}) {
  const repository = dependencies.repository ?? drizzleReportRepository;
  const shareIdGenerator = dependencies.shareIdGenerator ?? createShareId;
  const reportGenerationService =
    dependencies.reportGenerationService ?? createDeepResearchReportGenerationService({ repository });
  const exportService = dependencies.exportService ?? createReportExportService({ repository });

  const hydrateShell = async (shareId: string, shell?: StoredReportShell | null) =>
    reportGenerationService.syncReportRun({
      shareId,
      shell,
    });

  const materializeArtifactIfMissing = async (input: {
    shareId: string;
    artifactType: PersistedArtifact["artifactType"];
    reason: "document_load" | "download_request";
    shell?: StoredReportShell | null;
  }) => {
    let artifact = await repository.findArtifactByShareId(input.shareId, input.artifactType);

    if (artifact) {
      return artifact;
    }

    const shell = await hydrateShell(input.shareId, input.shell);

    if (!shell?.currentRun || !isReadyLikeReportStatus(shell.report.status)) {
      return null;
    }

    try {
      if (input.artifactType === "markdown") {
        await exportService.generateMarkdownArtifact({
          report: shell.report,
          run: shell.currentRun,
        });
      } else if (input.artifactType === "pdf") {
        await exportService.generatePdfArtifact({
          report: shell.report,
          run: shell.currentRun,
        });
      } else {
        return null;
      }
    } catch (error) {
      logServerEvent("warn", "report.artifact.materialize_failed", {
        shareId: input.shareId,
        artifactType: input.artifactType,
        reason: input.reason,
        error,
      });
      return null;
    }

    artifact = await repository.findArtifactByShareId(input.shareId, input.artifactType);

    return artifact;
  };

  return {
    async createReport(
      companyUrl: string,
      options: CreateReportOptions = {},
    ): Promise<Omit<CreateReportResponse, "shareUrl" | "statusUrl">> {
      const normalizedInputUrl = normalizeCompanyUrl(companyUrl);
      const canonicalDomain = extractCanonicalDomain(normalizedInputUrl);
      const requesterHash = options.requesterHash ?? "anonymous-requester";
      const [latestByDomain, latestReadyByDomain] = await Promise.all([
        repository.findLatestReportShellByCanonicalDomain(canonicalDomain),
        repository.findLatestReadyReportShellByCanonicalDomain?.(canonicalDomain) ??
          repository.findLatestReportShellByCanonicalDomain(canonicalDomain),
      ]);

      const recentReadyThreshold = new Date(Date.now() - serverEnv.REPORT_RECENT_REUSE_WINDOW_MS);
      const activeCooldownThreshold = new Date(Date.now() - serverEnv.REPORT_DOMAIN_ACTIVE_COOLDOWN_MS);
      const failedCooldownThreshold = new Date(Date.now() - serverEnv.REPORT_DOMAIN_FAILED_COOLDOWN_MS);
      const latestUsableByDomain = hasUsableCoreBrief(latestReadyByDomain)
        ? latestReadyByDomain
        : hasUsableCoreBrief(latestByDomain)
          ? latestByDomain
          : null;

      if (latestUsableByDomain?.currentRun) {
        const latestActivityAt = getDomainActivityTimestamp(latestByDomain);
        const activeRefreshInFlight = Boolean(
          latestByDomain?.currentRun &&
            latestByDomain.report.id !== latestUsableByDomain.report.id &&
            isActiveRunStatus(latestByDomain.currentRun.status) &&
            latestActivityAt &&
            latestActivityAt >= activeCooldownThreshold,
        );
        const usableCompletedAt = latestUsableByDomain.report.completedAt;
        const usableIsRecent = Boolean(usableCompletedAt && usableCompletedAt >= recentReadyThreshold);
        let backgroundRefresh: BackgroundRefreshResult = null;

        if (!usableIsRecent && !activeRefreshInFlight) {
          backgroundRefresh = await startBackgroundRefresh({
            repository,
            reportGenerationService,
            shareIdGenerator,
            normalizedInputUrl,
            canonicalDomain,
            companyName: latestUsableByDomain.report.companyName,
          });
        }

        await repository.recordReportRequest({
          requesterHash,
          normalizedInputUrl,
          canonicalDomain,
          outcome: "reused_recent_completed",
          reportId: latestUsableByDomain.report.id,
          shareId: latestUsableByDomain.report.shareId,
          metadata: {
            cacheAge: usableIsRecent ? "recent" : "stale",
            activeRefreshInFlight,
            backgroundRefreshShareId: backgroundRefresh?.shareId ?? null,
            backgroundRefreshRunId: backgroundRefresh?.runId ?? null,
          },
        });

        logServerEvent(
          "info",
          usableIsRecent ? "report.create.reused_recent_completed" : "report.create.reused_cached_completed",
          {
            canonicalDomain,
            shareId: latestUsableByDomain.report.shareId,
            backgroundRefreshShareId: backgroundRefresh?.shareId ?? null,
            activeRefreshInFlight,
          },
        );

        return serializeCreateResponse({
          shell: latestUsableByDomain,
          disposition: "reused",
          reuseReason: usableIsRecent ? "recent_completed" : "cached_completed",
        });
      }

      if (latestByDomain?.currentRun) {
        const latestActivityAt = getDomainActivityTimestamp(latestByDomain) ?? latestByDomain.report.updatedAt;

        if (
          hasUsableCoreBrief(latestByDomain) &&
          isReadyLikeReportStatus(latestByDomain.report.status) &&
          latestByDomain.report.completedAt &&
          latestByDomain.report.completedAt >= recentReadyThreshold
        ) {
          await repository.recordReportRequest({
            requesterHash,
            normalizedInputUrl,
            canonicalDomain,
            outcome: "reused_recent_completed",
            reportId: latestByDomain.report.id,
            shareId: latestByDomain.report.shareId,
          });

          logServerEvent("info", "report.create.reused_recent_completed", {
            canonicalDomain,
            shareId: latestByDomain.report.shareId,
          });

          return serializeCreateResponse({
            shell: latestByDomain,
            disposition: "reused",
            reuseReason: "recent_completed",
          });
        }

        if (
          isActiveRunStatus(latestByDomain.currentRun.status) &&
          latestActivityAt >= activeCooldownThreshold
        ) {
          await repository.recordReportRequest({
            requesterHash,
            normalizedInputUrl,
            canonicalDomain,
            outcome: "reused_in_progress",
            reportId: latestByDomain.report.id,
            shareId: latestByDomain.report.shareId,
          });

          logServerEvent("info", "report.create.reused_in_progress", {
            canonicalDomain,
            shareId: latestByDomain.report.shareId,
          });

          return serializeCreateResponse({
            shell: latestByDomain,
            disposition: "reused",
            reuseReason: "in_progress",
          });
        }

        if (
          latestByDomain.report.status === "failed" &&
          latestByDomain.report.updatedAt >= failedCooldownThreshold &&
          shouldReuseRecentFailedReport(latestByDomain)
        ) {
          await repository.recordReportRequest({
            requesterHash,
            normalizedInputUrl,
            canonicalDomain,
            outcome: "reused_recent_failed",
            reportId: latestByDomain.report.id,
            shareId: latestByDomain.report.shareId,
          });

          logServerEvent("warn", "report.create.reused_recent_failed", {
            canonicalDomain,
            shareId: latestByDomain.report.shareId,
          });

          return serializeCreateResponse({
            shell: latestByDomain,
            disposition: "reused",
            reuseReason: "recent_failed",
          });
        }
      }

      const requestCount = await repository.countRecentRequestsByRequester({
        requesterHash,
        since: new Date(Date.now() - serverEnv.REPORT_CREATE_RATE_LIMIT_WINDOW_MS),
      });

      if (requestCount >= serverEnv.REPORT_CREATE_RATE_LIMIT_MAX) {
        const retryAfterSeconds = Math.ceil(serverEnv.REPORT_CREATE_RATE_LIMIT_WINDOW_MS / 1_000);

        await repository.recordReportRequest({
          requesterHash,
          normalizedInputUrl,
          canonicalDomain,
          outcome: "rate_limited",
        });

        logServerEvent("warn", "report.create.rate_limited", {
          canonicalDomain,
          requesterHash,
          recentRequestCount: requestCount,
          retryAfterSeconds,
        });

        throw new ReportCreatePolicyError(
          "Too many new report requests from this client. Please wait before starting another run.",
          retryAfterSeconds,
        );
      }

      const shareId = await generateAvailableShareId(repository, shareIdGenerator);
      const created = await repository.createQueuedReport({
        shareId,
        normalizedInputUrl,
        canonicalDomain,
        companyName: null,
        executionMode: "inline",
      });

      try {
        await reportGenerationService.startReportRun({
          report: created.report,
          run: created.currentRun,
        });
      } catch (error) {
        await repository.recordReportRequest({
          requesterHash,
          normalizedInputUrl,
          canonicalDomain,
          outcome: "dispatch_failed",
          reportId: created.report.id,
          shareId: created.report.shareId,
        });

        logServerEvent("error", "report.create.dispatch_failed", {
          canonicalDomain,
          shareId: created.report.shareId,
          error,
        });

        throw error;
      }

      await repository.recordReportRequest({
        requesterHash,
        normalizedInputUrl,
        canonicalDomain,
        outcome: "created",
        reportId: created.report.id,
        shareId: created.report.shareId,
      });

      logServerEvent("info", "report.create.created", {
        canonicalDomain,
        shareId: created.report.shareId,
        runId: created.currentRun.id,
        executionMode: "inline",
      });

      const refreshed = await hydrateShell(shareId);

      if (!refreshed || !refreshed.currentRun) {
        throw new Error("Created report run could not be reloaded after dispatch.");
      }

      return serializeCreateResponse({
        shell: refreshed,
        disposition: "created",
        reuseReason: null,
      });
    },

    async getReportShell(shareId: string): Promise<ReportShell | null> {
      const shell = await hydrateShell(shareId);

      if (!shell) {
        return null;
      }

      const currentRun = serializeRun({
        run: shell.currentRun,
        reportStatus: shell.report.status,
      });

      return {
        report: serializeReport(shell.report),
        currentRun,
        sections: buildReportSections(currentRun),
        result: buildResultMeta({
          currentRun,
          reportStatus: shell.report.status,
        }),
        message: buildShellMessage(shell),
      };
    },

    async getReportDocument(shareId: string): Promise<ReportDocument | null> {
      const shell = await hydrateShell(shareId);

      if (!shell) {
        return null;
      }

      const currentRun = serializeRun({
        run: shell.currentRun,
        reportStatus: shell.report.status,
      });
      const sections = buildReportSections(currentRun);

      if (shell.currentRun && isReadyLikeReportStatus(shell.report.status)) {
        await materializeArtifactIfMissing({
          shareId,
          artifactType: "markdown",
          reason: "document_load",
          shell,
        });
      }

      const [sources, facts, artifacts] = shell.currentRun
        ? await Promise.all([
            repository.listSourcesByRunId(shell.currentRun.id),
            repository.listFactsByRunId(shell.currentRun.id),
            repository.listArtifactsByRunId(shell.currentRun.id),
          ])
        : [[], [], []];

      return {
        report: serializeReport(shell.report),
        currentRun,
        sections,
        result: buildResultMeta({
          currentRun,
          reportStatus: shell.report.status,
        }),
        recentEvents: shell.recentEvents.map(serializeEvent),
        facts: facts.map(serializeFact),
        sources: sources.map(serializeSource),
        artifacts: artifacts.map((artifact) => serializeArtifact(artifact, shell.report.shareId)),
        sectionAssessments: buildSectionAssessments(sections, currentRun),
        thinEvidenceWarnings: buildThinEvidenceWarnings(currentRun),
        message: buildShellMessage(shell),
      };
    },

    async getReportStatusShell(shareId: string): Promise<ReportStatusShell | null> {
      const shell = await hydrateShell(shareId);

      if (!shell) {
        return null;
      }

      const currentRun = serializeRun({
        run: shell.currentRun,
        reportStatus: shell.report.status,
      });

      return {
        shareId,
        statusUrl: createStatusUrl(shareId),
        displayStatus: currentRun?.displayStatus ?? null,
        report: {
          shareId: shell.report.shareId,
          status: shell.report.status,
          createdAt: shell.report.createdAt.toISOString(),
          updatedAt: shell.report.updatedAt.toISOString(),
          completedAt: shell.report.completedAt?.toISOString() ?? null,
        },
        currentRun,
        result: buildResultMeta({
          currentRun,
          reportStatus: shell.report.status,
        }),
        recentEvents: shell.recentEvents.map(serializeEvent),
        pollAfterMs: getStatusPollInterval(currentRun, shell.report.status),
        isTerminal: isReadyLikeReportStatus(shell.report.status)
          ? true
          : currentRun
            ? isTerminalRunStatus(currentRun.status)
            : isTerminalReportStatus(shell.report.status),
        message: buildShellMessage(shell),
      };
    },

    async getReportPageModel(shareId: string): Promise<ReportPageModel> {
      try {
        const shell = await this.getReportShell(shareId);

        if (!shell) {
          return {
            shareId,
            status: "not-found",
            title: "Report not found",
            summary: NOT_FOUND_MESSAGE,
            companyUrl: "No saved company URL is available for this share link.",
            canonicalDomain: "unknown",
            companyName: null,
            createdAt: new Date().toISOString(),
            sections: createPendingReportSections(),
            completenessSummary: "0 of 10 major sections populated",
            confidenceSummary: "Not scored because no source-backed evidence was found for this share link.",
            message: NOT_FOUND_MESSAGE,
          };
        }

        return {
          shareId: shell.report.shareId,
          status: shell.report.status,
          title: buildReportTitle(shell.report),
          summary: buildReportSummary(shell),
          companyUrl: shell.report.normalizedInputUrl,
          canonicalDomain: shell.report.canonicalDomain,
          companyName: shell.report.companyName,
          createdAt: shell.report.createdAt,
          sections: shell.sections,
          completenessSummary: buildCompletenessSummary(shell.sections, shell.currentRun),
          confidenceSummary: buildConfidenceSummary(shell.currentRun),
          message: shell.message,
        };
      } catch (error) {
        if (isDatabaseConfigError(error)) {
          return {
            shareId,
            status: "unavailable",
            title: "Database setup required",
            summary: DB_UNAVAILABLE_MESSAGE,
            companyUrl: "DATABASE_URL is not configured.",
            canonicalDomain: "unconfigured",
            companyName: null,
            createdAt: new Date().toISOString(),
            sections: createPendingReportSections(),
            completenessSummary: "0 of 10 major sections populated",
            confidenceSummary: "Not scored because server-side persistence is not configured.",
            message: DB_UNAVAILABLE_MESSAGE,
          };
        }

        throw error;
      }
    },

    async getArtifactDownload(
      shareId: string,
      artifactType: PersistedArtifact["artifactType"],
    ): Promise<ArtifactDownloadPayload | null> {
      const artifact = await materializeArtifactIfMissing({
        shareId,
        artifactType,
        reason: "download_request",
      });

      if (!artifact) {
        return null;
      }

      return resolveArtifactInlineBody(artifact);
    },
  };
}
