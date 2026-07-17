export class ConfigValidationError extends TypeError {
  readonly issues: readonly string[];

  constructor(label: string, issues: readonly string[]) {
    super(`${label} validation failed:\n- ${issues.join("\n- ")}`);
    this.name = "ConfigValidationError";
    this.issues = [...issues];
  }
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  issues: string[],
) {
  const allowedKeys = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) issues.push(`${path}.${key} is not a supported configuration field`);
  }
}

export function requiredString(
  value: unknown,
  path: string,
  issues: string[],
  options: { maxLength?: number } = {},
) {
  if (typeof value !== "string" || value.trim().length === 0) {
    issues.push(`${path} must be a non-empty string`);
    return "";
  }
  const result = value.trim();
  if (options.maxLength && result.length > options.maxLength) {
    issues.push(`${path} must be at most ${options.maxLength} characters`);
  }
  return result;
}

const localHostnames = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function absoluteWebUrl(value: unknown, path: string, issues: string[]) {
  const raw = requiredString(value, path, issues);
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    const localHttp = parsed.protocol === "http:" && localHostnames.has(parsed.hostname);
    if (parsed.protocol !== "https:" && !localHttp) {
      issues.push(`${path} must use https (http is allowed only for localhost)`);
    }
    if (parsed.username || parsed.password) issues.push(`${path} must not contain credentials`);
    return parsed.toString().replace(/\/$/, "");
  } catch {
    issues.push(`${path} must be an absolute web URL`);
    return raw;
  }
}

export function pathOrAbsoluteWebUrl(value: unknown, path: string, issues: string[]) {
  const raw = requiredString(value, path, issues);
  if (!raw) return "";
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return absoluteWebUrl(raw, path, issues);
}
