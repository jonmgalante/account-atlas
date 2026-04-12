import { beforeAll, describe, expect, it } from "vitest";

const liveInputs = (process.env.QUALITY_LIVE_DOMAINS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const liveDescribe = liveInputs.length > 0 ? describe : describe.skip;
const liveTimeoutMs = Number(process.env.QUALITY_LIVE_TIMEOUT_MS ?? 10 * 60_000);

liveDescribe("Live canary", () => {
  const results = new Map<
    string,
    Awaited<ReturnType<(typeof import("@/server/quality/live-canary"))["runLiveQualityCanary"]>>
  >();

  beforeAll(
    async () => {
      process.env.REPORT_PIPELINE_MODE = "inline";

      const { runLiveQualityCanary } = await import("@/server/quality/live-canary");

      for (const inputUrl of liveInputs) {
        results.set(
          inputUrl,
          await runLiveQualityCanary(inputUrl, {
            timeoutMs: liveTimeoutMs,
          }),
        );
      }
    },
    liveTimeoutMs * Math.max(1, liveInputs.length),
  );

  for (const inputUrl of liveInputs) {
    describe(inputUrl, () => {
      it("entity resolution", () => {
        expect(results.get(inputUrl)?.scorecard.find((entry) => entry.section === "entity_resolution")?.status).toBe("pass");
      });

      it("industry grounding", () => {
        expect(results.get(inputUrl)?.scorecard.find((entry) => entry.section === "industry_grounding")?.status).toBe("pass");
      });

      it("relevance of top opportunities", () => {
        expect(
          results.get(inputUrl)?.scorecard.find((entry) => entry.section === "relevance_of_top_opportunities")?.status,
        ).toBe("pass");
      });

      it("evidence support", () => {
        expect(results.get(inputUrl)?.scorecard.find((entry) => entry.section === "evidence_support")?.status).toBe("pass");
      });

      it("fallback correctness", () => {
        expect(results.get(inputUrl)?.scorecard.find((entry) => entry.section === "fallback_correctness")?.status).toBe("pass");
      });
    });
  }
});
