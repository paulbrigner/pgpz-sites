import type { DocumentTypePolicy } from "@pgpz/document-vault";

/**
 * Board-owned upload policy. The shared vault validates neutral file mechanics;
 * the Board app decides which formats belong in its governance repository.
 */
export const BOARD_DOCUMENT_TYPE_POLICY: DocumentTypePolicy = {
  allowedMimeTypes: [
    "application/pdf",
    "application/zip",
    "application/x-zip-compressed",
    "application/json",
    "text/plain",
    "text/markdown",
    "text/csv",
  ],
  allowedExtensions: [".pdf", ".zip", ".json", ".txt", ".md", ".csv"],
};

const MIME_BY_EXTENSION: Readonly<Record<string, ReadonlyArray<string>>> = {
  ".pdf": ["application/pdf"],
  ".zip": ["application/zip", "application/x-zip-compressed"],
  ".json": ["application/json"],
  ".txt": ["text/plain"],
  ".md": ["text/plain", "text/markdown"],
  ".csv": ["text/plain", "text/csv"],
};

export function boardExtensionMatchesMimeType(extension: string, mimeType: string): boolean {
  return MIME_BY_EXTENSION[extension]?.includes(mimeType) === true;
}
