import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

const QUEUE_PROXY_CONTEXT = "account-atlas.report-run-queue.proxy";

type QueueProxyEnv = {
  DATABASE_URL?: string;
  REQUEST_FINGERPRINT_SALT?: string;
  [key: string]: string | undefined;
};

export function createReportRunQueueProxyToken(env: QueueProxyEnv = process.env): string {
  const databaseUrl = env.DATABASE_URL ?? "";
  const requestFingerprintSalt = env.REQUEST_FINGERPRINT_SALT ?? "";

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

export function isValidReportRunQueueProxyToken(candidate: string | null | undefined, env: QueueProxyEnv = process.env) {
  if (!candidate) {
    return false;
  }

  let expected: string;

  try {
    expected = createReportRunQueueProxyToken(env);
  } catch {
    return false;
  }

  const candidateBuffer = Buffer.from(candidate);
  const expectedBuffer = Buffer.from(expected);

  return candidateBuffer.length === expectedBuffer.length && timingSafeEqual(candidateBuffer, expectedBuffer);
}
