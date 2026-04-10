import "server-only";

import type { PipelineStepKey, PipelineStepStatus } from "@/lib/types/report";
import {
  evaluateSellerFacingReport,
  formatMinimumViableRequirement,
  formatOptionalCoverageGap,
} from "@/lib/report-completion";
import { createAccountPlanService } from "@/server/account-plan/account-plan-service";
import { createCompanySiteCrawler } from "@/server/crawl/company-site-crawler";
import { createReportExportService } from "@/server/exports/export-service";
import { logServerEvent } from "@/server/observability/logger";
import { recordPipelineEvent, summarizeRunCoverage } from "@/server/pipeline/pipeline-observability";
import { createResearchPipelineService } from "@/server/research/research-service";
import type { ReportRepository, StoredRunContext } from "@/server/repositories/report-repository";
import { drizzleReportRepository } from "@/server/repositories/report-repository";
import { PipelineRunNotFoundError, PipelineStepError, getPipelineErrorDetails } from "@/server/pipeline/pipeline-errors";
import { withTimeout } from "@/server/reliability/retry";
import {
  canContinueAfterCoreBriefSuccess,
  getPipelineProgressBefore,
  normalizePipelineState,
  REPORT_PIPELINE_STEPS,
  type StoredPipelineState,
} from "@/server/pipeline/pipeline-steps";

type PipelineRunnerDependencies = {
  repository?: ReportRepository;
  crawler?: ReturnType<typeof createCompanySiteCrawler>;
  researchService?: ReturnType<typeof createResearchPipelineService>;
  accountPlanService?: ReturnType<typeof createAccountPlanService>;
  exportService?: ReturnType<typeof createReportExportService>;
};

type PipelineRunTrigger = "inline" | "queue";

type ProcessReportRunInput = {
  runId: number;
  trigger: PipelineRunTrigger;
  queueMessageId?: string | null;
  deliveryCount?: number | null;
};

type StepHandlerContext = {
  report: StoredRunContext["report"];
  run: StoredRunContext["run"];
  repository: ReportRepository;
};

type StepOutcome = {
  message: string;
  fallbackApplied?: boolean;
};

type StepHandler = (context: StepHandlerContext) => Promise<StepOutcome>;

const STEP_TIMEOUT_MS: Record<PipelineStepKey, number> = {
  normalize_target: 10_000,
  crawl_company_site: 90_000,
  enrich_external_sources: 240_000,
  build_fact_base: 120_000,
  generate_account_plan: 240_000,
  export_markdown: 30_000,
  export_pdf: 60_000,
  finalize_report: 15_000,
};

const STEP_MAX_ATTEMPTS: Record<PipelineStepKey, number> = {
  normalize_target: 2,
  crawl_company_site: 3,
  enrich_external_sources: 3,
  build_fact_base: 3,
  generate_account_plan: 3,
  export_markdown: 2,
  export_pdf: 2,
  finalize_report: 2,
};

const STEP_HEARTBEAT_INTERVAL_MS = 15_000;
const STEP_ACTIVE_HEARTBEAT_THRESHOLD_MS = STEP_HEARTBEAT_INTERVAL_MS * 3;

function clonePipelineState(state: StoredPipelineState): StoredPipelineState {
  return {
    currentStepKey: state.currentStepKey,
    steps: Object.fromEntries(
      Object.entries(state.steps).map(([key, value]) => [
        key,
        {
          ...value,
        },
      ]),
    ) as StoredPipelineState["steps"],
  };
}

