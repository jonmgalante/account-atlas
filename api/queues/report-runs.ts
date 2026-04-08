import { QueueClient } from "@vercel/queue";

import { createReportRunQueueProxyToken } from "../../src/lib/queue-report-run-proxy-auth";
import {
  reportRunQueueProxyResponseSchema,
  serializeQueueMessageMetadata,
  type ReportRunQueueMessage,
} from "../../src/lib/queue-report-run-proxy";

const queueClient = new QueueClient();
const QUEUE_PROXY_PATH = "/api/internal/queue/report-runs";
const QUEUE_PROXY_TOKEN_HEADER = "x-account-atlas-queue-proxy-token";

class QueueProxyRetryError extends Error {
  constructor(readonly afterSeconds: number) {
    super(`Queue proxy requested retry after ${afterSeconds} seconds.`);
    this.name = "QueueProxyRetryError";
  }
}

function getQueueProxyUrl() {
  const deploymentHost = process.env.VERCEL_URL;

  if (!deploymentHost) {
    throw new Error("VERCEL_URL is required for queue proxy requests.");
  }

  return new URL(QUEUE_PROXY_PATH, `https://${deploymentHost}`);
}

function getQueueProxyHeaders() {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    [QUEUE_PROXY_TOKEN_HEADER]: createReportRunQueueProxyToken(),
  };

  if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
    headers["x-vercel-protection-bypass"] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  }

  return headers;
}

async function proxyReportRunMessage(message: ReportRunQueueMessage, metadata: Parameters<typeof serializeQueueMessageMetadata>[0]) {
  const response = await fetch(getQueueProxyUrl(), {
    method: "POST",
    headers: getQueueProxyHeaders(),
    body: JSON.stringify({
      message,
      metadata: serializeQueueMessageMetadata(metadata),
    }),
  });

  if (response.ok) {
    return;
  }

  const payload = await response.json().catch(() => null);
  const parsed = reportRunQueueProxyResponseSchema.safeParse(payload);

  if (parsed.success && "retryAfterSeconds" in parsed.data) {
    throw new QueueProxyRetryError(parsed.data.retryAfterSeconds);
  }

  throw new Error(`Queue proxy failed with status ${response.status}.`);
}

export default queueClient.handleNodeCallback<ReportRunQueueMessage>(proxyReportRunMessage, {
  retry(error, metadata) {
    if (error instanceof QueueProxyRetryError) {
      return { afterSeconds: error.afterSeconds };
    }

    const delaySeconds = Math.min(300, 2 ** Math.min(metadata.deliveryCount, 6));
    return { afterSeconds: delaySeconds };
  },
});
