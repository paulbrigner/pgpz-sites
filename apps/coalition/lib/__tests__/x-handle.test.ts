import { describe, expect, it } from "vitest";
import { normalizeXHandle } from "@/lib/x-handle";

describe("normalizeXHandle", () => {
  it("normalizes handles and X profile URLs", () => {
    expect(normalizeXHandle("pgpz")).toBe("@pgpz");
    expect(normalizeXHandle("@zcash")).toBe("@zcash");
    expect(normalizeXHandle("https://x.com/paulbrigner")).toBe("@paulbrigner");
    expect(normalizeXHandle("https://twitter.com/zcash")).toBe("@zcash");
  });

  it("rejects invalid handles", () => {
    expect(() => normalizeXHandle("https://example.com/pgpz")).toThrow(/x.com or twitter.com/);
    expect(() => normalizeXHandle("@this_handle_is_way_too_long")).toThrow(/1-15/);
    expect(() => normalizeXHandle("@bad-handle")).toThrow(/1-15/);
  });
});
