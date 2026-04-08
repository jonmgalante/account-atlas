import { describe, expect, it } from "vitest";

import { parseReportRequest } from "@/lib/validation/report-request";

describe("parseReportRequest", () => {
  it("normalizes a valid company URL", () => {
    const result = parseReportRequest({
      companyUrl: "openai.com",
    });

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.companyUrl).toBe("https://openai.com/");
    }
  });

  it("rejects private targets", () => {
    const result = parseReportRequest({
      companyUrl: "http://127.0.0.1:4000",
    });

    expect(result.success).toBe(false);
  });
});

