import "server-only";

import type {
  CuratedBriefingTopicInput,
  CuratedBriefingTopicsResponse,
  CuratedBriefingVersion,
  CuratedBriefingVersionsResponse,
} from "@pgpz/x-monitor-core/contracts";

const CLIENT_ID_HEADER = "x-xmonitor-client-id";
const CLIENT_SECRET_HEADER = "x-xmonitor-client-secret";
const DEFAULT_TIMEOUT_MS = 15_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type BriefingAdminConfiguration = {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  timeoutMs: number;
};

export class AdminXMonitorBriefingError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "AdminXMonitorBriefingError";
    this.status = status;
  }
}

const boundedTimeout = (value: string | undefined) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_TIMEOUT_MS;
  return Math.min(30_000, Math.max(1_000, Math.trunc(parsed)));
};

export function readBriefingAdminConfiguration(
  environment: Record<string, string | undefined> = process.env,
): BriefingAdminConfiguration {
  const rawBaseUrl = environment.XMONITOR_READ_API_BASE_URL?.trim() || "";
  const clientId = environment.XMONITOR_BRIEFINGS_ADMIN_CLIENT_ID?.trim() || "";
  const clientSecret = environment.XMONITOR_BRIEFINGS_ADMIN_CLIENT_SECRET?.trim() || "";
  const readClientId = environment.XMONITOR_READ_CLIENT_ID?.trim() || "";
  const readClientSecret = environment.XMONITOR_READ_CLIENT_SECRET?.trim() || "";

  let parsedBaseUrl: URL | null = null;
  try {
    parsedBaseUrl = rawBaseUrl ? new URL(rawBaseUrl) : null;
  } catch {
    parsedBaseUrl = null;
  }
  const production = (environment.NODE_ENV || process.env.NODE_ENV) === "production";
  const developmentHttp = Boolean(
    !production &&
    parsedBaseUrl?.protocol === "http:" &&
    new Set(["localhost", "127.0.0.1", "::1"]).has(parsedBaseUrl.hostname),
  );

  if (
    !parsedBaseUrl ||
    (parsedBaseUrl.protocol !== "https:" && !developmentHttp) ||
    parsedBaseUrl.username ||
    parsedBaseUrl.password ||
    parsedBaseUrl.search ||
    parsedBaseUrl.hash ||
    !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(clientId) ||
    clientSecret.length < 32 ||
    (readClientId && clientId === readClientId) ||
    (readClientSecret && clientSecret === readClientSecret)
  ) {
    throw new AdminXMonitorBriefingError("Topic Briefings administration is not configured", 503);
  }

  return {
    baseUrl: rawBaseUrl.replace(/\/+$/, ""),
    clientId,
    clientSecret,
    timeoutMs: boundedTimeout(environment.XMONITOR_BRIEFINGS_ADMIN_TIMEOUT_MS),
  };
}

const assertUuid = (value: string, label: string) => {
  const normalized = String(value || "").trim();
  if (!UUID_PATTERN.test(normalized)) {
    throw new AdminXMonitorBriefingError(`${label} is invalid`);
  }
  return normalized;
};

const plainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const optionalText = (value: unknown, maxLength: number, label: string) => {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string") throw new AdminXMonitorBriefingError(`${label} must be text`);
  const normalized = value.trim();
  if (normalized.length > maxLength) throw new AdminXMonitorBriefingError(`${label} is too long`);
  return normalized || null;
};

