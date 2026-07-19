export const BACKGROUND_JOB_MAX_PAGE_SIZE = 100;

export const BACKGROUND_JOB_CURSOR_INDEXES = [
  "recent_jobs",
  "job_status",
  "job_tasks",
  "job_task_status",
] as const;

export type BackgroundJobCursorIndex =
  (typeof BACKGROUND_JOB_CURSOR_INDEXES)[number];

export type BackgroundJobCursorKey = Readonly<{
  pk: string;
  sk: string;
  GSI1PK?: string;
  GSI1SK?: string;
  GSI2PK?: string;
  GSI2SK?: string;
}>;

type SerializedCursor = Readonly<{
  version: 1;
  index: BackgroundJobCursorIndex;
  key: BackgroundJobCursorKey;
}>;

const ALLOWED_KEY_FIELDS = new Set([
  "pk",
  "sk",
  "GSI1PK",
  "GSI1SK",
  "GSI2PK",
  "GSI2SK",
]);

const INDEX_KEY_FIELDS: Readonly<
  Record<BackgroundJobCursorIndex, readonly (keyof BackgroundJobCursorKey)[]>
> = {
  recent_jobs: ["pk", "sk", "GSI1PK", "GSI1SK"],
  job_status: ["pk", "sk", "GSI2PK", "GSI2SK"],
  job_tasks: ["pk", "sk"],
  job_task_status: ["pk", "sk", "GSI2PK", "GSI2SK"],
};

function isCursorIndex(value: unknown): value is BackgroundJobCursorIndex {
  return (
    typeof value === "string" &&
    (BACKGROUND_JOB_CURSOR_INDEXES as readonly string[]).includes(value)
  );
}

function isCursorKey(value: unknown): value is BackgroundJobCursorKey {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  if (!entries.length || entries.some(([key]) => !ALLOWED_KEY_FIELDS.has(key))) {
    return false;
  }
  if (
    typeof (value as Record<string, unknown>).pk !== "string" ||
    typeof (value as Record<string, unknown>).sk !== "string"
  ) {
    return false;
  }
  return entries.every(
    ([, nested]) => typeof nested === "string" && nested.length > 0 && nested.length <= 512,
  );
}

export function normalizeBackgroundJobPageSize(
  value: unknown,
  fallback = 30,
): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), 1), BACKGROUND_JOB_MAX_PAGE_SIZE);
}

export function encodeBackgroundJobCursor(
  index: BackgroundJobCursorIndex,
  key: BackgroundJobCursorKey | null | undefined,
): string | null {
  if (!key) return null;
  if (!isCursorKey(key)) throw new TypeError("Invalid background-job cursor key");
  return Buffer.from(
    JSON.stringify({ version: 1, index, key } satisfies SerializedCursor),
    "utf8",
  ).toString("base64url");
}

export function decodeBackgroundJobCursor(
  cursor: string | null | undefined,
  expectedIndex: BackgroundJobCursorIndex,
): BackgroundJobCursorKey | undefined {
  if (!cursor) return undefined;
  if (cursor.length > 4096 || !/^[A-Za-z0-9_-]+$/.test(cursor)) {
    throw new TypeError("Invalid background-job cursor");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    throw new TypeError("Invalid background-job cursor");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new TypeError("Invalid background-job cursor");
  }
  const value = parsed as Partial<SerializedCursor>;
  if (
    value.version !== 1 ||
    !isCursorIndex(value.index) ||
    value.index !== expectedIndex ||
    !isCursorKey(value.key) ||
    INDEX_KEY_FIELDS[expectedIndex].some(
      (field) => typeof value.key?.[field] !== "string",
    )
  ) {
    throw new TypeError("Invalid background-job cursor");
  }
  return value.key;
}
