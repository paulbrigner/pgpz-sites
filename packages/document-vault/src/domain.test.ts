import { describe, expect, it } from "vitest";
import {
  acceptUploadVersion,
  classifyUploadedObject,
  contentMatchesType,
  restoreVersion,
  setDocumentArchived,
  updateDocumentMetadata,
  validateDocumentMetadata,
  type DocumentRecord,
  type DocumentVersion,
} from "./domain";

function record(): DocumentRecord {
  return {
    documentId: "doc-1",
    title: "Articles",
    description: "",
    category: "incorporation",
    visibility: "members",
    status: "active",
    revision: 0,
    currentVersionId: "v1",
    createdBy: null,
    createdAt: "2026-08-06T00:00:00.000Z",
    updatedBy: null,
    updatedAt: "2026-08-06T00:00:00.000Z",
  };
}

function version(versionId = "v2", sequence = 2): DocumentVersion {
  return {
    versionId,
    sequence,
    source: "upload",
    restoredFromVersionId: null,
    objectKey: `board/objects/doc-1/${versionId}`,
    sha256: "a".repeat(64),
    sha256Algorithm: "sha256",
    mimeType: "application/pdf",
    byteLength: 2048,
    originalFileName: "articles.pdf",
    uploadedAt: "2026-08-06T01:00:00.000Z",
    uploadedBy: "user-1",
  };
}

describe("@pgpz/document-vault domain", () => {
  it("validates document metadata limits", () => {
    expect(validateDocumentMetadata({ title: "  Articles  ", description: "", category: "x" })).toEqual([]);
    expect(validateDocumentMetadata({ title: " ", description: "", category: "x" })).toContain("title.required");
    expect(validateDocumentMetadata({ title: "a".repeat(201), description: "", category: "x" })).toContain("title.too-long");
    expect(validateDocumentMetadata({ title: "ok", description: "", category: " " })).toContain("category.required");
  });

  it("classifies uploaded objects by byte length and content type", () => {
    expect(classifyUploadedObject({ byteLength: 100, mimeType: "application/pdf", originalFileName: "x.pdf" })).toMatchObject({ accepted: true });
    expect(classifyUploadedObject({ byteLength: 0, mimeType: "application/pdf", originalFileName: "x.pdf" })).toMatchObject({ accepted: false, reason: "empty" });
    expect(classifyUploadedObject({ byteLength: 100, mimeType: "", originalFileName: "x" })).toMatchObject({ accepted: false, reason: "missing-content-type" });
    expect(classifyUploadedObject({ byteLength: 100, mimeType: "application/zip", originalFileName: "x.zip" })).toMatchObject({ accepted: false, reason: "unsupported-content-type" });
    expect(classifyUploadedObject(
      { byteLength: 100, mimeType: "application/zip", originalFileName: "x.zip" },
      { allowedMimeTypes: ["application/zip"], allowedExtensions: [".zip"] },
    )).toMatchObject({ accepted: true, extension: ".zip" });
  });

  it("matches content magic bytes to the declared type", () => {
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e]);
    expect(contentMatchesType("application/pdf", pdf)).toBe(true);
    expect(contentMatchesType("application/pdf", new Uint8Array([1, 2, 3]))).toBe(false);
    expect(contentMatchesType("text/plain", new Uint8Array([0x68, 0x69]))).toBe(true);
    expect(contentMatchesType("text/plain", new Uint8Array([0x68, 0x00, 0x69]))).toBe(false);
    expect(contentMatchesType("application/zip", new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBe(true);
    expect(contentMatchesType("application/zip", new Uint8Array([0x50, 0x4b, 0x00, 0x00]))).toBe(false);
    expect(contentMatchesType("application/json", new TextEncoder().encode('{"ok":true}'))).toBe(true);
    expect(contentMatchesType("application/json", new TextEncoder().encode("not json"))).toBe(false);
  });

  it("bumps the revision and current version on accept", () => {
    const accepted = acceptUploadVersion(record(), version());
    expect(accepted.revision).toBe(1);
    expect(accepted.currentVersionId).toBe("v2");
    expect(accepted.updatedBy).toBe("user-1");
  });

  it("restore keeps source and target versions and references the restored one", () => {
    const { version: restored, next } = restoreVersion(record(), version("v1", 1), "2026-08-06T02:00:00.000Z", "user-2");
    expect(restored.source).toBe("restore");
    expect(restored.restoredFromVersionId).toBe("v1");
    expect(restored.sequence).toBe(1);
    expect(next.revision).toBe(1);
  });

  it("archive flips status and keeps content", () => {
    expect(setDocumentArchived(record(), true, "...", "u").status).toBe("archived");
    expect(updateDocumentMetadata(record(), { title: "New", description: "d", category: "agreements", visibility: "members" }, "...", "u").category).toBe("agreements");
  });
});
