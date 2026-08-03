import {
  assertMembershipModeAlignment,
  resolveActiveMembership,
} from "@pgpz/core/server";
import { describe, expect, it } from "vitest";
import { createBoardServerConfig } from "./server";
import { boardSiteConfig } from "./site";

const BOARD_ENV = {
  NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
  NEXTAUTH_TABLE: "PGPZBoardTest",
  BETTER_AUTH_URL: "http://localhost:3000",
  BETTER_AUTH_TRUSTED_ORIGINS: "http://localhost:3000",
  BETTER_AUTH_SECRET: "board-test-secret-at-least-32-characters",
  BOARD_MEMBER_EMAILS: "ada@example.org, Grace@Example.org",
} satisfies Record<string, string>;

describe("board server-only configuration", () => {
  it("aligns the externally managed roster adapter and honors the table", () => {
    const config = createBoardServerConfig(BOARD_ENV);

    expect(() => assertMembershipModeAlignment(boardSiteConfig, config)).not.toThrow();
    expect(config.dynamodb.tableName).toBe("PGPZBoardTest");
    expect(config.dynamodb.client).toBeDefined();
    expect(config.email.transport).toEqual({ mode: "disabled" });
    expect(config.membership.adapter.mode).toBe("externally-managed");
  });

  it("rejects an undersized production signing secret", () => {
    expect(() =>
      createBoardServerConfig({ ...BOARD_ENV, BETTER_AUTH_SECRET: "too-short" }),
    ).toThrow();
  });

  it("resolves membership only for allowlisted emails, case-insensitively", async () => {
    const config = createBoardServerConfig(BOARD_ENV);
    const adapter = config.membership.adapter;

    await expect(resolveActiveMembership(adapter, { email: "ada@example.org" })).resolves.toMatchObject({
      active: true,
      attributes: { source: "board-roster" },
    });
    await expect(resolveActiveMembership(adapter, { email: "  GRACE@example.org " })).resolves.toMatchObject({
      active: true,
    });
    await expect(resolveActiveMembership(adapter, { email: "not@on-the-roster.org" })).resolves.toMatchObject({
      active: false,
    });
    await expect(resolveActiveMembership(adapter, { id: "no-email-subject" })).resolves.toMatchObject({
      active: false,
    });
  });

  it("locks every account out when the allowlist is empty or missing", async () => {
    const locked = createBoardServerConfig({ ...BOARD_ENV, BOARD_MEMBER_EMAILS: "" });
    await expect(
      resolveActiveMembership(locked.membership.adapter, { email: "ada@example.org" }),
    ).resolves.toMatchObject({ active: false });

    const unset = createBoardServerConfig({ ...BOARD_ENV, BOARD_MEMBER_EMAILS: undefined });
    await expect(
      resolveActiveMembership(unset.membership.adapter, { email: "ada@example.org" }),
    ).resolves.toMatchObject({ active: false });
  });
});
