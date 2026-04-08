import { describe, expect, it } from "vitest";

import { createShareId } from "@/lib/id";

describe("createShareId", () => {
  it("returns the requested length", () => {
    expect(createShareId()).toHaveLength(10);
    expect(createShareId(16)).toHaveLength(16);
  });

  it("uses the allowed alphabet", () => {
    expect(createShareId(64)).toMatch(/^[23456789abcdefghjkmnpqrstuvwxyz]+$/);
  });
});

