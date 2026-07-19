import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  consumeEmailChangeTokenTransactionItem: vi.fn(),
  expireLegacySessionCookies: vi.fn(),
  findAppUserByEmail: vi.fn(),
  getAppUserById: vi.fn(),
  getEmailChangeToken: vi.fn(),
  updateAppAndBetterAuthUserEmail: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/app-users", () => ({
  findAppUserByEmail: mocks.findAppUserByEmail,
  getAppUserById: mocks.getAppUserById,
  normalizeEmail: (value: unknown) =>
    typeof value === "string" ? value.trim().toLowerCase() : "",
}));

vi.mock("@/lib/email-change-token", () => ({
  consumeEmailChangeTokenTransactionItem: mocks.consumeEmailChangeTokenTransactionItem,
  getEmailChangeToken: mocks.getEmailChangeToken,
}));

vi.mock("@/lib/better-auth-user-email", () => {
  class BetterAuthEmailCollisionError extends Error {
    constructor() {
      super("That email is already in use.");
      this.name = "BetterAuthEmailCollisionError";
    }
  }

  return {
    BetterAuthEmailCollisionError,
    updateAppAndBetterAuthUserEmail: mocks.updateAppAndBetterAuthUserEmail,
  };
});

vi.mock("@/lib/admin/email-transport", () => ({
  isValidEmail: (value: string) => /^[^@]+@[^@]+\.[^@]+$/.test(value),
}));

vi.mock("@/lib/legacy-session-cookies", () => ({
  expireLegacySessionCookies: mocks.expireLegacySessionCookies,
}));

const validRecord = {
  identifier: "EMAIL_CHANGE#user-1",
  token: "token-1",
  expires: new Date("2099-01-01T00:00:00.000Z"),
  newEmail: "New@Example.com",
  userId: "user-1",
  betterAuthUserId: "better-auth-user-1",
};

const activeUser = {
  id: "user-1",
  email: "old@example.com",
  accountStatus: "active",
  deactivatedAt: null,
};

const tokenDelete = {
  Delete: {
    TableName: "test-table",
    Key: { pk: "VT#EMAIL_CHANGE#user-1", sk: "VT#token-1" },
    ConditionExpression: "token remains valid",
  },
};

function confirmationUrl(identifier = validRecord.identifier, token = validRecord.token) {
  const url = new URL("https://site.example/api/profile/confirm-email-change");
  if (identifier) url.searchParams.set("identifier", identifier);
  if (token) url.searchParams.set("token", token);
  return url;
}

async function getConfirmation(identifier?: string, token?: string) {
  const { GET } = await import("./route");
  return GET(new NextRequest(confirmationUrl(identifier, token)));
}

async function postConfirmation({
  identifier = validRecord.identifier,
  token = validRecord.token,
  origin = "https://site.example",
}: {
  identifier?: string;
  token?: string;
  origin?: string | null;
} = {}) {
  const headers = new Headers({ "content-type": "application/x-www-form-urlencoded" });
  if (origin !== null) headers.set("origin", origin);

  const { POST } = await import("./route");
  return POST(
    new NextRequest("https://site.example/api/profile/confirm-email-change", {
      method: "POST",
      headers,
      body: new URLSearchParams({ identifier, token }).toString(),
    }),
  );
}

