import type { ReportRunQueueMessage } from "@/lib/queue-report-run-proxy";
import { reportRunQueueMessageHandler, retryReportRunQueueMessage } from "@/server/pipeline/report-run-queue-consumer";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const { handleCallback } = await import("@vercel/queue");
  const handler = handleCallback<ReportRunQueueMessage>(reportRunQueueMessageHandler, {
    retry: retryReportRunQueueMessage,
  });

  return handler(request);
}
