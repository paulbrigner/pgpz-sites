import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const dynamoMocks = vi.hoisted(() => ({ put: vi.fn(), query: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/dynamodb", () => ({ documentClient: dynamoMocks, TABLE_NAME: "TestTable" }));

import {
  createPolicyGroupWorkspaceItem,
  listPolicyGroupWorkspaceItems,
  setPolicyGroupTaskStatus,
} from "@/lib/policy-group-workspace";

describe("policy group workspaces", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dynamoMocks.put.mockResolvedValue({});
    dynamoMocks.query.mockResolvedValue({ Items: [] });
  });

  it("stores durable notes under the selected policy group", async () => {
    const item = await createPolicyGroupWorkspaceItem({
      groupId: "privacy",
      kind: "note",
      title: "Hearing watch",
      body: "Track the committee calendar.",
      authorId: "member-1",
      authorName: "Member One",
    });
    expect(item).toMatchObject({ groupId: "privacy", kind: "note", status: "open" });
    expect(dynamoMocks.put).toHaveBeenCalledWith(
      expect.objectContaining({
        Item: expect.objectContaining({ pk: "POLICY_GROUP#privacy", type: "POLICY_GROUP_WORKSPACE_ITEM" }),
      }),
    );
  });

  it("requires a safe URL for link items", async () => {
    await expect(createPolicyGroupWorkspaceItem({
      groupId: "privacy",
      kind: "link",
      title: "Unsafe",
      body: "Unsafe link",
      url: "file:///tmp/private",
      authorId: "member-1",
      authorName: "Member One",
    })).rejects.toMatchObject({ status: 400 });
  });

  it("queries the group partition rather than scanning the table", async () => {
    await listPolicyGroupWorkspaceItems("tax");
    expect(dynamoMocks.query).toHaveBeenCalledWith(
      expect.objectContaining({
        KeyConditionExpression: "#pk = :pk AND begins_with(#sk, :prefix)",
        ExpressionAttributeValues: { ":pk": "POLICY_GROUP#tax", ":prefix": "WORKSPACE_ITEM#" },
      }),
    );
  });

  it("uses a conditional task update for completion", async () => {
    dynamoMocks.update.mockResolvedValue({
      Attributes: {
        id: "item-1",
        groupId: "tax",
        kind: "task",
        title: "Follow up",
        body: "Call partner",
        status: "completed",
        authorId: "member-1",
        authorName: "Member One",
        createdAt: "2026-07-19T12:00:00.000Z",
      },
    });
    await setPolicyGroupTaskStatus({
      groupId: "tax",
      id: "item-1",
      createdAt: "2026-07-19T12:00:00.000Z",
      completed: true,
      memberId: "member-2",
    });
    expect(dynamoMocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        ConditionExpression: "attribute_exists(pk) AND #kind = :task",
        ExpressionAttributeValues: expect.objectContaining({
          ":completed": "completed",
          ":memberId": "member-2",
        }),
      }),
    );
  });
});
