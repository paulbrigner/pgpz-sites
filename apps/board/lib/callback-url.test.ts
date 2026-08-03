import { describe, expect, it } from "vitest";
import { resolveSafeCallbackUrl } from "./callback-url";

const ORIGIN = "https://board.pgpz.org";

describe("resolveSafeCallbackUrl", () => {
  it("falls back to / for missing or malformed input", () => {
    expect(resolveSafeCallbackUrl(null, ORIGIN)).toBe("/");
    expect(resolveSafeCallbackUrl(undefined, ORIGIN)).toBe("/");
    expect(resolveSafeCallbackUrl("", ORIGIN)).toBe("/");
    expect(resolveSafeCallbackUrl("   ", ORIGIN)).toBe("/");
  });

  it("rejects absolute URLs of any scheme", () => {
    expect(resolveSafeCallbackUrl("https://evil.example/steal", ORIGIN)).toBe("/");
    expect(resolveSafeCallbackUrl("http://evil.example/", ORIGIN)).toBe("/");
    expect(resolveSafeCallbackUrl("javascript:alert(1)", ORIGIN)).toBe("/");
    expect(resolveSafeCallbackUrl("JAVASCRIPT:alert(1)", ORIGIN)).toBe("/");
    expect(resolveSafeCallbackUrl("data:text/html,<script>1</script>", ORIGIN)).toBe("/");
    expect(resolveSafeCallbackUrl("mailto:director@example.org", ORIGIN)).toBe("/");
  });

  it("rejects protocol-relative and backslash-host forms", () => {
    expect(resolveSafeCallbackUrl("//evil.example", ORIGIN)).toBe("/");
    expect(resolveSafeCallbackUrl("//evil.example/path", ORIGIN)).toBe("/");
    expect(resolveSafeCallbackUrl("/\\evil.example", ORIGIN)).toBe("/");
    expect(resolveSafeCallbackUrl("\\\\evil.example", ORIGIN)).toBe("/");
    expect(resolveSafeCallbackUrl("///evil.example", ORIGIN)).toBe("/");
  });

  it("rejects percent-encoded protocol-relative paths", () => {
    expect(resolveSafeCallbackUrl("/%2F%2Fevil.example", ORIGIN)).toBe("/");
    expect(resolveSafeCallbackUrl("/%5cevil.example", ORIGIN)).toBe("/");
    expect(resolveSafeCallbackUrl("/%2F%2Fevil.example/path", ORIGIN)).toBe("/");
  });

  it("rejects control characters", () => {
    expect(resolveSafeCallbackUrl("/terms%00", ORIGIN)).toBe("/");
    expect(resolveSafeCallbackUrl("/terms\u0000", ORIGIN)).toBe("/");
  });

  it("rejects absolute URLs even when they match the board origin", () => {
    // The portal always supplies callbacks as local paths; an absolute URL,
    // same-origin or not, is treated as attacker input and dropped.
    expect(resolveSafeCallbackUrl("https://board.pgpz.org/privacy", ORIGIN)).toBe("/");
    expect(resolveSafeCallbackUrl("https://board.pgpz.org/terms?x=1", ORIGIN)).toBe("/");
    expect(resolveSafeCallbackUrl("https://board.pgpz.org.evil.example/privacy", ORIGIN)).toBe("/");
  });

  it("accepts canonical local paths and preserves the query", () => {
    expect(resolveSafeCallbackUrl("/", ORIGIN)).toBe("/");
    expect(resolveSafeCallbackUrl("/terms", ORIGIN)).toBe("/terms");
    expect(resolveSafeCallbackUrl("/privacy", ORIGIN)).toBe("/privacy");
    expect(resolveSafeCallbackUrl("/files/board-minutes-2026.pdf", ORIGIN)).toBe("/files/board-minutes-2026.pdf");
    expect(resolveSafeCallbackUrl("/meetings?tab=upcoming", ORIGIN)).toBe("/meetings?tab=upcoming");
  });

  it("trims surrounding whitespace before validating", () => {
    expect(resolveSafeCallbackUrl("  /terms  ", ORIGIN)).toBe("/terms");
    expect(resolveSafeCallbackUrl("  https://evil.example  ", ORIGIN)).toBe("/");
  });
});
