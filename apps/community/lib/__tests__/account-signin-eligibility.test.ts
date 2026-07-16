import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findAppUserByEmail: vi.fn(),
  get: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dynamodb", () => ({
  TABLE_NAME: "TestTable",
  documentClient: { get: mocks.get, delete: mocks.delete },
}));
vi.mock("@/lib/app-users", () => ({
  findAppUserByEmail: mocks.findAppUserByEmail,
  normalizeEmail: (value: unknown) =>
    typeof value === "string" ? value.trim().toLowerCase() : "",
}));
vi.mock("@/lib/legal-config", () => ({ LEGAL_DOCUMENT_VERSION: "2026-07-01" }));
vi.mock("@/lib/config", () => ({ SITE_URL: "https://community.pgpz.org" }));

describe("account sign-in eligibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findAppUserByEmail.mockResolvedValue(null);
    mocks.get.mockResolvedValue({});
    mocks.delete.mockResolvedValue({});
  });

  it("allows an existing active account without a pending signup profile", async () => {
    mocks.findAppUserByEmail.mockResolvedValue({ id: "user-1", accountStatus: "active" });
    const { assertLegalAcceptanceForAccountEmail } = await import(
      "@/lib/account-signin-eligibility"
    );

    await expect(
      assertLegalAcceptanceForAccountEmail(" Member@Example.Test ", "https://community.pgpz.org"),
    ).resolves.toBeUndefined();
    expect(mocks.findAppUserByEmail).toHaveBeenCalledWith("member@example.test");
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it("rejects a deactivated account before reading signup state", async () => {
    mocks.findAppUserByEmail.mockResolvedValue({
      id: "user-1",
      accountStatus: "deactivated",
    });
    const { assertLegalAcceptanceForAccountEmail } = await import(
      "@/lib/account-signin-eligibility"
    );

    await expect(
      assertLegalAcceptanceForAccountEmail("member@example.test", "https://community.pgpz.org"),
    ).rejects.toThrow("This account is deactivated");
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it("accepts current legal consent from the keyed pending signup profile", async () => {
    mocks.get.mockResolvedValue({
      Item: {
        type: "SIGNUP_PROFILE",
        legalAcceptedAt: "2026-07-16T12:00:00.000Z",
        legalDocumentVersion: "2026-07-01",
        expires: Math.floor(Date.now() / 1000) + 600,
      },
    });
    const { assertLegalAcceptanceForAccountEmail } = await import(
      "@/lib/account-signin-eligibility"
    );
    const callbackUrl = encodeURIComponent(
      "https://community.pgpz.org/signup?signupProfileId=profile-1",
    );

    await expect(
      assertLegalAcceptanceForAccountEmail(
        "member@example.test",
        `https://community.pgpz.org/api/better-auth/magic-link?callbackURL=${callbackUrl}`,
      ),
    ).resolves.toBeUndefined();
    expect(mocks.get).toHaveBeenCalledWith({
      TableName: "TestTable",
      Key: {
        pk: "SIGNUP_PROFILE#member@example.test",
        sk: "SIGNUP_PROFILE#profile-1",
      },
    });
  });

  it("deletes and rejects an expired pending signup profile", async () => {
    mocks.get.mockResolvedValue({
      Item: {
        type: "SIGNUP_PROFILE",
        legalAcceptedAt: "2026-07-16T12:00:00.000Z",
        legalDocumentVersion: "2026-07-01",
        expires: Math.floor(Date.now() / 1000) - 1,
      },
    });
    const { assertLegalAcceptanceForAccountEmail } = await import(
      "@/lib/account-signin-eligibility"
    );

    await expect(
      assertLegalAcceptanceForAccountEmail(
        "member@example.test",
        "https://community.pgpz.org/api/better-auth/magic-link?signupProfileId=profile-1",
      ),
    ).rejects.toThrow("Your sign-up session expired");
    expect(mocks.delete).toHaveBeenCalledWith({
      TableName: "TestTable",
      Key: {
        pk: "SIGNUP_PROFILE#member@example.test",
        sk: "SIGNUP_PROFILE#profile-1",
      },
    });
  });
});