function createStepHandlers(
  crawler: ReturnType<typeof createCompanySiteCrawler>,
  researchService: ReturnType<typeof createResearchPipelineService>,
  accountPlanService: ReturnType<typeof createAccountPlanService>,
  exportService: ReturnType<typeof createReportExportService>,
): Record<PipelineStepKey, StepHandler> {
  async function runOptionalExport(input: {
    report: StoredRunContext["report"];
    run: StoredRunContext["run"];
    repository: ReportRepository;
    artifactType: "markdown" | "pdf";
    stepKey: "export_markdown" | "export_pdf";
    exportOperation: () => Promise<string>;
  }) {
    const artifactLabel = input.artifactType === "pdf" ? "PDF" : "Markdown";

    await recordPipelineEvent({
      repository: input.repository,
      context: {
        report: input.report,
        run: input.run,
      },
      level: "info",
      eventType: `${input.stepKey}_started`,
      stepKey: input.stepKey,
      message: `${artifactLabel} export started.`,
      metadata: {
        artifactType: input.artifactType,
      },
    });

    try {
      const message = await input.exportOperation();

      await recordPipelineEvent({
        repository: input.repository,
        context: {
          report: input.report,
          run: input.run,
        },
        level: "info",
        eventType: `${input.stepKey}_completed`,
        stepKey: input.stepKey,
        message: `${artifactLabel} export completed.`,
        metadata: {
          artifactType: input.artifactType,
        },
      });

      return {
        message,
        fallbackApplied: false,
      };
    } catch (error) {
      const errorDetails = getPipelineErrorDetails(error);
      const fallbackMessage = `${artifactLabel} export failed for this run, but the report can still be shared from the web view${input.artifactType === "pdf" ? " and any available Markdown export" : ""}.`;

      await recordPipelineEvent({
        repository: input.repository,
        context: {
          report: input.report,
          run: input.run,
        },
        level: "warning",
        eventType: `${input.stepKey}_failed`,
        stepKey: input.stepKey,
        message: `${artifactLabel} export failed.`,
        metadata: {
          artifactType: input.artifactType,
          errorCode: errorDetails.code,
          errorMessage: errorDetails.message,
        },
      });

      await recordPipelineEvent({
        repository: input.repository,
        context: {
          report: input.report,
          run: input.run,
        },
        level: "warning",
        eventType: "fallback_applied",
        stepKey: input.stepKey,
        message: `${artifactLabel} export failed, but the report can still complete with the source-backed web view: ${errorDetails.message}`,
        metadata: {
          artifactType: input.artifactType,
          fallbackType: "artifact_export",
          fallbackMessage,
          errorCode: errorDetails.code,
          errorMessage: errorDetails.message,
          errorCause: errorDetails.cause,
        },
      });

      return {
        message: fallbackMessage,
        fallbackApplied: true,
      };
    }
  }

  return {
    async normalize_target({ report }) {
      return {
        message: `Normalized the target URL and confirmed ${report.canonicalDomain} as the canonical domain.`,
      };
    },

    async crawl_company_site({ report, run }) {
      const crawlResult = await crawler.crawlCompanySite({
        report,
        run,
      });

      return {
        message:
          crawlResult.coverageStatus === "broad"
            ? `Crawled ${crawlResult.pagesFetched} pages and stored ${crawlResult.htmlPagesStored + crawlResult.pdfSourcesStored} first-party sources (${crawlResult.pdfSourcesStored} PDFs, ${crawlResult.dedupedSources} deduped).`
            : crawlResult.coverageStatus === "limited"
              ? `Crawled ${crawlResult.pagesFetched} pages and stored ${crawlResult.htmlPagesStored + crawlResult.pdfSourcesStored} first-party sources (${crawlResult.pdfSourcesStored} PDFs, ${crawlResult.dedupedSources} deduped). First-party coverage was limited, so Account Atlas continued with a lighter source plan and public-web research.`
              : "First-party crawl coverage remained thin, so Account Atlas continued with public-web research and any verified company sources it could preserve.",
        fallbackApplied: crawlResult.coverageStatus !== "broad",
      };
    },

    async enrich_external_sources({ report, run }) {
      return {
        message: await researchService.enrichExternalSources({
          report,
          run,
        }),
      };
    },

    async build_fact_base({ report, run }) {
      return {
        message: await researchService.buildFactBase({
          report,
          run,
        }),
      };
    },

    async generate_account_plan({ report, run }) {
      return {
        message: await accountPlanService.generateAccountPlan({
          report,
          run,
        }),
      };
    },

    async export_markdown({ report, run, repository }) {
      return runOptionalExport({
        report,
        run,
        repository,
        artifactType: "markdown",
        stepKey: "export_markdown",
        exportOperation: () =>
          exportService.generateMarkdownArtifact({
            report,
            run,
          }),
      });
    },

    async export_pdf({ report, run, repository }) {
      return runOptionalExport({
        report,
        run,
        repository,
        artifactType: "pdf",
        stepKey: "export_pdf",
        exportOperation: () =>
          exportService.generatePdfArtifact({
            report,
            run,
          }),
      });
    },

    async finalize_report({ run, repository }) {
      const artifacts = await repository.listArtifactsByRunId(run.id);
      const availableArtifactTypes = new Set(artifacts.map((artifact) => artifact.artifactType));
      const contract = evaluateSellerFacingReport({
        researchSummary: run.researchSummary,
        accountPlan: run.accountPlan,
      });
      const limitedCoverageAreas: string[] = [...contract.optionalGapKeys.map(formatOptionalCoverageGap)];

      if (!availableArtifactTypes.has("markdown")) {
        limitedCoverageAreas.push("Markdown export");
      }

      if (!availableArtifactTypes.has("pdf")) {
        limitedCoverageAreas.push("PDF export");
      }

      if (!contract.isSatisfied) {
        throw new PipelineStepError(
          "REPORT_CORE_CONTRACT_INCOMPLETE",
          `The minimum viable seller-facing report is incomplete: ${contract.missingRequirements.map(formatMinimumViableRequirement).join(", ")}.`,
        );
      }

      if (run.accountPlan) {
        return {
          message:
            limitedCoverageAreas.length > 0
              ? `The report run completed with a usable source-backed account brief and limited coverage in ${limitedCoverageAreas.join(", ")}.`
              : `The report run completed with a source-backed account plan, ${run.accountPlan.topUseCases.length} prioritized use cases, and downloadable ${availableArtifactTypes.has("pdf") ? "Markdown/PDF" : availableArtifactTypes.has("markdown") ? "Markdown" : "web"} exports.`,
          fallbackApplied: limitedCoverageAreas.length > 0,
        };
      }

      throw new PipelineStepError(
        "REPORT_CORE_CONTRACT_INCOMPLETE",
        "The minimum viable seller-facing report was not persisted before finalization.",
      );
    },
  };
}

