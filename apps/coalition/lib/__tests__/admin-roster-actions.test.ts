import { beforeEach, describe, expect, it, vi } from "vitest";

const dynamoMocks = vi.hoisted(() => ({
  get: vi.fn(),
  query: vi.fn(),
  update: vi.fn(),
  scan: vi.fn(),
  transactWrite: vi.fn(),
  batchWrite: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dynamodb", () => ({
  documentClient: dynamoMocks,
  TABLE_NAME: "TestTable",
}));

import {
  buildAdminRoster,
  deactivateAdminMember,
  deleteDeactivatedAdminMember,
  reactivateAdminMember,
  updateAdminMemberAdminAccess,
  updateAdminMemberProfile,
} from "@/lib/admin/roster";

describe("admin roster account actions", () => {
  beforeEach(() => {
    dynamoMocks.get.mockReset();
    dynamoMocks.query.mockReset();
    dynamoMocks.update.mockReset();
    dynamoMocks.scan.mockReset();
    dynamoMocks.transactWrite.mockReset();
    dynamoMocks.batchWrite.mockReset();
    dynamoMocks.get.mockResolvedValue({
      Item: {
        id: "user-1",
        email: "member@example.com",
        isAdmin: false,
        membershipStatus: "active",
      },
    });
    dynamoMocks.query.mockResolvedValue({ Items: [] });
    dynamoMocks.update.mockResolvedValue({});
    dynamoMocks.scan.mockResolvedValue({ Items: [] });
    dynamoMocks.transactWrite.mockResolvedValue({});
    dynamoMocks.batchWrite.mockResolvedValue({ UnprocessedItems: {} });
  });

  it("deactivates a user when the admin types DEACTIVATE", async () => {
    await deactivateAdminMember({
      userId: "user-1",
      adminUserId: "admin-1",
      confirmation: "DEACTIVATE",
    });

    const request = dynamoMocks.transactWrite.mock.calls[0][0];
    expect(request.TransactItems[0].Update).toEqual(
      expect.objectContaining({
        TableName: "TestTable",
        Key: { pk: "USER#user-1", sk: "USER#user-1" },
        UpdateExpression: expect.stringContaining("manualApprovalStatus = :manualNone"),
        ExpressionAttributeValues: expect.objectContaining({
          ":accountStatus": "deactivated",
          ":membershipStatus": "none",
          ":manualNone": "none",
          ":suppressed": true,
          ":reason": "account_deactivated",
        }),
      }),
    );
  });

  it("rejects incorrect deactivation confirmation without updating the user", async () => {
    await expect(
      deactivateAdminMember({
        userId: "user-1",
        adminUserId: "admin-1",
        confirmation: "deactivate",
      })
    ).rejects.toMatchObject({
      message: "Type DEACTIVATE to confirm.",
      status: 400,
    });

    expect(dynamoMocks.update).not.toHaveBeenCalled();
    expect(dynamoMocks.transactWrite).not.toHaveBeenCalled();
  });

  it("revokes Better Auth sessions and the user-bound invitation token during deactivation", async () => {
    dynamoMocks.get.mockResolvedValueOnce({
      Item: {
        id: "user-1",
        email: "member@example.com",
        isAdmin: false,
        membershipStatus: "invited",
        invitationTokenHash: "token-hash-1",
      },
    });
    dynamoMocks.query.mockResolvedValueOnce({
      Items: [
        {
          type: "BETTER_AUTH#better_auth_users",
          id: "better-user-1",
          email: "member@example.com",
        },
      ],
    });
    dynamoMocks.scan.mockResolvedValueOnce({
      Items: [
        { pk: "session-1", sk: "session-1", type: "BETTER_AUTH#better_auth_sessions", userId: "better-user-1" },
        {
          pk: "VT#EMAIL_CHANGE#user-1",
          sk: "VT#email-change-1",
          type: "VT",
          userId: "user-1",
        },
      ],
    });

    await deactivateAdminMember({
      userId: "user-1",
      adminUserId: "admin-1",
      confirmation: "DEACTIVATE",
    });

    const request = dynamoMocks.transactWrite.mock.calls[0][0];
    expect(request.TransactItems).toEqual(
      expect.arrayContaining([
        { Delete: { TableName: "TestTable", Key: { pk: "session-1", sk: "session-1" } } },
        {
          Delete: {
            TableName: "TestTable",
            Key: { pk: "VT#EMAIL_CHANGE#user-1", sk: "VT#email-change-1" },
          },
        },
        {
          Delete: {
            TableName: "TestTable",
            Key: { pk: "INVITATION#token-hash-1", sk: "INVITATION#token-hash-1" },
          },
        },
      ]),
    );
    expect(request.TransactItems[0].Update.UpdateExpression).toContain("invitationTokenHash");
  });

  it("reactivates sign-in without restoring Coalition membership", async () => {
    dynamoMocks.get.mockResolvedValueOnce({
      Item: {
        id: "user-1",
        email: "member@example.com",
        isAdmin: false,
        accountStatus: "deactivated",
        deactivatedAt: "2026-07-01T00:00:00.000Z",
        membershipStatus: "none",
      },
    });
    dynamoMocks.scan.mockResolvedValueOnce({
      Items: [
        {
          pk: "VT#EMAIL_CHANGE#user-1",
          sk: "VT#email-change-1",
          type: "VT",
          userId: "user-1",
        },
      ],
    });

    const result = await reactivateAdminMember({
      userId: "user-1",
      adminUserId: "admin-1",
      confirmation: "REACTIVATE member@example.com",
    });

    const request = dynamoMocks.transactWrite.mock.calls[0][0];
    const update = request.TransactItems[request.TransactItems.length - 1]?.Update;
    expect(request.TransactItems).toContainEqual({
      Delete: {
        TableName: "TestTable",
        Key: { pk: "VT#EMAIL_CHANGE#user-1", sk: "VT#email-change-1" },
      },
    });
    expect(update.ExpressionAttributeValues).toEqual(
      expect.objectContaining({
        ":active": "active",
        ":membershipNone": "none",
        ":manualNone": "none",
        ":notSuppressed": false,
      }),
    );
    expect(result).toMatchObject({
      accountStatus: "active",
      membershipStatus: "none",
      manualApprovalStatus: "none",
    });
  });

  it("permanently deletes the app partition and exact Better Auth identity", async () => {
    dynamoMocks.get.mockResolvedValueOnce({
      Item: {
        id: "user-1",
        email: "member@example.com",
        isAdmin: false,
        accountStatus: "deactivated",
        deactivatedAt: "2026-07-01T00:00:00.000Z",
      },
    });
    dynamoMocks.query.mockImplementation(async (request: any) =>
      request.IndexName === "GSI1"
        ? {
            Items: [
              {
                type: "BETTER_AUTH#better_auth_users",
                id: "better-user-1",
                email: "member@example.com",
              },
            ],
          }
        : {
            Items: [
              { pk: "USER#user-1", sk: "USER#user-1" },
              { pk: "USER#user-1", sk: "EMAIL#one" },
            ],
          },
    );
    dynamoMocks.scan
      .mockResolvedValueOnce({
        Items: [
          { pk: "account-1", sk: "account-1", type: "BETTER_AUTH#better_auth_accounts", userId: "better-user-1" },
          { pk: "session-1", sk: "session-1", type: "BETTER_AUTH#better_auth_sessions", userId: "better-user-1" },
          {
            pk: "VT#EMAIL_CHANGE#user-1",
            sk: "VT#email-change-1",
            type: "VT",
            userId: "user-1",
          },
        ],
      })
      .mockResolvedValue({ Items: [] });

    const result = await deleteDeactivatedAdminMember({
      userId: "user-1",
      adminUserId: "admin-1",
      confirmation: "DELETE member@example.com",
    });

    expect(dynamoMocks.batchWrite.mock.calls[0][0].RequestItems.TestTable).toEqual(
      expect.arrayContaining([
        { DeleteRequest: { Key: { pk: "USER#user-1", sk: "EMAIL#one" } } },
        { DeleteRequest: { Key: { pk: "account-1", sk: "account-1" } } },
        { DeleteRequest: { Key: { pk: "session-1", sk: "session-1" } } },
        {
          DeleteRequest: {
            Key: { pk: "VT#EMAIL_CHANGE#user-1", sk: "VT#email-change-1" },
          },
        },
      ]),
    );
    const finalRequest = dynamoMocks.transactWrite.mock.calls[dynamoMocks.transactWrite.mock.calls.length - 1]?.[0];
    expect(finalRequest).toBeDefined();
    if (!finalRequest) throw new Error("Expected final identity deletion transaction");
    expect(finalRequest.TransactItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ Delete: expect.objectContaining({ Key: { pk: "USER#user-1", sk: "USER#user-1" } }) }),
        expect.objectContaining({
          Delete: expect.objectContaining({
            Key: {
              pk: "BETTER_AUTH#better_auth_users#better-user-1",
              sk: "BETTER_AUTH#better_auth_users#better-user-1",
            },
          }),
        }),
        expect.objectContaining({
          Delete: expect.objectContaining({
            Key: {
              pk: "EMAIL_OWNERSHIP#member@example.com",
              sk: "EMAIL_OWNERSHIP#member@example.com",
            },
          }),
        }),
      ]),
    );
    expect(result.deletedItemCount).toBe(7);
  });

  it("updates admin-edited email and auth lookup keys together", async () => {
    dynamoMocks.get
      .mockResolvedValueOnce({
        Item: {
          id: "user-1",
          email: "member@example.com",
          isAdmin: false,
          membershipStatus: "active",
        },
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});
    dynamoMocks.query
      .mockResolvedValueOnce({ Items: [] })
      .mockResolvedValueOnce({
        Items: [
          {
            type: "BETTER_AUTH#better_auth_users",
            id: "better-user-1",
            email: "member@example.com",
          },
        ],
      })
      .mockResolvedValueOnce({ Items: [] });

    await updateAdminMemberProfile({
      userId: "user-1",
      adminUserId: "admin-1",
      profile: {
        email: " New.Member@Example.COM ",
        firstName: "New",
        lastName: "Member",
        company: "Zcash Org",
        jobTitle: "Policy Lead",
        linkedinUrl: "https://www.linkedin.com/in/newmember",
        xHandle: "@newmember",
        memberDirectoryOptIn: true,
        policyInterestGroups: ["tax", "not-a-topic", "mining"],
      },
    });

    expect(dynamoMocks.query).toHaveBeenCalledWith(
      expect.objectContaining({
        IndexName: "GSI1",
        ExpressionAttributeValues: {
          ":pk": "USER#new.member@example.com",
          ":sk": "USER#new.member@example.com",
        },
      })
    );
    const request = dynamoMocks.transactWrite.mock.calls[0][0];
    expect(request.TransactItems).toHaveLength(4);
    expect(request.TransactItems[1].Update).toEqual(
      expect.objectContaining({
        Key: { pk: "USER#user-1", sk: "USER#user-1" },
        ExpressionAttributeValues: expect.objectContaining({
          ":oldEmail": "member@example.com",
          ":newEmail": "new.member@example.com",
          ":appGsi": "USER#new.member@example.com",
          ":app8": ["mining", "tax"],
        }),
      }),
    );
    expect(request.TransactItems[2].Update.Key).toEqual({
      pk: "BETTER_AUTH#better_auth_users#better-user-1",
      sk: "BETTER_AUTH#better_auth_users#better-user-1",
    });
  });

  it("rejects admin email edits that collide with another user", async () => {
    dynamoMocks.query.mockResolvedValueOnce({ Items: [{ id: "other-user", email: "taken@example.com" }] });

    await expect(
      updateAdminMemberProfile({
        userId: "user-1",
        adminUserId: "admin-1",
        profile: {
          email: "taken@example.com",
          firstName: "New",
          lastName: "Member",
          company: "Zcash Org",
          jobTitle: "Policy Lead",
          linkedinUrl: "https://www.linkedin.com/in/newmember",
          xHandle: "@newmember",
          memberDirectoryOptIn: true,
          policyInterestGroups: ["tax"],
        },
      })
    ).rejects.toMatchObject({
      message: "That email is already in use.",
      status: 409,
    });

    expect(dynamoMocks.update).not.toHaveBeenCalled();
  });

  it("grants admin access with an explicit confirmation phrase", async () => {
    const result = await updateAdminMemberAdminAccess({
      userId: "user-1",
      adminUserId: "admin-1",
      isAdmin: true,
      confirmation: "MAKE ADMIN member@example.com",
    });

    expect(result).toMatchObject({ userId: "user-1", isAdmin: true });
    const request = dynamoMocks.transactWrite.mock.calls[0][0];
    expect(request.TransactItems).toHaveLength(1);
    expect(request.TransactItems[0].Update).toEqual(
      expect.objectContaining({
        Key: { pk: "USER#user-1", sk: "USER#user-1" },
        ConditionExpression: expect.stringContaining("attribute_not_exists(#deactivatedAt)"),
        ExpressionAttributeValues: expect.objectContaining({
          ":isAdmin": true,
          ":currentIsAdmin": false,
          ":adminUserId": "admin-1",
        }),
      }),
    );
  });

  it("prevents an administrator from removing their own access", async () => {
    dynamoMocks.get.mockResolvedValueOnce({
      Item: { id: "admin-1", email: "admin@example.com", isAdmin: true, accountStatus: "active" },
    });

    await expect(
      updateAdminMemberAdminAccess({
        userId: "admin-1",
        adminUserId: "admin-1",
        isAdmin: false,
        confirmation: "REMOVE ADMIN admin@example.com",
      }),
    ).rejects.toMatchObject({
      message: "You cannot remove your own admin access.",
      status: 409,
    });
    expect(dynamoMocks.update).not.toHaveBeenCalled();
  });

  it("removes another administrator when an active administrator remains", async () => {
    dynamoMocks.get.mockResolvedValueOnce({
      Item: { id: "admin-2", email: "other-admin@example.com", isAdmin: true, accountStatus: "active" },
    });
    dynamoMocks.scan.mockResolvedValueOnce({
      Items: [
        { id: "admin-1", isAdmin: true, accountStatus: "active" },
        { id: "admin-2", isAdmin: true, accountStatus: "active" },
      ],
    });

    const result = await updateAdminMemberAdminAccess({
      userId: "admin-2",
      adminUserId: "admin-1",
      isAdmin: false,
      confirmation: "REMOVE ADMIN other-admin@example.com",
    });

    expect(result).toMatchObject({ userId: "admin-2", isAdmin: false });
    const request = dynamoMocks.transactWrite.mock.calls[0][0];
    expect(request.TransactItems[0].ConditionCheck).toEqual(
      expect.objectContaining({
        Key: { pk: "USER#admin-1", sk: "USER#admin-1" },
        ConditionExpression: expect.stringContaining("isAdmin = :isAdmin"),
      }),
    );
    expect(request.TransactItems[1].Update).toEqual(
      expect.objectContaining({
        ExpressionAttributeValues: expect.objectContaining({
          ":isAdmin": false,
          ":currentIsAdmin": true,
        }),
      }),
    );
  });

  it("rejects a demotion if the alternative active administrator changes before commit", async () => {
    dynamoMocks.get.mockResolvedValueOnce({
      Item: { id: "admin-2", email: "other-admin@example.com", isAdmin: true, accountStatus: "active" },
    });
    dynamoMocks.scan.mockResolvedValueOnce({
      Items: [
        { id: "admin-1", isAdmin: true, accountStatus: "active" },
        { id: "admin-2", isAdmin: true, accountStatus: "active" },
      ],
    });
    dynamoMocks.transactWrite.mockRejectedValueOnce({ name: "TransactionCanceledException" });

    await expect(
      updateAdminMemberAdminAccess({
        userId: "admin-2",
        adminUserId: "admin-1",
        isAdmin: false,
        confirmation: "REMOVE ADMIN other-admin@example.com",
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("preserves the last active administrator", async () => {
    dynamoMocks.get.mockResolvedValueOnce({
      Item: { id: "admin-2", email: "other-admin@example.com", isAdmin: true, accountStatus: "active" },
    });
    dynamoMocks.scan.mockResolvedValueOnce({
      Items: [{ id: "admin-2", isAdmin: true, accountStatus: "active" }],
    });

    await expect(
      updateAdminMemberAdminAccess({
        userId: "admin-2",
        adminUserId: "admin-1",
        isAdmin: false,
        confirmation: "REMOVE ADMIN other-admin@example.com",
      }),
    ).rejects.toMatchObject({
      message: "At least one active administrator is required.",
      status: 409,
    });
    expect(dynamoMocks.update).not.toHaveBeenCalled();
  });

  it("prevents granting admin access to a deactivated user", async () => {
    dynamoMocks.get.mockResolvedValueOnce({
      Item: {
        id: "user-1",
        email: "member@example.com",
        isAdmin: false,
        accountStatus: "deactivated",
      },
    });

    await expect(
      updateAdminMemberAdminAccess({
        userId: "user-1",
        adminUserId: "admin-1",
        isAdmin: true,
        confirmation: "MAKE ADMIN member@example.com",
      }),
    ).rejects.toMatchObject({
      message: "Reactivate this user before granting admin access.",
      status: 409,
    });
    expect(dynamoMocks.update).not.toHaveBeenCalled();
  });

  it("treats signed-in unapproved prospects as approval-ready in the admin roster", async () => {
    dynamoMocks.scan.mockResolvedValueOnce({
      Items: [
        {
          id: "prospect-1",
          email: "prospect@example.com",
          membershipStatus: "none",
        },
        {
          id: "invitee-1",
          email: "invitee@example.com",
          membershipStatus: "invited",
          membershipProvider: "admin_invite",
        },
        {
          id: "pending-1",
          email: "pending@example.com",
          membershipStatus: "invited",
          manualApprovalStatus: "pending",
          manualApprovalRequestedAt: "2026-06-26T12:00:00.000Z",
        },
        {
          id: "active-1",
          email: "active@example.com",
          membershipStatus: "active",
        },
      ],
    });

    const roster = await buildAdminRoster({ statusFilter: "manual" });

    expect(roster.meta.manualPending).toBe(2);
    expect(roster.members.map((member) => member.id).sort()).toEqual(["pending-1", "prospect-1"]);
  });

  it("normalizes policy interest groups in roster entries", async () => {
    dynamoMocks.scan.mockResolvedValueOnce({
      Items: [
        {
          id: "member-1",
          email: "member@example.com",
          firstName: "Policy",
          lastName: "Member",
          membershipStatus: "active",
          policyInterestGroups: ["unknown", "tax", "mining"],
        },
      ],
    });

    const roster = await buildAdminRoster();

    expect(roster.members[0]?.policyInterestGroups).toEqual(["mining", "tax"]);
  });
});