describe("profile email-change confirmation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getEmailChangeToken.mockResolvedValue(validRecord);
    mocks.getAppUserById.mockResolvedValue(activeUser);
    mocks.findAppUserByEmail.mockResolvedValue(null);
    mocks.consumeEmailChangeTokenTransactionItem.mockReturnValue(tokenDelete);
    mocks.updateAppAndBetterAuthUserEmail.mockResolvedValue(undefined);
    mocks.expireLegacySessionCookies.mockImplementation((response) => response);
  });

  it("renders an explicit confirmation form on GET without consuming or updating anything", async () => {
    const response = await getConfirmation();
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(body).toContain("Confirm email change");
    expect(body).toContain('<form method="post"');
    expect(body).toContain('name="identifier" value="EMAIL_CHANGE#user-1"');
    expect(body).toContain('name="token" value="token-1"');
    expect(body).toContain("new@example.com");
    expect(mocks.getEmailChangeToken).toHaveBeenCalledWith({
      identifier: validRecord.identifier,
      token: validRecord.token,
    });
    expect(mocks.getAppUserById).toHaveBeenCalledWith("user-1", { consistentRead: true });
    expect(mocks.consumeEmailChangeTokenTransactionItem).not.toHaveBeenCalled();
    expect(mocks.updateAppAndBetterAuthUserEmail).not.toHaveBeenCalled();
  });

  it.each([null, "https://attacker.example"])(
    "requires a same-origin POST (origin %s)",
    async (origin) => {
      const response = await postConfirmation({ origin });

      expect(response.status).toBe(403);
      expect(await response.text()).toContain("did not come from this site");
      expect(mocks.getEmailChangeToken).not.toHaveBeenCalled();
      expect(mocks.updateAppAndBetterAuthUserEmail).not.toHaveBeenCalled();
    },
  );

  it("rejects a malformed confirmation before reading or mutating a token", async () => {
    const response = await postConfirmation({ identifier: "", token: "" });

    expect(response.status).toBe(400);
    expect(await response.text()).toContain("Missing or invalid token");
    expect(mocks.getEmailChangeToken).not.toHaveBeenCalled();
    expect(mocks.updateAppAndBetterAuthUserEmail).not.toHaveBeenCalled();
  });

  it("rejects an expired token without consuming it", async () => {
    mocks.getEmailChangeToken.mockResolvedValueOnce({
      ...validRecord,
      expires: new Date("2000-01-01T00:00:00.000Z"),
    });

    const response = await postConfirmation();

    expect(response.status).toBe(410);
    expect(await response.text()).toContain("link has expired");
    expect(mocks.consumeEmailChangeTokenTransactionItem).not.toHaveBeenCalled();
    expect(mocks.updateAppAndBetterAuthUserEmail).not.toHaveBeenCalled();
  });

  it("rejects a token whose identifier is not bound to its user", async () => {
    mocks.getEmailChangeToken.mockResolvedValueOnce({
      ...validRecord,
      userId: "user-2",
    });

    const response = await postConfirmation();

    expect(response.status).toBe(400);
    expect(await response.text()).toContain("Invalid token payload");
    expect(mocks.getAppUserById).not.toHaveBeenCalled();
    expect(mocks.updateAppAndBetterAuthUserEmail).not.toHaveBeenCalled();
  });

  it.each([
    { accountStatus: "deactivated", deactivatedAt: null },
    { accountStatus: "active", deactivatedAt: "2026-07-19T12:00:00.000Z" },
  ])("rejects a deactivated account before mutation", async (lifecycle) => {
    mocks.getAppUserById.mockResolvedValueOnce({ ...activeUser, ...lifecycle });

    const response = await postConfirmation();

    expect(response.status).toBe(409);
    expect(await response.text()).toContain("account is deactivated");
    expect(mocks.consumeEmailChangeTokenTransactionItem).not.toHaveBeenCalled();
    expect(mocks.updateAppAndBetterAuthUserEmail).not.toHaveBeenCalled();
  });

  it("treats a consumed token as a replay and does not perform a second update", async () => {
    const firstResponse = await postConfirmation();
    expect(firstResponse.status).toBe(303);

    mocks.getEmailChangeToken.mockResolvedValueOnce(null);
    const replayResponse = await postConfirmation();

    expect(replayResponse.status).toBe(404);
    expect(await replayResponse.text()).toContain("invalid or has already been used");
    expect(mocks.updateAppAndBetterAuthUserEmail).toHaveBeenCalledTimes(1);
  });

  it("reports a deactivation race when the atomic update rejects", async () => {
    mocks.getAppUserById
      .mockResolvedValueOnce(activeUser)
      .mockResolvedValueOnce({
        ...activeUser,
        accountStatus: "deactivated",
        deactivatedAt: "2026-07-19T12:00:00.000Z",
      });
    mocks.updateAppAndBetterAuthUserEmail.mockRejectedValueOnce(
      Object.assign(new Error("transaction cancelled"), {
        name: "TransactionCanceledException",
      }),
    );

    const response = await postConfirmation();

    expect(response.status).toBe(409);
    expect(await response.text()).toContain("deactivated before the change completed");
    expect(mocks.getAppUserById).toHaveBeenCalledTimes(2);
    expect(mocks.getEmailChangeToken).toHaveBeenCalledTimes(1);
  });

  it("atomically consumes the token while updating the app and Better Auth identities", async () => {
    const response = await postConfirmation();

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://site.example/signin?reason=email-updated");
    expect(mocks.consumeEmailChangeTokenTransactionItem).toHaveBeenCalledWith(validRecord);
    expect(mocks.updateAppAndBetterAuthUserEmail).toHaveBeenCalledWith({
      appUserId: "user-1",
      betterAuthUserId: "better-auth-user-1",
      oldEmail: "old@example.com",
      newEmail: "new@example.com",
      requireActiveAccount: true,
      additionalTransactItems: [tokenDelete],
    });
    expect(mocks.expireLegacySessionCookies).toHaveBeenCalledOnce();
  });
});
