import "server-only";

import type { SourceRegistryEntry } from "@/lib/types/research";
import { normalizePublicHttpUrl } from "@/lib/url";
import type { PersistedSource } from "@/server/repositories/report-repository";

type PersistedSourceWithOpenAI = PersistedSource & {
  storagePointers: PersistedSource["storagePointers"] & {
    openaiFileId?: string;
  };
};

function summarizeSource(source: PersistedSource) {
  const textCandidate =
    typeof source.storagePointers.summary === "string"
      ? source.storagePointers.summary
      : source.textContent ?? source.markdownContent ?? null;

  if (!textCandidate) {
    return null;
  }

  return textCandidate.replace(/\s+/g, " ").trim().slice(0, 400) || null;
}

export function buildSourceRegistry(sources: PersistedSource[]): SourceRegistryEntry[] {
  return sources.map((source) => ({
    sourceId: source.id,
    title: source.title ?? source.canonicalUrl,
    url: source.canonicalUrl,
    sourceType: source.sourceType,
    sourceTier: source.sourceTier,
    publishedAt: source.publishedAt?.toISOString() ?? null,
    retrievedAt: source.retrievedAt?.toISOString() ?? null,
    summary: summarizeSource(source),
    availableInFileSearch: typeof source.storagePointers.openaiFileId === "string",
  }));
}

export function buildSourceUrlIndex(sources: PersistedSource[]) {
  const index = new Map<string, PersistedSource>();

  for (const source of sources) {
    try {
      index.set(normalizePublicHttpUrl(source.canonicalUrl), source);
    } catch {
      index.set(source.canonicalUrl, source);
    }
  }

  return index;
}

export function resolveSourceIdsFromUrls(urls: string[], sourceUrlIndex: Map<string, PersistedSource>) {
  const sourceIds = new Set<number>();

  for (const url of urls) {
    try {
      const normalized = normalizePublicHttpUrl(url);
      const source = sourceUrlIndex.get(normalized);

      if (source) {
        sourceIds.add(source.id);
      }
    } catch {
      continue;
    }
  }

  return [...sourceIds];
}

export function buildFileIdSourceIndex(sources: PersistedSource[]) {
  const index = new Map<string, PersistedSourceWithOpenAI>();

  for (const source of sources as PersistedSourceWithOpenAI[]) {
    if (typeof source.storagePointers.openaiFileId === "string") {
      index.set(source.storagePointers.openaiFileId, source);
    }
  }

  return index;
}
