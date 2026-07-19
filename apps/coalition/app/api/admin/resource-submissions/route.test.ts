import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  listResourceSubmissions: vi.fn(),
  requireAdminSession: vi.fn(),
  reviewResourceSubmission: vi.fn(),
}));

vi.mock("@/lib/admin/auth", () => ({
  requireAdminSession: mocks.requireAdminSession,
}));

vi.mock("@/lib/resource-submissions", () => {
  class ResourceSubmissionError extends Error {
    status: number;

    constructor(message: string, status = 400) {
      super(message);
      this.status = status;
    }
  }

  return {
    listResourceSubmissions: mocks.listResourceSubmissions,
    reviewResourceSubmission: mocks.reviewResourceSubmission,
    ResourceSubmissionError,
  };
});

describe("admin resource moderation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminSession.mockResolvedValue({ user: { id: "admin-1" } });
    mocks.listResourceSubmissions.mockResolvedValue([]);
    mocks.reviewResourceSubmission.mockResolvedValue({
      id: "submission-1",
      status: "approved",
    });
  });

  it("fails closed when the caller is not an administrator", async () => {
    mocks.requireAdminSession.mockRejectedValue(new Error("forbidden"));
    const { GET, PATCH } = await import("./route");

    const getResponse = await GET(
      new NextRequest("https://coalition.example.test/api/admin/resource-submissions"),
    );
    const patchResponse = await PATCH(
      new NextRequest("https://coalition.example.test/api/admin/resource-submissions", {
        method: "PATCH",
        body: JSON.stringify({ id: "submission-1", decision: "approved" }),
      }),
    );

    expect(getResponse.status).toBe(403);
    expect(patchResponse.status).toBe(403);
    expect(mocks.reviewResourceSubmission).not.toHaveBeenCalled();
  });

  it("passes only recognized status filters to the indexed listing", async () => {
    const { GET } = await import("./route");

    await GET(
      new NextRequest(
        "https://coalition.example.test/api/admin/resource-submissions?status=approved",
      ),
    );
    await GET(
      new NextRequest(
        "https://coalition.example.test/api/admin/resource-submissions?status=unexpected",
      ),
    );

    expect(mocks.listResourceSubmissions).toHaveBeenNthCalledWith(1, "approved");
    expect(mocks.listResourceSubmissions).toHaveBeenNthCalledWith(2, "all");
  });

  it("requires an explicit decision and records the administrator", async () => {
    const { PATCH } = await import("./route");
    const invalid = await PATCH(
      new NextRequest("https://coalition.example.test/api/admin/resource-submissions", {
        method: "PATCH",
        body: JSON.stringify({ id: "submission-1", decision: "pending" }),
      }),
    );
    expect(invalid.status).toBe(400);

    const valid = await PATCH(
      new NextRequest("https://coalition.example.test/api/admin/resource-submissions", {
        method: "PATCH",
        body: JSON.stringify({
          id: "submission-1",
          decision: "approved",
          note: "Reviewed",
        }),
      }),
    );

    expect(valid.status).toBe(200);
    expect(mocks.reviewResourceSubmission).toHaveBeenCalledWith({
      id: "submission-1",
      decision: "approved",
      adminUserId: "admin-1",
      note: "Reviewed",
    });
  });
});
