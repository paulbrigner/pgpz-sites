import { normalizePublicFilePath, publicFileIsInline } from "./domain";

export type PublicFileResourceRequest = {
  headers: { get(name: string): string | null };
};

export type PublicFileRouteContext = {
  params: Promise<{ path: string[] }>;
};

type ByteRange = { start: number; end: number } | "invalid" | null;

type PublicFileStoredObject = {
  Body?: any;
  ContentLength?: number;
  ETag?: string;
  LastModified?: Date;
};

export type PublicFileResourceRouteDependencies<ResponseType extends Response = Response> = {
  jsonResponse(body: unknown, init?: ResponseInit): ResponseType;
  createResponse(body: BodyInit | null, init?: ResponseInit): ResponseType;
  isFeatureEnabled(feature: "publicFiles"): boolean;
  getPublicFileRecord(path: string): Promise<any>;
  hasPublicFileMemberAccess(request: PublicFileResourceRequest): Promise<boolean>;
  getObject(input: {
    bucket: string;
    key: string;
    range?: string;
  }): Promise<PublicFileStoredObject>;
};

function parsePublicFileByteRange(value: string | null, totalBytes: number): ByteRange {
  if (!value) return null;
  const match = value.match(/^bytes=(\d*)-(\d*)$/);
  if (!match || (!match[1] && !match[2]) || totalBytes <= 0) return "invalid";

  let start: number;
  let end: number;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isInteger(suffixLength) || suffixLength <= 0) return "invalid";
    start = Math.max(0, totalBytes - suffixLength);
    end = totalBytes - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : totalBytes - 1;
  }

  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end < start ||
    start >= totalBytes
  ) {
    return "invalid";
  }
  return { start, end: Math.min(end, totalBytes - 1) };
}

const responseFileName = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/[/"\\\r\n]/g, "_") || "download";

const encodedResponseFileName = (value: string) =>
  encodeURIComponent(value.replace(/[\r\n]/g, "_")).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );

const validDate = (value: string) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : new Date(0);
};

export function createPublicFileResourceRouteHandlers<
  ResponseType extends Response,
>({
  jsonResponse,
  createResponse,
  isFeatureEnabled,
  getPublicFileRecord,
  hasPublicFileMemberAccess,
  getObject,
}: PublicFileResourceRouteDependencies<ResponseType>) {
  async function resolveRecord(context: PublicFileRouteContext) {
    try {
      const params = await context.params;
      const path = normalizePublicFilePath(params.path.join("/"));
      return getPublicFileRecord(path);
    } catch {
      return null;
    }
  }

  const notFound = () => jsonResponse({ error: "Unknown public file" }, { status: 404 });

  const baseHeaders = (record: NonNullable<Awaited<ReturnType<typeof resolveRecord>>>) => ({
    "Accept-Ranges": "bytes",
    "Cache-Control":
      record.access === "public"
        ? "public, max-age=0, must-revalidate"
        : "private, no-store",
    "Content-Disposition": `${publicFileIsInline(record.contentType) ? "inline" : "attachment"}; filename="${responseFileName(record.originalFileName)}"; filename*=UTF-8''${encodedResponseFileName(record.originalFileName)}`,
    "Content-Type": record.contentType,
    "X-Content-Type-Options": "nosniff",
    ...(record.access === "members" ? { Vary: "Cookie" } : {}),
  });

  async function memberAccessRequired(
    request: PublicFileResourceRequest,
    record: NonNullable<Awaited<ReturnType<typeof resolveRecord>>>,
  ) {
    if (record.access === "public") return null;
    return (await hasPublicFileMemberAccess(request))
      ? null
      : jsonResponse(
          { error: "Active membership required" },
          {
            status: 403,
            headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
          },
        );
  }

  async function HEAD(request: PublicFileResourceRequest, context: PublicFileRouteContext) {
    if (!isFeatureEnabled("publicFiles")) return notFound();
    const record = await resolveRecord(context);
    if (!record) return notFound();
    const forbidden = await memberAccessRequired(request, record);
    if (forbidden) return forbidden;
    return createResponse(null, {
      headers: {
        ...baseHeaders(record),
        "Content-Length": String(record.fileSize),
        ...(record.etag ? { ETag: `"${record.etag}"` } : {}),
        "Last-Modified": validDate(record.updatedAt).toUTCString(),
      },
    });
  }

  async function GET(request: PublicFileResourceRequest, context: PublicFileRouteContext) {
    if (!isFeatureEnabled("publicFiles")) return notFound();
    const record = await resolveRecord(context);
    if (!record) return notFound();
    const forbidden = await memberAccessRequired(request, record);
    if (forbidden) return forbidden;

    const range = parsePublicFileByteRange(request.headers.get("range"), record.fileSize);
    if (range === "invalid") {
      return createResponse(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${record.fileSize}` },
      });
    }

    let object: PublicFileStoredObject;
    try {
      object = await getObject({
        bucket: record.s3Bucket,
        key: record.s3Key,
        ...(range ? { range: `bytes=${range.start}-${range.end}` } : {}),
      });
    } catch {
      return notFound();
    }
    if (!object.Body) return notFound();

    const body =
      typeof object.Body.transformToWebStream === "function"
        ? object.Body.transformToWebStream()
        : object.Body;
    const contentLength = range
      ? range.end - range.start + 1
      : Number(object.ContentLength || record.fileSize);

    return createResponse(body as BodyInit, {
      status: range ? 206 : 200,
      headers: {
        ...baseHeaders(record),
        "Content-Length": String(contentLength),
        ...(range
          ? { "Content-Range": `bytes ${range.start}-${range.end}/${record.fileSize}` }
          : {}),
        ...(object.ETag || record.etag
          ? { ETag: object.ETag || `"${record.etag}"` }
          : {}),
        "Last-Modified": (object.LastModified || validDate(record.updatedAt)).toUTCString(),
      },
    });
  }

  return { GET, HEAD };
}
