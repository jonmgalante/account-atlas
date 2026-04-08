import "server-only";

import { createHash } from "node:crypto";

import ipaddr from "ipaddr.js";

import { serverEnv } from "@/env/server";

const FALLBACK_REQUEST_SALT = "account-atlas-dev-salt";

function pickHeaderValue(headers: Headers, key: string) {
  const value = headers.get(key)?.trim();
  return value ? value : null;
}

export function extractRequesterIp(headers: Headers) {
  const forwarded = pickHeaderValue(headers, "x-forwarded-for");
  const candidates = [
    forwarded?.split(",")[0]?.trim() ?? null,
    pickHeaderValue(headers, "x-real-ip"),
    pickHeaderValue(headers, "cf-connecting-ip"),
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    if (ipaddr.isValid(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function createRequestFingerprint(input: {
  ipAddress: string | null;
  userAgent?: string | null;
}) {
  const salt = serverEnv.REQUEST_FINGERPRINT_SALT ?? FALLBACK_REQUEST_SALT;
  const identity = `${input.ipAddress ?? "unknown"}|${input.userAgent?.trim() || "unknown-agent"}`;

  return createHash("sha256").update(`${salt}:${identity}`).digest("hex");
}
