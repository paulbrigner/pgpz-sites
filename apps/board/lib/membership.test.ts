import { describe, expect, it } from "vitest";
import {
  createBoardMembershipAdapter,
  parseBoardAdminEmails,
  parseBoardExecutiveDirectorEmails,
  parseBoardLegalCounselEmails,
  parseBoardMemberEmails,
} from "./membership";

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
    expect(parseBoardAdminEmails("ADA@EXAMPLE.ORG")).toEqual(
      new Set(["ada@example.org"]),
    );
  });

  it("parses the executive director allowlist with the same normalization", () => {
    expect(parseBoardExecutiveDirectorEmails("  Div@PGPZ.org \n grace@example.org")).toEqual(
      new Set(["div@pgpz.org", "grace@example.org"]),
    );
    expect(parseBoardExecutiveDirectorEmails("")).toEqual(new Set());
    expect(parseBoardExecutiveDirectorEmails(undefined)).toEqual(new Set());
  });

  it("matches subjects by normalized email", async () => {
    const adapter = createBoardMembershipAdapter({
      BOARD_MEMBER_EMAILS: "director@pgpz.org, admin@pgpz.org",
      BOARD_ADMIN_EMAILS: "ADMIN@pgpz.org",
    });

    await expect(adapter.resolve({ email: "  DIRECTOR@pgpz.org " })).resolves.toMatchObject({
      active: true,
      attributes: { source: "board-roster" },
    });
    expect((await adapter.resolve({ email: "director@pgpz.org" })).active).toBe(true);
    expect((await adapter.resolve({ email: "other@pgpz.org" })).active).toBe(false);
    expect((await adapter.resolve({})).active).toBe(false);
    await expect(adapter.resolve({ email: "admin@pgpz.org" })).resolves.toMatchObject({
      active: true,
      attributes: { role: "admin", isAdmin: true },
    });
  });

  it("rejects administrators who are not also Board members", () => {
    expect(() =>
      createBoardMembershipAdapter({
        BOARD_MEMBER_EMAILS: "director@pgpz.org",
        BOARD_ADMIN_EMAILS: "outsider@pgpz.org",
      }),
    ).toThrow(/subset/);
  });

  it("resolves the executive director as an active administrator with a unique role", async () => {
    const adapter = createBoardMembershipAdapter({
      BOARD_MEMBER_EMAILS: "director@pgpz.org",
      BOARD_ADMIN_EMAILS: "director@pgpz.org",
      BOARD_EXECUTIVE_DIRECTOR_EMAILS: "div@pgpz.org",
    });

    await expect(adapter.resolve({ email: "  DIV@pgpz.org " })).resolves.toMatchObject({
      active: true,
      attributes: {
        source: "executive-director",
        role: "executive-director",
        isAdmin: true,
      },
    });
    // The Executive Director is not a Board member; ordinary roster
    // resolution is unchanged for directors.
    await expect(adapter.resolve({ email: "director@pgpz.org" })).resolves.toMatchObject({
      active: true,
      attributes: { role: "admin", isAdmin: true },
    });
    expect((await adapter.resolve({ email: "other@pgpz.org" })).active).toBe(false);
  });

  it("grants the executive director access without any member roster configured", async () => {
    const adapter = createBoardMembershipAdapter({
      BOARD_MEMBER_EMAILS: "",
      BOARD_ADMIN_EMAILS: "",
      BOARD_EXECUTIVE_DIRECTOR_EMAILS: "div@pgpz.org",
    });

    await expect(adapter.resolve({ email: "div@pgpz.org" })).resolves.toMatchObject({
      active: true,
      attributes: { role: "executive-director", isAdmin: true },
    });
    await expect(adapter.resolve({ email: "anyone@pgpz.org" })).resolves.toMatchObject({
      active: false,
    });
  });

  it("rejects an executive director who is also on the Board roster", () => {
    expect(() =>
      createBoardMembershipAdapter({
        BOARD_MEMBER_EMAILS: "div@pgpz.org",
        BOARD_ADMIN_EMAILS: "",
        BOARD_EXECUTIVE_DIRECTOR_EMAILS: "div@pgpz.org",
      }),
    ).toThrow(/must not overlap/);
  });

  it("parses the legal counsel allowlist with the same normalization", () => {
    expect(parseBoardLegalCounselEmails("  Sam@PGPZ.org \n grace@example.org")).toEqual(
      new Set(["sam@pgpz.org", "grace@example.org"]),
    );
    expect(parseBoardLegalCounselEmails("")).toEqual(new Set());
    expect(parseBoardLegalCounselEmails(undefined)).toEqual(new Set());
  });

  it("resolves legal counsel as an active administrator with a unique role", async () => {
    const adapter = createBoardMembershipAdapter({
      BOARD_MEMBER_EMAILS: "director@pgpz.org",
      BOARD_ADMIN_EMAILS: "director@pgpz.org",
      BOARD_LEGAL_COUNSEL_EMAILS: "sam@pgpz.org",
    });

    await expect(adapter.resolve({ email: "  SAM@pgpz.org " })).resolves.toMatchObject({
      active: true,
      attributes: {
        source: "legal-counsel",
        role: "legal-counsel",
        isAdmin: true,
      },
    });
    // Legal Counsel is not a Board member; ordinary roster resolution unchanged.
    await expect(adapter.resolve({ email: "director@pgpz.org" })).resolves.toMatchObject({
      active: true,
      attributes: { role: "admin", isAdmin: true },
    });
    expect((await adapter.resolve({ email: "other@pgpz.org" })).active).toBe(false);
  });

  it("grants legal counsel access without any member roster configured", async () => {
    const adapter = createBoardMembershipAdapter({
      BOARD_MEMBER_EMAILS: "",
      BOARD_ADMIN_EMAILS: "",
      BOARD_EXECUTIVE_DIRECTOR_EMAILS: "",
      BOARD_LEGAL_COUNSEL_EMAILS: "sam@pgpz.org",
    });

    await expect(adapter.resolve({ email: "sam@pgpz.org" })).resolves.toMatchObject({
      active: true,
      attributes: { role: "legal-counsel", isAdmin: true },
    });
    await expect(adapter.resolve({ email: "anyone@pgpz.org" })).resolves.toMatchObject({
      active: false,
    });
  });

  it("rejects legal counsel who is also on the Board roster", () => {
    expect(() =>
      createBoardMembershipAdapter({
        BOARD_MEMBER_EMAILS: "sam@pgpz.org",
        BOARD_ADMIN_EMAILS: "",
        BOARD_LEGAL_COUNSEL_EMAILS: "sam@pgpz.org",
      }),
    ).toThrow(/must not overlap BOARD_MEMBER_EMAILS/);
  });

  it("rejects legal counsel who is also the executive director", () => {
    expect(() =>
      createBoardMembershipAdapter({
        BOARD_MEMBER_EMAILS: "director@pgpz.org",
        BOARD_ADMIN_EMAILS: "",
        BOARD_EXECUTIVE_DIRECTOR_EMAILS: "div@pgpz.org",
        BOARD_LEGAL_COUNSEL_EMAILS: "div@pgpz.org",
      }),
    ).toThrow(/must not overlap BOARD_EXECUTIVE_DIRECTOR_EMAILS/);
  });
});
