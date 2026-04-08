export class PipelineRunNotFoundError extends Error {
  constructor(runId: number) {
    super(`Pipeline run ${runId} was not found.`);
    this.name = "PipelineRunNotFoundError";
  }
}

export class PipelineStepError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PipelineStepError";
    this.code = code;
  }
}

export function getPipelineErrorDetails(error: unknown) {
  if (error instanceof PipelineStepError) {
    return {
      code: error.code,
      message: error.message,
    };
  }

  if (error instanceof Error) {
    return {
      code: "PIPELINE_STEP_FAILED",
      message: error.message,
    };
  }

  return {
    code: "PIPELINE_STEP_FAILED",
    message: "The pipeline step failed with an unknown error.",
  };
}
