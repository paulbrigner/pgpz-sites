import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createPolicyGroupWorkspaceItem: vi.fn(),
  listPolicyGroupWorkspaceItems: vi.fn(),
  resolveAppSession: vi.fn(),
  setPolicyGroupTaskStatus: vi.fn(),
}));

vi.mock("@/lib/app-session", () => ({
  resolveAppSession: mocks.resolveAppSession,
}));

vi.mock("@/lib/policy-group-workspace", () => {
  class PolicyGroupWorkspaceError extends Error {
    status: number;

    constructor(message: string, status = 400) {
      super(message);
      this.status = status;
    }
  }

  return {
    createPolicyGroupWorkspaceItem: mocks.createPolicyGroupWorkspaceItem,
    listPolicyGroupWorkspaceItems: mocks.listPolicyGroupWorkspaceItems,
    setPolicyGroupTaskStatus: mocks.setPolicyGroupTaskStatus,
    PolicyGroupWorkspaceError,
  };
});

const params = { params: Promise.resolve({ group: "privacy" }) };
const memberSession = {
  user: { id: "member-1", firstName: "Member", lastName: "One" },
  capabilities: { member: true },
};

describe("policy-group workspace route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listPolicyGroupWorkspaceItems.mockResolvedValue([]);
    mocks.createPolicyGroupWorkspaceItem.mockResolvedValue({ id: "item-1" });
    mocks.setPolicyGroupTaskStatus.mockResolvedValue({ id: "task-1", status: "completed" });
  });

  it("rejects unauthenticated and inactive accounts", async () => {
    mocks.resolveAppSession.mockResolvedValueOnce(null).mockResolvedValueOnce({
      user: { id: "account-1" },
      capabilities: { member: false },
    });
    const { GET } = await import("./route");

    expect(
      (await GET(new Request("https://coalition.example.test/api/groups/privacy/items") as any, params)).status,
    ).toBe(401);
    expect(
      (await GET(new Request("https://coalition.example.test/api/groups/privacy/items") as any, params)).status,
    ).toBe(403);
    expect(mocks.listPolicyGroupWorkspaceItems).not.toHaveBeenCalled();
  });

  it("allows active members to list and create workspace items", async () => {
    mocks.resolveAppSession.mockResolvedValue(memberSession);
    const { GET, POST } = await import("./route");

    const list = await GET(
      new Request("https://coalition.example.test/api/groups/privacy/items") as any,
      params,
    );
    const create = await POST(
      new Request("https://coalition.example.test/api/groups/privacy/items", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "task", title: "Draft", body: "Prepare text" }),
      }) as any,
      params,
    );

    expect(list.status).toBe(200);
    expect(create.status).toBe(201);
    expect(mocks.createPolicyGroupWorkspaceItem).toHaveBeenCalledWith({
      groupId: "privacy",
      kind: "task",
      title: "Draft",
      body: "Prepare text",
      url: undefined,
      authorId: "member-1",
      authorName: "Member One",
    });
  });

  it("validates task transitions before updating DynamoDB", async () => {
    mocks.resolveAppSession.mockResolvedValue(memberSession);
    const { PATCH } = await import("./route");
    const invalid = await PATCH(
      new Request("https://coalition.example.test/api/groups/privacy/items", {
        method: "PATCH",
        body: JSON.stringify({ id: "task-1", completed: true }),
      }) as any,
      params,
    );
    expect(invalid.status).toBe(400);

    const valid = await PATCH(
      new Request("https://coalition.example.test/api/groups/privacy/items", {
        method: "PATCH",
        body: JSON.stringify({
          id: "task-1",
          createdAt: "2026-07-19T12:00:00.000Z",
          completed: true,
        }),
      }) as any,
      params,
    );

    expect(valid.status).toBe(200);
    expect(mocks.setPolicyGroupTaskStatus).toHaveBeenCalledWith({
      groupId: "privacy",
      id: "task-1",
      createdAt: "2026-07-19T12:00:00.000Z",
      completed: true,
      memberId: "member-1",
    });
  });
});
