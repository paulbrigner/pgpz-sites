import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertLegalAcceptanceForAccountEmail: vi.fn(),
}));

vi.mock("@/lib/auth-options", () => ({
  assertLegalAcceptanceForAccountEmail: mocks.assertLegalAcceptanceForAccountEmail,
}));

vi.mock("@/lib/config", () => ({
  NEXTAUTH_URL: "",
  SITE_URL: "https://coalition.pgpz.org",
}));

async function postPreflight(body: Record<string, unknown>) {
  const { POST } = await import("./route");
  return POST(
    new Request("https://coalition.pgpz.org/api/signin/email/preflight", {
      method: "POST",
      body: JSON.stringify(body),
    }) as any,
  );
}

describe("sign-in email preflight", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertLegalAcceptanceForAccountEmail.mockResolvedValue(undefined);
  });

  it("validates the normalized email against the Better Auth callback URL", async () => {
    const response = await postPreflight({
      email: "  Member@Example.COM ",
      callbackURL: "/?signupProfileId=profile-123",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.assertLegalAcceptanceForAccountEmail).toHaveBeenCalledWith(
      "member@example.com",
      expect.stringContaining("/api/better-auth/magic-link/verify"),
    );
    const validationUrl = new URL(mocks.assertLegalAcceptanceForAccountEmail.mock.calls[0][1]);
    expect(validationUrl.searchParams.get("callbackURL")).toBe("/?signupProfileId=profile-123");
  });

  it("returns the eligibility failure as JSON instead of a blank auth error", async () => {
    mocks.assertLegalAcceptanceForAccountEmail.mockRejectedValue(
      new Error("Create an account from the sign-up page first."),
    );

    const response = await postPreflight({
      email: "prospect@example.com",
      callbackURL: "/",
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Create an account from the sign-up page first.",
    });
  });

  it("rejects invalid email addresses before querying account state", async () => {
    const response = await postPreflight({
      email: "not-an-email",
      callbackURL: "/",
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Enter a valid email address." });
    expect(mocks.assertLegalAcceptanceForAccountEmail).not.toHaveBeenCalled();
  });
});
