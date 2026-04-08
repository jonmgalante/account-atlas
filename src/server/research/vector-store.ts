import "server-only";

import { fetchCompanyResource } from "@/server/crawl/fetch-company-resource";
import { crawlConfig } from "@/server/crawl/config";
import type { OpenAIResearchClient } from "@/server/openai/client";
import { createOpenAIResearchClient } from "@/server/openai/client";
import type { PersistedSource, ReportRepository, StoredRunContext } from "@/server/repositories/report-repository";
import { drizzleReportRepository } from "@/server/repositories/report-repository";

type VectorStoreDependencies = {
  openAIClient?: OpenAIResearchClient;
  repository?: ReportRepository;
};

function sanitizeFileName(input: string) {
  return input.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 96) || "source";
}

function buildSourceUploadFilename(source: PersistedSource) {
  const title = sanitizeFileName(source.title ?? source.sourceType);
  const extension = source.mimeType?.includes("pdf") ? "pdf" : "md";
  return `${source.id}-${title}.${extension}`;
}

function buildTextPayload(source: PersistedSource) {
  const body = source.markdownContent ?? source.textContent ?? "";

  return [
    `# ${source.title ?? source.canonicalUrl}`,
    "",
    `- Source ID: ${source.id}`,
    `- URL: ${source.canonicalUrl}`,
    `- Source type: ${source.sourceType}`,
    `- Source tier: ${source.sourceTier}`,
    `- Published at: ${source.publishedAt?.toISOString() ?? "unknown"}`,
    "",
    body,
  ].join("\n");
}

function sourceHasOpenAIFile(source: PersistedSource) {
  return typeof source.storagePointers.openaiFileId === "string";
}

export function createRunVectorStoreManager(dependencies: VectorStoreDependencies = {}) {
  const openAIClient = dependencies.openAIClient ?? createOpenAIResearchClient();
  const repository = dependencies.repository ?? drizzleReportRepository;

  return {
    async ensureRunVectorStore(
      context: StoredRunContext,
      sources: PersistedSource[],
      options: {
        syncSources?: boolean;
      } = {},
    ) {
      if (!openAIClient.isConfigured()) {
        return null;
      }

      const syncSources = options.syncSources ?? true;

      let vectorStoreId = context.run.vectorStoreId;

      if (!vectorStoreId) {
        const vectorStore = await openAIClient.createVectorStore({
          name: `Account Atlas ${context.report.shareId}`,
          metadata: {
            report_share_id: context.report.shareId,
            report_run_id: String(context.run.id),
          },
        });

        vectorStoreId = vectorStore.id;

        await repository.setRunVectorStore({
          reportId: context.report.id,
          runId: context.run.id,
          vectorStoreId,
        });
      }

      if (!syncSources) {
        return vectorStoreId;
      }

      for (const source of sources) {
        if (sourceHasOpenAIFile(source)) {
          continue;
        }

        if (!source.mimeType?.includes("pdf") && !source.markdownContent && !source.textContent) {
          continue;
        }

        if (source.mimeType?.includes("pdf") && source.canonicalDomain !== context.report.canonicalDomain) {
          continue;
        }

        let file: File;

        if (source.mimeType?.includes("pdf")) {
          const response = await fetchCompanyResource({
            url: source.canonicalUrl,
            canonicalDomain: context.report.canonicalDomain,
            maxBytes: crawlConfig.maxPdfBytes,
            requestTimeoutMs: crawlConfig.requestTimeoutMs,
            maxRedirects: crawlConfig.maxRedirects,
            acceptHeader: "application/pdf,text/html;q=0.1",
          });

          file = new File([response.buffer], buildSourceUploadFilename(source), {
            type: response.mimeType ?? "application/pdf",
          });
        } else {
          file = new File([buildTextPayload(source)], buildSourceUploadFilename(source), {
            type: "text/markdown",
          });
        }

        const uploadedFile = await openAIClient.uploadFile({
          file,
          metadata: {
            reportShareId: context.report.shareId,
            sourceId: String(source.id),
          },
        });
        const vectorStoreFile = await openAIClient.attachFileToVectorStoreAndPoll({
          vectorStoreId,
          fileId: uploadedFile.id,
          attributes: {
            reportId: context.report.id,
            runId: context.run.id,
            sourceId: source.id,
          },
        });

        if (vectorStoreFile.lastError) {
          throw new Error(
            `OpenAI vector store indexing failed for source ${source.id}: ${vectorStoreFile.lastError.message}`,
          );
        }

        await repository.updateSourceStoragePointers({
          sourceId: source.id,
          storagePointers: {
            openaiFileId: uploadedFile.id,
            openaiVectorStoreFileId: vectorStoreFile.id,
            openaiVectorStoreId: vectorStoreId,
          },
        });
      }

      return vectorStoreId;
    },
  };
}
