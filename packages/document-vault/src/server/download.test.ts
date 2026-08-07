import { describe, expect, it } from "vitest";
import { contentDisposition, isInlineMimeType, sanitizeFilename } from "./download";

describe("safe download helpers", () => {
  it("treats PDFs and text as inline, binaries as attachment", () => {
    expect(isInlineMimeType("application/pdf")).toBe(true);
    expect(isInlineMimeType("text/plain")).toBe(true);
    expect(isInlineMimeType("application/octet-stream")).toBe(false);
    expect(isInlineMimeType("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe(false);
  });

  it("strips traversal and control characters from filenames", () => {
    expect(sanitizeFilename("../../etc/passwd.pdf")).toBe(".._.._etc_passwd.pdf");
    expect(sanitizeFilename("caf\u00e9.pdf")).toBe("cafe.pdf");
    expect(sanitizeFilename("")).toBe("download");
  });

  it("emits RFC 6266 content disposition with an inline flag for PDF", () => {
    const header = contentDisposition({ mimeType: "application/pdf", originalFileName: "articles.pdf" });
    expect(header.startsWith("inline; filename=")).toBe(true);
    expect(header).toContain("articles.pdf");
  });
});
