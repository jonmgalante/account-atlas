import "server-only";

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { z } from "zod";

import { serverEnv } from "@/env/server";
import { logServerEvent } from "@/server/observability/logger";
import { retryWithBackoff, withTimeout } from "@/server/reliability/retry";

type JsonRecord = Record<string, unknown>;
const DEFAULT_OPENAI_TIMEOUT_MS = 45_000;
const DEFAULT_OPENAI_MAX_ATTEMPTS = 3;

export type OpenAIWebSearchSource = {
  url: string;
};

export type OpenAIFileSearchResult = {
  fileId: string | null;
  filename: string | null;
  score: number | null;
  text: string | null;
  attributes: Record<string, string | number | boolean> | null;
};

export type ParsedStructuredResponse<T> = {
  responseId: string;
  parsed: T;
  outputText: string;
  rawResponse: {
    id: string;
    output: unknown;
    usage: unknown;
  };
  webSearchSources: OpenAIWebSearchSource[];
  fileSearchResults: OpenAIFileSearchResult[];
};

export type OpenAIBackgroundResponseStatus =
  | "queued"
  | "in_progress"
  | "completed"
  | "failed"
  | "cancelled"
  | "incomplete";

export type RetrievedBackgroundResponse = {
  responseId: string;
  status: OpenAIBackgroundResponseStatus | null;
  outputText: string;
  rawResponse: {
    id: string;
    status: OpenAIBackgroundResponseStatus | null;
    output: unknown;
    usage: unknown;
    error: unknown;
    incompleteDetails: unknown;
    model: string;
    completedAt: number | null;
  };
  webSearchSources: OpenAIWebSearchSource[];
  fileSearchResults: OpenAIFileSearchResult[];
};

export class OpenAIConfigError extends Error {
  constructor(message = "OPENAI_API_KEY is not configured on the server.") {
    super(message);
    this.name = "OpenAIConfigError";
  }
}

export type OpenAIResearchClient = {
  isConfigured(): boolean;
  createVectorStore(input: {
    name: string;
    metadata?: Record<string, string>;
  }): Promise<{
    id: string;
    status: string;
  }>;
  uploadFile(input: {
    file: File;
    metadata?: Record<string, string>;
  }): Promise<{
    id: string;
  }>;
  attachFileToVectorStoreAndPoll(input: {
    vectorStoreId: string;
    fileId: string;
    attributes?: Record<string, string | number | boolean>;
  }): Promise<{
    id: string;
    status: string;
    lastError: {
      code: string;
      message: string;
    } | null;
  }>;
  parseStructuredOutput<T extends z.ZodTypeAny>(input: {
    model: string;
    instructions: string;
    input: string;
    schema: T;
    schemaName: string;
    tools?: Array<Record<string, unknown>>;
    include?: Array<"web_search_call.action.sources" | "file_search_call.results">;
    metadata?: Record<string, string>;
    maxOutputTokens?: number;
    timeoutMs?: number;
    maxAttempts?: number;
  }): Promise<ParsedStructuredResponse<z.infer<T>>>;
  createBackgroundStructuredOutput?<T extends z.ZodTypeAny>(input: {
    model: string;
    instructions: string;
    input: string;
    schema: T;
    schemaName: string;
    tools?: Array<Record<string, unknown>>;
    include?: Array<"web_search_call.action.sources" | "file_search_call.results">;
    metadata?: Record<string, string>;
    maxOutputTokens?: number;
    timeoutMs?: number;
    maxAttempts?: number;
  }): Promise<RetrievedBackgroundResponse>;
  retrieveBackgroundResponse?(input: {
    responseId: string;
    include?: Array<"web_search_call.action.sources" | "file_search_call.results">;
    timeoutMs?: number;
    maxAttempts?: number;
  }): Promise<RetrievedBackgroundResponse>;
};

declare global {
  var __accountAtlasOpenAIClient: OpenAI | undefined;
}

function getClient() {
  if (!serverEnv.OPENAI_API_KEY) {
    throw new OpenAIConfigError();
  }

  if (!globalThis.__accountAtlasOpenAIClient) {
    globalThis.__accountAtlasOpenAIClient = new OpenAI({
      apiKey: serverEnv.OPENAI_API_KEY,
    });
  }

  return globalThis.__accountAtlasOpenAIClient;
}

