import { describe, expect, it } from "vitest";
import { createBoardMembershipAdapter, parseBoardMemberEmails } from "./membership";

describe("board membership allowlist", () => {
  it("parses comma, whitespace, and newline separated addresses", () => {
    expect(parseBoardMemberEmails("ada@example.org, grace@example.org")).toEqual(
      new Set(["ada@example.org", "grace@example.org"]),
    );
    expect(parseBoardMemberEmails("  ada@example.org \n grace@example.org\t")).toEqual(
      new Set(["ada@example.org", "grace@example.org"]),
    );
    expect(parseBoardMemberEmails("")).toEqual(new Set());
    expect(parseBoardMemberEmails(undefined)).toEqual(new Set());
  });

  it("normalizes mixed-case addresses to lowercase", () => {
    expect(parseBoardMemberEmails("Ada@Example.org, GRACE@EXAMPLE.ORG")).toEqual(
      new Set(["ada@example.org", "grace@example.org"]),
    );
  });

  it("matches subjects by normalized email", async () => {
    const adapter = createBoardMembershipAdapter({
      BOARD_MEMBER_EMAILS: "director@pgpz.org",
    });

    await expect(adapter.resolve({ email: "  DIRECTOR@pgpz.org " })).resolves.toMatchObject({
      active: true,
      attributes: { source: "board-roster" },
    });
    expect((await adapter.resolve({ email: "director@pgpz.org" })).active).toBe(true);
    expect((await adapter.resolve({ email: "other@pgpz.org" })).active).toBe(false);
    expect((await adapter.resolve({})).active).toBe(false);
  });
});
