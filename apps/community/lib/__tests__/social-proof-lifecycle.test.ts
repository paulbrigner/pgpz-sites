import { beforeEach, describe, expect, it, vi } from "vitest";

const dynamoMocks = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  query: vi.fn(),
  update: vi.fn(),
  transactWrite: vi.fn(),
}));

const notificationMocks = vi.hoisted(() => ({
  send: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/dynamodb", () => ({
  documentClient: dynamoMocks,
  TABLE_NAME: "TestTable",
}));

vi.mock("@/lib/admin/signup-notifications", () => ({
  queueAdminSignupNotification: notificationMocks.send,
}));

vi.mock("@/lib/config", () => ({
  MEMBERSHIP_PROOF_RETENTION_POLICY: "indefinite",
  SITE_URL: "https://community.example.test",
  ZCASHME_API_TIMEOUT_MS: 1_000,
  ZCASHME_DIRECTORY_URL: "https://zcash.example.test",
  X_API_BASE_URL: "https://api.x.example.test",
  X_API_TIMEOUT_MS: 1_000,
  X_BEARER_TOKEN: "test-token",
  X_PROOF_AUTOVERIFY_BATCH_SIZE: 10,
  X_PROOF_AUTOVERIFY_GROUP_SIZE: 5,
  X_PROOF_AUTOVERIFY_MAX_ATTEMPTS: 5,
  X_PROOF_AUTOVERIFY_WINDOW_MINUTES: 60,
  X_PROOF_CHALLENGE_RATE_LIMIT: 5,
  X_PROOF_CHALLENGE_TTL_MINUTES: 15,
  X_PROOF_RATE_LIMIT_WINDOW_MINUTES: 15,
  X_PROOF_VERIFY_RATE_LIMIT: 5,
}));

import { createXChallenge, verifyXProof, verifyZcashMeDryRun } from "@/lib/social-proof";

const pendingChallenge = {
  pk: "SOCIAL_PROOF#USER#user-1",
  sk: "CHALLENGE#2026-07-21T12:00:00.000Z#challenge-1",
  type: "SOCIAL_PROOF_CHALLENGE",
  challengeId: "challenge-1",
  challenge: "PGPZ-ABC123",
  userId: "user-1",
  provider: "x",
  status: "pending",
  createdAt: "2026-07-21T12:00:00.000Z",
  expiresAt: "2099-07-21T12:15:00.000Z",
  autoVerifyUntilAt: "2099-07-21T13:00:00.000Z",
};

const xPostResponse = {
  data: {
    id: "12345",
    text: "Joining PGPZ. Verification code: PGPZ-ABC123",
    author_id: "author-1",
    created_at: "2026-07-21T12:05:00.000Z",
  },
  includes: {
    users: [{ id: "author-1", name: "Verified Member", username: "verified" }],
  },
};

