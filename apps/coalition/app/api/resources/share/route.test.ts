import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createResourceSubmission: vi.fn(),
  listApprovedResourceSubmissions: vi.fn(),
  resolveAppSession: vi.fn(),
}));

vi.mock("@/lib/app-session", () => ({
  resolveAppSession: mocks.resolveAppSession,
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
    createResourceSubmission: mocks.createResourceSubmission,
    listApprovedResourceSubmissions: mocks.listApprovedResourceSubmissions,
    ResourceSubmissionError,
    toApprovedResourceListing: (submission: Record<string, unknown>) => ({
      id: submission.id,
      title: submission.title,
      url: submission.url,
      details: submission.details,
    }),
  };
});

const memberSession = {
  user: {
    id: "member-1",
    email: "member@example.test",
    firstName: "Member",
    lastName: "One",
  },
  capabilities: { member: true },
};

async function getResources() {
  const { GET } = await import("./route");
  return GET(new Request("https://coalition.example.test/api/resources/share") as any);
}

async function postResource(body: Record<string, unknown>) {
  const { POST } = await import("./route");
  return POST(
    new Request("https://coalition.example.test/api/resources/share", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }) as any,
  );
}

describe("member resource submissions route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listApprovedResourceSubmissions.mockResolvedValue([]);
    mocks.createResourceSubmission.mockResolvedValue({
      id: "submission-1",
      status: "pending",
      submittedAt: "2026-07-19T12:00:00.000Z",
    });
  });

  it("rejects unauthenticated and inactive accounts", async () => {
    mocks.resolveAppSession.mockResolvedValueOnce(null).mockResolvedValueOnce({
      user: { id: "account-1" },
      capabilities: { member: false },
    });

    expect((await getResources()).status).toBe(401);
    expect((await getResources()).status).toBe(403);
    expect(mocks.listApprovedResourceSubmissions).not.toHaveBeenCalled();
  });

  it("lists approved resources only for active members", async () => {
    mocks.resolveAppSession.mockResolvedValue(memberSession);
    mocks.listApprovedResourceSubmissions.mockResolvedValue([{
      id: "approved-1",
      title: "Approved resource",
      url: "https://example.test/resource",
      details: "Useful details",
      submittedBy: "member-1",
      submitterName: "Member One",
      submitterEmail: "member@example.test",
      reviewedBy: "admin-1",
      reviewNote: "Approved",
    }]);

    const response = await getResources();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      resources: [{
        id: "approved-1",
        title: "Approved resource",
        url: "https://example.test/resource",
        details: "Useful details",
      }],
    });
  });

  it("stores a member submission for moderation without sending email", async () => {
    mocks.resolveAppSession.mockResolvedValue(memberSession);

    const response = await postResource({
      title: "A resource",
      url: "https://example.test/resource",
      details: "Useful notes",
    });

    expect(response.status).toBe(202);
    expect(mocks.createResourceSubmission).toHaveBeenCalledWith({
      title: "A resource",
      url: "https://example.test/resource",
      details: "Useful notes",
      submittedBy: "member-1",
      submitterName: "Member One",
      submitterEmail: "member@example.test",
    });
  });
});