const stepHandlersFactory = createStepHandlers;

function getStepStateLabel(status: PipelineStepStatus) {
  switch (status) {
    case "running":
      return "started";
    case "retrying":
      return "retrying";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    default:
      return "pending";
  }
}

function getActiveRunStatusForStep(stepKey: PipelineStepKey): StoredRunContext["run"]["status"] {
  return stepKey === "finalize_report" ? "synthesizing" : getPipelineStepRunStatus(stepKey);
}

function getPipelineStepRunStatus(stepKey: PipelineStepKey): StoredRunContext["run"]["status"] {
  return REPORT_PIPELINE_STEPS.find((step) => step.key === stepKey)?.runStatus ?? "synthesizing";
}

function isReportSuccessful(status: StoredRunContext["report"]["status"]) {
  return status === "ready" || status === "ready_with_limited_coverage";
}

function isReportFailed(status: StoredRunContext["report"]["status"]) {
  return status === "failed";
}

function isRunFinalized(status: StoredRunContext["run"]["status"]) {
  return status === "completed" || status === "failed" || status === "cancelled";
}

function shouldPreserveSuccessfulReport(input: {
  stepKey: PipelineStepKey;
  reportStatus: StoredRunContext["report"]["status"];
}) {
  return isReportSuccessful(input.reportStatus) && canContinueAfterCoreBriefSuccess(input.stepKey);
}

async function resolveReportStatusAfterStep(input: {
  repository: ReportRepository;
  runId: number;
}) {
  const refreshedContext = await input.repository.findRunContextById(input.runId);

  if (!refreshedContext) {
    throw new PipelineRunNotFoundError(input.runId);
  }

  const artifacts = await input.repository.listArtifactsByRunId(refreshedContext.run.id);
  const coverage = summarizeRunCoverage(refreshedContext, artifacts);
  const reportStatus: StoredRunContext["report"]["status"] = coverage.coreContractSatisfied
    ? coverage.hasLimitedCoverage
      ? "ready_with_limited_coverage"
      : "ready"
    : "running";

  return {
    context: refreshedContext,
    artifacts,
    coverage,
    reportStatus,
    reportCompletedAt: coverage.coreContractSatisfied ? refreshedContext.report.completedAt ?? new Date() : undefined,
  };
}

function startStepHeartbeat(input: {
  repository: ReportRepository;
  context: StoredRunContext;
  stepKey: PipelineStepKey;
}) {
  const intervalId = setInterval(() => {
    void input.repository.touchRunHeartbeat({
      reportId: input.context.report.id,
      runId: input.context.run.id,
      stepKey: input.stepKey,
    });
  }, STEP_HEARTBEAT_INTERVAL_MS);

  return () => {
    clearInterval(intervalId);
  };
}

