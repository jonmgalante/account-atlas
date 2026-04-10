import "server-only";

import { and, asc, count, desc, eq, gte, inArray } from "drizzle-orm";

import type { SourceType } from "@/lib/source";
import type { AccountPlanUseCase, FinalAccountPlan, StakeholderHypothesis } from "@/lib/types/account-plan";
import type { PipelineExecutionMode, PipelineStepKey, ReportEventLevel } from "@/lib/types/report";
import type { PersistedFactRecord, ResearchSummary } from "@/lib/types/research";
import { getDb } from "@/server/db/client";
import {
  artifacts,
  facts,
  reportEvents,
  reportRequests,
  reportRuns,
  reports,
  sources,
  stakeholders,
  useCases,
} from "@/server/db/schema";
import {
  canContinueAfterCoreBriefSuccess,
  createInitialPipelineState,
  normalizePipelineState,
  type StoredPipelineState,
  type StoredPipelineStepState,
} from "@/server/pipeline/pipeline-steps";

const reportColumns = {
  id: reports.id,
  shareId: reports.shareId,
  status: reports.status,
  normalizedInputUrl: reports.normalizedInputUrl,
  canonicalDomain: reports.canonicalDomain,
  companyName: reports.companyName,
  createdAt: reports.createdAt,
  updatedAt: reports.updatedAt,
  completedAt: reports.completedAt,
  failedAt: reports.failedAt,
};

const reportRunColumns = {
  id: reportRuns.id,
  reportId: reportRuns.reportId,
  attemptNumber: reportRuns.attemptNumber,
  status: reportRuns.status,
  executionMode: reportRuns.executionMode,
  progressPercent: reportRuns.progressPercent,
  stepKey: reportRuns.stepKey,
  statusMessage: reportRuns.statusMessage,
  pipelineState: reportRuns.pipelineState,
  queueMessageId: reportRuns.queueMessageId,
  vectorStoreId: reportRuns.vectorStoreId,
  researchSummary: reportRuns.researchSummary,
  accountPlan: reportRuns.accountPlan,
  errorCode: reportRuns.errorCode,
  errorMessage: reportRuns.errorMessage,
  createdAt: reportRuns.createdAt,
  updatedAt: reportRuns.updatedAt,
  startedAt: reportRuns.startedAt,
  lastHeartbeatAt: reportRuns.lastHeartbeatAt,
  completedAt: reportRuns.completedAt,
  failedAt: reportRuns.failedAt,
};

const factColumns = {
  id: facts.id,
  reportId: facts.reportId,
  runId: facts.runId,
  sourceId: facts.sourceId,
  section: facts.section,
  classification: facts.classification,
  statement: facts.statement,
  rationale: facts.rationale,
  confidence: facts.confidence,
  freshness: facts.freshness,
  sentiment: facts.sentiment,
  relevance: facts.relevance,
  evidenceSnippet: facts.evidenceSnippet,
  sourceIds: facts.sourceIds,
  createdAt: facts.createdAt,
  updatedAt: facts.updatedAt,
};

const reportEventColumns = {
  id: reportEvents.id,
  level: reportEvents.level,
  eventType: reportEvents.eventType,
  stepKey: reportEvents.stepKey,
  message: reportEvents.message,
  occurredAt: reportEvents.occurredAt,
};

const sourceColumns = {
  id: sources.id,
  reportId: sources.reportId,
  runId: sources.runId,
  url: sources.url,
  normalizedUrl: sources.normalizedUrl,
  canonicalUrl: sources.canonicalUrl,
  canonicalDomain: sources.canonicalDomain,
  title: sources.title,
  sourceType: sources.sourceType,
  sourceTier: sources.sourceTier,
  mimeType: sources.mimeType,
  discoveredAt: sources.discoveredAt,
  publishedAt: sources.publishedAt,
  updatedAtHint: sources.updatedAtHint,
  retrievedAt: sources.retrievedAt,
  contentHash: sources.contentHash,
  textContent: sources.textContent,
  markdownContent: sources.markdownContent,
  storagePointers: sources.storagePointers,
  createdAt: sources.createdAt,
  updatedAt: sources.updatedAt,
};

const artifactColumns = {
  id: artifacts.id,
  reportId: artifacts.reportId,
  runId: artifacts.runId,
  artifactType: artifacts.artifactType,
  mimeType: artifacts.mimeType,
  fileName: artifacts.fileName,
  storagePointers: artifacts.storagePointers,
  contentHash: artifacts.contentHash,
  sizeBytes: artifacts.sizeBytes,
  createdAt: artifacts.createdAt,
  updatedAt: artifacts.updatedAt,
};

export type PersistedReport = {
  id: number;
  shareId: string;
  status: "queued" | "running" | "ready" | "ready_with_limited_coverage" | "failed";
  normalizedInputUrl: string;
  canonicalDomain: string;
  companyName: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  failedAt: Date | null;
};

