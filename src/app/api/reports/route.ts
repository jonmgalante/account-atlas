import { parseReportRequest } from "@/lib/validation/report-request";
import { isDatabaseConfigError } from "@/server/db/client";
import { apiError, apiSuccess } from "@/server/http/api-response";
import { logServerEvent } from "@/server/observability/logger";
import { isReportCreatePolicyError } from "@/server/reporting/report-create-policy";
import { createRequestFingerprint, extractRequesterIp } from "@/server/security/request-fingerprint";
import { createReportService } from "@/server/services/report-service";

const reportService = createReportService();

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = parseReportRequest(body);
  const requesterIp = extractRequesterIp(request.headers);
  const requesterHash = createRequestFingerprint({
    ipAddress: requesterIp,
    userAgent: request.headers.get("user-agent"),
  });

  if (!parsed.success) {
    logServerEvent("warn", "api.report.create.invalid_request", {
      requesterHash,
    });

    return apiError({
      status: 400,
      code: "BAD_REQUEST",
      message: "Invalid company URL.",
      retryable: false,
      details: {
        issues: parsed.error.flatten(),
      },
    });
  }

  try {
    const createdReport = await reportService.createReport(parsed.data.companyUrl, {
      requesterHash,
    });
    const shareUrl = new URL(`/reports/${createdReport.shareId}`, request.url).toString();
    const statusUrl = new URL(`/api/reports/${createdReport.shareId}/status`, request.url).toString();

    return apiSuccess(
      {
        ...createdReport,
        shareUrl,
        statusUrl,
      },
      { status: createdReport.disposition === "created" ? 201 : 200 },
    );
  } catch (error) {
    if (isReportCreatePolicyError(error)) {
      return apiError({
        status: error.status,
        code: error.code,
        message: error.message,
        retryable: false,
        retryAfterSeconds: error.retryAfterSeconds,
      });
    }

    if (isDatabaseConfigError(error)) {
      return apiError({
        status: 503,
        code: "PERSISTENCE_UNAVAILABLE",
        message: "Server-side persistence is not configured. Set DATABASE_URL and run the Drizzle migration.",
      });
    }

    logServerEvent("error", "api.report.create.failed", {
      requesterHash,
      error,
    });

    return apiError({
      status: 500,
      code: "REPORT_CREATE_FAILED",
      message: "Unable to create the report.",
    });
  }
}
