import { describe, expect, it } from "vitest";

import {
  createReportRunQueueProxyToken,
  isValidReportRunQueueProxyToken,
} from "@/lib/queue-report-run-proxy-auth";

describe("queue report run proxy auth", () => {
  it("validates a token when token material is configured", () => {
    const env = {
      REQUEST_FINGERPRINT_SALT: "test-salt",
    };
    const token = createReportRunQueueProxyToken(env);

    expect(isValidReportRunQueueProxyToken(token, env)).toBe(true);
  });

  it("returns false instead of throwing when token material is unavailable", () => {
    expect(isValidReportRunQueueProxyToken("candidate-token", {})).toBe(false);
  });
});
