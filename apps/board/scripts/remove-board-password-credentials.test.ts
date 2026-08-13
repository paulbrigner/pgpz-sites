import { describe, expect, it, vi } from "vitest";
import {
  REMOVE_PASSWORD_CREDENTIALS_CONFIRMATION,
  removeBoardPasswordCredentials,
  type PasswordRemovalDocumentClient,
} from "./remove-board-password-credentials";

const ACCOUNT_TYPE = "BETTER_AUTH#better_auth_accounts";
const SESSION_TYPE = "BETTER_AUTH#better_auth_sessions";
const env = {
  BOARD_PASSWORD_AUTH_ENABLED: "false",
  NEXTAUTH_TABLE: "PGPZBoardNextAuth",
};

function account(id: string, userId = id, providerId = "credential") {
  return {
    pk: `${ACCOUNT_TYPE}#${id}`,
    sk: `${ACCOUNT_TYPE}#${id}`,
    type: ACCOUNT_TYPE,
    id,
    userId,
    accountId: userId,
    providerId,
    password: "must-never-be-returned",
  };
}

function session(id: string, userId: string) {
  return {
    pk: `${SESSION_TYPE}#${id}`,
    sk: `${SESSION_TYPE}#${id}`,
    type: SESSION_TYPE,
    id,
    userId,
    token: "must-never-be-returned",
  };
}

function fakeClient(records: Array<Record<string, unknown>>) {
  const calls: Array<Record<string, unknown>> = [];
  const client: PasswordRemovalDocumentClient = {
    async scan(params) {
      const type = (params.ExpressionAttributeValues as Record<string, unknown>)[":type"];
      return { Items: records.filter((record) => record.type === type) };
    },
    async transactWrite(params) {
      calls.push(params);
    },
  };
  return { client, calls };
}

function fakeAuditLedger() {
  const calls: Array<Record<string, unknown>> = [];
  return {
    calls,
    auditLedger: {
      async buildAppendItems(input: Record<string, unknown>) {
        calls.push(input);
        return {
          TransactItems: [
            { Put: { TableName: "PGPZBoardAuditLog", Item: { sk: "ENTRY" } } },
            { Put: { TableName: "PGPZBoardAuditLog", Item: { sk: "IDEMP" } } },
            { Put: { TableName: "PGPZBoardAuditLog", Item: { sk: "HEAD" } } },
          ],
        };
      },
    },
  };
}

const applyArgs = [
  "--apply",
  "--confirm",
  REMOVE_PASSWORD_CREDENTIALS_CONFIRMATION,
  "--actor-email",
  "operator@pgpz.org",
];

