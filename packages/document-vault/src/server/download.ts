import "server-only";

/** MIME types a browser renders inline; everything else downloads. */
export function isInlineMimeType(mimeType: string): boolean {
  const type = mimeType.split(";")[0].trim().toLowerCase();
  return (
    type === "application/pdf" ||
    type === "image/png" ||
    type === "image/jpeg" ||
    type === "image/webp" ||
    type.startsWith("text/")
  );
}

/** Strips path separators, control characters, and non-ASCII from a filename. */
export function sanitizeFilename(value: string, fallback = "download"): string {
  return (
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\x20-\x7e]/g, "_")
      .replace(/[/"\\\r\n]/g, "_")
      .trim() || fallback
  );
}

function encodedRfc5987(value: string): string {
  return encodeURIComponent(value.replace(/[\r\n]/g, "_")).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/** Builds an RFC 6266 Content-Disposition value (inline or attachment). */
export function contentDisposition(input: {
  mimeType: string;
  originalFileName: string;
}): string {
  const inline = isInlineMimeType(input.mimeType);
  const name = sanitizeFilename(input.originalFileName);
  return `${inline ? "inline" : "attachment"}; filename="${name}"; filename*=UTF-8''${encodedRfc5987(name)}`;
}

export function downloadCacheControl() {
  return "private, no-store";
}
