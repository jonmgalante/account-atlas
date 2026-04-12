import { describe, expect, it } from "vitest";

import { preferSourceBackedCompanyName } from "@/server/research/fact-packet";
import type { PersistedSource } from "@/server/repositories/report-repository";

function createSource(input: Partial<PersistedSource> & Pick<PersistedSource, "id" | "canonicalUrl" | "canonicalDomain" | "sourceType">): PersistedSource {
  return {
    id: input.id,
    reportId: 1,
    runId: 11,
    url: input.canonicalUrl,
    normalizedUrl: input.canonicalUrl,
    canonicalUrl: input.canonicalUrl,
    canonicalDomain: input.canonicalDomain,
    title: input.title ?? null,
    sourceType: input.sourceType,
    sourceTier: input.sourceTier ?? "primary",
    mimeType: input.mimeType ?? "text/html",
    discoveredAt: input.discoveredAt ?? new Date("2026-04-07T12:00:00.000Z"),
    publishedAt: input.publishedAt ?? null,
    updatedAtHint: input.updatedAtHint ?? null,
    retrievedAt: input.retrievedAt ?? new Date("2026-04-07T12:00:00.000Z"),
    contentHash: input.contentHash ?? null,
    textContent: input.textContent ?? null,
    markdownContent: input.markdownContent ?? null,
    storagePointers: input.storagePointers ?? {},
    createdAt: input.createdAt ?? new Date("2026-04-07T12:00:00.000Z"),
    updatedAt: input.updatedAt ?? new Date("2026-04-07T12:00:00.000Z"),
  };
}

describe("preferSourceBackedCompanyName", () => {
  it("prefers a fuller first-party company name when the fallback is an acronym", () => {
    const companyName = preferSourceBackedCompanyName({
      canonicalDomain: "gm.com",
      currentName: "GM",
      sources: [
        createSource({
          id: 1,
          canonicalUrl: "https://www.gm.com/",
          canonicalDomain: "gm.com",
          title: "General Motors | Official Site",
          sourceType: "company_homepage",
        }),
        createSource({
          id: 2,
          canonicalUrl: "https://investor.gm.com/",
          canonicalDomain: "investor.gm.com",
          title: "Investors | General Motors Company",
          sourceType: "investor_relations_page",
        }),
      ],
    });

    expect(companyName).toBe("General Motors");
  });
});
