import { describe, expect, it } from "vitest";

import { externalSourceEnrichmentJsonSchema } from "@/server/research/schemas";

describe("externalSourceEnrichmentJsonSchema", () => {
  it("does not emit unsupported uri formats for OpenAI structured outputs", () => {
    const serialized = JSON.stringify(externalSourceEnrichmentJsonSchema);

    expect(serialized).not.toContain('"format":"uri"');
  });
});