export type PersistedRun = {
  id: number;
  reportId: number;
  attemptNumber: number;
  status: "queued" | "fetching" | "extracting" | "synthesizing" | "completed" | "failed" | "cancelled";
  executionMode: PipelineExecutionMode;
  progressPercent: number;
  stepKey: string | null;
  statusMessage: string;
  pipelineState: {
    currentStepKey: string | null;
    steps: Record<string, StoredPipelineStepState>;
  };
  queueMessageId: string | null;
  vectorStoreId: string | null;
  researchSummary: ResearchSummary | null;
  accountPlan: FinalAccountPlan | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  lastHeartbeatAt: Date | null;
  completedAt: Date | null;
  failedAt: Date | null;
};

type PersistedEvent = {
  id: number;
  level: ReportEventLevel;
  eventType: string;
  stepKey: string | null;
  message: string;
  occurredAt: Date;
};

export type PersistedSource = {
  id: number;
  reportId: number;
  runId: number;
  url: string;
  normalizedUrl: string;
  canonicalUrl: string;
  canonicalDomain: string;
  title: string | null;
  sourceType: SourceType;
  sourceTier: "primary" | "secondary" | "tertiary" | "unknown";
  mimeType: string | null;
  discoveredAt: Date;
  publishedAt: Date | null;
  updatedAtHint: Date | null;
  retrievedAt: Date | null;
  contentHash: string | null;
  textContent: string | null;
  markdownContent: string | null;
  storagePointers: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

export type PersistedArtifact = {
  id: number;
  reportId: number;
  runId: number | null;
  artifactType: "markdown" | "pdf" | "structured_json" | "source_bundle";
  mimeType: string;
  fileName: string | null;
  storagePointers: Record<string, unknown>;
  contentHash: string | null;
  sizeBytes: number | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PersistedFact = {
  id: number;
  reportId: number;
  runId: number;
  sourceId: number | null;
  section: PersistedFactRecord["section"];
  classification: PersistedFactRecord["classification"];
  statement: string;
  rationale: string | null;
  confidence: number;
  freshness: PersistedFactRecord["freshness"];
  sentiment: PersistedFactRecord["sentiment"];
  relevance: number;
  evidenceSnippet: string | null;
  sourceIds: number[];
  createdAt: Date;
  updatedAt: Date;
};

export type StoredReportShell = {
  report: PersistedReport;
  currentRun: PersistedRun | null;
  recentEvents: PersistedEvent[];
};

export type StoredRunContext = {
  report: PersistedReport;
  run: PersistedRun;
};

export type CreateQueuedReportParams = {
  shareId: string;
  normalizedInputUrl: string;
  canonicalDomain: string;
  companyName?: string | null;
  executionMode: PipelineExecutionMode;
};

export type CreatedQueuedReportRecord = {
  report: PersistedReport;
  currentRun: PersistedRun;
};

export type RunEventInput = {
  reportId: number;
  runId: number;
  level: ReportEventLevel;
  eventType: string;
  stepKey?: PipelineStepKey | null;
  message: string;
  metadata?: Record<string, unknown>;
};

export type RunStepUpdateInput = {
  reportId: number;
  runId: number;
  status: PersistedRun["status"];
  stepKey: PipelineStepKey | null;
  progressPercent: number;
  statusMessage: string;
  executionMode?: PipelineExecutionMode;
  pipelineState: {
    currentStepKey: string | null;
    steps: Record<string, StoredPipelineStepState>;
  };
  queueMessageId?: string | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
  failedAt?: Date | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  reportStatus?: PersistedReport["status"];
  reportCompletedAt?: Date | null;
  reportFailedAt?: Date | null;
};

export type ClaimRunStepExecutionInput = {
  runId: number;
  stepKey: PipelineStepKey;
  stepRunStatus: PersistedRun["status"];
  progressPercent: number;
  statusMessage: string;
  executionMode?: PipelineExecutionMode;
  queueMessageId?: string | null;
  reportStatus?: PersistedReport["status"];
  activeHeartbeatThresholdMs: number;
  startedAt?: Date | null;
  deliveryCount?: number | null;
};

export type ClaimRunStepExecutionResult =
  | {
      outcome: "claimed";
      context: StoredRunContext;
      claimMode: "fresh" | "resumed";
      resumedFromStatus: StoredPipelineStepState["status"] | null;
      activeStepKey: PipelineStepKey | null;
    }
  | {
      outcome: "already_completed";
      context: StoredRunContext;
    }
  | {
      outcome: "duplicate_delivery";
      context: StoredRunContext;
      activeStepKey: PipelineStepKey;
      lastHeartbeatAt: Date | null;
    }
  | {
      outcome: "finalized";
      context: StoredRunContext;
      reason: "report_finalized" | "run_finalized";
    };

export type UpsertCrawledSourceInput = {
  reportId: number;
  runId: number;
  url: string;
  normalizedUrl: string;
  canonicalUrl: string;
  canonicalDomain: string;
  title?: string | null;
  sourceType: SourceType;
  sourceTier: PersistedSource["sourceTier"];
  mimeType?: string | null;
  discoveredAt?: Date;
  publishedAt?: Date | null;
  updatedAtHint?: Date | null;
  retrievedAt?: Date | null;
  contentHash?: string | null;
  textContent?: string | null;
  markdownContent?: string | null;
  storagePointers?: Record<string, unknown>;
};

export type UpsertCrawledSourceResult = {
  source: PersistedSource;
  dedupeStrategy: "created" | "canonical_url" | "content_hash";
};

export type UpsertArtifactInput = {
  reportId: number;
  runId: number | null;
  artifactType: "markdown" | "pdf" | "structured_json" | "source_bundle";
  mimeType: string;
  fileName?: string | null;
  storagePointers?: Record<string, unknown>;
  contentHash?: string | null;
  sizeBytes?: number | null;
};

export type ReplaceFactsForRunInput = {
  reportId: number;
  runId: number;
  facts: PersistedFactRecord[];
};

export type ReplaceUseCasesForRunInput = {
  reportId: number;
  runId: number;
  useCases: AccountPlanUseCase[];
};

export type ReplaceStakeholdersForRunInput = {
  reportId: number;
  runId: number;
  stakeholders: StakeholderHypothesis[];
};

export type ReportRepository = {
  isShareIdAvailable(shareId: string): Promise<boolean>;
  createQueuedReport(input: CreateQueuedReportParams): Promise<CreatedQueuedReportRecord>;
  findReportShellByShareId(shareId: string): Promise<StoredReportShell | null>;
  findLatestReportShellByCanonicalDomain(canonicalDomain: string): Promise<StoredReportShell | null>;
  findLatestReadyReportShellByCanonicalDomain?(canonicalDomain: string): Promise<StoredReportShell | null>;
  findRunContextById(runId: number): Promise<StoredRunContext | null>;
  listSourcesByRunId(runId: number): Promise<PersistedSource[]>;
  listFactsByRunId(runId: number): Promise<PersistedFact[]>;
  listArtifactsByRunId(runId: number): Promise<PersistedArtifact[]>;
  findArtifactByShareId(
    shareId: string,
    artifactType: PersistedArtifact["artifactType"],
  ): Promise<PersistedArtifact | null>;
  countRecentRequestsByRequester(input: {
    requesterHash: string;
    since: Date;
  }): Promise<number>;
  recordReportRequest(input: {
    requesterHash: string;
    normalizedInputUrl: string;
    canonicalDomain: string;
    outcome:
      | "created"
      | "reused_recent_completed"
      | "reused_in_progress"
      | "reused_recent_failed"
      | "rate_limited"
      | "dispatch_failed";
    reportId?: number | null;
    shareId?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
  setRunDispatchState(input: {
    reportId: number;
    runId: number;
    executionMode: PipelineExecutionMode;
    queueMessageId?: string | null;
    statusMessage: string;
  }): Promise<void>;
  setRunVectorStore(input: {
    reportId: number;
    runId: number;
    vectorStoreId: string;
  }): Promise<void>;
  updateRunResearchSummary(input: {
    reportId: number;
    runId: number;
    researchSummary: ResearchSummary;
    companyName?: string | null;
  }): Promise<void>;
  updateRunAccountPlan(input: {
    reportId: number;
    runId: number;
    accountPlan: FinalAccountPlan;
  }): Promise<void>;
  claimRunStepExecution(input: ClaimRunStepExecutionInput): Promise<ClaimRunStepExecutionResult | null>;
  touchRunHeartbeat(input: {
    reportId: number;
    runId: number;
    stepKey: PipelineStepKey;
  }): Promise<void>;
  updateRunStepState(input: RunStepUpdateInput): Promise<void>;
  appendRunEvent(input: RunEventInput): Promise<void>;
  upsertCrawledSource(input: UpsertCrawledSourceInput): Promise<UpsertCrawledSourceResult>;
  updateSourceStoragePointers(input: {
    sourceId: number;
    storagePointers: Record<string, unknown>;
  }): Promise<void>;
  replaceFactsForRun(input: ReplaceFactsForRunInput): Promise<void>;
  replaceUseCasesForRun(input: ReplaceUseCasesForRunInput): Promise<void>;
  replaceStakeholdersForRun(input: ReplaceStakeholdersForRunInput): Promise<void>;
  upsertArtifact(input: UpsertArtifactInput): Promise<void>;
};

async function findLatestRunByReportId(reportId: number) {
  const db = getDb();
  const [run] = await db
    .select(reportRunColumns)
    .from(reportRuns)
    .where(eq(reportRuns.reportId, reportId))
    .orderBy(desc(reportRuns.createdAt), desc(reportRuns.id))
    .limit(1);

  return run ?? null;
}

async function findRecentEventsByRunId(runId: number, limit = 8) {
  const db = getDb();

  const rows = await db
    .select(reportEventColumns)
    .from(reportEvents)
    .where(eq(reportEvents.runId, runId))
    .orderBy(desc(reportEvents.occurredAt), desc(reportEvents.id))
    .limit(limit);

  return rows.reverse();
}

function isReportFinalized(status: PersistedReport["status"]) {
  return status === "ready" || status === "ready_with_limited_coverage" || status === "failed";
}

function isReportSuccessful(status: PersistedReport["status"]) {
  return status === "ready" || status === "ready_with_limited_coverage";
}

function isRunFinalized(status: PersistedRun["status"]) {
  return status === "completed" || status === "failed" || status === "cancelled";
}

function isStepLeaseFresh(lastHeartbeatAt: Date | null, activeHeartbeatThresholdMs: number) {
  if (!lastHeartbeatAt) {
    return false;
  }

  return lastHeartbeatAt.getTime() >= Date.now() - activeHeartbeatThresholdMs;
}

function mergeStoragePointers(
  existingPointers: Record<string, unknown>,
  nextPointers: Record<string, unknown> | undefined,
  extraPointers: Record<string, unknown> = {},
) {
  return {
    ...existingPointers,
    ...(nextPointers ?? {}),
    ...extraPointers,
  };
}

export const drizzleReportRepository: ReportRepository = {
  async isShareIdAvailable(shareId) {
    const db = getDb();
    const [existing] = await db.select({ id: reports.id }).from(reports).where(eq(reports.shareId, shareId)).limit(1);

    return !existing;
  },

  async createQueuedReport(input) {
    const db = getDb();

    return db.transaction(async (tx) => {
      const [report] = await tx
        .insert(reports)
        .values({
          shareId: input.shareId,
          status: "queued",
          normalizedInputUrl: input.normalizedInputUrl,
          canonicalDomain: input.canonicalDomain,
          companyName: input.companyName ?? null,
        })
        .returning(reportColumns);

      const [run] = await tx
        .insert(reportRuns)
        .values({
          reportId: report.id,
          attemptNumber: 1,
          status: "queued",
          executionMode: input.executionMode,
          progressPercent: 0,
          stepKey: null,
          statusMessage: "Report queued for processing.",
          pipelineState: createInitialPipelineState(),
        })
        .returning(reportRunColumns);

      await tx.insert(reportEvents).values({
        reportId: report.id,
        runId: run.id,
        level: "info",
        eventType: "report.created",
        stepKey: null,
        message: "Report was created and queued for processing.",
        metadata: {
          shareId: report.shareId,
          executionMode: run.executionMode,
        },
      });

      return {
        report,
        currentRun: run,
      };
    });
  },

  async findReportShellByShareId(shareId) {
    const db = getDb();
    const [report] = await db.select(reportColumns).from(reports).where(eq(reports.shareId, shareId)).limit(1);

    if (!report) {
      return null;
    }

    const currentRun = await findLatestRunByReportId(report.id);
    const recentEvents = currentRun ? await findRecentEventsByRunId(currentRun.id) : [];

    return {
      report,
      currentRun,
      recentEvents,
    };
  },

  async findLatestReportShellByCanonicalDomain(canonicalDomain) {
    const db = getDb();
    const [report] = await db
      .select(reportColumns)
      .from(reports)
      .where(eq(reports.canonicalDomain, canonicalDomain))
      .orderBy(desc(reports.updatedAt), desc(reports.id))
      .limit(1);

    if (!report) {
      return null;
    }

    const currentRun = await findLatestRunByReportId(report.id);
    const recentEvents = currentRun ? await findRecentEventsByRunId(currentRun.id) : [];

    return {
      report,
      currentRun,
      recentEvents,
    };
  },

  async findLatestReadyReportShellByCanonicalDomain(canonicalDomain) {
    const db = getDb();
    const [report] = await db
      .select(reportColumns)
      .from(reports)
      .where(
        and(
          eq(reports.canonicalDomain, canonicalDomain),
          inArray(reports.status, ["ready", "ready_with_limited_coverage"]),
        ),
      )
      .orderBy(desc(reports.completedAt), desc(reports.updatedAt), desc(reports.id))
      .limit(1);

    if (!report) {
      return null;
    }

    const currentRun = await findLatestRunByReportId(report.id);
    const recentEvents = currentRun ? await findRecentEventsByRunId(currentRun.id) : [];

    return {
      report,
      currentRun,
      recentEvents,
    };
  },

  async findRunContextById(runId) {
    const db = getDb();
    const [row] = await db
      .select({
        report: reportColumns,
        run: reportRunColumns,
      })
      .from(reportRuns)
      .innerJoin(reports, eq(reportRuns.reportId, reports.id))
      .where(eq(reportRuns.id, runId))
      .limit(1);

    if (!row) {
      return null;
    }

    return row;
  },

  async listSourcesByRunId(runId) {
    const db = getDb();

    return db
      .select(sourceColumns)
      .from(sources)
      .where(eq(sources.runId, runId))
      .orderBy(desc(sources.sourceTier), desc(sources.publishedAt), desc(sources.retrievedAt), desc(sources.id));
  },

  async listFactsByRunId(runId) {
    const db = getDb();

    return db.select(factColumns).from(facts).where(eq(facts.runId, runId)).orderBy(desc(facts.relevance), desc(facts.id));
  },

  async listArtifactsByRunId(runId) {
    const db = getDb();

    return db
      .select(artifactColumns)
      .from(artifacts)
      .where(eq(artifacts.runId, runId))
      .orderBy(asc(artifacts.artifactType), asc(artifacts.id));
  },

  async findArtifactByShareId(shareId, artifactType) {
    const db = getDb();
    const [report] = await db.select(reportColumns).from(reports).where(eq(reports.shareId, shareId)).limit(1);

    if (!report) {
      return null;
    }

    const currentRun = await findLatestRunByReportId(report.id);

    if (!currentRun) {
      return null;
    }

    const [artifact] = await db
      .select(artifactColumns)
      .from(artifacts)
      .where(
        and(
          eq(artifacts.reportId, report.id),
          eq(artifacts.runId, currentRun.id),
          eq(artifacts.artifactType, artifactType),
        ),
      )
      .orderBy(desc(artifacts.updatedAt), desc(artifacts.id))
      .limit(1);

    return artifact ?? null;
  },

  async countRecentRequestsByRequester({ requesterHash, since }) {
    const db = getDb();
    const [result] = await db
      .select({ value: count() })
      .from(reportRequests)
      .where(
        and(
          eq(reportRequests.requesterHash, requesterHash),
          gte(reportRequests.createdAt, since),
          inArray(reportRequests.outcome, ["created", "dispatch_failed"]),
        ),
      );

    return result?.value ?? 0;
  },

  async recordReportRequest(input) {
    const db = getDb();

    await db.insert(reportRequests).values({
      requesterHash: input.requesterHash,
      normalizedInputUrl: input.normalizedInputUrl,
      canonicalDomain: input.canonicalDomain,
      outcome: input.outcome,
      reportId: input.reportId ?? null,
      shareId: input.shareId ?? null,
      metadata: input.metadata ?? {},
    });
  },

  async setRunDispatchState({ reportId, runId, executionMode, queueMessageId, statusMessage }) {
    const db = getDb();

    await db
      .update(reportRuns)
      .set({
        executionMode,
        queueMessageId: queueMessageId ?? null,
        statusMessage,
        updatedAt: new Date(),
      })
      .where(and(eq(reportRuns.id, runId), eq(reportRuns.reportId, reportId)));
  },

  async setRunVectorStore({ reportId, runId, vectorStoreId }) {
    const db = getDb();

    await db
      .update(reportRuns)
      .set({
        vectorStoreId,
        updatedAt: new Date(),
      })
      .where(and(eq(reportRuns.id, runId), eq(reportRuns.reportId, reportId)));
  },

  async claimRunStepExecution(input) {
    const db = getDb();
    const now = new Date();

    return db.transaction(async (tx) => {
      const [row] = await tx
        .select({
          report: reportColumns,
          run: reportRunColumns,
        })
        .from(reportRuns)
        .innerJoin(reports, eq(reportRuns.reportId, reports.id))
        .where(eq(reportRuns.id, input.runId))
        .limit(1)
        .for("update");

      if (!row) {
        return null;
      }

      if (isRunFinalized(row.run.status)) {
        return {
          outcome: "finalized",
          context: row,
          reason: "run_finalized",
        } satisfies ClaimRunStepExecutionResult;
      }

      const currentState = normalizePipelineState(row.run.pipelineState);
      const stepState = currentState.steps[input.stepKey];
      const activeStepKey =
        currentState.currentStepKey && currentState.steps[currentState.currentStepKey]?.status === "running"
          ? currentState.currentStepKey
          : null;

      if (stepState?.status === "completed") {
        return {
          outcome: "already_completed",
          context: row,
        } satisfies ClaimRunStepExecutionResult;
      }

      const allowPostSuccessContinuation =
        isReportSuccessful(row.report.status) &&
        !isRunFinalized(row.run.status) &&
        canContinueAfterCoreBriefSuccess(input.stepKey);

      if (isReportFinalized(row.report.status) && !allowPostSuccessContinuation) {
        return {
          outcome: "finalized",
          context: row,
          reason: "report_finalized",
        } satisfies ClaimRunStepExecutionResult;
      }

      if (
        activeStepKey &&
        isStepLeaseFresh(row.run.lastHeartbeatAt, input.activeHeartbeatThresholdMs)
      ) {
        return {
          outcome: "duplicate_delivery",
          context: row,
          activeStepKey,
          lastHeartbeatAt: row.run.lastHeartbeatAt,
        } satisfies ClaimRunStepExecutionResult;
      }

      const runningState: StoredPipelineState = {
        currentStepKey: input.stepKey,
        steps: {
          ...currentState.steps,
          [input.stepKey]: {
            ...currentState.steps[input.stepKey],
            status: "running",
            attemptCount: (stepState?.attemptCount ?? 0) + 1,
            startedAt: stepState?.startedAt ?? (input.startedAt ?? now).toISOString(),
            completedAt: null,
            lastAttemptedAt: now.toISOString(),
            lastDeliveryCount: input.deliveryCount ?? null,
            errorCode: null,
            errorMessage: null,
            fallbackApplied: false,
            retryExhausted: false,
          },
        },
      };
      const attemptCount = runningState.steps[input.stepKey].attemptCount;
      const runningMessage = `${input.statusMessage} (${attemptCount} ${attemptCount === 1 ? "attempt" : "attempts"}).`;

      const [updatedRun] = await tx
        .update(reportRuns)
        .set({
          status: input.stepRunStatus,
          executionMode: input.executionMode,
          progressPercent: input.progressPercent,
          stepKey: input.stepKey,
          statusMessage: runningMessage,
          pipelineState: runningState,
          queueMessageId: input.queueMessageId,
          errorCode: null,
          errorMessage: null,
          startedAt: input.startedAt ?? row.run.startedAt ?? now,
          lastHeartbeatAt: now,
          completedAt: null,
          failedAt: null,
          updatedAt: now,
        })
        .where(and(eq(reportRuns.id, row.run.id), eq(reportRuns.reportId, row.report.id)))
        .returning(reportRunColumns);

      const [updatedReport] = await tx
        .update(reports)
        .set({
          status: input.reportStatus ?? "running",
          completedAt: isReportSuccessful(input.reportStatus ?? "running") ? row.report.completedAt ?? now : null,
          failedAt: null,
          updatedAt: now,
        })
        .where(eq(reports.id, row.report.id))
        .returning(reportColumns);

      return {
        outcome: "claimed",
        context: {
          report: updatedReport,
          run: updatedRun,
        },
        claimMode:
          stepState?.status === "retrying" || stepState?.status === "failed" || stepState?.status === "running"
            ? "resumed"
            : "fresh",
        resumedFromStatus:
          stepState?.status === "retrying" || stepState?.status === "failed" || stepState?.status === "running"
            ? stepState.status
            : null,
        activeStepKey,
      } satisfies ClaimRunStepExecutionResult;
    });
  },

  async touchRunHeartbeat({ reportId, runId, stepKey }) {
    const db = getDb();

    await db
      .update(reportRuns)
      .set({
        lastHeartbeatAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(reportRuns.id, runId), eq(reportRuns.reportId, reportId), eq(reportRuns.stepKey, stepKey)));
  },

  async updateRunResearchSummary({ reportId, runId, researchSummary, companyName }) {
    const db = getDb();
    const now = new Date();

    await db.transaction(async (tx) => {
      await tx
        .update(reportRuns)
        .set({
          researchSummary,
          updatedAt: now,
        })
        .where(and(eq(reportRuns.id, runId), eq(reportRuns.reportId, reportId)));

      await tx
        .update(reports)
        .set({
          ...(companyName !== undefined ? { companyName } : {}),
          updatedAt: now,
        })
        .where(eq(reports.id, reportId));
    });
  },

  async updateRunAccountPlan({ reportId, runId, accountPlan }) {
    const db = getDb();
    const now = new Date();

    await db.transaction(async (tx) => {
      await tx
        .update(reportRuns)
        .set({
          accountPlan,
          updatedAt: now,
        })
        .where(and(eq(reportRuns.id, runId), eq(reportRuns.reportId, reportId)));

      await tx
        .update(reports)
        .set({
          updatedAt: now,
        })
        .where(eq(reports.id, reportId));
    });
  },

  async updateRunStepState(input) {
    const db = getDb();
    const now = new Date();

    await db.transaction(async (tx) => {
      await tx
        .update(reportRuns)
        .set({
          status: input.status,
          executionMode: input.executionMode,
          progressPercent: input.progressPercent,
          stepKey: input.stepKey,
          statusMessage: input.statusMessage,
          pipelineState: input.pipelineState,
          queueMessageId: input.queueMessageId,
          errorCode: input.errorCode ?? null,
          errorMessage: input.errorMessage ?? null,
          startedAt: input.startedAt,
          lastHeartbeatAt: now,
          completedAt: input.completedAt ?? null,
          failedAt: input.failedAt ?? null,
          updatedAt: now,
        })
        .where(and(eq(reportRuns.id, input.runId), eq(reportRuns.reportId, input.reportId)));

      await tx
        .update(reports)
        .set(
          {
            status: input.reportStatus,
            updatedAt: now,
            ...(input.reportCompletedAt !== undefined ? { completedAt: input.reportCompletedAt } : {}),
            ...(input.reportFailedAt !== undefined ? { failedAt: input.reportFailedAt } : {}),
          },
        )
        .where(eq(reports.id, input.reportId));
    });
  },

  async appendRunEvent(input) {
    const db = getDb();

    await db.insert(reportEvents).values({
      reportId: input.reportId,
      runId: input.runId,
      level: input.level,
      eventType: input.eventType,
      stepKey: input.stepKey ?? null,
      message: input.message,
      metadata: input.metadata ?? {},
    });
  },

  async upsertCrawledSource(input) {
    const db = getDb();
    const now = new Date();
    const discoveredAt = input.discoveredAt ?? now;
    const retrievedAt = input.retrievedAt ?? now;

    const [existingByCanonical] = await db
      .select(sourceColumns)
      .from(sources)
      .where(
        and(
          eq(sources.reportId, input.reportId),
          eq(sources.runId, input.runId),
          eq(sources.canonicalUrl, input.canonicalUrl),
        ),
      )
      .limit(1);

    if (existingByCanonical) {
      const [updatedSource] = await db
        .update(sources)
        .set({
          url: input.url,
          normalizedUrl: input.normalizedUrl,
          canonicalUrl: input.canonicalUrl,
          canonicalDomain: input.canonicalDomain,
          title: input.title ?? existingByCanonical.title,
          sourceType: input.sourceType,
          sourceTier: input.sourceTier,
          mimeType: input.mimeType ?? existingByCanonical.mimeType,
          discoveredAt: existingByCanonical.discoveredAt,
          publishedAt: input.publishedAt ?? existingByCanonical.publishedAt,
          updatedAtHint: input.updatedAtHint ?? existingByCanonical.updatedAtHint,
          retrievedAt,
          contentHash: input.contentHash ?? existingByCanonical.contentHash,
          textContent: input.textContent ?? existingByCanonical.textContent,
          markdownContent: input.markdownContent ?? existingByCanonical.markdownContent,
          storagePointers: mergeStoragePointers(existingByCanonical.storagePointers, input.storagePointers),
          updatedAt: now,
        })
        .where(eq(sources.id, existingByCanonical.id))
        .returning(sourceColumns);

      return {
        source: updatedSource,
        dedupeStrategy: "canonical_url",
      };
    }

    if (input.contentHash) {
      const [existingByHash] = await db
        .select(sourceColumns)
        .from(sources)
        .where(
          and(
            eq(sources.reportId, input.reportId),
            eq(sources.runId, input.runId),
            eq(sources.contentHash, input.contentHash),
          ),
        )
        .limit(1);

      if (existingByHash) {
        const aliases = Array.isArray(existingByHash.storagePointers.aliasUrls)
          ? [...(existingByHash.storagePointers.aliasUrls as string[]), input.canonicalUrl]
          : [input.canonicalUrl];

        const [updatedSource] = await db
          .update(sources)
          .set({
            title: existingByHash.title ?? input.title ?? null,
            updatedAtHint: input.updatedAtHint ?? existingByHash.updatedAtHint,
            retrievedAt,
            storagePointers: mergeStoragePointers(existingByHash.storagePointers, input.storagePointers, {
              aliasUrls: [...new Set(aliases)],
              dedupedByContentHash: true,
            }),
            updatedAt: now,
          })
          .where(eq(sources.id, existingByHash.id))
          .returning(sourceColumns);

        return {
          source: updatedSource,
          dedupeStrategy: "content_hash",
        };
      }
    }

    const [source] = await db
      .insert(sources)
      .values({
        reportId: input.reportId,
        runId: input.runId,
        url: input.url,
        normalizedUrl: input.normalizedUrl,
        canonicalUrl: input.canonicalUrl,
        canonicalDomain: input.canonicalDomain,
        title: input.title ?? null,
        sourceType: input.sourceType,
        sourceTier: input.sourceTier,
        mimeType: input.mimeType ?? null,
        discoveredAt,
        publishedAt: input.publishedAt ?? null,
        updatedAtHint: input.updatedAtHint ?? null,
        retrievedAt,
        contentHash: input.contentHash ?? null,
        textContent: input.textContent ?? null,
        markdownContent: input.markdownContent ?? null,
        storagePointers: input.storagePointers ?? {},
      })
      .returning(sourceColumns);

    return {
      source,
      dedupeStrategy: "created",
    };
  },

  async updateSourceStoragePointers({ sourceId, storagePointers }) {
    const db = getDb();
    const now = new Date();
    const [existing] = await db.select({ storagePointers: sources.storagePointers }).from(sources).where(eq(sources.id, sourceId)).limit(1);

    if (!existing) {
      return;
    }

    await db
      .update(sources)
      .set({
        storagePointers: mergeStoragePointers(existing.storagePointers, storagePointers),
        updatedAt: now,
      })
      .where(eq(sources.id, sourceId));
  },

  async replaceFactsForRun(input) {
    const db = getDb();
    const now = new Date();

    await db.transaction(async (tx) => {
      await tx.delete(facts).where(and(eq(facts.reportId, input.reportId), eq(facts.runId, input.runId)));

      if (!input.facts.length) {
        return;
      }

      await tx.insert(facts).values(
        input.facts.map((fact) => ({
          reportId: input.reportId,
          runId: input.runId,
          sourceId: fact.sourceIds[0] ?? null,
          section: fact.section,
          classification: fact.classification,
          statement: fact.claim,
          rationale: fact.rationale,
          confidence: fact.confidence,
          freshness: fact.freshness,
          sentiment: fact.sentiment,
          relevance: fact.relevance,
          evidenceSnippet: fact.evidenceSnippet,
          sourceIds: fact.sourceIds,
          createdAt: now,
          updatedAt: now,
        })),
      );
    });
  },

  async replaceUseCasesForRun(input) {
    const db = getDb();
    const now = new Date();

    await db.transaction(async (tx) => {
      await tx.delete(useCases).where(and(eq(useCases.reportId, input.reportId), eq(useCases.runId, input.runId)));

      if (!input.useCases.length) {
        return;
      }

      await tx.insert(useCases).values(
        input.useCases.map((useCase) => ({
          reportId: input.reportId,
          runId: input.runId,
          department: useCase.department,
          name: useCase.workflowName,
          summary: useCase.summary,
          painPoint: useCase.painPoint,
          whyNow: useCase.whyNow,
          likelyUsers: useCase.likelyUsers,
          expectedOutcome: useCase.expectedOutcome,
          priorityRank: useCase.priorityRank,
          overallScore: Math.round(useCase.scorecard.priorityScore),
          impactScore: useCase.scorecard.businessValue,
          feasibilityScore: useCase.scorecard.deploymentReadiness,
          confidence: useCase.scorecard.evidenceConfidence,
          scorecard: useCase.scorecard,
          priorityScore: useCase.scorecard.priorityScore.toFixed(2),
          motionRecommendation: useCase.recommendedMotion,
          motionRationale: useCase.motionRationale,
          metrics: useCase.metrics,
          dependencies: useCase.dependencies,
          securityComplianceNotes: useCase.securityComplianceNotes,
          evidenceFactIds: [],
          evidenceSourceIds: useCase.evidenceSourceIds,
          openQuestions: useCase.openQuestions,
          createdAt: now,
          updatedAt: now,
        })),
      );
    });
  },

  async replaceStakeholdersForRun(input) {
    const db = getDb();
    const now = new Date();

    await db.transaction(async (tx) => {
      await tx
        .delete(stakeholders)
        .where(and(eq(stakeholders.reportId, input.reportId), eq(stakeholders.runId, input.runId)));

      if (!input.stakeholders.length) {
        return;
      }

      await tx.insert(stakeholders).values(
        input.stakeholders.map((stakeholder) => ({
          reportId: input.reportId,
          runId: input.runId,
          name: null,
          title: null,
          department: stakeholder.department,
          likelyRole: stakeholder.likelyRole,
          hypothesis: stakeholder.hypothesis,
          rationale: stakeholder.rationale,
          confidence: stakeholder.confidence,
          evidenceFactIds: [],
          evidenceSourceIds: stakeholder.evidenceSourceIds,
          createdAt: now,
          updatedAt: now,
        })),
      );
    });
  },

  async upsertArtifact(input) {
    const db = getDb();
    const now = new Date();

    await db
      .insert(artifacts)
      .values({
        reportId: input.reportId,
        runId: input.runId,
        artifactType: input.artifactType,
        mimeType: input.mimeType,
        fileName: input.fileName ?? null,
        storagePointers: input.storagePointers ?? {},
        contentHash: input.contentHash ?? null,
        sizeBytes: input.sizeBytes ?? null,
      })
      .onConflictDoUpdate({
        target: [artifacts.reportId, artifacts.runId, artifacts.artifactType],
        set: {
          mimeType: input.mimeType,
          fileName: input.fileName ?? null,
          storagePointers: input.storagePointers ?? {},
          contentHash: input.contentHash ?? null,
          sizeBytes: input.sizeBytes ?? null,
          updatedAt: now,
        },
      });
  },
};
