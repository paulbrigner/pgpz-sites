import type { SanitizedJobError } from "./contracts";

const DEFAULT_MESSAGE = "Background job task failed";
const MAX_MESSAGE_LENGTH = 500;
const MAX_NAME_LENGTH = 80;
const MAX_CODE_LENGTH = 80;

const REDACTIONS: readonly [RegExp, string][] = [
  [/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]"],
  [/\bAKIA[0-9A-Z]{16}\b/g, "[REDACTED_AWS_ACCESS_KEY]"],
  [
    /([?&](?:access[_-]?token|api[_-]?key|authorization|password|secret|signature|token)=)[^&\s]+/gi,
    "$1[REDACTED]",
  ],
  [
    /\b(access[_-]?token|api[_-]?key|authorization|password|secret|signature|token)\s*[:=]\s*([^\s,;&]+)/gi,
    "$1=[REDACTED]",
  ],
];

function clipped(value: string, maximum: number): string {
  if (value.length <= maximum) return value;
  return `${value.slice(0, maximum - 1)}…`;
}

function redact(value: string): string {
  return REDACTIONS.reduce((current, [pattern, replacement]) => current.replace(pattern, replacement), value);
}

function safeText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
  return text || undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

/**
 * Creates the only error shape that may be persisted or returned to an admin.
 * It deliberately drops stack traces, causes, provider responses, and arbitrary
 * enumerable properties while redacting common credential forms.
 */
export function sanitizeJobError(error: unknown): SanitizedJobError {
  const record = asRecord(error);
  const rawMessage =
    safeText(error instanceof Error ? error.message : undefined) ??
    safeText(record?.message) ??
    safeText(error) ??
    DEFAULT_MESSAGE;
  const rawName =
    safeText(error instanceof Error ? error.name : undefined) ?? safeText(record?.name) ?? "Error";
  const rawCode = safeText(record?.code);
  const retryable = typeof record?.retryable === "boolean" ? record.retryable : undefined;

  return {
    name: clipped(redact(rawName), MAX_NAME_LENGTH),
    message: clipped(redact(rawMessage), MAX_MESSAGE_LENGTH),
    ...(rawCode ? { code: clipped(redact(rawCode), MAX_CODE_LENGTH) } : {}),
    ...(retryable === undefined ? {} : { retryable }),
  };
}
