export const MAX_PUBLIC_FILE_BYTES = 50 * 1024 * 1024;

const PUBLIC_FILE_CONTENT_TYPES = {
  ".csv": "text/csv; charset=utf-8",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".zip": "application/zip",
} as const;

export type PublicFileStatus = "active" | "archived";
export type PublicFileAccess = "public" | "members";

export type PublicFileItem = {
  path: string;
  title: string;
  description: string;
  originalFileName: string;
  contentType: string;
  fileSize: number;
  access: PublicFileAccess;
  status: PublicFileStatus;
  createdAt: string;
  createdBy: string | null;
  updatedAt: string;
  updatedBy: string | null;
  archivedAt: string | null;
  archivedBy: string | null;
  previousVersionCount: number;
  url: string;
};

export class PublicFileValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublicFileValidationError";
  }
}

const safeDecodeURIComponent = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new PublicFileValidationError("The public path contains invalid URL encoding.");
  }
};

const sanitizePathSegment = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "-and-")
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "");

export function publicFileExtension(value: string) {
  const normalized = value.toLowerCase();
  const dot = normalized.lastIndexOf(".");
  return dot > -1 ? normalized.slice(dot) : "";
}

export function publicFileContentType(path: string) {
  const extension = publicFileExtension(path);
  return PUBLIC_FILE_CONTENT_TYPES[
    extension as keyof typeof PUBLIC_FILE_CONTENT_TYPES
  ] || null;
}

export function publicFileIsInline(contentType: string) {
  return contentType === "application/pdf" || contentType.startsWith("image/");
}

export function normalizePublicFileAccess(value: unknown): PublicFileAccess {
  return value === "members" ? "members" : "public";
}

export function normalizePublicFilePath(rawValue: string) {
  let value = rawValue.trim();
  if (!value) {
    throw new PublicFileValidationError("Enter a public path for the file.");
  }

  if (/^https?:\/\//i.test(value)) {
    try {
      value = new URL(value).pathname;
    } catch {
      throw new PublicFileValidationError("Enter a valid public URL or path.");
    }
  }

  value = safeDecodeURIComponent(value.split(/[?#]/, 1)[0] || "")
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .replace(/^resources\/+/i, "");

  const rawSegments = value.split("/");
  if (
    !rawSegments.length ||
    rawSegments.length > 8 ||
    rawSegments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new PublicFileValidationError(
      "Use a file path with no more than eight folders and no relative segments.",
    );
  }

  const segments = rawSegments.map(sanitizePathSegment);
  if (segments.some((segment) => !segment)) {
    throw new PublicFileValidationError(
      "The public path must contain letters or numbers in every segment.",
    );
  }

  const path = segments.join("/");
  if (path.length > 240) {
    throw new PublicFileValidationError("The public path must be 240 characters or fewer.");
  }
  if (!publicFileContentType(path)) {
    throw new PublicFileValidationError(
      "Supported files are PDF, Word, Excel, PowerPoint, CSV, text, PNG, JPEG, WebP, and ZIP.",
    );
  }

  return path;
}

export function publicFilePathForFileName(fileName: string) {
  return normalizePublicFilePath(fileName);
}

export function publicFileTitleFromPath(path: string) {
  const fileName = path.split("/").pop() || path;
  const extension = publicFileExtension(fileName);
  return fileName
    .slice(0, extension ? -extension.length : undefined)
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim();
}

export function publicFileUrl(path: string, siteUrl = "") {
  const encodedPath = path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const base = siteUrl.trim().replace(/\/+$/, "");
  return `${base}/resources/${encodedPath}`;
}