export function normalizeCuratedBriefingTopicInput(
  value: unknown,
  options: { partial?: boolean } = {},
): Partial<CuratedBriefingTopicInput> {
  if (!plainObject(value)) throw new AdminXMonitorBriefingError("A topic payload is required");
  const output: Partial<CuratedBriefingTopicInput> = {};
  const partial = options.partial === true;

  if (value.slug !== undefined || !partial) {
    if (typeof value.slug !== "string" || !SLUG_PATTERN.test(value.slug.trim())) {
      throw new AdminXMonitorBriefingError("Slug must use lowercase words separated by hyphens");
    }
    output.slug = value.slug.trim();
  }
  if (value.question !== undefined || !partial) {
    if (typeof value.question !== "string") {
      throw new AdminXMonitorBriefingError("Question is required");
    }
    const question = value.question.trim();
    if (question.length < 10 || question.length > 1000) {
      throw new AdminXMonitorBriefingError("Question must be between 10 and 1,000 characters");
    }
    output.question = question;
  }
  if (value.category !== undefined) output.category = optionalText(value.category, 120, "Category");
  if (value.editorial_context !== undefined) {
    output.editorial_context = optionalText(value.editorial_context, 4000, "Editorial context");
  }
  if (value.retrieval_config !== undefined) {
    if (!plainObject(value.retrieval_config)) {
      throw new AdminXMonitorBriefingError("Retrieval configuration must be an object");
    }
    if (JSON.stringify(value.retrieval_config).length > 16_000) {
      throw new AdminXMonitorBriefingError("Retrieval configuration is too large");
    }
    output.retrieval_config = value.retrieval_config;
  }
  if (value.answer_style !== undefined) {
    if (!new Set(["brief", "balanced", "detailed"]).has(String(value.answer_style))) {
      throw new AdminXMonitorBriefingError("Answer style is invalid");
    }
    output.answer_style = value.answer_style as CuratedBriefingTopicInput["answer_style"];
  }
  if (value.refresh_interval_minutes !== undefined) {
    const interval = Number(value.refresh_interval_minutes);
    if (!Number.isInteger(interval) || interval < 60 || interval > 10_080) {
      throw new AdminXMonitorBriefingError("Refresh interval must be between 60 and 10,080 minutes");
    }
    output.refresh_interval_minutes = interval;
  }
  if (value.enabled !== undefined) {
    if (typeof value.enabled !== "boolean") {
      throw new AdminXMonitorBriefingError("Enabled must be true or false");
    }
    output.enabled = value.enabled;
  }
  if (value.order !== undefined) {
    const displayOrder = Number(value.order);
    if (!Number.isInteger(displayOrder) || displayOrder < -10_000 || displayOrder > 10_000) {
      throw new AdminXMonitorBriefingError("Display order is invalid");
    }
    output.order = displayOrder;
  }
  if (partial && Object.keys(output).length === 0) {
    throw new AdminXMonitorBriefingError("At least one topic field is required");
  }
  return output;
}

export function normalizeCuratedBriefingDraftInput(value: unknown) {
  if (!plainObject(value)) throw new AdminXMonitorBriefingError("A draft payload is required");
  const output: { answer_text?: string; key_points?: string[] } = {};
  if (value.answer_text !== undefined) {
    if (typeof value.answer_text !== "string") {
      throw new AdminXMonitorBriefingError("Draft answer text must be text");
    }
    const answerText = value.answer_text.trim();
    if (!answerText || answerText.length > 50_000) {
      throw new AdminXMonitorBriefingError("Draft answer must contain at most 50,000 characters");
    }
    output.answer_text = answerText;
  }
  if (value.key_points !== undefined) {
    if (!Array.isArray(value.key_points) || value.key_points.length > 12) {
      throw new AdminXMonitorBriefingError("Key points must be an array of at most 12 items");
    }
    output.key_points = value.key_points.map((point) => {
      if (typeof point !== "string" || !point.trim() || point.trim().length > 1000) {
        throw new AdminXMonitorBriefingError("Each key point must contain at most 1,000 characters");
      }
      return point.trim();
    });
  }
  if (Object.keys(output).length === 0) {
    throw new AdminXMonitorBriefingError("Answer text or key points are required");
  }
  return output;
}

