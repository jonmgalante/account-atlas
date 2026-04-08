import "server-only";

type LogLevel = "info" | "warn" | "error";

const SENSITIVE_KEY_PATTERN = /(authorization|cookie|password|secret|token|api[_-]?key|database_url)/i;
const MAX_STRING_LENGTH = 280;

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > 4) {
    return "[truncated]";
  }

  if (value instanceof Error) {
    const errorRecord = value as unknown as { code?: unknown; status?: unknown };

    return {
      name: value.name,
      message: value.message,
      ...(typeof errorRecord.code === "string" ? { code: errorRecord.code } : {}),
      ...(typeof errorRecord.status === "number" ? { status: errorRecord.status } : {}),
    };
  }

  if (typeof value === "string") {
    return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}…` : value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeValue(item, depth + 1));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      SENSITIVE_KEY_PATTERN.test(key) ? "[redacted]" : sanitizeValue(entry, depth + 1),
    ]),
  );
}

export function logServerEvent(level: LogLevel, event: string, payload: Record<string, unknown> = {}) {
  const sanitizedPayload = sanitizeValue(payload);

  const record = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...(sanitizedPayload && typeof sanitizedPayload === "object" ? sanitizedPayload : {}),
  };

  const line = JSON.stringify(record);

  switch (level) {
    case "error":
      console.error(line);
      break;
    case "warn":
      console.warn(line);
      break;
    default:
      console.info(line);
      break;
  }
}
