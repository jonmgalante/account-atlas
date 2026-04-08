// Vercel loads this queue callback as CommonJS at runtime, so it cannot use ESM imports.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createHash } = require("node:crypto") as typeof import("node:crypto");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { QueueClient } = require("@vercel/queue") as typeof import("@vercel/queue");

type ReportRunQueueMessage = {
  runId: number;
};

type SerializableQueueMessageMetadata = {
  messageId: string;
  deliveryCount: number;
  createdAt: string;
  expiresAt: string;
  topicName: string;
  consumerGroup: string;
  region: string;
};

const queueClient = new QueueClient();
const QUEUE_PROXY_CONTEXT = "account-atlas.report-run-queue.proxy";
const QUEUE_PROXY_PATH = "/api/internal/queue/report-runs";
const QUEUE_PROXY_TOKEN_HEADER = "x-account-atlas-queue-proxy-token";

class QueueProxyRetryError extends Error {
  constructor(readonly afterSeconds: number) {
    super(`Queue proxy requested retry after ${afterSeconds} seconds.`);
    this.name = "QueueProxyRetryError";
  }
}

function createReportRunQueueProxyToken() {
  const databaseUrl = process.env.DATABASE_URL ?? "";
  const requestFingerprintSalt = process.env.REQUEST_FINGERPRINT_SALT ?? "";

  if (!databaseUrl && !requestFingerprintSalt) {
    throw new Error("Queue proxy token requires DATABASE_URL or REQUEST_FINGERPRINT_SALT.");
  }

  return createHash("sha256")
    .update(QUEUE_PROXY_CONTEXT)
    .update("\0")
    .update(databaseUrl)
    .update("\0")
    .update(requestFingerprintSalt)
    .digest("hex");
}

function serializeQueueMessageMetadata(metadata: {
  messageId: string;
  deliveryCount: number;
  createdAt: Date;
  expiresAt: Date;
  topicName: string;
  consumerGroup: string;
  region: string;
}): SerializableQueueMessageMetadata {
  return {
    messageId: metadata.messageId,
    deliveryCount: metadata.deliveryCount,
    createdAt: metadata.createdAt.toISOString(),
    expiresAt: metadata.expiresAt.toISOString(),
    topicName: metadata.topicName,
    consumerGroup: metadata.consumerGroup,
    region: metadata.region,
  };
}

function parseQueueProxyRetryAfterSeconds(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as { retryAfterSeconds?: unknown };
  return typeof record.retryAfterSeconds === "number" && Number.isInteger(record.retryAfterSeconds) && record.retryAfterSeconds > 0
    ? record.retryAfterSeconds
    : null;
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
  const retryAfterSeconds = parseQueueProxyRetryAfterSeconds(payload);

  if (retryAfterSeconds) {
    throw new QueueProxyRetryError(retryAfterSeconds);
  }

  throw new Error(`Queue proxy failed with status ${response.status}.`);
}

module.exports = queueClient.handleNodeCallback<ReportRunQueueMessage>(proxyReportRunMessage, {
  retry(error, metadata) {
    if (error instanceof QueueProxyRetryError) {
      return { afterSeconds: error.afterSeconds };
    }

    const delaySeconds = Math.min(300, 2 ** Math.min(metadata.deliveryCount, 6));
    return { afterSeconds: delaySeconds };
  },
});
