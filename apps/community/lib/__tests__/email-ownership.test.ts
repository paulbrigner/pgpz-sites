import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("normalized email ownership transaction items", () => {
  it("supports distinct application and Better Auth ids in one durable claim", async () => {
    const { claimEmailOwnershipTransactionItem } = await import("@/lib/email-ownership");
    const item = claimEmailOwnershipTransactionItem({
      tableName: "TestTable",
      email: " Member@Example.Test ",
      appUserId: "app-user-1",
      betterAuthUserId: "better-user-1",
      now: "2026-07-19T12:00:00.000Z",
    });

    expect(item.Update).toMatchObject({
      Key: {
        pk: "EMAIL_OWNERSHIP#member@example.test",
        sk: "EMAIL_OWNERSHIP#member@example.test",
      },
      ExpressionAttributeValues: expect.objectContaining({
        ":type": "EMAIL_OWNERSHIP",
        ":email": "member@example.test",
        ":appUserId": "app-user-1",
        ":betterAuthUserId": "better-user-1",
      }),
    });
    expect(item.Update.ConditionExpression).toContain(
      "attribute_not_exists(#appUserId) OR #appUserId = :appUserId",
    );
    expect(item.Update.ConditionExpression).toContain(
      "attribute_not_exists(#betterAuthUserId) OR #betterAuthUserId = :betterAuthUserId",
    );
  });

  it("fails closed when either canonical owner differs", async () => {
    const { assertCompatibleEmailOwnership, EmailOwnershipCollisionError } = await import(
      "@/lib/email-ownership"
    );
    const ownership = {
      pk: "EMAIL_OWNERSHIP#member@example.test",
      sk: "EMAIL_OWNERSHIP#member@example.test",
      type: "EMAIL_OWNERSHIP" as const,
      email: "member@example.test",
      appUserId: "app-user-1",
      betterAuthUserId: "better-user-1",
    };

    expect(() =>
      assertCompatibleEmailOwnership(ownership, {
        appUserId: "app-user-1",
        betterAuthUserId: "better-user-1",
      }),
    ).not.toThrow();
    expect(() =>
      assertCompatibleEmailOwnership(ownership, { appUserId: "other-app-user" }),
    ).toThrow(EmailOwnershipCollisionError);
    expect(() =>
      assertCompatibleEmailOwnership(ownership, { betterAuthUserId: "other-better-user" }),
    ).toThrow(EmailOwnershipCollisionError);
  });

  it("releases only the exact owners while tolerating an unbackfilled legacy claim", async () => {
    const { releaseEmailOwnershipTransactionItem } = await import("@/lib/email-ownership");
    const item = releaseEmailOwnershipTransactionItem({
      tableName: "TestTable",
      email: "member@example.test",
      appUserId: "app-user-1",
      betterAuthUserId: "better-user-1",
    });

    expect(item.Delete.ConditionExpression).toContain("attribute_not_exists(#pk) OR");
    expect(item.Delete.ConditionExpression).toContain("#appUserId = :appUserId");
    expect(item.Delete.ConditionExpression).toContain("#betterAuthUserId = :betterAuthUserId");
  });
});
