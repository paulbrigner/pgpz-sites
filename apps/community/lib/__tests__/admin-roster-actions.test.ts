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

import { deactivateAdminMember, updateAdminMemberProfile } from "@/lib/admin/roster";

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
});
