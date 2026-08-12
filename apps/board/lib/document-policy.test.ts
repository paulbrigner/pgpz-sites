import { describe, expect, it } from "vitest";
import { BOARD_DOCUMENT_TYPE_POLICY, boardExtensionMatchesMimeType } from "@/lib/document-policy";

describe("Board document upload policy", () => {
  it("permits governed brand-package formats", () => {
    expect(BOARD_DOCUMENT_TYPE_POLICY.allowedExtensions).toEqual(expect.arrayContaining([".pdf", ".zip", ".json", ".md", ".txt"]));
    expect(boardExtensionMatchesMimeType(".zip", "application/zip")).toBe(true);
    expect(boardExtensionMatchesMimeType(".md", "text/plain")).toBe(true);
  });

  it("rejects mismatched filename and content types", () => {
    expect(boardExtensionMatchesMimeType(".zip", "application/pdf")).toBe(false);
    expect(boardExtensionMatchesMimeType(".pdf", "application/zip")).toBe(false);
  });
});
