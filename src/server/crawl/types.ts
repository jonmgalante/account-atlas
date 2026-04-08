import "server-only";

import type { SourceType } from "@/lib/source";

export type CrawlCandidateKind = "html" | "pdf";

export type CrawlCandidate = {
  url: string;
  kind: CrawlCandidateKind;
  priority: number;
  sourceType: SourceType;
  anchorText: string | null;
  discoveredFromUrl: string | null;
  discoveredAt: Date;
};

export type DiscoveredLink = {
  url: string;
  anchorText: string | null;
};

export type ParsedHtmlDocument = {
  title: string | null;
  canonicalUrl: string;
  markdownContent: string | null;
  textContent: string | null;
  publishedAt: Date | null;
  updatedAtHint: Date | null;
  links: DiscoveredLink[];
};

export type FetchCompanyResourceResult = {
  finalUrl: string;
  status: number;
  mimeType: string | null;
  buffer: Buffer;
  retrievedAt: Date;
};

export type CrawlSourceArtifactPointers = Record<string, unknown>;

export type CrawlIngestionResult = {
  pagesFetched: number;
  htmlPagesStored: number;
  pdfSourcesStored: number;
  dedupedSources: number;
  sourceIds: number[];
  manifest: {
    visitedUrls: string[];
    pdfUrls: string[];
    blockedUrls: string[];
  };
};
