import "server-only";

import { createHash } from "node:crypto";

import { serializeReportToMarkdown } from "@/server/exports/markdown";
import { renderReportPdf } from "@/server/exports/pdf-document";
import { buildReportExportViewModel } from "@/server/exports/view-model";
import {
  drizzleReportRepository,
  type ReportRepository,
  type StoredRunContext,
} from "@/server/repositories/report-repository";
import { maybeStoreBlobArtifact } from "@/server/storage/blob-store";

type ArtifactBlobStore = typeof maybeStoreBlobArtifact;

type ReportExportServiceDependencies = {
  repository?: ReportRepository;
  blobStore?: ArtifactBlobStore;
  pdfRenderer?: typeof renderReportPdf;
};

function createArtifactSlug(context: StoredRunContext) {
  const base = (context.report.companyName ?? context.report.canonicalDomain)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return base || context.report.shareId;
}

function getArtifactFileName(context: StoredRunContext, extension: "md" | "pdf") {
  const slug = createArtifactSlug(context);
  return `${slug}-account-atlas-${context.report.shareId}.${extension}`;
}

function createArtifactHash(body: string | Buffer) {
  return createHash("sha256").update(body).digest("hex");
}

function getArtifactSize(body: string | Buffer) {
  return typeof body === "string" ? Buffer.byteLength(body) : body.byteLength;
}

export function createReportExportService(dependencies: ReportExportServiceDependencies = {}) {
  const repository = dependencies.repository ?? drizzleReportRepository;
  const blobStore = dependencies.blobStore ?? maybeStoreBlobArtifact;
  const pdfRenderer = dependencies.pdfRenderer ?? renderReportPdf;

  async function buildExportViewModel(context: StoredRunContext) {
    const [sources, facts] = await Promise.all([
      repository.listSourcesByRunId(context.run.id),
      repository.listFactsByRunId(context.run.id),
    ]);

    return buildReportExportViewModel({
      context,
      sources,
      facts,
    });
  }

  async function persistArtifact(input: {
    context: StoredRunContext;
    artifactType: "markdown" | "pdf";
    body: string | Buffer;
    mimeType: string;
    extension: "md" | "pdf";
  }) {
    const fileName = getArtifactFileName(input.context, input.extension);
    const pathname = `reports/${input.context.report.shareId}/${input.context.run.id}/${fileName}`;
    const contentHash = createArtifactHash(input.body);
    const sizeBytes = getArtifactSize(input.body);
    const blob = await blobStore({
      pathname,
      body: input.body,
      contentType: input.mimeType,
      minimumBytes: 0,
    });

    await repository.upsertArtifact({
      reportId: input.context.report.id,
      runId: input.context.run.id,
      artifactType: input.artifactType,
      mimeType: input.mimeType,
      fileName,
      storagePointers: blob
        ? {
            storageMode: "blob",
            blob,
          }
        : typeof input.body === "string"
          ? {
              storageMode: "inline_text",
              inlineText: input.body,
            }
          : {
              storageMode: "inline_base64",
              inlineBase64: input.body.toString("base64"),
            },
      contentHash,
      sizeBytes,
    });

    return {
      fileName,
      contentHash,
      sizeBytes,
      storageMode: blob ? "blob" : "inline",
    };
  }

  return {
    async generateMarkdownArtifact(context: StoredRunContext) {
      const model = await buildExportViewModel(context);
      const markdown = serializeReportToMarkdown(model);
      const artifact = await persistArtifact({
        context,
        artifactType: "markdown",
        body: markdown,
        mimeType: "text/markdown; charset=utf-8",
        extension: "md",
      });

      return `Generated a deterministic Markdown export (${artifact.fileName}, ${artifact.sizeBytes} bytes).`;
    },

    async generatePdfArtifact(context: StoredRunContext) {
      const model = await buildExportViewModel(context);
      const pdf = await pdfRenderer(model);
      const artifact = await persistArtifact({
        context,
        artifactType: "pdf",
        body: pdf,
        mimeType: "application/pdf",
        extension: "pdf",
      });

      return `Generated a branded PDF export (${artifact.fileName}, ${artifact.sizeBytes} bytes).`;
    },
  };
}