function extractWebSearchSources(output: unknown): OpenAIWebSearchSource[] {
  if (!Array.isArray(output)) {
    return [];
  }

  const urls = output.flatMap((item) => {
    if (!item || typeof item !== "object" || (item as { type?: string }).type !== "web_search_call") {
      return [];
    }

    const action = (item as { action?: { sources?: Array<{ url?: string }> } }).action;

    if (!action?.sources || !Array.isArray(action.sources)) {
      return [];
    }

    return action.sources
      .map((source) => source.url?.trim())
      .filter((url): url is string => Boolean(url));
  });

  return [...new Set(urls)].map((url) => ({ url }));
}

function extractFileSearchResults(output: unknown): OpenAIFileSearchResult[] {
  if (!Array.isArray(output)) {
    return [];
  }

  return output.flatMap((item) => {
    if (!item || typeof item !== "object" || (item as { type?: string }).type !== "file_search_call") {
      return [];
    }

    const results = (item as { results?: Array<JsonRecord> }).results;

    if (!results || !Array.isArray(results)) {
      return [];
    }

    return results.map((result) => ({
      fileId: typeof result.file_id === "string" ? result.file_id : null,
      filename: typeof result.filename === "string" ? result.filename : null,
      score: typeof result.score === "number" ? result.score : null,
      text: typeof result.text === "string" ? result.text : null,
      attributes:
        result.attributes && typeof result.attributes === "object"
          ? (result.attributes as Record<string, string | number | boolean>)
          : null,
    }));
  });
}

function getResponseStatus(response: { status?: string | null }): OpenAIBackgroundResponseStatus | null {
  const status = response.status;

  if (
    status === "queued" ||
    status === "in_progress" ||
    status === "completed" ||
    status === "failed" ||
    status === "cancelled" ||
    status === "incomplete"
  ) {
    return status;
  }

  return null;
}

export function isOpenAIConfigError(error: unknown): error is OpenAIConfigError {
  return error instanceof OpenAIConfigError;
}

