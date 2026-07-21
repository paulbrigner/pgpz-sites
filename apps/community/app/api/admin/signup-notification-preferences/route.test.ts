import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => {
  class AdminAccessError extends Error {}
  return { requireAdminSession: vi.fn(), AdminAccessError };
});

const preferenceMocks = vi.hoisted(() => {
  class AdminSignupNotificationPreferenceError extends Error {
    status: number;

    constructor(message: string, status = 400) {
      super(message);
      this.status = status;
    }
  }
  return {
    get: vi.fn(),
    update: vi.fn(),
    AdminSignupNotificationPreferenceError,
  };
});

vi.mock("@/lib/admin/auth", () => ({
  requireAdminSession: authMocks.requireAdminSession,
  AdminAccessError: authMocks.AdminAccessError,
}));

vi.mock("@/lib/admin/signup-notifications", () => ({
  getAdminSignupNotificationPreferences: preferenceMocks.get,
  updateAdminSignupNotificationPreferences: preferenceMocks.update,
  AdminSignupNotificationPreferenceError:
    preferenceMocks.AdminSignupNotificationPreferenceError,
}));

import { GET, PATCH } from "./route";

describe("admin signup notification preferences route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.requireAdminSession.mockResolvedValue({ user: { id: "admin-1" } });
    preferenceMocks.get.mockResolvedValue({
      recipientEmail: "admin@example.test",
      preferences: { approvalRequested: false, successfulJoin: false },
      options: {},
    });
    preferenceMocks.update.mockResolvedValue({
      recipientEmail: "admin@example.test",
      preferences: { approvalRequested: true, successfulJoin: true },
      options: {},
    });
  });

  it("loads only the signed-in administrator's preferences", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(preferenceMocks.get).toHaveBeenCalledWith("admin-1");
  });

  it("updates only the signed-in administrator with boolean preferences", async () => {
    const response = await PATCH(
      new Request("https://portal.example.test/api/admin/signup-notification-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminUserId: "someone-else",
          approvalRequested: true,
          successfulJoin: true,
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(preferenceMocks.update).toHaveBeenCalledWith({
      adminUserId: "admin-1",
      preferences: { approvalRequested: true, successfulJoin: true },
    });
  });

  it("rejects malformed preference values", async () => {
    const response = await PATCH(
      new Request("https://portal.example.test/api/admin/signup-notification-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvalRequested: "yes", successfulJoin: false }),
      }),
    );

    expect(response.status).toBe(400);
    expect(preferenceMocks.update).not.toHaveBeenCalled();
  });

  it("rejects non-administrators", async () => {
    authMocks.requireAdminSession.mockRejectedValueOnce(new authMocks.AdminAccessError());

    const response = await GET();

    expect(response.status).toBe(403);
    expect(preferenceMocks.get).not.toHaveBeenCalled();
  });
});