async function adminRequest<T>(
  path: string,
  init: { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown } = {},
): Promise<T> {
  const configuration = readBriefingAdminConfiguration();
  const url = new URL(`${configuration.baseUrl}${path}`);
  const headers = new Headers({
    accept: "application/json",
    [CLIENT_ID_HEADER]: configuration.clientId,
    [CLIENT_SECRET_HEADER]: configuration.clientSecret,
  });
  if (init.body !== undefined) headers.set("content-type", "application/json");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), configuration.timeoutMs);
  let response: Response;
  try {
    response = await fetch(url, {
      method: init.method || "GET",
      cache: "no-store",
      redirect: "manual",
      headers,
      signal: controller.signal,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch (error) {
    if (error instanceof AdminXMonitorBriefingError) throw error;
    throw new AdminXMonitorBriefingError("Topic Briefings backend is unavailable", 502);
  } finally {
    clearTimeout(timeout);
  }

  if (response.status >= 300 && response.status < 400) {
    throw new AdminXMonitorBriefingError("Topic Briefings backend refused the request", 502);
  }

  const payload = await response.json().catch(() => null) as ({ error?: unknown } & Record<string, unknown>) | null;
  if (!response.ok) {
    const upstreamMessage = typeof payload?.error === "string" ? payload.error.trim() : "";
    if (response.status === 400 || response.status === 404 || response.status === 409 || response.status === 422 || response.status === 429) {
      throw new AdminXMonitorBriefingError(upstreamMessage || "Topic Briefings request failed", response.status);
    }
    throw new AdminXMonitorBriefingError("Topic Briefings backend request failed", 502);
  }
  if (!payload) throw new AdminXMonitorBriefingError("Topic Briefings backend returned invalid data", 502);
  return payload as T;
}

const adminBase = "/admin/curated-briefings";

export async function listCuratedBriefingTopics(): Promise<CuratedBriefingTopicsResponse> {
  const payload = await adminRequest<CuratedBriefingTopicsResponse>(adminBase);
  if (!Array.isArray(payload.items)) throw new AdminXMonitorBriefingError("Invalid topic list", 502);
  return payload;
}

export function createCuratedBriefingTopic(value: unknown) {
  return adminRequest(`${adminBase}/topics`, {
    method: "POST",
    body: normalizeCuratedBriefingTopicInput(value),
  });
}

export function updateCuratedBriefingTopic(topicId: string, value: unknown) {
  return adminRequest(`${adminBase}/topics/${assertUuid(topicId, "Topic ID")}`, {
    method: "PATCH",
    body: normalizeCuratedBriefingTopicInput(value, { partial: true }),
  });
}

export function deleteCuratedBriefingTopic(topicId: string) {
  return adminRequest(`${adminBase}/topics/${assertUuid(topicId, "Topic ID")}`, { method: "DELETE" });
}

export function refreshCuratedBriefingTopic(topicId: string) {
  return adminRequest(`${adminBase}/topics/${assertUuid(topicId, "Topic ID")}/refresh`, { method: "POST" });
}

export async function listCuratedBriefingVersions(topicId: string): Promise<CuratedBriefingVersionsResponse> {
  const payload = await adminRequest<CuratedBriefingVersionsResponse>(
    `${adminBase}/topics/${assertUuid(topicId, "Topic ID")}/versions`,
  );
  if (!Array.isArray(payload.items)) throw new AdminXMonitorBriefingError("Invalid version history", 502);
  return payload;
}

export function getCuratedBriefingVersion(versionId: string): Promise<CuratedBriefingVersion> {
  return adminRequest(`${adminBase}/versions/${assertUuid(versionId, "Version ID")}`);
}

export function editCuratedBriefingDraft(versionId: string, value: unknown) {
  return adminRequest(`${adminBase}/versions/${assertUuid(versionId, "Version ID")}`, {
    method: "PATCH",
    body: normalizeCuratedBriefingDraftInput(value),
  });
}

export function publishCuratedBriefingVersion(versionId: string) {
  return adminRequest(`${adminBase}/versions/${assertUuid(versionId, "Version ID")}/publish`, { method: "POST" });
}

export function rejectCuratedBriefingVersion(versionId: string, value: unknown) {
  const reason = plainObject(value) ? optionalText(value.reason, 2000, "Rejection reason") : undefined;
  return adminRequest(`${adminBase}/versions/${assertUuid(versionId, "Version ID")}/reject`, {
    method: "POST",
    body: { reason: reason ?? null },
  });
}

export function rollbackCuratedBriefingTopic(topicId: string, value: unknown) {
  if (!plainObject(value)) throw new AdminXMonitorBriefingError("A version ID is required");
  return adminRequest(`${adminBase}/topics/${assertUuid(topicId, "Topic ID")}/rollback`, {
    method: "POST",
    body: { version_id: assertUuid(String(value.version_id || ""), "Version ID") },
  });
}
