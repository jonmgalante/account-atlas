import "server-only";

export class ReportCreatePolicyError extends Error {
  readonly code: "RATE_LIMITED";
  readonly status: number;
  readonly retryAfterSeconds: number;

  constructor(message: string, retryAfterSeconds: number) {
    super(message);
    this.name = "ReportCreatePolicyError";
    this.code = "RATE_LIMITED";
    this.status = 429;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function isReportCreatePolicyError(error: unknown): error is ReportCreatePolicyError {
  return error instanceof ReportCreatePolicyError;
}
