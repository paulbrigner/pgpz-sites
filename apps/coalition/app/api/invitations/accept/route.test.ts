import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveAppSession: vi.fn(),
  acceptAuthenticatedInvitation: vi.fn(),
}));

vi.mock("@/lib/app-session", () => ({
  resolveAppSession: mocks.resolveAppSession,
}));

vi.mock("@/lib/admin/invitations", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/invitations")>();
  return {
    ...actual,
    acceptAuthenticatedInvitation: mocks.acceptAuthenticatedInvitation,
  };
});

import { POST } from "./route";

describe("POST /api/invitations/accept", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts the invitation for the authenticated app user", async () => {
    mocks.resolveAppSession.mockResolvedValue({
      user: { id: "user-1", email: "invitee@example.com" },
      authProvider: "better-auth",
    });
    mocks.acceptAuthenticatedInvitation.mockResolvedValue({
      ok: true,
      status: "activated",
      userId: "user-1",
    });

    const response = await POST(
      new Request("https://example.test/api/invitations/accept", { method: "POST" }) as any,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, status: "activated" });
    expect(mocks.acceptAuthenticatedInvitation).toHaveBeenCalledWith({
      userId: "user-1",
      email: "invitee@example.com",
    });
  });

  it("rejects unauthenticated requests", async () => {
    mocks.resolveAppSession.mockResolvedValue(null);

    const response = await POST(
      new Request("https://example.test/api/invitations/accept", { method: "POST" }) as any,
    );

    expect(response.status).toBe(401);
    expect(mocks.acceptAuthenticatedInvitation).not.toHaveBeenCalled();
  });
});