describe("social proof account lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    notificationMocks.send.mockResolvedValue({
      queued: false,
      recipientCount: 0,
      reason: "no_eligible_recipients",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(xPostResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
  });

  it.each([
    { membershipStatus: "none", accountStatus: "deactivated" },
    {
      membershipStatus: "none",
      accountStatus: "active",
      deactivatedAt: "2026-07-19T00:00:00.000Z",
    },
  ])("does not create membership proof challenges for deactivated accounts", async (item) => {
    dynamoMocks.get.mockResolvedValue({ Item: item });

    await expect(createXChallenge("user-1")).rejects.toMatchObject({
      message: "This account is deactivated.",
      status: 409,
    });
    expect(dynamoMocks.query).not.toHaveBeenCalled();
    expect(dynamoMocks.put).not.toHaveBeenCalled();
  });

  it("creates the challenge and current-challenge lock atomically", async () => {
    dynamoMocks.get.mockResolvedValue({
      Item: { membershipStatus: "none", accountStatus: "active" },
    });
    dynamoMocks.query.mockResolvedValue({ Items: [] });
    dynamoMocks.transactWrite.mockResolvedValue({});

    const result = await createXChallenge("user-1");

    expect(result.challenge).toMatch(/^PGPZ-[0-9A-F]{10}$/);
    expect(dynamoMocks.transactWrite).toHaveBeenCalledWith({
      TransactItems: [
        expect.objectContaining({ Put: expect.objectContaining({ Item: expect.objectContaining({ type: "SOCIAL_PROOF_CHALLENGE" }) }) }),
        expect.objectContaining({
          Put: expect.objectContaining({
            Item: expect.objectContaining({
              pk: "SOCIAL_PROOF#USER#user-1",
              sk: "CURRENT_CHALLENGE",
              status: "pending",
            }),
            ConditionExpression: expect.stringContaining("attribute_not_exists"),
          }),
        }),
      ],
    });
  });

  it("returns the winning same-provider challenge after a concurrent start", async () => {
    dynamoMocks.get.mockResolvedValue({
      Item: { membershipStatus: "none", accountStatus: "active" },
    });
    dynamoMocks.query
      .mockResolvedValueOnce({ Items: [] })
      .mockResolvedValueOnce({ Items: [pendingChallenge] });
    dynamoMocks.transactWrite.mockRejectedValueOnce(
      Object.assign(new Error("lost race"), { name: "TransactionCanceledException" }),
    );

    await expect(createXChallenge("user-1")).resolves.toMatchObject({
      challengeId: "challenge-1",
      challenge: "PGPZ-ABC123",
    });
  });

  it("verifies a ZcashMe dry run without reading or writing PGPZ records", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        username: "canary",
        address: "u1testaddress",
        links: [{
          platform: "pgpz",
          label: "PGPZ-0123456789",
          url: "https://community.example.test/challenge/PGPZ-0123456789",
        }],
      }), { status: 200, headers: { "Content-Type": "application/json" } }),
    ));

    await expect(verifyZcashMeDryRun({
      username: "canary",
      challenge: "PGPZ-0123456789",
    })).resolves.toEqual({
      ok: true,
      username: "canary",
      profileUrl: "https://zcash.example.test/canary",
      challenge: "PGPZ-0123456789",
    });
    expect(dynamoMocks.get).not.toHaveBeenCalled();
    expect(dynamoMocks.query).not.toHaveBeenCalled();
    expect(dynamoMocks.transactWrite).not.toHaveBeenCalled();
    expect(notificationMocks.send).not.toHaveBeenCalled();
  });

  it("notifies administrators after a successful X membership transaction", async () => {
    dynamoMocks.query
      .mockResolvedValueOnce({ Items: [pendingChallenge] })
      .mockResolvedValueOnce({ Items: [] });
    dynamoMocks.get
      .mockResolvedValueOnce({ Item: { membershipStatus: "none", accountStatus: "active" } })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});
    dynamoMocks.transactWrite.mockResolvedValue({});

    const result = await verifyXProof("user-1", "https://x.com/verified/status/12345");

    expect(result).toMatchObject({
      status: "verified",
      handle: "@verified",
      postId: "12345",
    });
    expect(dynamoMocks.transactWrite).toHaveBeenCalledTimes(1);
    expect(notificationMocks.send).toHaveBeenCalledWith({
      type: "successful_join",
      memberUserId: "user-1",
      occurredAt: result.verifiedAt,
      method: "self_verification",
      provider: "x",
      proofUrl: "https://x.com/verified/status/12345",
    });
  });

  it("does not notify when the X membership transaction fails", async () => {
    dynamoMocks.query
      .mockResolvedValueOnce({ Items: [pendingChallenge] })
      .mockResolvedValueOnce({ Items: [] });
    dynamoMocks.get
      .mockResolvedValueOnce({ Item: { membershipStatus: "none", accountStatus: "active" } })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});
    dynamoMocks.transactWrite.mockRejectedValueOnce(
      Object.assign(new Error("duplicate"), { name: "TransactionCanceledException" }),
    );

    await expect(
      verifyXProof("user-1", "https://x.com/verified/status/12345"),
    ).rejects.toMatchObject({ status: 409 });
    expect(notificationMocks.send).not.toHaveBeenCalled();
  });

  it("keeps a successful X activation successful when notification dispatch fails", async () => {
    dynamoMocks.query
      .mockResolvedValueOnce({ Items: [pendingChallenge] })
      .mockResolvedValueOnce({ Items: [] });
    dynamoMocks.get
      .mockResolvedValueOnce({ Item: { membershipStatus: "none", accountStatus: "active" } })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});
    dynamoMocks.transactWrite.mockResolvedValue({});
    notificationMocks.send.mockRejectedValueOnce(new Error("Background job dispatch unavailable"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      verifyXProof("user-1", "https://x.com/verified/status/12345"),
    ).resolves.toMatchObject({ status: "verified", handle: "@verified" });
    expect(dynamoMocks.transactWrite).toHaveBeenCalledTimes(1);
    expect(notificationMocks.send).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });
});
