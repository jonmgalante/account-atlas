import { describe, expect, it } from "vitest";

import { extractCanonicalDomain, safeNormalizeCompanyUrl } from "@/lib/url";

describe("safeNormalizeCompanyUrl", () => {
  it("adds https when the scheme is omitted", () => {
    expect(safeNormalizeCompanyUrl("openai.com")).toEqual({
      success: true,
      data: "https://openai.com/",
    });
  });

  it("strips the hash fragment", () => {
    expect(safeNormalizeCompanyUrl("https://example.com/test#about")).toEqual({
      success: true,
      data: "https://example.com/test",
    });
  });

  it("strips common tracking query params", () => {
    expect(safeNormalizeCompanyUrl("https://example.com/pricing?utm_source=newsletter&gclid=123&plan=team")).toEqual({
      success: true,
      data: "https://example.com/pricing?plan=team",
    });
  });

  it("rejects unsafe schemes", () => {
    expect(safeNormalizeCompanyUrl("javascript:alert(1)")).toEqual({
      success: false,
      error: "Only http and https URLs are supported.",
    });
  });

  it("rejects localhost", () => {
    expect(safeNormalizeCompanyUrl("http://localhost:3000")).toEqual({
      success: false,
      error: "Enter a public company URL. Local and private-network targets are blocked.",
    });
  });

  it("rejects private IPv4 ranges", () => {
    expect(safeNormalizeCompanyUrl("http://192.168.1.24")).toEqual({
      success: false,
      error: "Enter a company domain, not a raw IP address.",
    });
  });

  it("rejects link-local IPv6 addresses", () => {
    expect(safeNormalizeCompanyUrl("http://[fe80::1]")).toEqual({
      success: false,
      error: "Enter a company domain, not a raw IP address.",
    });
  });

  it("rejects custom ports", () => {
    expect(safeNormalizeCompanyUrl("https://example.com:8443")).toEqual({
      success: false,
      error: "Only standard public web ports are supported.",
    });
  });

  it("extracts a canonical domain", () => {
    expect(extractCanonicalDomain("https://www.openai.com/research")).toBe("openai.com");
  });
});