async function resolveFallbackForExhaustedStep(input: {
  repository: ReportRepository;
  context: StoredRunContext;
  stepKey: PipelineStepKey;
}) {
  switch (input.stepKey) {
    case "crawl_company_site": {
      const sources = await input.repository.listSourcesByRunId(input.context.run.id);

      if (!sources.length) {
        return null;
      }

      return `Crawl company site exhausted retries. Continuing with ${sources.length} previously persisted sources and limited first-party coverage.`;
    }
    case "enrich_external_sources":
      return "External enrichment exhausted retries. Continuing with first-party research only.";
    case "build_fact_base": {
      const sources = await input.repository.listSourcesByRunId(input.context.run.id);

      if (!sources.length) {
        return null;
      }

      return `Fact-base extraction exhausted retries. Continuing with ${sources.length} persisted sources; downstream synthesis may have limited coverage.`;
    }
    case "generate_account_plan": {
      const refreshed = await input.repository.findRunContextById(input.context.run.id);

      if (!refreshed?.run.accountPlan) {
        return null;
      }

      const contract = evaluateSellerFacingReport({
        researchSummary: refreshed.run.researchSummary,
        accountPlan: refreshed.run.accountPlan,
      });

      if (!contract.isSatisfied) {
        return null;
      }

      return "Account-plan synthesis exhausted retries after the core seller-facing brief was already persisted. Continuing without optional sections.";
    }
    default:
      return null;
  }
}

