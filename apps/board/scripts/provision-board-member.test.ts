import { describe, expect, it } from "vitest";
import {
  provisionBoardMember,
  type ProvisionDocumentClient,
} from "./provision-board-member";

type RecordedCall = { params: Record<string, unknown> };

function createFakeClient(options: {
  existingUserId?: string | null;
  accountVersion?: number | null;
  sessionCount?: number;
}) {
  const calls: {
    query: RecordedCall[];
    put: RecordedCall[];
    delete: RecordedCall[];
    transactWrite: RecordedCall[];
  } = { query: [], put: [], delete: [], transactWrite: [] };

  const client: ProvisionDocumentClient = {
    async query(params) {
      calls.query.push({ params });
      const pk = (params.ExpressionAttributeValues as Record<string, unknown> | undefined)?.[
        ":pk"
      ];
      if (typeof pk !== "string") return { Items: [] };
      // User lookup by email (GSI1).
      if (pk.includes("#email#")) {
        const user = options.existingUserId
          ? {
              id: options.existingUserId,
              email: pk.split("#email#")[1]?.replace(/#$/, ""),
            }
          : null;
        return { Items: user && options.existingUserId ? [user] : [] };
      }
      // Account lookup (GSI2) — only present when the user exists.
      if (pk.includes("better_auth_accounts")) {
        const account =
          options.accountVersion !== null && options.accountVersion !== undefined
            ? { userId: options.existingUserId, providerId: "credential", adapterVersion: options.accountVersion }
            : null;
        return { Items: account ? [account] : [] };
      }
      // Session listing (GSI2).
      if (pk.includes("better_auth_sessions")) {
        const count = options.sessionCount ?? 0;
        return {
          Items: Array.from({ length: count }, (_, index) => ({
            pk: `sess-${index}`,
            sk: `sess-${index}`,
          })),
        };
      }
      return { Items: [] };
    },
    async put(params) {
      calls.put.push({ params });
    },
    async delete(params) {
      calls.delete.push({ params });
    },
    async transactWrite(params) {
      calls.transactWrite.push({ params });
    },
  };
  return { client, calls };
}

const memberEnv = {
  BOARD_MEMBER_EMAILS: "ada@example.org, new@example.org",
  BOARD_PASSWORD_AUTH_ENABLED: "true",
};

describe("provisionBoardMember --dry-run is strictly non-mutating", () => {
  it("reports the session count for an existing account without deleting anything", async () => {
    const { client, calls } = createFakeClient({
      existingUserId: "user-1",
      accountVersion: 1,
      sessionCount: 2,
    });

    const outcome = await provisionBoardMember({
      args: ["ada@example.org", "--dry-run"],
      env: memberEnv,
      client,
    });

    expect(outcome).toMatchObject({
      action: "rotated",
      email: "ada@example.org",
      dryRun: true,
      sessionCount: 2,
    });
    // A dry run must make zero mutations: no session deletes, no writes.
    expect(calls.delete).toHaveLength(0);
    expect(calls.put).toHaveLength(0);
    expect(calls.transactWrite).toHaveLength(0);
  });

  it("is a no-op write-wise for a brand-new account", async () => {
    const { client, calls } = createFakeClient({ existingUserId: null });

    const outcome = await provisionBoardMember({
      args: ["new@example.org", "--dry-run"],
      env: memberEnv,
      client,
    });

    expect(outcome).toMatchObject({ action: "created", dryRun: true, sessionCount: 0 });
    expect(calls.delete).toHaveLength(0);
    expect(calls.put).toHaveLength(0);
    expect(calls.transactWrite).toHaveLength(0);
  });

  it("revokes sessions on a live rotation (regression: this used to run even in dry-run)", async () => {
    const { client, calls } = createFakeClient({
      existingUserId: "user-1",
      accountVersion: 1,
      sessionCount: 2,
    });

    const outcome = await provisionBoardMember({
      args: ["ada@example.org"],
      env: memberEnv,
      client,
    });

    expect(outcome).toMatchObject({ action: "rotated", dryRun: false, sessionCount: 2 });
    expect(calls.delete).toHaveLength(2);
    expect(calls.put).toHaveLength(1);
    expect(calls.transactWrite).toHaveLength(0);
  });

  it("keeps sessions when --keep-sessions is passed on a live rotation", async () => {
    const { client, calls } = createFakeClient({
      existingUserId: "user-1",
      accountVersion: 1,
      sessionCount: 2,
    });

    const outcome = await provisionBoardMember({
      args: ["ada@example.org", "--keep-sessions"],
      env: memberEnv,
      client,
    });

    expect(outcome).toMatchObject({ dryRun: false, sessionCount: 0, keepSessions: true });
    expect(calls.delete).toHaveLength(0);
    expect(calls.put).toHaveLength(1);
  });

  it("creates a new account transactionally on a live run", async () => {
    const { client, calls } = createFakeClient({ existingUserId: null });

    const outcome = await provisionBoardMember({
      args: ["new@example.org"],
      env: memberEnv,
      client,
    });

    expect(outcome).toMatchObject({ action: "created", dryRun: false });
    expect(calls.transactWrite).toHaveLength(1);
    expect(calls.put).toHaveLength(0);
    expect(calls.delete).toHaveLength(0);
  });

  it("refuses an email not on any roster allowlist", async () => {
    const { client } = createFakeClient({ existingUserId: null });
    await expect(
      provisionBoardMember({ args: ["outsider@example.org"], env: memberEnv, client }),
    ).rejects.toThrow(/not on the BOARD_MEMBER_EMAILS/);
  });

  it("refuses provisioning while password auth is retired", async () => {
    const { client } = createFakeClient({ existingUserId: null });
    await expect(
      provisionBoardMember({
        args: ["new@example.org"],
        env: { ...memberEnv, BOARD_PASSWORD_AUTH_ENABLED: "false" },
        client,
      }),
    ).rejects.toThrow(/BOARD_PASSWORD_AUTH_ENABLED=true/);
  });
});
