import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  approveManualApproval: vi.fn(),
  declineAccessApplication: vi.fn(),
  requireAdminSession: vi.fn(),
}));

vi.mock("@/lib/admin/auth", () => ({
  requireAdminSession: mocks.requireAdminSession,
}));

vi.mock("@/lib/manual-approval", () => {
  class ManualApprovalError extends Error {
    status: number;

    constructor(message: string, status = 400) {
      super(message);
      this.status = status;
    }
  }

  return {
    approveManualApproval: mocks.approveManualApproval,
    declineAccessApplication: mocks.declineAccessApplication,
    ManualApprovalError,
  };
});

const post = async (body: Record<string, unknown>) => {
  const { POST } = await import("./route");
  return POST(
    new NextRequest("https://coalition.example.test/api/admin/members/manual-approval", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
};

describe("manual approval admin route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminSession.mockResolvedValue({ user: { id: "admin-1" } });
    mocks.approveManualApproval.mockResolvedValue({ ok: true, applicationStatus: "approved" });
    mocks.declineAccessApplication.mockResolvedValue({ ok: true, applicationStatus: "declined" });
  });

  it.each([
    ["missing", { userId: "user-1" }],
    ["unknown", { userId: "user-1", action: "approve-all" }],
  ])("rejects a %s action", async (_label, body) => {
    const response = await post(body);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Action must be either "approve" or "decline".',
    });
    expect(mocks.approveManualApproval).not.toHaveBeenCalled();
    expect(mocks.declineAccessApplication).not.toHaveBeenCalled();
  });

  it("dispatches an explicit approve action with the administrator identity", async () => {
    const response = await post({ userId: " user-1 ", action: "approve" });

    expect(response.status).toBe(200);
    expect(mocks.approveManualApproval).toHaveBeenCalledWith({
      userId: "user-1",
      adminUserId: "admin-1",
    });
    expect(mocks.declineAccessApplication).not.toHaveBeenCalled();
  });

  it("dispatches an explicit decline action with its optional reason", async () => {
    const response = await post({
      userId: "user-1",
      action: "decline",
      reason: "Not a current fit",
    });

    expect(response.status).toBe(200);
    expect(mocks.declineAccessApplication).toHaveBeenCalledWith({
      userId: "user-1",
      adminUserId: "admin-1",
      reason: "Not a current fit",
    });
    expect(mocks.approveManualApproval).not.toHaveBeenCalled();
  });

  it("fails closed when administrator authentication fails", async () => {
    mocks.requireAdminSession.mockRejectedValue(new Error("forbidden"));

    const response = await post({ userId: "user-1", action: "approve" });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Admin access required" });
    expect(mocks.approveManualApproval).not.toHaveBeenCalled();
    expect(mocks.declineAccessApplication).not.toHaveBeenCalled();
  });
});
