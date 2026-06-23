import { beforeEach, describe, expect, it, vi } from "vitest";

const dynamoMocks = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn(),
  scan: vi.fn(),
}));

vi.mock("@/lib/dynamodb", () => ({
  documentClient: dynamoMocks,
  TABLE_NAME: "TestTable",
}));

import { deactivateAdminMember } from "@/lib/admin/roster";

describe("admin roster account actions", () => {
  beforeEach(() => {
    dynamoMocks.get.mockReset();
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
});