export function createOpenAIResearchClient(overrides: { client?: OpenAI } = {}): OpenAIResearchClient {
  const client = overrides.client;

  function resolveClient() {
    return client ?? getClient();
  }

  function isRetryableOpenAIError(error: unknown) {
    if (!(error instanceof Error)) {
      return false;
    }

    const errorRecord = error as unknown as { status?: unknown; code?: unknown };
    const status = typeof errorRecord.status === "number" ? errorRecord.status : null;
    const code = typeof errorRecord.code === "string" ? errorRecord.code : null;

    return (
      status === 408 ||
      status === 409 ||
      status === 429 ||
      (status !== null && status >= 500) ||
      code === "STEP_TIMEOUT" ||
      code === "rate_limit_exceeded" ||
      code === "timeout" ||
      error.message.toLowerCase().includes("timeout") ||
      error.message.toLowerCase().includes("timed out")
    );
  }

  async function withOpenAIRetry<T>(
    operationName: string,
    operation: () => Promise<T>,
    options: {
      timeoutMs?: number;
      maxAttempts?: number;
    } = {},
  ) {
    const timeoutMs = options.timeoutMs ?? DEFAULT_OPENAI_TIMEOUT_MS;
    const maxAttempts = options.maxAttempts ?? DEFAULT_OPENAI_MAX_ATTEMPTS;

    return retryWithBackoff(
      async () =>
        withTimeout(operation, {
          timeoutMs,
          label: operationName,
        }),
      {
        maxAttempts,
        baseDelayMs: 500,
        maxDelayMs: 4_000,
        shouldRetry: (error) => isRetryableOpenAIError(error),
        onRetry: ({ attempt, nextDelayMs }, error) => {
          logServerEvent("warn", "openai.retry", {
            operationName,
            attempt,
            nextDelayMs,
            error,
          });
        },
      },
    );
  }

  return {
    isConfigured() {
      return Boolean(client ?? serverEnv.OPENAI_API_KEY);
    },

    async createVectorStore(input) {
      const vectorStore = await withOpenAIRetry("openai.createVectorStore", () =>
        resolveClient().vectorStores.create({
          name: input.name,
          metadata: input.metadata,
          expires_after: {
            anchor: "last_active_at",
            days: 7,
          },
        }),
      );

      return {
        id: vectorStore.id,
        status: vectorStore.status,
      };
    },

    async uploadFile(input) {
      const file = await withOpenAIRetry("openai.uploadFile", () =>
        resolveClient().files.create({
          file: input.file,
          purpose: "user_data",
          expires_after: {
            anchor: "created_at",
            seconds: 7 * 24 * 60 * 60,
          },
        }),
      );

      return {
        id: file.id,
      };
    },

    async attachFileToVectorStoreAndPoll(input) {
      const vectorStoreFile = await withOpenAIRetry("openai.attachFileToVectorStoreAndPoll", () =>
        resolveClient().vectorStores.files.createAndPoll(input.vectorStoreId, {
          file_id: input.fileId,
          attributes: input.attributes,
        }),
      );

      return {
        id: vectorStoreFile.id,
        status: vectorStoreFile.status,
        lastError: vectorStoreFile.last_error
          ? {
              code: vectorStoreFile.last_error.code,
              message: vectorStoreFile.last_error.message,
            }
          : null,
      };
    },

    async parseStructuredOutput<T extends z.ZodTypeAny>(input: {
      model: string;
      instructions: string;
      input: string;
      schema: T;
      schemaName: string;
      tools?: Array<Record<string, unknown>>;
      include?: Array<"web_search_call.action.sources" | "file_search_call.results">;
      metadata?: Record<string, string>;
      maxOutputTokens?: number;
      timeoutMs?: number;
      maxAttempts?: number;
    }) {
      const response = await withOpenAIRetry(
        `openai.parseStructuredOutput:${input.schemaName}`,
        () =>
          resolveClient().responses.parse({
            model: input.model,
            instructions: input.instructions,
            input: input.input,
            tools: input.tools as never,
            include: input.include as never,
            metadata: input.metadata,
            max_output_tokens: input.maxOutputTokens,
            text: {
              format: zodTextFormat(input.schema, input.schemaName),
            },
          }),
        {
          timeoutMs: input.timeoutMs,
          maxAttempts: input.maxAttempts,
        },
      );

      if (!response.output_parsed) {
        throw new Error(`OpenAI response ${response.id} returned no parsed structured output.`);
      }

      return {
        responseId: response.id,
        parsed: response.output_parsed,
        outputText: response.output_text,
        rawResponse: {
          id: response.id,
          output: response.output,
          usage: response.usage,
        },
        webSearchSources: extractWebSearchSources(response.output),
        fileSearchResults: extractFileSearchResults(response.output),
      };
    },

    async createBackgroundStructuredOutput<T extends z.ZodTypeAny>(input: {
      model: string;
      instructions: string;
      input: string;
      schema: T;
      schemaName: string;
      tools?: Array<Record<string, unknown>>;
      include?: Array<"web_search_call.action.sources" | "file_search_call.results">;
      metadata?: Record<string, string>;
      maxOutputTokens?: number;
      timeoutMs?: number;
      maxAttempts?: number;
    }) {
      const response = await withOpenAIRetry(
        `openai.createBackgroundStructuredOutput:${input.schemaName}`,
        () =>
          resolveClient().responses.create({
            model: input.model,
            instructions: input.instructions,
            input: input.input,
            background: true,
            store: true,
            parallel_tool_calls: false,
            tools: input.tools as never,
            include: input.include as never,
            metadata: input.metadata,
            max_output_tokens: input.maxOutputTokens,
            text: {
              format: zodTextFormat(input.schema, input.schemaName),
            },
          }),
        {
          timeoutMs: input.timeoutMs,
          maxAttempts: input.maxAttempts,
        },
      );

      return {
        responseId: response.id,
        status: getResponseStatus(response),
        outputText: response.output_text,
        rawResponse: {
          id: response.id,
          status: getResponseStatus(response),
          output: response.output,
          usage: response.usage,
          error: response.error,
          incompleteDetails: response.incomplete_details,
          model: response.model,
          completedAt: response.completed_at ?? null,
        },
        webSearchSources: extractWebSearchSources(response.output),
        fileSearchResults: extractFileSearchResults(response.output),
      };
    },

    async retrieveBackgroundResponse(input) {
      const response = await withOpenAIRetry(
        `openai.retrieveBackgroundResponse:${input.responseId}`,
        () =>
          resolveClient().responses.retrieve(input.responseId, {
            include: input.include as never,
          }),
        {
          timeoutMs: input.timeoutMs,
          maxAttempts: input.maxAttempts,
        },
      );

      return {
        responseId: response.id,
        status: getResponseStatus(response),
        outputText: response.output_text,
        rawResponse: {
          id: response.id,
          status: getResponseStatus(response),
          output: response.output,
          usage: response.usage,
          error: response.error,
          incompleteDetails: response.incomplete_details,
          model: response.model,
          completedAt: response.completed_at ?? null,
        },
        webSearchSources: extractWebSearchSources(response.output),
        fileSearchResults: extractFileSearchResults(response.output),
      };
    },
  };
}
