import "server-only";

import { PipelineStepError } from "@/server/pipeline/pipeline-errors";

type RetryContext = {
  attempt: number;
  nextDelayMs: number;
};

type RetryWithBackoffOptions = {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  shouldRetry: (error: unknown, attempt: number) => boolean;
  onRetry?: (context: RetryContext, error: unknown) => void;
};

function wait(delayMs: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

export async function retryWithBackoff<T>(operation: (attempt: number) => Promise<T>, options: RetryWithBackoffOptions) {
  let attempt = 1;

  while (true) {
    try {
      return await operation(attempt);
    } catch (error) {
      if (attempt >= options.maxAttempts || !options.shouldRetry(error, attempt)) {
        throw error;
      }

      const exponentialDelay = Math.min(options.maxDelayMs, options.baseDelayMs * 2 ** (attempt - 1));
      const jitter = Math.round(exponentialDelay * 0.2 * Math.random());
      const nextDelayMs = exponentialDelay + jitter;

      options.onRetry?.(
        {
          attempt,
          nextDelayMs,
        },
        error,
      );

      await wait(nextDelayMs);
      attempt += 1;
    }
  }
}

export async function withTimeout<T>(operation: () => Promise<T>, input: { timeoutMs: number; label: string }) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      operation(),
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new PipelineStepError("STEP_TIMEOUT", `${input.label} timed out after ${input.timeoutMs}ms.`));
        }, input.timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}
