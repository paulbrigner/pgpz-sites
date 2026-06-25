import { beforeEach, describe, expect, it, vi } from "vitest";

const dynamoMocks = vi.hoisted(() => ({
  query: vi.fn(),
  put: vi.fn(),
  update: vi.fn(),
  get: vi.fn(),
  scan: vi.fn(),
}));

vi.mock("@/lib/dynamodb", () => ({
  documentClient: dynamoMocks,
  TABLE_NAME: "CoalitionTable",
}));

vi.mock("@/lib/config", () => ({
  PGPZ_COMMUNITY_NEXTAUTH_TABLE: "CommunityTable",
}));

import {
  syncCoalitionMemberRecordToCommunity,
  type CoalitionMemberForCommunitySync,
} from "@/lib/community-sync";

const activeCoalitionMember = (
  overrides: Partial<CoalitionMemberForCommunitySync> = {},
): CoalitionMemberForCommunitySync => ({
  id: "coalition-user-1",
  name: "Policy Member",
  email: "Member@Example.com",
  firstName: "Policy",
  lastName: "Member",
  linkedinUrl: "https://www.linkedin.com/in/policy-member",
  xHandle: "@policy",
  membershipStatus: "active",
  membershipProvider: "manual",
  membershipVerifiedAt: "2026-06-25T10:00:00.000Z",
  welcomeEmailSentAt: "2026-06-25T10:01:00.000Z",
  emailSuppressed: null,
  emailSuppressedAt: null,
  emailSuppressedReason: null,
  emailSuppressedBy: null,
  accountStatus: "active",
  deactivatedAt: null,
  ...overrides,
});

describe("coalition to community sync", () => {
  beforeEach(() => {
    dynamoMocks.query.mockReset();
    dynamoMocks.put.mockReset();
    dynamoMocks.update.mockReset();
    dynamoMocks.get.mockReset();
    dynamoMocks.scan.mockReset();
    dynamoMocks.query.mockResolvedValue({ Items: [] });
    dynamoMocks.put.mockResolvedValue({});
    dynamoMocks.update.mockResolvedValue({});
  });

  it("creates a community member when none exists", async () => {
    const result = await syncCoalitionMemberRecordToCommunity(activeCoalitionMember(), {
      now: "2026-06-25T12:00:00.000Z",
      triggeredBy: "test",
    });

    expect(result.status).toBe("created");
    expect(result.email).toBe("member@example.com");
    expect(dynamoMocks.put).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: "CommunityTable",
        Item: expect.objectContaining({
          type: "USER",
          email: "member@example.com",
          membershipStatus: "active",
          membershipProvider: "coalition_sync",
          welcomeEmailSuppressedAt: "2026-06-25T12:00:00.000Z",
          welcomeEmailSuppressedReason: "coalition_member",
          coalitionUserId: "coalition-user-1",
        }),
      }),
    );
  });

  it("activates and marks an existing community member without sending welcome", async () => {
    dynamoMocks.query.mockResolvedValueOnce({
      Items: [{ id: "community-user-1", email: "member@example.com", membershipStatus: "none" }],
    });

    const result = await syncCoalitionMemberRecordToCommunity(activeCoalitionMember(), {
      now: "2026-06-25T12:00:00.000Z",
      triggeredBy: "test",
    });

    expect(result.status).toBe("updated");
    expect(dynamoMocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: "CommunityTable",
        Key: { pk: "USER#community-user-1", sk: "USER#community-user-1" },
        UpdateExpression: expect.stringContaining("welcomeEmailSuppressedReason = if_not_exists"),
        ExpressionAttributeValues: expect.objectContaining({
          ":active": "active",
          ":provider": "coalition_sync",
          ":reason": "coalition_member",
          ":coalitionUserId": "coalition-user-1",
        }),
      }),
    );
  });

  it("leaves deactivated community records for manual review", async () => {
    dynamoMocks.query.mockResolvedValueOnce({
      Items: [{ id: "community-user-1", email: "member@example.com", accountStatus: "deactivated" }],
    });

    const result = await syncCoalitionMemberRecordToCommunity(activeCoalitionMember(), {
      now: "2026-06-25T12:00:00.000Z",
      triggeredBy: "test",
    });

    expect(result.status).toBe("conflict");
    expect(result.message).toContain("deactivated");
    expect(dynamoMocks.put).not.toHaveBeenCalled();
    expect(dynamoMocks.update).not.toHaveBeenCalled();
  });

  it("skips coalition members without valid email", async () => {
    const result = await syncCoalitionMemberRecordToCommunity(activeCoalitionMember({ email: "not-an-email" }), {
      now: "2026-06-25T12:00:00.000Z",
      triggeredBy: "test",
    });

    expect(result.status).toBe("skipped");
    expect(dynamoMocks.query).not.toHaveBeenCalled();
    expect(dynamoMocks.put).not.toHaveBeenCalled();
  });
});
