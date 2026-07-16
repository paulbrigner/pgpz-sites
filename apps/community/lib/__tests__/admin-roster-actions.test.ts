import { beforeEach, describe, expect, it, vi } from "vitest";

const dynamoMocks = vi.hoisted(() => ({
  get: vi.fn(),
  query: vi.fn(),
  update: vi.fn(),
  scan: vi.fn(),
}));

vi.mock("@/lib/dynamodb", () => ({
  documentClient: dynamoMocks,
  TABLE_NAME: "TestTable",
}));

import {
  deactivateAdminMember,
  updateAdminMemberAdminAccess,
  updateAdminMemberProfile,
} from "@/lib/admin/roster";

describe("admin roster account actions", () => {
  beforeEach(() => {
    dynamoMocks.get.mockReset();
    dynamoMocks.query.mockReset();
    dynamoMocks.update.mockReset();
    dynamoMocks.scan.mockReset();
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
  });

  it("deactivates a user when the admin types DEACTIVATE", async () => {
    await deactivateAdminMember({
      userId: "user-1",
      adminUserId: "admin-1",
      confirmation: "DEACTIVATE",
    });

    expect(dynamoMocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: "TestTable",
        Key: { pk: "USER#user-1", sk: "USER#user-1" },
        ExpressionAttributeValues: expect.objectContaining({
          ":accountStatus": "deactivated",
          ":membershipStatus": "none",
          ":suppressed": true,
          ":reason": "account_deactivated",
        }),
      })
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
  });

  it("updates admin-edited email and auth lookup keys together", async () => {
    await updateAdminMemberProfile({
      userId: "user-1",
      adminUserId: "admin-1",
      profile: {
        email: " New.Member@Example.COM ",
        firstName: "New",
        lastName: "Member",
        xHandle: "@newmember",
        linkedinUrl: "https://www.linkedin.com/in/newmember",
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
    expect(dynamoMocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        ExpressionAttributeValues: expect.objectContaining({
          ":email": "new.member@example.com",
          ":gsi1pk": "USER#new.member@example.com",
          ":gsi1sk": "USER#new.member@example.com",
          ":previousEmail": "member@example.com",
        }),
      })
    );
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
          xHandle: "@newmember",
          linkedinUrl: "https://www.linkedin.com/in/newmember",
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
    expect(dynamoMocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        Key: { pk: "USER#user-1", sk: "USER#user-1" },
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
    expect(dynamoMocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        ExpressionAttributeValues: expect.objectContaining({
          ":isAdmin": false,
          ":currentIsAdmin": true,
        }),
      }),
    );
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
});
