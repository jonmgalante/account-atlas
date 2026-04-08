import "server-only";

type DatabaseErrorKind = "relation_missing" | "column_missing" | "auth_or_ssl" | "connection" | "other";

type DatabaseErrorRecord = {
  name?: unknown;
  message?: unknown;
  code?: unknown;
  cause?: unknown;
  severity?: unknown;
  detail?: unknown;
  hint?: unknown;
  schema_name?: unknown;
  table_name?: unknown;
  column_name?: unknown;
};

export type DatabaseErrorDiagnostics = {
  kind: DatabaseErrorKind;
  postgresCode: string | null;
  postgresMessage: string | null;
  postgresSeverity: string | null;
  detail: string | null;
  hint: string | null;
  schemaName: string | null;
  tableName: string | null;
  columnName: string | null;
};

const POSTGRES_CODE_PATTERN = /^[0-9A-Z]{5}$/;

function asRecord(value: unknown): DatabaseErrorRecord | null {
  return value && typeof value === "object" ? (value as DatabaseErrorRecord) : null;
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function collectCauseChain(error: unknown) {
  const chain: DatabaseErrorRecord[] = [];
  let current = asRecord(error);
  let depth = 0;

  while (current && depth < 8) {
    chain.push(current);
    current = asRecord(current.cause);
    depth += 1;
  }

  return chain;
}

function classifyDatabaseError(code: string | null, message: string | null): DatabaseErrorKind {
  const normalizedMessage = message?.toLowerCase() ?? "";

  if (code === "42P01" || normalizedMessage.includes("relation") && normalizedMessage.includes("does not exist")) {
    return "relation_missing";
  }

  if (code === "42703" || normalizedMessage.includes("column") && normalizedMessage.includes("does not exist")) {
    return "column_missing";
  }

  if (
    (code?.startsWith("28") ?? false) ||
    code === "08P01" ||
    normalizedMessage.includes("ssl") ||
    normalizedMessage.includes("password") ||
    normalizedMessage.includes("authentication")
  ) {
    return "auth_or_ssl";
  }

  if (
    (code?.startsWith("08") ?? false) ||
    code === "3D000" ||
    normalizedMessage.includes("connect") ||
    normalizedMessage.includes("connection") ||
    normalizedMessage.includes("timeout") ||
    normalizedMessage.includes("econnrefused") ||
    normalizedMessage.includes("enotfound")
  ) {
    return "connection";
  }

  return "other";
}

export function getDatabaseErrorDiagnostics(error: unknown): DatabaseErrorDiagnostics | null {
  const chain = collectCauseChain(error);
  const postgresError =
    chain.find((candidate) => POSTGRES_CODE_PATTERN.test(asString(candidate.code) ?? "")) ??
    chain.find(
      (candidate) =>
        asString(candidate.severity) ||
        asString(candidate.table_name) ||
        asString(candidate.column_name) ||
        asString(candidate.schema_name),
    ) ??
    null;

  if (!postgresError) {
    return null;
  }

  const postgresCode = asString(postgresError.code);
  const postgresMessage = asString(postgresError.message);

  return {
    kind: classifyDatabaseError(postgresCode, postgresMessage),
    postgresCode,
    postgresMessage,
    postgresSeverity: asString(postgresError.severity),
    detail: asString(postgresError.detail),
    hint: asString(postgresError.hint),
    schemaName: asString(postgresError.schema_name),
    tableName: asString(postgresError.table_name),
    columnName: asString(postgresError.column_name),
  };
}
