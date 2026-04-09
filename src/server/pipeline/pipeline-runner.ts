import "server-only";

import type { PipelineStepKey, PipelineStepStatus } from "@/lib/types/report";
import { createAccountPlanService } from "@/server/account-plan/account-plan-service";
import { createCompanySiteCrawler } from "@/server/crawl/company-site-crawler";
import { createReportExportService } from "@/server/exports/export-service";
import { logServerEvent } from "@/server/observability/logger";
import { createResearchPipelineService } from "@/server/research/research-service";
import type { ReportRepository, StoredRunContext } from "@/server/repositories/report-repository";
import { drizzleReportRepository } from "@/server/repositories/report-repository";
import { PipelineRunNotFoundError, PipelineStepError, getPipelineErrorDetails } from "@/server/pipeline/pipeline-errors";
import { withTimeout } from "@/server/reliability/retry";
import {
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

type StepHandler = (context: StepHandlerContext) => Promise<string>;

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
    try {
      return await input.exportOperation();
    } catch (error) {
      const artifactLabel = input.artifactType === "pdf" ? "PDF" : "Markdown";
      const errorMessage = error instanceof Error ? error.message : `Unknown ${artifactLabel} export error.`;

      await input.repository.appendRunEvent({
        reportId: input.report.id,
        runId: input.run.id,
        level: "warning",
        eventType: `artifact.${input.artifactType}.failed`,
        stepKey: input.stepKey,
        message: `${artifactLabel} export failed, but the report can still complete with the source-backed web view: ${errorMessage}`,
        metadata: {
          errorMessage,
        },
      });

      logServerEvent("warn", "artifact.export.failed", {
        shareId: input.report.shareId,
        runId: input.run.id,
        artifactType: input.artifactType,
        error,
      });

      return `${artifactLabel} export failed for this run, but the report can still be shared from the web view${input.artifactType === "pdf" ? " and any available Markdown export" : ""}.`;
    }
  }

  return {
    async normalize_target({ report }) {
      return `Normalized the target URL and confirmed ${report.canonicalDomain} as the canonical domain.`;
    },

    async crawl_company_site({ report, run }) {
      const crawlResult = await crawler.crawlCompanySite({
        report,
        run,
      });

      return `Crawled ${crawlResult.pagesFetched} pages and stored ${crawlResult.htmlPagesStored + crawlResult.pdfSourcesStored} first-party sources (${crawlResult.pdfSourcesStored} PDFs, ${crawlResult.dedupedSources} deduped).`;
    },

    async enrich_external_sources({ report, run }) {
      return researchService.enrichExternalSources({
        report,
        run,
      });
    },

    async build_fact_base({ report, run }) {
      return researchService.buildFactBase({
        report,
        run,
      });
    },

    async generate_account_plan({ report, run }) {
      return accountPlanService.generateAccountPlan({
        report,
        run,
      });
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

      if (run.accountPlan) {
        return `The report run completed with a source-backed account plan, ${run.accountPlan.topUseCases.length} prioritized use cases, and downloadable ${availableArtifactTypes.has("pdf") ? "Markdown/PDF" : availableArtifactTypes.has("markdown") ? "Markdown" : "web"} exports.`;
      }

      if (run.researchSummary) {
        return "The report run completed with a research summary, but account-plan synthesis did not persist final recommendations.";
      }

      return "The report run completed, but no source-backed research artifacts were persisted for the final share view.";
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
    researchService,
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

      if (runContext.run.status === "completed" || runContext.report.status === "ready") {
        return;
      }

      let currentContext = runContext;

      logServerEvent("info", "pipeline.run.started", {
        shareId: currentContext.report.shareId,
        runId: currentContext.run.id,
        trigger: input.trigger,
        deliveryCount: input.deliveryCount ?? 1,
      });

      for (const step of REPORT_PIPELINE_STEPS) {
        const currentState = normalizePipelineState(currentContext.run.pipelineState);
        const stepState = currentState.steps[step.key];

        if (stepState?.status === "completed") {
          continue;
        }

        if (stepState?.status === "failed" && (stepState.attemptCount ?? 0) >= STEP_MAX_ATTEMPTS[step.key]) {
          const error = new PipelineStepError(
            "PIPELINE_STEP_CIRCUIT_OPEN",
            `${step.label} exceeded ${STEP_MAX_ATTEMPTS[step.key]} attempts and is blocked for this run.`,
          );

          logServerEvent("warn", "pipeline.step.circuit_open", {
            shareId: currentContext.report.shareId,
            runId: currentContext.run.id,
            stepKey: step.key,
            attemptCount: stepState.attemptCount,
          });

          throw error;
        }

        const runningState = clonePipelineState(currentState);
        runningState.currentStepKey = step.key;
        runningState.steps[step.key] = {
          status: "running",
          attemptCount: (stepState?.attemptCount ?? 0) + 1,
          startedAt: stepState?.startedAt ?? new Date().toISOString(),
          completedAt: stepState?.completedAt ?? null,
          errorCode: null,
          errorMessage: null,
        };

        const startedAt = currentContext.run.startedAt ?? new Date();
        const runningMessage = `${step.label} started (${runningState.steps[step.key].attemptCount} ${runningState.steps[step.key].attemptCount === 1 ? "attempt" : "attempts"}).`;

        await repository.updateRunStepState({
          reportId: currentContext.report.id,
          runId: currentContext.run.id,
          status: step.runStatus,
          stepKey: step.key,
          progressPercent: getPipelineProgressBefore(step.key),
          statusMessage: runningMessage,
          executionMode: currentContext.run.executionMode,
          pipelineState: runningState,
          queueMessageId: input.queueMessageId ?? currentContext.run.queueMessageId,
          startedAt,
          reportStatus: "running",
        });

        await repository.appendRunEvent({
          reportId: currentContext.report.id,
          runId: currentContext.run.id,
          level: "info",
          eventType: "pipeline.step.started",
          stepKey: step.key,
          message: runningMessage,
          metadata: {
            trigger: input.trigger,
            deliveryCount: input.deliveryCount ?? 1,
            stepStatus: getStepStateLabel("running"),
          },
        });

        logServerEvent("info", "pipeline.step.started", {
          shareId: currentContext.report.shareId,
          runId: currentContext.run.id,
          stepKey: step.key,
          attemptCount: runningState.steps[step.key].attemptCount,
          trigger: input.trigger,
        });

        try {
          const completedMessage = await withTimeout(
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

          const completedState = clonePipelineState(runningState);
          completedState.currentStepKey = null;
          completedState.steps[step.key] = {
            ...completedState.steps[step.key],
            status: "completed",
            completedAt: new Date().toISOString(),
            errorCode: null,
            errorMessage: null,
          };

          const isFinalStep = step.key === "finalize_report";
          const completedAt = isFinalStep ? new Date() : null;

          await repository.updateRunStepState({
            reportId: currentContext.report.id,
            runId: currentContext.run.id,
            status: isFinalStep ? "completed" : step.runStatus,
            stepKey: isFinalStep ? null : step.key,
            progressPercent: step.progressPercent,
            statusMessage: completedMessage,
            executionMode: currentContext.run.executionMode,
            pipelineState: completedState,
            queueMessageId: input.queueMessageId ?? currentContext.run.queueMessageId,
            startedAt,
            completedAt,
            reportStatus: isFinalStep ? "ready" : "running",
            reportCompletedAt: completedAt,
          });

          await repository.appendRunEvent({
            reportId: currentContext.report.id,
            runId: currentContext.run.id,
            level: "info",
            eventType: "pipeline.step.completed",
            stepKey: step.key,
            message: completedMessage,
            metadata: {
              trigger: input.trigger,
              stepStatus: getStepStateLabel("completed"),
              progressPercent: step.progressPercent,
            },
          });

          logServerEvent("info", "pipeline.step.completed", {
            shareId: currentContext.report.shareId,
            runId: currentContext.run.id,
            stepKey: step.key,
            progressPercent: step.progressPercent,
          });

          const refreshedContext = await repository.findRunContextById(input.runId);

          if (!refreshedContext) {
            throw new PipelineRunNotFoundError(input.runId);
          }

          currentContext = refreshedContext;

          if (isFinalStep) {
            logServerEvent("info", "pipeline.run.completed", {
              shareId: refreshedContext.report.shareId,
              runId: refreshedContext.run.id,
            });
          }
        } catch (error) {
          const errorDetails = getPipelineErrorDetails(error);
          const attemptCount = runningState.steps[step.key].attemptCount;
          const maxAttempts = STEP_MAX_ATTEMPTS[step.key];
          const retryable = attemptCount < maxAttempts;

          if (retryable) {
            const retryingState = clonePipelineState(runningState);
            retryingState.currentStepKey = step.key;
            retryingState.steps[step.key] = {
              ...retryingState.steps[step.key],
              status: "retrying",
              errorCode: errorDetails.code,
              errorMessage: errorDetails.message,
            };

            const retryingMessage = `${step.label} hit a retryable error. Account Atlas will retry automatically (${attemptCount}/${maxAttempts} attempts used): ${errorDetails.message}`;

            await repository.updateRunStepState({
              reportId: currentContext.report.id,
              runId: currentContext.run.id,
              status: step.runStatus,
              stepKey: step.key,
              progressPercent: getPipelineProgressBefore(step.key),
              statusMessage: retryingMessage,
              executionMode: currentContext.run.executionMode,
              pipelineState: retryingState,
              queueMessageId: input.queueMessageId ?? currentContext.run.queueMessageId,
              startedAt,
              errorCode: errorDetails.code,
              errorMessage: errorDetails.message,
              reportStatus: "running",
            });

            await repository.appendRunEvent({
              reportId: currentContext.report.id,
              runId: currentContext.run.id,
              level: "warning",
              eventType: "pipeline.step.retry_scheduled",
              stepKey: step.key,
              message: retryingMessage,
              metadata: {
                trigger: input.trigger,
                stepStatus: getStepStateLabel("retrying"),
                errorCode: errorDetails.code,
                attemptCount,
                maxAttempts,
              },
            });

            logServerEvent("warn", "pipeline.step.retry_scheduled", {
              shareId: currentContext.report.shareId,
              runId: currentContext.run.id,
              stepKey: step.key,
              errorCode: errorDetails.code,
              attemptCount,
              maxAttempts,
            });
          } else {
            const failedState = clonePipelineState(runningState);
            failedState.currentStepKey = step.key;
            failedState.steps[step.key] = {
              ...failedState.steps[step.key],
              status: "failed",
              errorCode: errorDetails.code,
              errorMessage: errorDetails.message,
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

            await repository.appendRunEvent({
              reportId: currentContext.report.id,
              runId: currentContext.run.id,
              level: "error",
              eventType: "pipeline.step.failed",
              stepKey: step.key,
              message: failedMessage,
              metadata: {
                trigger: input.trigger,
                stepStatus: getStepStateLabel("failed"),
                errorCode: errorDetails.code,
                attemptCount,
                maxAttempts,
              },
            });

            logServerEvent("error", "pipeline.step.failed", {
              shareId: currentContext.report.shareId,
              runId: currentContext.run.id,
              stepKey: step.key,
              errorCode: errorDetails.code,
              error,
            });

            logServerEvent("error", "pipeline.run.failed", {
              shareId: currentContext.report.shareId,
              runId: currentContext.run.id,
              stepKey: step.key,
              errorCode: errorDetails.code,
            });
          }

          throw error;
        }
      }
    },
  };
}
