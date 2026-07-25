import { describe, expect, it } from "vitest";
import {
  normalizePublicFileAccess,
  normalizePublicFilePath,
  publicFileContentType,
  publicFileIsInline,
  publicFilePathIsReserved,
  publicFileTitleFromPath,
  publicFileUrl,
} from "@/lib/public-files";

describe("public file paths", () => {
  it("normalizes folders, file names, and complete resource URLs", () => {
    expect(
      normalizePublicFilePath(
        "https://community.pgpz.org/resources/Statements for the Record/HFSC_Test File.PDF?download=1",
      ),
    ).toBe("statements-for-the-record/hfsc-test-file.pdf");
  });

  it("rejects traversal, unsupported active content, and missing extensions", () => {
    expect(() => normalizePublicFilePath("../private.pdf")).toThrow(/relative segments/i);
    expect(() => normalizePublicFilePath("%2e%2e/private.pdf")).toThrow(/relative segments/i);
    expect(() => normalizePublicFilePath("public/report.html")).toThrow(/Supported files/i);
    expect(() => normalizePublicFilePath("public/report")).toThrow(/Supported files/i);
  });

  it("derives safe content behavior and human-readable titles", () => {
    expect(publicFileContentType("memo.pdf")).toBe("application/pdf");
    expect(publicFileContentType("memo.docx")).toContain(
      "application/vnd.openxmlformats-officedocument",
    );
    expect(publicFileIsInline("application/pdf")).toBe(true);
    expect(publicFileIsInline("application/zip")).toBe(false);
    expect(publicFileTitleFromPath("statements/2026-hfsc-clarity-act.pdf")).toBe(
      "2026 Hfsc Clarity Act",
    );
  });

  it("encodes every public URL path segment without requiring authentication", () => {
    expect(
      publicFileUrl(
        "statements-for-the-record/test file.pdf",
        "https://community.pgpz.org/",
      ),
    ).toBe(
      "https://community.pgpz.org/resources/statements-for-the-record/test%20file.pdf",
    );
  });

  it("defaults file access to public and preserves the members-only setting", () => {
    expect(normalizePublicFileAccess(undefined)).toBe("public");
    expect(normalizePublicFileAccess("public")).toBe("public");
    expect(normalizePublicFileAccess("members")).toBe("members");
    expect(normalizePublicFileAccess("unknown")).toBe("public");
  });

  it("reserves the remaining code-owned legacy resource paths", () => {
    expect(
      publicFilePathIsReserved("/resources/2026-06-08-weekly-policy-memo.pdf"),
    ).toBe(true);
    expect(publicFilePathIsReserved("1H2026-us-digital-asset-policy-cover.png")).toBe(
      true,
    );
    expect(publicFilePathIsReserved("statements-for-the-record/new.pdf")).toBe(false);
  });
});
