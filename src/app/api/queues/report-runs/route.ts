import { handleCallback } from "@vercel/queue";

import type { ReportRunQueueMessage } from "@/lib/queue-report-run-proxy";
import { reportRunQueueMessageHandler, retryReportRunQueueMessage } from "@/server/pipeline/report-run-queue-consumer";

export const runtime = "nodejs";

export const POST = handleCallback<ReportRunQueueMessage>(reportRunQueueMessageHandler, {
  retry: retryReportRunQueueMessage,
});
