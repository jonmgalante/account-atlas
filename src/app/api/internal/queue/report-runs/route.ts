import { isValidReportRunQueueProxyToken } from "@/lib/queue-report-run-proxy-auth";
import {
  hydrateQueueMessageMetadata,
  reportRunQueueProxyRequestSchema,
} from "@/lib/queue-report-run-proxy";
import { logServerEvent } from "@/server/observability/logger";
import { reportRunQueueMessageHandler, retryReportRunQueueMessage } from "@/server/pipeline/report-run-queue-consumer";

export const runtime = "nodejs";
export const maxDuration = 300;

const QUEUE_PROXY_TOKEN_HEADER = "x-account-atlas-queue-proxy-token";

export async function POST(request: Request) {
  const proxyToken = request.headers.get(QUEUE_PROXY_TOKEN_HEADER);

  if (!isValidReportRunQueueProxyToken(proxyToken)) {
    logServerEvent("warn", "queue.report_run.proxy.unauthorized", {});
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = reportRunQueueProxyRequestSchema.safeParse(payload);

  if (!parsed.success) {
    logServerEvent("warn", "queue.report_run.proxy.bad_request", {
      issues: parsed.error.flatten(),
    });
    return Response.json({ error: "Invalid queue proxy payload." }, { status: 400 });
  }

  const metadata = hydrateQueueMessageMetadata(parsed.data.metadata);

  try {
    await reportRunQueueMessageHandler(parsed.data.message, metadata);
    return Response.json({ acknowledge: true });
  } catch (error) {
    const retryDirective = retryReportRunQueueMessage(error, metadata);

    if (retryDirective && "acknowledge" in retryDirective) {
      return Response.json({ acknowledge: true });
    }

    if (retryDirective && "afterSeconds" in retryDirective) {
      return Response.json({ retryAfterSeconds: retryDirective.afterSeconds }, { status: 503 });
    }

    throw error;
  }
}
