import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const dynamoMocks = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  query: vi.fn(),
  scan: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/dynamodb", () => ({
  documentClient: dynamoMocks,
  TABLE_NAME: "TestTable",
}));

vi.mock("@/lib/config", () => ({
  SITE_URL: "https://community.example.test",
}));

import { normalizeReferralCode } from "@/lib/referral-code";
import { creditReferralSignup, getReferralSummaryForUser } from "@/lib/referrals";

const referralCodeRecord = {
  type: "REFERRAL_CODE",
  code: "abc123",
  userId: "referrer-1",
  email: "referrer@example.com",
  name: "Referrer Member",
  createdAt: "2026-06-01T00:00:00.000Z",
};

describe("referral code normalization", () => {
  it("normalizes valid referral codes and rejects unsafe values", () => {
    expect(normalizeReferralCode(" ABC_123-def ")).toBe("abc_123-def");
    expect(normalizeReferralCode("abc 123")).toBe("");
    expect(normalizeReferralCode("short")).toBe("");
    expect(normalizeReferralCode("abc123<script>")).toBe("");
  });
});

describe("referral signup crediting", () => {
  beforeEach(() => {
    dynamoMocks.get.mockReset();
    dynamoMocks.put.mockReset();
    dynamoMocks.query.mockReset();
    dynamoMocks.scan.mockReset();
    dynamoMocks.update.mockReset();
    dynamoMocks.put.mockResolvedValue({});
    dynamoMocks.update.mockResolvedValue({});
  });

  it("records a recruitment credit and updates both user records", async () => {
    dynamoMocks.get.mockImplementation(async ({ Key }) => {
      if (Key.pk === "REFERRAL_CODE#abc123") return { Item: referralCodeRecord };
      if (Key.pk === "USER#referred-1") {
        return {
          Item: {
            id: "referred-1",
            email: "Referred@Example.com",
            createdAt: "2026-06-02T00:00:00.000Z",
          },
        };
      }
      return {};
    });

    const result = await creditReferralSignup({
      referralCode: " ABC123 ",
      referredUserId: "referred-1",
      referredEmail: "Referred@Example.com",
      referredName: "New Recruit",
      signupProfileId: "signup-1",
      pendingSignupCreatedAt: "2026-06-02T00:00:00.000Z",
    });

    expect(result.credited).toBe(true);
    expect(dynamoMocks.put).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: "TestTable",
        Item: expect.objectContaining({
          pk: "REFERRAL_CREDIT#referred-1",
          sk: "REFERRAL_CREDIT#referred-1",
          type: "REFERRAL_CREDIT",
          GSI1PK: "REFERRER#referrer-1",
          GSI1SK: expect.stringMatching(/^REFERRAL_CREDIT#/),
          referralCode: "abc123",
          referrerUserId: "referrer-1",
          referredUserId: "referred-1",
          referredEmail: "referred@example.com",
          referredName: "New Recruit",
          signupProfileId: "signup-1",
        }),
        ConditionExpression: "attribute_not_exists(#pk)",
      }),
    );
    expect(dynamoMocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        Key: { pk: "USER#referred-1", sk: "USER#referred-1" },
        ExpressionAttributeValues: expect.objectContaining({
          ":referrerUserId": "referrer-1",
          ":code": "abc123",
        }),
      }),
    );
    expect(dynamoMocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        Key: { pk: "USER#referrer-1", sk: "USER#referrer-1" },
        ExpressionAttributeValues: expect.objectContaining({
          ":one": 1,
        }),
      }),
    );
  });

  it("does not credit self-referrals", async () => {
    dynamoMocks.get.mockResolvedValueOnce({
      Item: { ...referralCodeRecord, userId: "referred-1" },
    });

    const result = await creditReferralSignup({
      referralCode: "abc123",
      referredUserId: "referred-1",
      referredEmail: "referrer@example.com",
    });

    expect(result).toEqual({ credited: false, reason: "self_referral" });
    expect(dynamoMocks.put).not.toHaveBeenCalled();
    expect(dynamoMocks.update).not.toHaveBeenCalled();
  });

  it("does not credit an existing account that predates the pending signup", async () => {
    dynamoMocks.get.mockImplementation(async ({ Key }) => {
      if (Key.pk === "REFERRAL_CODE#abc123") return { Item: referralCodeRecord };
      if (Key.pk === "USER#referred-1") {
        return {
          Item: {
            id: "referred-1",
            email: "referred@example.com",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        };
      }
      return {};
    });

    const result = await creditReferralSignup({
      referralCode: "abc123",
      referredUserId: "referred-1",
      referredEmail: "referred@example.com",
      pendingSignupCreatedAt: "2026-06-02T00:00:00.000Z",
    });

    expect(result).toEqual({ credited: false, reason: "not_new_signup" });
    expect(dynamoMocks.put).not.toHaveBeenCalled();
    expect(dynamoMocks.update).not.toHaveBeenCalled();
  });
});

describe("referral member summaries", () => {
  beforeEach(() => {
    dynamoMocks.get.mockReset();
    dynamoMocks.put.mockReset();
    dynamoMocks.query.mockReset();
    dynamoMocks.scan.mockReset();
    dynamoMocks.update.mockReset();
    dynamoMocks.put.mockResolvedValue({});
    dynamoMocks.update.mockResolvedValue({});
  });

  it("counts active recruits across all credits while returning only recent credit previews", async () => {
    const credits = Array.from({ length: 30 }, (_, index) => {
      const number = index + 1;
      return {
        type: "REFERRAL_CREDIT",
        referralCode: "abc123",
        referrerUserId: "referrer-1",
        referrerEmail: "referrer@example.com",
        referrerName: "Referrer Member",
        referredUserId: `referred-${number}`,
        referredEmail: `referred-${number}@example.com`,
        referredName: `Recruit ${number}`,
        signupProfileId: `signup-${number}`,
        creditedAt: new Date(Date.UTC(2026, 5, number)).toISOString(),
        pendingSignupCreatedAt: null,
      };
    });

    dynamoMocks.get.mockImplementation(async ({ Key }) => {
      if (Key.pk === "USER#referrer-1") {
        return {
          Item: {
            id: "referrer-1",
            email: "referrer@example.com",
            firstName: "Referrer",
            lastName: "Member",
            referralCode: "abc123",
          },
        };
      }

      const match = /^USER#referred-(\d+)$/.exec(Key.pk);
      if (match) {
        const number = Number(match[1]);
        return {
          Item: {
            id: `referred-${number}`,
            email: `referred-${number}@example.com`,
            firstName: "Recruit",
            lastName: String(number),
            membershipStatus: number % 2 === 0 ? "active" : "none",
          },
        };
      }

      return {};
    });
    dynamoMocks.query.mockResolvedValue({ Items: credits });

    const summary = await getReferralSummaryForUser("referrer-1");

    expect(dynamoMocks.query).toHaveBeenCalledWith(
      expect.objectContaining({
        IndexName: "GSI1",
        KeyConditionExpression: "#gsi1pk = :pk",
        ExpressionAttributeValues: { ":pk": "REFERRER#referrer-1" },
      }),
    );
    expect(summary.referralCode).toBe("abc123");
    expect(summary.referralUrl).toBe("https://community.example.test/?ref=abc123");
    expect(summary.creditedSignupCount).toBe(30);
    expect(summary.activeRecruitCount).toBe(15);
    expect(summary.recentCredits).toHaveLength(5);
    expect(summary.recentCredits[0]).toMatchObject({
      referredUserId: "referred-30",
      membershipStatus: "active",
    });
  });
});
