import { describe, expect, it } from "vitest";

import { buildInitialCrawlCandidates, classifyDiscoveredCandidate } from "@/server/crawl/source-discovery";

describe("classifyDiscoveredCandidate", () => {
  it("classifies high-value same-domain pages", () => {
    const candidate = classifyDiscoveredCandidate("/security", "https://openai.com/", "openai.com", "Security");

    expect(candidate).toMatchObject({
      url: "https://openai.com/security",
      kind: "html",
      sourceType: "security_page",
    });
  });

  it("rejects external domains", () => {
    expect(classifyDiscoveredCandidate("https://example.org/about", "https://openai.com/", "openai.com", "About")).toBeNull();
  });

  it("detects investor PDFs", () => {
    const candidate = classifyDiscoveredCandidate(
      "/investors/q1-2026-shareholder-letter.pdf",
      "https://openai.com/investors",
      "openai.com",
      "Q1 shareholder letter",
    );

    expect(candidate).toMatchObject({
      kind: "pdf",
      sourceType: "investor_report",
    });
  });
});

describe("buildInitialCrawlCandidates", () => {
  it("seeds the homepage and fallback high-value paths", () => {
    const candidates = buildInitialCrawlCandidates("https://openai.com/platform", "openai.com");
    const urls = candidates.map((candidate) => candidate.url);

    expect(urls[0]).toBe("https://openai.com/");
    expect(urls).toContain("https://openai.com/about");
    expect(urls).toContain("https://openai.com/pricing");
    expect(urls).toContain("https://openai.com/docs");
  });
});
