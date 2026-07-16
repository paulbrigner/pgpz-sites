import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  appSessionUserFromRecord: vi.fn((user) => user),
  ensureAppUserForEmail: vi.fn(),
  getBetterAuthSession: vi.fn(),
  headers: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("next/headers", () => ({
  headers: mocks.headers,
}));

vi.mock("@/lib/better-auth", () => ({
  auth: {
    api: {
      getSession: mocks.getBetterAuthSession,
    },
  },
}));

vi.mock("@/lib/app-users", () => ({
  appSessionUserFromRecord: mocks.appSessionUserFromRecord,
  ensureAppUserForEmail: mocks.ensureAppUserForEmail,
  normalizeEmail: (value: unknown) => (typeof value === "string" ? value.trim().toLowerCase() : ""),
}));

const appUser = {
  id: "user-1",
  email: "member@example.test",
  name: "Member",
  membershipStatus: "active",
};

describe("Better Auth-only app sessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getBetterAuthSession.mockResolvedValue(null);
    mocks.ensureAppUserForEmail.mockResolvedValue(appUser);
    mocks.headers.mockResolvedValue(new Headers({ cookie: "better-auth.session_token=token" }));
  });

  it("resolves a Better Auth session and maps it to the application user", async () => {
    const requestHeaders = new Headers({ cookie: "better-auth.session_token=request-token" });
    mocks.getBetterAuthSession.mockResolvedValue({
      user: { id: "better-user-1", email: "Member@Example.Test", name: "Member" },
    });
    const { resolveAppSession } = await import("@/lib/app-session");

    const session = await resolveAppSession(requestHeaders);

    expect(mocks.getBetterAuthSession).toHaveBeenCalledWith({
      headers: requestHeaders,
      query: { disableRefresh: true },
    });
    expect(mocks.ensureAppUserForEmail).toHaveBeenCalledWith({
      email: "member@example.test",
      preferredUserId: "better-user-1",
      name: "Member",
    });
    expect(session).toMatchObject({
      authProvider: "better-auth",
      authUserId: "better-user-1",
      user: appUser,
    });
  });

  it("uses the current request headers when none are supplied", async () => {
    mocks.getBetterAuthSession.mockResolvedValue({
      user: { id: "better-user-1", email: "member@example.test" },
    });
    const { resolveAppSession } = await import("@/lib/app-session");

    await resolveAppSession();

    expect(mocks.headers).toHaveBeenCalledOnce();
    expect(mocks.getBetterAuthSession).toHaveBeenCalledWith({
      headers: expect.any(Headers),
      query: { disableRefresh: true },
    });
  });

  it.each([
    ["no Better Auth session", null],
    ["missing Better Auth user id", { user: { email: "member@example.test" } }],
    ["missing Better Auth email", { user: { id: "better-user-1" } }],
  ])("returns no app session for %s", async (_label, betterAuthSession) => {
    mocks.getBetterAuthSession.mockResolvedValue(betterAuthSession);
    const { resolveAppSession } = await import("@/lib/app-session");

    await expect(resolveAppSession(new Headers())).resolves.toBeNull();
    expect(mocks.ensureAppUserForEmail).not.toHaveBeenCalled();
  });

  it("surfaces Better Auth resolution failures instead of silently authenticating elsewhere", async () => {
    mocks.getBetterAuthSession.mockRejectedValue(new Error("Better Auth unavailable"));
    const { resolveAppSession } = await import("@/lib/app-session");

    await expect(resolveAppSession(new Headers())).rejects.toThrow("Better Auth unavailable");
  });

  it("rejects a required session when Better Auth has no current user", async () => {
    const { requireAppSession } = await import("@/lib/app-session");

    await expect(requireAppSession(new Headers())).rejects.toThrow("Unauthorized");
  });
});
