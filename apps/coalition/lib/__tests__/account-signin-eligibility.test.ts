import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findAppUserByEmail: vi.fn(),
  get: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/config", () => ({ SITE_URL: "https://coalition.example.test" }));
vi.mock("@/lib/legal-config", () => ({ LEGAL_DOCUMENT_VERSION: "legal-v1" }));
vi.mock("@/lib/app-users", () => ({
  findAppUserByEmail: mocks.findAppUserByEmail,
  normalizeEmail: (value: unknown) =>
    typeof value === "string" ? value.trim().toLowerCase() : "",
}));
vi.mock("@/lib/dynamodb", () => ({
  TABLE_NAME: "TestTable",
  documentClient: {
    get: mocks.get,
    delete: mocks.delete,
  },
}));

describe("account sign-in eligibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findAppUserByEmail.mockResolvedValue(null);
    mocks.get.mockResolvedValue({});
    mocks.delete.mockResolvedValue({});
  });

  it("allows an existing active application user without a signup profile", async () => {
    mocks.findAppUserByEmail.mockResolvedValue({ id: "user-1", accountStatus: "active" });
    const { assertLegalAcceptanceForAccountEmail } = await import(
      "@/lib/account-signin-eligibility"
    );

    await expect(
      assertLegalAcceptanceForAccountEmail("Member@Example.Test", "https://example.test/link"),
    ).resolves.toBeUndefined();
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it("rejects a deactivated application user", async () => {
    mocks.findAppUserByEmail.mockResolvedValue({ id: "user-1", accountStatus: "deactivated" });
    const { assertLegalAcceptanceForAccountEmail } = await import(
      "@/lib/account-signin-eligibility"
    );

    await expect(
      assertLegalAcceptanceForAccountEmail("member@example.test", "https://example.test/link"),
    ).rejects.toThrow("This account is deactivated");
  });

  it("extracts direct and nested signup-profile identifiers", async () => {
    const { signupProfileIdFromMagicLink } = await import("@/lib/account-signin-eligibility");

    expect(
      signupProfileIdFromMagicLink(
        "https://example.test/link?signupProfileId=direct-profile",
      ),
    ).toBe("direct-profile");
    expect(
      signupProfileIdFromMagicLink(
        "https://example.test/link?callbackURL=%2F%3FsignupProfileId%3Dnested-profile",
      ),
    ).toBe("nested-profile");
  });

  it("requires a current accepted signup profile for a new account", async () => {
    const { assertLegalAcceptanceForAccountEmail } = await import(
      "@/lib/account-signin-eligibility"
    );
    const url =
      "https://example.test/link?callbackURL=%2F%3FsignupProfileId%3Dprofile-1";

    mocks.get.mockResolvedValueOnce({});
    await expect(
      assertLegalAcceptanceForAccountEmail("new@example.test", url),
    ).rejects.toThrow("Create an account from the sign-up page");

    mocks.get.mockResolvedValueOnce({
      Item: {
        type: "SIGNUP_PROFILE",
        expires: Math.floor(Date.now() / 1000) + 300,
        legalAcceptedAt: new Date().toISOString(),
        legalDocumentVersion: "old-version",
      },
    });
    await expect(
      assertLegalAcceptanceForAccountEmail("new@example.test", url),
    ).rejects.toThrow("accept the current Terms of Service");

    mocks.get.mockResolvedValueOnce({
      Item: {
        type: "SIGNUP_PROFILE",
        expires: Math.floor(Date.now() / 1000) + 300,
        legalAcceptedAt: new Date().toISOString(),
        legalDocumentVersion: "legal-v1",
      },
    });
    await expect(
      assertLegalAcceptanceForAccountEmail("new@example.test", url),
    ).resolves.toBeUndefined();
  });

  it("deletes and rejects an expired signup profile", async () => {
    mocks.get.mockResolvedValue({
      Item: {
        type: "SIGNUP_PROFILE",
        expires: Math.floor(Date.now() / 1000) - 1,
        legalAcceptedAt: new Date().toISOString(),
        legalDocumentVersion: "legal-v1",
      },
    });
    const { assertLegalAcceptanceForAccountEmail } = await import(
      "@/lib/account-signin-eligibility"
    );

    await expect(
      assertLegalAcceptanceForAccountEmail(
        "new@example.test",
        "https://example.test/link?signupProfileId=profile-1",
      ),
    ).rejects.toThrow("sign-up session expired");
    expect(mocks.delete).toHaveBeenCalledWith({
      TableName: "TestTable",
      Key: {
        pk: "SIGNUP_PROFILE#new@example.test",
        sk: "SIGNUP_PROFILE#profile-1",
      },
    });
  });
});
