export type ApiErrorCode =
  | "BAD_REQUEST"
  | "RATE_LIMITED"
  | "REPORT_NOT_FOUND"
  | "PERSISTENCE_UNAVAILABLE"
  | "REPORT_CREATE_FAILED"
  | "REPORT_STATUS_FAILED"
  | "REPORT_FETCH_FAILED"
  | "ARTIFACT_NOT_FOUND"
  | "ARTIFACT_DOWNLOAD_FAILED";

export type ApiSuccessResponse<T> = {
  ok: true;
  data: T;
};

export type ApiErrorResponse = {
  ok: false;
  error: {
    code: ApiErrorCode;
    message: string;
    retryable: boolean;
    retryAfterSeconds?: number;
    details?: Record<string, unknown>;
  };
};

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;