describe("removeBoardPasswordCredentials", () => {
  it("defaults to a non-mutating exact dry-run plan and ignores non-credential records", async () => {
    const { client, calls } = fakeClient([
      account("credential-1", "user-1"),
      account("oauth-1", "user-1", "github"),
      session("session-1", "user-1"),
      {
        pk: "BETTER_AUTH#better_auth_passkeys#passkey-1",
        sk: "BETTER_AUTH#better_auth_passkeys#passkey-1",
        type: "BETTER_AUTH#better_auth_passkeys",
        id: "passkey-1",
        userId: "user-1",
      },
      {
        pk: "BETTER_AUTH#better_auth_verifications#verification-1",
        sk: "BETTER_AUTH#better_auth_verifications#verification-1",
        type: "BETTER_AUTH#better_auth_verifications",
        id: "verification-1",
      },
    ]);

    const outcome = await removeBoardPasswordCredentials({ args: [], env, client });

    expect(outcome).toEqual(expect.objectContaining({
      mode: "dry-run",
      tableName: "PGPZBoardNextAuth",
      actorEmail: null,
      deletedCredentialAccountIds: [],
      revokedSessionCount: 0,
      failures: [],
    }));
    expect(outcome.targets).toEqual([{
      id: "credential-1",
      userId: "user-1",
      accountId: "user-1",
      providerId: "credential",
      pk: `${ACCOUNT_TYPE}#credential-1`,
      sk: `${ACCOUNT_TYPE}#credential-1`,
      sessionCount: 1,
    }]);
    expect(outcome.targets[0]).not.toHaveProperty("password");
    expect(calls).toHaveLength(0);
  });

  it("requires an explicit disabled-password state, table, and apply confirmation", async () => {
    const { client } = fakeClient([]);
    await expect(removeBoardPasswordCredentials({
      args: [],
      env: { NEXTAUTH_TABLE: "PGPZBoardNextAuth" },
      client,
    })).rejects.toThrow("BOARD_PASSWORD_AUTH_ENABLED=false");
    await expect(removeBoardPasswordCredentials({
      args: [],
      env: { BOARD_PASSWORD_AUTH_ENABLED: "false" },
      client,
    })).rejects.toThrow("NEXTAUTH_TABLE");
    await expect(removeBoardPasswordCredentials({
      args: ["--apply", "--confirm", "wrong"],
      env,
      client,
    })).rejects.toThrow(REMOVE_PASSWORD_CREDENTIALS_CONFIRMATION);
    await expect(removeBoardPasswordCredentials({
      args: ["--apply", "--confirm", REMOVE_PASSWORD_CREDENTIALS_CONFIRMATION],
      env,
      client,
    })).rejects.toThrow("--actor-email");
  });

  it("atomically deletes only credential accounts and their current sessions", async () => {
    const credential = account("credential-1", "user-1");
    const currentSession = session("session-1", "user-1");
    const { client, calls } = fakeClient([
      credential,
      account("oauth-1", "user-1", "github"),
      currentSession,
    ]);
    const { auditLedger, calls: auditCalls } = fakeAuditLedger();

    const outcome = await removeBoardPasswordCredentials({
      args: applyArgs,
      env,
      client,
      auditLedger,
    });

    expect(outcome.deletedCredentialAccountIds).toEqual(["credential-1"]);
    expect(outcome.revokedSessionCount).toBe(1);
    expect(outcome.failures).toEqual([]);
    expect(calls).toHaveLength(1);
    const transactionItems = calls[0].TransactItems as Array<any>;
    const deletes = transactionItems.slice(0, 2).map((item) => item.Delete);
    expect(transactionItems).toHaveLength(5);
    expect(deletes.map((item) => item.Key)).toEqual([
      { pk: credential.pk, sk: credential.sk },
      { pk: currentSession.pk, sk: currentSession.sk },
    ]);
    expect(transactionItems.slice(2)).toEqual([
      expect.objectContaining({ Put: expect.any(Object) }),
      expect.objectContaining({ Put: expect.any(Object) }),
      expect.objectContaining({ Put: expect.any(Object) }),
    ]);
    expect(deletes[0].ExpressionAttributeValues).toMatchObject({
      ":accountType": ACCOUNT_TYPE,
      ":credential": "credential",
    });
    expect(deletes[1].ExpressionAttributeValues).toMatchObject({
      ":sessionType": SESSION_TYPE,
    });
    expect(auditCalls).toEqual([expect.objectContaining({
      category: "account",
      action: "password_credentials_removed",
      outcome: "success",
      actor: expect.objectContaining({ email: "operator@pgpz.org" }),
      target: { type: "better_auth_user", id: "user-1", version: null },
      idempotencyKey: "board-password-credential-removal:user-1",
    })]);
  });

  it("retries bounded transient failures without changing the transaction target", async () => {
    const { client } = fakeClient([account("credential-1", "user-1")]);
    const transactWrite = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error("busy"), {
        name: "TransactionInProgressException",
      }))
      .mockResolvedValueOnce({});
    client.transactWrite = transactWrite;
    const wait = vi.fn(async () => {});
    const { auditLedger } = fakeAuditLedger();

    const outcome = await removeBoardPasswordCredentials({
      args: applyArgs,
      env,
      client,
      auditLedger,
      wait,
    });

    expect(outcome.deletedCredentialAccountIds).toEqual(["credential-1"]);
    expect(transactWrite).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledOnce();
    expect(transactWrite.mock.calls[1][0].TransactItems).toEqual(
      transactWrite.mock.calls[0][0].TransactItems,
    );
  });

  it("reports partial failures exactly and continues independent user transactions", async () => {
    const { client } = fakeClient([
      account("credential-1", "user-1"),
      account("credential-2", "user-2"),
    ]);
    const { auditLedger } = fakeAuditLedger();
    client.transactWrite = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error("condition changed"), {
        name: "AccessDeniedException",
      }))
      .mockResolvedValueOnce({});

    const outcome = await removeBoardPasswordCredentials({
      args: applyArgs,
      env,
      client,
      auditLedger,
    });

    expect(outcome.deletedCredentialAccountIds).toEqual(["credential-2"]);
    expect(outcome.failures).toEqual([{
      userId: "user-1",
      credentialAccountIds: ["credential-1"],
      message: "AccessDeniedException: condition changed",
    }]);
  });

  it("refuses the whole apply before writing when a user exceeds the atomic limit", async () => {
    const { client, calls } = fakeClient([
      account("credential-1", "user-1"),
      ...Array.from({ length: 97 }, (_, index) => session(`session-${index}`, "user-1")),
    ]);
    const { auditLedger } = fakeAuditLedger();

    await expect(removeBoardPasswordCredentials({
      args: applyArgs,
      env,
      client,
      auditLedger,
    })).rejects.toThrow("97-delete ceiling");
    expect(calls).toHaveLength(0);
  });
});
