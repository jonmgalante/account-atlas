import { describe, expect, it } from "vitest";

import { canonicalAccountAtlasReportJsonSchema } from "@/server/deep-research/report-contract";

describe("canonicalAccountAtlasReportJsonSchema", () => {
  it("does not emit unsupported uri formats for OpenAI structured outputs", () => {
    const serialized = JSON.stringify(canonicalAccountAtlasReportJsonSchema);

    expect(serialized).not.toContain('"format":"uri"');
  });
});
