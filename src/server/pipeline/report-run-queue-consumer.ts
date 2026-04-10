import "server-only";

import type { MessageHandler, RetryHandler } from "@vercel/queue";

import type { ReportRunQueueMessage } from "@/lib/queue-report-run-proxy";
import { logServerEvent } from "@/server/observability/logger";
import { PipelineRunNotFoundError, PipelineStepError } from "@/server/pipeline/pipeline-errors";
import { createReportPipelineRunner } from "@/server/pipeline/pipeline-runner";

const pipelineRunner = createReportPipelineRunner();

export const reportRunQueueMessageHandler: MessageHandler<ReportRunQueueMessage> = async (message, metadata) => {
  logServerEvent("info", "queue.report_run.received", {
    runId: message.runId,
    messageId: metadata.messageId,
    deliveryCount: metadata.deliveryCount,
  });

  await pipelineRunner.processReportRun({
    runId: message.runId,
    trigger: "queue",
    queueMessageId: metadata.messageId,
    deliveryCount: metadata.deliveryCount,
  });
};

export const retryReportRunQueueMessage: RetryHandler = (error, metadata) => {
  if (error instanceof PipelineRunNotFoundError) {
    logServerEvent("warn", "queue.report_run.ack_not_found", {
      messageId: metadata.messageId,
      deliveryCount: metadata.deliveryCount,
    });
    return { acknowledge: true };
  }

  if (error instanceof PipelineStepError && error.code === "PIPELINE_STEP_CIRCUIT_OPEN") {
    logServerEvent("error", "queue.report_run.ack_circuit_open", {
      messageId: metadata.messageId,
      deliveryCount: metadata.deliveryCount,
      error,
    });
    return { acknowledge: true };
  }

  if (error instanceof PipelineStepError && error.code === "PIPELINE_RUN_FAILED") {
    logServerEvent("warn", "queue.report_run.ack_terminal_failure", {
      messageId: metadata.messageId,
      deliveryCount: metadata.deliveryCount,
      error,
    });
    return { acknowledge: true };
  }

  if (error instanceof PipelineStepError && error.code === "PIPELINE_RUN_ALREADY_ACTIVE") {
    logServerEvent("warn", "queue.report_run.ack_duplicate_active", {
      messageId: metadata.messageId,
      deliveryCount: metadata.deliveryCount,
      error,
    });
    return { acknowledge: true };
  }

  const delaySeconds = Math.min(300, 2 ** Math.min(metadata.deliveryCount, 6));
  logServerEvent("warn", "queue.report_run.retry_scheduled", {
    messageId: metadata.messageId,
    deliveryCount: metadata.deliveryCount,
    delaySeconds,
    error,
  });
  return { afterSeconds: delaySeconds };
};
