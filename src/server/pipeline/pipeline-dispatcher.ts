import "server-only";

import { serverEnv } from "@/env/server";
import type { PipelineExecutionMode } from "@/lib/types/report";
import { logServerEvent } from "@/server/observability/logger";
import { createReportPipelineRunner } from "@/server/pipeline/pipeline-runner";

declare global {
  var __accountAtlasInlineRuns: Map<number, Promise<void>> | undefined;
}

export const REPORT_PIPELINE_TOPIC = "account-atlas-report-runs";

type DispatchContext = {
  runId: number;
};

export type PipelineDispatchResult = {
  executionMode: PipelineExecutionMode;
  queueMessageId: string | null;
  statusMessage: string;
};

type QueueSender = typeof import("@vercel/queue").send;

type PipelineDispatcherDependencies = {
  queueSender?: QueueSender;
  inlineRunner?: (runId: number) => Promise<void>;
};

function getInlineRunRegistry() {
  if (!globalThis.__accountAtlasInlineRuns) {
    globalThis.__accountAtlasInlineRuns = new Map<number, Promise<void>>();
  }

  return globalThis.__accountAtlasInlineRuns;
}

function resolvePreferredExecutionMode(): PipelineExecutionMode {
  if (serverEnv.REPORT_PIPELINE_MODE === "inline") {
    return "inline";
  }

  if (serverEnv.REPORT_PIPELINE_MODE === "vercel_queue") {
    return "vercel_queue";
  }

  return process.env.VERCEL === "1" ? "vercel_queue" : "inline";
}

function scheduleInlineRun(runId: number, inlineRunner: (runId: number) => Promise<void>) {
  const inlineRuns = getInlineRunRegistry();

  if (inlineRuns.has(runId)) {
    return;
  }

  const promise = inlineRunner(runId)
    .catch((error) => {
      logServerEvent("error", "pipeline.dispatch.inline_failed", {
        runId,
        error,
      });
    })
    .finally(() => {
      inlineRuns.delete(runId);
    });

  inlineRuns.set(runId, promise);
}

async function getQueueSender(): Promise<QueueSender> {
  const queueModule = await import("@vercel/queue");
  return queueModule.send;
}

async function dispatchToQueue(runId: number, queueSender: QueueSender): Promise<PipelineDispatchResult> {
  const result = await queueSender(
    REPORT_PIPELINE_TOPIC,
    {
      runId,
      enqueuedAt: new Date().toISOString(),
    },
    {
      idempotencyKey: `report-run-${runId}`,
    },
  );

  return {
    executionMode: "vercel_queue",
    queueMessageId: result.messageId,
    statusMessage: "Report run was published to Vercel Queues.",
  };
}

async function dispatchInline(runId: number, inlineRunner: (runId: number) => Promise<void>): Promise<PipelineDispatchResult> {
  scheduleInlineRun(runId, inlineRunner);

  return {
    executionMode: "inline",
    queueMessageId: null,
    statusMessage: "Report run started inline for local development.",
  };
}

export function createPipelineDispatcher(dependencies: PipelineDispatcherDependencies = {}) {
  const inlineRunner =
    dependencies.inlineRunner ??
    (async (runId: number) => {
      const runner = createReportPipelineRunner();
      await runner.processReportRun({
        runId,
        trigger: "inline",
      });
    });

  return {
    resolvePreferredExecutionMode,

    async dispatch(context: DispatchContext): Promise<PipelineDispatchResult> {
      const preferredMode = resolvePreferredExecutionMode();

      if (preferredMode === "inline") {
        return dispatchInline(context.runId, inlineRunner);
      }

      try {
        const queueSender = dependencies.queueSender ?? (await getQueueSender());
        return await dispatchToQueue(context.runId, queueSender);
      } catch (error) {
        if (serverEnv.REPORT_PIPELINE_MODE === "vercel_queue" || process.env.VERCEL === "1") {
          logServerEvent("error", "pipeline.dispatch.queue_failed", {
            runId: context.runId,
            error,
          });
          throw error;
        }

        logServerEvent("warn", "pipeline.dispatch.fallback_inline", {
          runId: context.runId,
          error,
        });
        return dispatchInline(context.runId, inlineRunner);
      }
    },
  };
}
