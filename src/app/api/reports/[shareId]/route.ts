import { isDatabaseConfigError } from "@/server/db/client";
import { apiError, apiSuccess } from "@/server/http/api-response";
import { logServerEvent } from "@/server/observability/logger";
import { createReportService } from "@/server/services/report-service";

type ReportRouteProps = {
  params: Promise<{
    shareId: string;
  }>;
};

const reportService = createReportService();

export async function GET(_: Request, { params }: ReportRouteProps) {
  const { shareId } = await params;

  try {
    const report = await reportService.getReportDocument(shareId);

    if (!report) {
      return apiError({
        status: 404,
        code: "REPORT_NOT_FOUND",
        message: "Report not found.",
        retryable: false,
      });
    }

    return apiSuccess(report);
  } catch (error) {
    if (isDatabaseConfigError(error)) {
      return apiError({
        status: 503,
        code: "PERSISTENCE_UNAVAILABLE",
        message: "Server-side persistence is not configured. Set DATABASE_URL and run the Drizzle migration.",
      });
    }

    logServerEvent("error", "api.report.fetch.failed", {
      shareId,
      error,
    });

    return apiError({
      status: 500,
      code: "REPORT_FETCH_FAILED",
      message: "Unable to load the report.",
    });
  }
}
