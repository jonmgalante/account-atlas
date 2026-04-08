import { isDatabaseConfigError } from "@/server/db/client";
import { apiError } from "@/server/http/api-response";
import { logServerEvent } from "@/server/observability/logger";
import { createReportService } from "@/server/services/report-service";

type ArtifactRouteProps = {
  params: Promise<{
    shareId: string;
    artifactType: string;
  }>;
};

const reportService = createReportService();

function isSupportedArtifactType(value: string): value is "markdown" | "pdf" {
  return value === "markdown" || value === "pdf";
}

export async function GET(_: Request, { params }: ArtifactRouteProps) {
  const { shareId, artifactType } = await params;

  if (!isSupportedArtifactType(artifactType)) {
    return apiError({
      status: 404,
      code: "ARTIFACT_NOT_FOUND",
      message: "Artifact type not supported.",
      retryable: false,
    });
  }

  try {
    const artifact = await reportService.getArtifactDownload(shareId, artifactType);

    if (!artifact) {
      return apiError({
        status: 404,
        code: "ARTIFACT_NOT_FOUND",
        message: "Artifact not found.",
        retryable: false,
      });
    }

    if (artifact.kind === "redirect") {
      return Response.redirect(artifact.url);
    }

    const body = typeof artifact.body === "string" ? artifact.body : new Uint8Array(artifact.body);

    return new Response(body, {
      headers: {
        "content-type": artifact.mimeType,
        "content-disposition": `attachment; filename="${artifact.fileName}"`,
        "cache-control": "private, max-age=0, must-revalidate",
      },
    });
  } catch (error) {
    if (isDatabaseConfigError(error)) {
      return apiError({
        status: 503,
        code: "PERSISTENCE_UNAVAILABLE",
        message: "Server-side persistence is not configured. Set DATABASE_URL and run the Drizzle migration.",
      });
    }

    logServerEvent("error", "api.report.artifact.failed", {
      shareId,
      artifactType,
      error,
    });

    return apiError({
      status: 500,
      code: "ARTIFACT_DOWNLOAD_FAILED",
      message: "Unable to download the artifact.",
    });
  }
}
