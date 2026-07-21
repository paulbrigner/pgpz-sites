import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const dynamoMocks = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  query: vi.fn(),
  scan: vi.fn(),
  transactWrite: vi.fn(),
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
    dynamoMocks.transactWrite.mockReset();
    dynamoMocks.update.mockReset();
    dynamoMocks.put.mockResolvedValue({});
    dynamoMocks.transactWrite.mockResolvedValue({});
    dynamoMocks.update.mockResolvedValue({});
  });

  it("records a recruitment credit and updates both user records", async () => {
    dynamoMocks.get.mockImplementation(async ({ Key }) => {
      if (Key.pk === "REFERRAL_CODE#abc123") return { Item: referralCodeRecord };
      if (Key.pk === "USER#referrer-1") {
        return {
          Item: {
            id: "referrer-1",
            email: "referrer@example.com",
            firstName: "Referrer",
            lastName: "Member",
            accountStatus: "active",
            membershipStatus: "active",
          },
        };
      }
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
    const transaction = dynamoMocks.transactWrite.mock.calls[0][0];
    expect(transaction.TransactItems).toHaveLength(4);
    expect(transaction.TransactItems[0].ConditionCheck).toEqual(
      expect.objectContaining({
        TableName: "TestTable",
        Key: { pk: "REFERRAL_CODE#abc123", sk: "REFERRAL_CODE#abc123" },
        ConditionExpression: expect.stringContaining("#userId = :ownerUserId"),
      }),
    );
    expect(transaction.TransactItems[1].Put).toEqual(
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
    expect(transaction.TransactItems[2].Update).toEqual(
      expect.objectContaining({
        Key: { pk: "USER#referred-1", sk: "USER#referred-1" },
        ConditionExpression: expect.stringContaining("attribute_not_exists(#referralCreditedAt)"),
        ExpressionAttributeValues: expect.objectContaining({
          ":referrerUserId": "referrer-1",
          ":code": "abc123",
        }),
      }),
    );
    expect(transaction.TransactItems[3].Update).toEqual(
      expect.objectContaining({
        Key: { pk: "USER#referrer-1", sk: "USER#referrer-1" },
        ConditionExpression: expect.stringContaining("#membershipStatus = :active"),
        ExpressionAttributeValues: expect.objectContaining({
          ":one": 1,
        }),
      }),
    );
    expect(dynamoMocks.put).not.toHaveBeenCalled();
    expect(dynamoMocks.update).not.toHaveBeenCalled();
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
    expect(dynamoMocks.transactWrite).not.toHaveBeenCalled();
  });

  it("does not credit an existing account that predates the pending signup", async () => {
    dynamoMocks.get.mockImplementation(async ({ Key }) => {
      if (Key.pk === "REFERRAL_CODE#abc123") return { Item: referralCodeRecord };
      if (Key.pk === "USER#referrer-1") {
        return {
          Item: {
            id: "referrer-1",
            email: "referrer@example.com",
            accountStatus: "active",
            membershipStatus: "active",
          },
        };
      }
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
    expect(dynamoMocks.transactWrite).not.toHaveBeenCalled();
  });

  it.each([
    ["unverified", { accountStatus: "active", membershipStatus: "none" }],
    ["deactivated", { accountStatus: "deactivated", membershipStatus: "active" }],
  ])("does not credit referrals owned by an %s account", async (_label, state) => {
    dynamoMocks.get.mockImplementation(async ({ Key }) => {
      if (Key.pk === "REFERRAL_CODE#abc123") return { Item: referralCodeRecord };
      if (Key.pk === "USER#referrer-1") {
        return { Item: { id: "referrer-1", email: "referrer@example.com", ...state } };
      }
      return {};
    });

    const result = await creditReferralSignup({
      referralCode: "abc123",
      referredUserId: "referred-1",
      referredEmail: "referred@example.com",
    });

    expect(result).toEqual({ credited: false, reason: "ineligible_referrer" });
    expect(dynamoMocks.transactWrite).not.toHaveBeenCalled();
  });

  it("does not credit when the referrer is deactivated during the transaction", async () => {
    let ownerReads = 0;
    dynamoMocks.get.mockImplementation(async ({ Key }) => {
      if (Key.pk === "REFERRAL_CODE#abc123") return { Item: referralCodeRecord };
      if (Key.pk === "REFERRAL_CREDIT#referred-1") return {};
      if (Key.pk === "USER#referrer-1") {
        ownerReads += 1;
        return {
          Item: {
            id: "referrer-1",
            accountStatus: ownerReads === 1 ? "active" : "deactivated",
            membershipStatus: "active",
          },
        };
      }
      if (Key.pk === "USER#referred-1") {
        return {
          Item: {
            id: "referred-1",
            createdAt: "2026-06-02T00:00:00.000Z",
          },
        };
      }
      return {};
    });
    const cancellation = new Error("condition changed");
    cancellation.name = "TransactionCanceledException";
    dynamoMocks.transactWrite.mockRejectedValue(cancellation);

    const result = await creditReferralSignup({
      referralCode: "abc123",
      referredUserId: "referred-1",
      pendingSignupCreatedAt: "2026-06-02T00:00:00.000Z",
    });

    expect(result).toEqual({ credited: false, reason: "ineligible_referrer" });
    expect(dynamoMocks.put).not.toHaveBeenCalled();
    expect(dynamoMocks.update).not.toHaveBeenCalled();
  });

  it("classifies a concurrently created credit as already credited", async () => {
    dynamoMocks.get.mockImplementation(async ({ Key }) => {
      if (Key.pk === "REFERRAL_CODE#abc123") return { Item: referralCodeRecord };
      if (Key.pk === "REFERRAL_CREDIT#referred-1") {
        return { Item: { type: "REFERRAL_CREDIT", referredUserId: "referred-1" } };
      }
      if (Key.pk === "USER#referrer-1") {
        return { Item: { id: "referrer-1", accountStatus: "active", membershipStatus: "active" } };
      }
      if (Key.pk === "USER#referred-1") {
        return { Item: { id: "referred-1", createdAt: "2026-06-02T00:00:00.000Z" } };
      }
      return {};
    });
    const cancellation = new Error("credit won elsewhere");
    cancellation.name = "TransactionCanceledException";
    dynamoMocks.transactWrite.mockRejectedValue(cancellation);

    await expect(creditReferralSignup({
      referralCode: "abc123",
      referredUserId: "referred-1",
    })).resolves.toEqual({ credited: false, reason: "already_credited" });
  });

  it("classifies a concurrently changed referral-code owner", async () => {
    let codeReads = 0;
    dynamoMocks.get.mockImplementation(async ({ Key }) => {
      if (Key.pk === "REFERRAL_CODE#abc123") {
        codeReads += 1;
        return {
          Item: codeReads === 1
            ? referralCodeRecord
            : { ...referralCodeRecord, userId: "different-owner" },
        };
      }
      if (Key.pk === "REFERRAL_CREDIT#referred-1") return {};
      if (Key.pk === "USER#referrer-1") {
        return { Item: { id: "referrer-1", accountStatus: "active", membershipStatus: "active" } };
      }
      if (Key.pk === "USER#referred-1") {
        return { Item: { id: "referred-1", createdAt: "2026-06-02T00:00:00.000Z" } };
      }
      return {};
    });
    const cancellation = new Error("code owner changed");
    cancellation.name = "TransactionCanceledException";
    dynamoMocks.transactWrite.mockRejectedValue(cancellation);

    await expect(creditReferralSignup({
      referralCode: "abc123",
      referredUserId: "referred-1",
    })).resolves.toEqual({ credited: false, reason: "unknown_referral_code" });
  });

  it("preserves an unclassified transaction cancellation for retry", async () => {
    dynamoMocks.get.mockImplementation(async ({ Key }) => {
      if (Key.pk === "REFERRAL_CODE#abc123") return { Item: referralCodeRecord };
      if (Key.pk === "REFERRAL_CREDIT#referred-1") return {};
      if (Key.pk === "USER#referrer-1") {
        return { Item: { id: "referrer-1", accountStatus: "active", membershipStatus: "active" } };
      }
      if (Key.pk === "USER#referred-1") {
        return { Item: { id: "referred-1", createdAt: "2026-06-02T00:00:00.000Z" } };
      }
      return {};
    });
    const cancellation = new Error("transaction conflict");
    cancellation.name = "TransactionCanceledException";
    dynamoMocks.transactWrite.mockRejectedValue(cancellation);

    await expect(creditReferralSignup({
      referralCode: "abc123",
      referredUserId: "referred-1",
    })).rejects.toBe(cancellation);
  });
});

describe("referral member summaries", () => {
  beforeEach(() => {
    dynamoMocks.get.mockReset();
    dynamoMocks.put.mockReset();
    dynamoMocks.query.mockReset();
    dynamoMocks.scan.mockReset();
    dynamoMocks.transactWrite.mockReset();
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
            accountStatus: "active",
            membershipStatus: "active",
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
      displayLabel: "Recruit 30",
      membershipStatus: "active",
    });
    expect(summary.recentCredits[0]).not.toHaveProperty("referredUserId");
    expect(summary.recentCredits[0]).not.toHaveProperty("referredEmail");
    expect(summary.recentCredits[0]).not.toHaveProperty("referredName");
  });

  it.each([
    ["unverified", { accountStatus: "active", membershipStatus: "none" }],
    ["deactivated", { accountStatus: "deactivated", membershipStatus: "active" }],
  ])("does not create a referral code for an %s account", async (_label, state) => {
    dynamoMocks.get.mockResolvedValue({
      Item: {
        id: "referrer-1",
        email: "referrer@example.com",
        ...state,
      },
    });

    await expect(getReferralSummaryForUser("referrer-1")).rejects.toThrow(
      "Active membership is required",
    );
    expect(dynamoMocks.put).not.toHaveBeenCalled();
    expect(dynamoMocks.query).not.toHaveBeenCalled();
  });
});