export function createReportPipelineRunner(dependencies: PipelineRunnerDependencies = {}) {
  const repository = dependencies.repository ?? drizzleReportRepository;
  const crawler = dependencies.crawler ?? createCompanySiteCrawler({
    repository,
  });
  const researchService = dependencies.researchService ?? createResearchPipelineService({
    repository,
  });
  const accountPlanService = dependencies.accountPlanService ?? createAccountPlanService({
    repository,
  });
  const exportService = dependencies.exportService ?? createReportExportService({
    repository,
  });
  const stepHandlers = stepHandlersFactory(crawler, researchService, accountPlanService, exportService);

  return {
    async processReportRun(input: ProcessReportRunInput) {
      const runContext = await repository.findRunContextById(input.runId);

      if (!runContext) {
        throw new PipelineRunNotFoundError(input.runId);
      }

      if (isRunFinalized(runContext.run.status) || isReportFailed(runContext.report.status)) {
        return;
      }

      let currentContext = runContext;

      logServerEvent("info", "pipeline.run.started", {
        shareId: currentContext.report.shareId,
        runId: currentContext.run.id,
        trigger: input.trigger,
        deliveryCount: input.deliveryCount ?? 1,
      });

      if ((input.deliveryCount ?? 1) > 1) {
        logServerEvent("warn", "pipeline.run.redelivered", {
          shareId: currentContext.report.shareId,
          runId: currentContext.run.id,
          trigger: input.trigger,
          deliveryCount: input.deliveryCount ?? 1,
          queueMessageId: input.queueMessageId ?? currentContext.run.queueMessageId,
        });
      }

      for (const step of REPORT_PIPELINE_STEPS) {
        const claimContext = await repository.findRunContextById(input.runId);

        if (!claimContext) {
          throw new PipelineRunNotFoundError(input.runId);
        }

        if (isRunFinalized(claimContext.run.status) || isReportFailed(claimContext.report.status)) {
          return;
        }

        const claimResult = await repository.claimRunStepExecution({
          runId: input.runId,
          stepKey: step.key,
          stepRunStatus: getActiveRunStatusForStep(step.key),
          progressPercent: getPipelineProgressBefore(step.key),
          statusMessage: `${step.label} started.`,
          executionMode: claimContext.run.executionMode,
          queueMessageId: input.queueMessageId ?? claimContext.run.queueMessageId,
          reportStatus: shouldPreserveSuccessfulReport({
            stepKey: step.key,
            reportStatus: claimContext.report.status,
          })
            ? claimContext.report.status
            : "running",
          activeHeartbeatThresholdMs: STEP_ACTIVE_HEARTBEAT_THRESHOLD_MS,
          startedAt: claimContext.run.startedAt ?? new Date(),
          deliveryCount: input.deliveryCount ?? 1,
        });

        if (!claimResult) {
          throw new PipelineRunNotFoundError(input.runId);
        }

        if (claimResult.outcome === "finalized") {
          return;
        }

        if (claimResult.outcome === "already_completed") {
          currentContext = claimResult.context;
          continue;
        }

        if (claimResult.outcome === "duplicate_delivery") {
          await recordPipelineEvent({
            repository,
            context: claimResult.context,
            level: "warning",
            eventType: "duplicate_delivery_detected",
            stepKey: claimResult.activeStepKey,
            message: `Duplicate queue delivery detected while ${claimResult.activeStepKey.replaceAll("_", " ")} is already running.`,
            metadata: {
              activeStepKey: claimResult.activeStepKey,
              deliveryCount: input.deliveryCount ?? 1,
              lastHeartbeatAt: claimResult.lastHeartbeatAt?.toISOString() ?? null,
              queueMessageId: input.queueMessageId ?? claimResult.context.run.queueMessageId,
              trigger: input.trigger,
            },
          });

          throw new PipelineStepError(
            "PIPELINE_RUN_ALREADY_ACTIVE",
            `Another worker is already running ${claimResult.activeStepKey.replaceAll("_", " ")} for this report.`,
          );
        }

        currentContext = claimResult.context;
        const runningState = normalizePipelineState(currentContext.run.pipelineState);
        const startedAt = currentContext.run.startedAt ?? new Date();
        const runningStepState = runningState.steps[step.key];
        const runningMessage = `${step.label} started (${runningStepState.attemptCount} ${runningStepState.attemptCount === 1 ? "attempt" : "attempts"}).`;

        if (claimResult.claimMode === "resumed") {
          await recordPipelineEvent({
            repository,
            context: currentContext,
            level: "warning",
            eventType: "resumed_step_execution",
            stepKey: step.key,
            message: `${step.label} resumed from ${claimResult.resumedFromStatus ?? "unknown"} state.`,
            metadata: {
              attemptCount: runningStepState.attemptCount,
              deliveryCount: input.deliveryCount ?? 1,
              previousStepStatus: claimResult.resumedFromStatus,
              queueMessageId: input.queueMessageId ?? currentContext.run.queueMessageId,
              stepLabel: step.label,
              trigger: input.trigger,
            },
          });
        }

        await recordPipelineEvent({
          repository,
          context: currentContext,
          level: "info",
          eventType: "step_started",
          stepKey: step.key,
          message: runningMessage,
          metadata: {
            attemptCount: runningStepState.attemptCount,
            deliveryCount: input.deliveryCount ?? 1,
            maxAttempts: STEP_MAX_ATTEMPTS[step.key],
            queueMessageId: input.queueMessageId ?? currentContext.run.queueMessageId,
            resumedFromStatus: claimResult.resumedFromStatus,
            stepLabel: step.label,
            stepStatus: getStepStateLabel("running"),
            trigger: input.trigger,
          },
        });

        let stopHeartbeat: (() => void) | null = null;
        try {
          stopHeartbeat = startStepHeartbeat({
            repository,
            context: currentContext,
            stepKey: step.key,
          });

          const stepOutcome = await withTimeout(
            () =>
              stepHandlers[step.key]({
                report: currentContext.report,
                run: currentContext.run,
                repository,
              }),
            {
              timeoutMs: STEP_TIMEOUT_MS[step.key],
              label: step.label,
            },
          );

          stopHeartbeat?.();
          stopHeartbeat = null;

          const completedState = clonePipelineState(runningState);
          completedState.currentStepKey = null;
          completedState.steps[step.key] = {
            ...completedState.steps[step.key],
            status: "completed",
            completedAt: new Date().toISOString(),
            lastAttemptedAt: new Date().toISOString(),
            lastDeliveryCount: input.deliveryCount ?? 1,
            errorCode: null,
            errorMessage: null,
            fallbackApplied: stepOutcome.fallbackApplied ?? false,
            retryExhausted: false,
          };

          const isFinalStep = step.key === "finalize_report";
          const reportState = await resolveReportStatusAfterStep({
            repository,
            runId: input.runId,
          });
          const completedAt = isFinalStep ? new Date() : null;
          const promotedCoreBrief =
            !isReportSuccessful(currentContext.report.status) && isReportSuccessful(reportState.reportStatus);

          await repository.updateRunStepState({
            reportId: currentContext.report.id,
            runId: currentContext.run.id,
            status: isFinalStep ? "completed" : step.runStatus,
            stepKey: isFinalStep ? null : step.key,
            progressPercent: step.progressPercent,
            statusMessage: stepOutcome.message,
            executionMode: currentContext.run.executionMode,
            pipelineState: completedState,
            queueMessageId: input.queueMessageId ?? currentContext.run.queueMessageId,
            startedAt,
            completedAt,
            reportStatus: reportState.reportStatus,
            reportCompletedAt: reportState.reportCompletedAt,
          });

          if (promotedCoreBrief) {
            await recordPipelineEvent({
              repository,
              context: reportState.context,
              level: reportState.reportStatus === "ready_with_limited_coverage" ? "warning" : "info",
              eventType: "report.core_brief_ready",
              stepKey: step.key,
              message:
                reportState.reportStatus === "ready_with_limited_coverage"
                  ? "A usable core brief is ready. Optional enrichment or export work may still complete in the background."
                  : "A usable core brief is ready.",
              metadata: {
                coverageLimitations: reportState.coverage.coverageLimitations,
                deliveryCount: input.deliveryCount ?? 1,
                queueMessageId: input.queueMessageId ?? currentContext.run.queueMessageId,
                reportStatus: reportState.reportStatus,
                trigger: input.trigger,
              },
            });

            logServerEvent(
              reportState.reportStatus === "ready_with_limited_coverage" ? "warn" : "info",
              reportState.reportStatus === "ready_with_limited_coverage"
                ? "run_completed_with_limited_coverage"
                : "run_completed",
              {
                shareId: reportState.context.report.shareId,
                runId: reportState.context.run.id,
                stepKey: step.key,
                trigger: input.trigger,
                deliveryCount: input.deliveryCount ?? 1,
                queueMessageId: input.queueMessageId ?? currentContext.run.queueMessageId,
                coverageLimitations: reportState.coverage.coverageLimitations,
                summary:
                  reportState.reportStatus === "ready_with_limited_coverage"
                    ? "A usable core brief is ready with limited coverage."
                    : "A usable core brief is ready.",
              },
            );
          }

          await recordPipelineEvent({
            repository,
            context: currentContext,
            level: "info",
            eventType: "step_succeeded",
            stepKey: step.key,
            message: stepOutcome.message,
            metadata: {
              attemptCount: completedState.steps[step.key].attemptCount,
              deliveryCount: input.deliveryCount ?? 1,
              fallbackApplied: stepOutcome.fallbackApplied ?? false,
              progressPercent: step.progressPercent,
              queueMessageId: input.queueMessageId ?? currentContext.run.queueMessageId,
              stepLabel: step.label,
              stepStatus: getStepStateLabel("completed"),
              trigger: input.trigger,
            },
          });

          const refreshedContext = await repository.findRunContextById(input.runId);

          if (!refreshedContext) {
            throw new PipelineRunNotFoundError(input.runId);
          }

          currentContext = refreshedContext;

          if (isFinalStep) {
            const refreshedArtifacts = await repository.listArtifactsByRunId(refreshedContext.run.id);
            const refreshedCoverage = summarizeRunCoverage(refreshedContext, refreshedArtifacts);

            await recordPipelineEvent({
              repository,
              context: refreshedContext,
              level: refreshedCoverage.hasLimitedCoverage ? "warning" : "info",
              eventType: refreshedCoverage.hasLimitedCoverage ? "run_completed_with_limited_coverage" : "run_completed",
              stepKey: step.key,
              message: stepOutcome.message,
              metadata: {
                availableArtifactTypes: refreshedCoverage.availableArtifactTypes,
                coverageLimitations: refreshedCoverage.coverageLimitations,
                deliveryCount: input.deliveryCount ?? 1,
                queueMessageId: input.queueMessageId ?? refreshedContext.run.queueMessageId,
                trigger: input.trigger,
              },
            });
          }
        } catch (error) {
          stopHeartbeat?.();
          stopHeartbeat = null;

          const errorDetails = getPipelineErrorDetails(error);
          const attemptCount = runningState.steps[step.key].attemptCount;
          const maxAttempts = STEP_MAX_ATTEMPTS[step.key];
          const retryable = attemptCount < maxAttempts;

          if (retryable) {
            const retryingState = clonePipelineState(runningState);
            retryingState.currentStepKey = null;
            retryingState.steps[step.key] = {
              ...retryingState.steps[step.key],
              status: "retrying",
              lastAttemptedAt: new Date().toISOString(),
              lastDeliveryCount: input.deliveryCount ?? 1,
              errorCode: errorDetails.code,
              errorMessage: errorDetails.message,
              fallbackApplied: false,
              retryExhausted: false,
            };

            const retryingMessage = `${step.label} hit a retryable error. Account Atlas will retry automatically (${attemptCount}/${maxAttempts} attempts used): ${errorDetails.message}`;

            await repository.updateRunStepState({
              reportId: currentContext.report.id,
              runId: currentContext.run.id,
              status: getActiveRunStatusForStep(step.key),
              stepKey: step.key,
              progressPercent: getPipelineProgressBefore(step.key),
              statusMessage: retryingMessage,
              executionMode: currentContext.run.executionMode,
              pipelineState: retryingState,
              queueMessageId: input.queueMessageId ?? currentContext.run.queueMessageId,
              startedAt,
              errorCode: errorDetails.code,
              errorMessage: errorDetails.message,
              reportStatus: shouldPreserveSuccessfulReport({
                stepKey: step.key,
                reportStatus: currentContext.report.status,
              })
                ? currentContext.report.status
                : "running",
              reportCompletedAt: shouldPreserveSuccessfulReport({
                stepKey: step.key,
                reportStatus: currentContext.report.status,
              })
                ? currentContext.report.completedAt ?? new Date()
                : undefined,
            });

            await recordPipelineEvent({
              repository,
              context: currentContext,
              level: "warning",
              eventType: "retrying",
              stepKey: step.key,
              message: retryingMessage,
              metadata: {
                attemptCount,
                deliveryCount: input.deliveryCount ?? 1,
                errorCause: errorDetails.cause,
                errorCode: errorDetails.code,
                errorMessage: errorDetails.message,
                maxAttempts,
                queueMessageId: input.queueMessageId ?? currentContext.run.queueMessageId,
                stepLabel: step.label,
                stepStatus: getStepStateLabel("retrying"),
                trigger: input.trigger,
              },
            });
          } else {
            await recordPipelineEvent({
              repository,
              context: currentContext,
              level: "error",
              eventType: "retry_exhausted",
              stepKey: step.key,
              message: `${step.label} exhausted ${maxAttempts} attempts.`,
              metadata: {
                attemptCount,
                deliveryCount: input.deliveryCount ?? 1,
                errorCause: errorDetails.cause,
                errorCode: errorDetails.code,
                errorMessage: errorDetails.message,
                maxAttempts,
                queueMessageId: input.queueMessageId ?? currentContext.run.queueMessageId,
                stepLabel: step.label,
                trigger: input.trigger,
              },
            });

            let fallbackMessage = await resolveFallbackForExhaustedStep({
              repository,
              context: currentContext,
              stepKey: step.key,
            });

            if (
              !fallbackMessage &&
              shouldPreserveSuccessfulReport({
                stepKey: step.key,
                reportStatus: currentContext.report.status,
              })
            ) {
              fallbackMessage = `${step.label} failed after the core brief was already ready. Account Atlas kept the source-backed brief available and marked this optional stage as limited coverage.`;
            }

            if (fallbackMessage) {
              const fallbackState = clonePipelineState(runningState);
              fallbackState.currentStepKey = null;
              fallbackState.steps[step.key] = {
                ...fallbackState.steps[step.key],
                status: "completed",
                completedAt: new Date().toISOString(),
                lastAttemptedAt: new Date().toISOString(),
                lastDeliveryCount: input.deliveryCount ?? 1,
                errorCode: errorDetails.code,
                errorMessage: errorDetails.message,
                fallbackApplied: true,
                retryExhausted: true,
              };

              await repository.updateRunStepState({
                reportId: currentContext.report.id,
                runId: currentContext.run.id,
                status: step.key === "finalize_report" ? "completed" : getActiveRunStatusForStep(step.key),
                stepKey: null,
                progressPercent: step.progressPercent,
                statusMessage: fallbackMessage,
                executionMode: currentContext.run.executionMode,
                pipelineState: fallbackState,
                queueMessageId: input.queueMessageId ?? currentContext.run.queueMessageId,
                startedAt,
                completedAt: step.key === "finalize_report" ? new Date() : null,
                errorCode: null,
                errorMessage: null,
                reportStatus: shouldPreserveSuccessfulReport({
                  stepKey: step.key,
                  reportStatus: currentContext.report.status,
                })
                  ? currentContext.report.status
                  : "running",
                reportCompletedAt: shouldPreserveSuccessfulReport({
                  stepKey: step.key,
                  reportStatus: currentContext.report.status,
                })
                  ? currentContext.report.completedAt ?? new Date()
                  : undefined,
              });

              await recordPipelineEvent({
                repository,
                context: currentContext,
                level: "warning",
                eventType: "fallback_applied",
                stepKey: step.key,
                message: fallbackMessage,
                metadata: {
                  attemptCount,
                  deliveryCount: input.deliveryCount ?? 1,
                  errorCause: errorDetails.cause,
                  errorCode: errorDetails.code,
                  errorMessage: errorDetails.message,
                  maxAttempts,
                  queueMessageId: input.queueMessageId ?? currentContext.run.queueMessageId,
                  stepLabel: step.label,
                  trigger: input.trigger,
                },
              });

              await recordPipelineEvent({
                repository,
                context: currentContext,
                level: "info",
                eventType: "step_succeeded",
                stepKey: step.key,
                message: fallbackMessage,
                metadata: {
                  attemptCount,
                  deliveryCount: input.deliveryCount ?? 1,
                  fallbackApplied: true,
                  progressPercent: step.progressPercent,
                  queueMessageId: input.queueMessageId ?? currentContext.run.queueMessageId,
                  stepLabel: step.label,
                  stepStatus: getStepStateLabel("completed"),
                  trigger: input.trigger,
                },
              });

              const refreshedContext = await repository.findRunContextById(input.runId);

              if (!refreshedContext) {
                throw new PipelineRunNotFoundError(input.runId);
              }

              currentContext = refreshedContext;
              continue;
            }

            const failedState = clonePipelineState(runningState);
            failedState.currentStepKey = null;
            failedState.steps[step.key] = {
              ...failedState.steps[step.key],
              status: "failed",
              lastAttemptedAt: new Date().toISOString(),
              lastDeliveryCount: input.deliveryCount ?? 1,
              errorCode: errorDetails.code,
              errorMessage: errorDetails.message,
              fallbackApplied: false,
              retryExhausted: true,
            };

            const failedMessage = `${step.label} failed: ${errorDetails.message}`;
            const failedAt = new Date();

            await repository.updateRunStepState({
              reportId: currentContext.report.id,
              runId: currentContext.run.id,
              status: "failed",
              stepKey: step.key,
              progressPercent: getPipelineProgressBefore(step.key),
              statusMessage: failedMessage,
              executionMode: currentContext.run.executionMode,
              pipelineState: failedState,
              queueMessageId: input.queueMessageId ?? currentContext.run.queueMessageId,
              startedAt,
              failedAt,
              errorCode: errorDetails.code,
              errorMessage: errorDetails.message,
              reportStatus: "failed",
              reportFailedAt: failedAt,
            });

            await recordPipelineEvent({
              repository,
              context: currentContext,
              level: "error",
              eventType: "step_failed",
              stepKey: step.key,
              message: failedMessage,
              metadata: {
                attemptCount,
                deliveryCount: input.deliveryCount ?? 1,
                errorCause: errorDetails.cause,
                errorCode: errorDetails.code,
                errorMessage: errorDetails.message,
                maxAttempts,
                queueMessageId: input.queueMessageId ?? currentContext.run.queueMessageId,
                stepLabel: step.label,
                stepStatus: getStepStateLabel("failed"),
                trigger: input.trigger,
              },
            });

            const failedContext = await repository.findRunContextById(input.runId);

            if (!failedContext) {
              throw new PipelineRunNotFoundError(input.runId);
            }

            const artifacts = await repository.listArtifactsByRunId(failedContext.run.id);
            const coverage = summarizeRunCoverage(failedContext, artifacts);

            await recordPipelineEvent({
              repository,
              context: failedContext,
              level: "error",
              eventType: "run_failed",
              stepKey: step.key,
              message: failedMessage,
              metadata: {
                attemptCount,
                deliveryCount: input.deliveryCount ?? 1,
                errorCause: errorDetails.cause,
                errorCode: errorDetails.code,
                errorMessage: errorDetails.message,
                maxAttempts,
                partialDataAvailable: coverage.usableDataAvailable,
                availableArtifactTypes: coverage.availableArtifactTypes,
                coverageLimitations: coverage.coverageLimitations,
                queueMessageId: input.queueMessageId ?? failedContext.run.queueMessageId,
                stepLabel: step.label,
                trigger: input.trigger,
              },
            });

            throw new PipelineStepError("PIPELINE_RUN_FAILED", failedMessage, {
              cause: error,
            });
          }

          throw error;
        }
      }
    },
  };
}
