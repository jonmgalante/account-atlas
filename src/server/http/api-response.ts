import "server-only";

import { NextResponse } from "next/server";

import type { ApiErrorCode, ApiErrorResponse, ApiSuccessResponse } from "@/lib/types/api";

export function apiSuccess<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(
    {
      ok: true,
      data,
    } satisfies ApiSuccessResponse<T>,
    init,
  );
}

export function apiError(input: {
  status: number;
  code: ApiErrorCode;
  message: string;
  retryable?: boolean;
  retryAfterSeconds?: number;
  details?: Record<string, unknown>;
  headers?: HeadersInit;
}) {
  const headers = new Headers(input.headers);

  if (input.retryAfterSeconds !== undefined) {
    headers.set("retry-after", String(input.retryAfterSeconds));
  }

  return NextResponse.json(
    {
      ok: false,
      error: {
        code: input.code,
        message: input.message,
        retryable: input.retryable ?? input.status >= 500,
        ...(input.retryAfterSeconds !== undefined ? { retryAfterSeconds: input.retryAfterSeconds } : {}),
        ...(input.details ? { details: input.details } : {}),
      },
    } satisfies ApiErrorResponse,
    {
      status: input.status,
      headers,
    },
  );
}
