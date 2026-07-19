import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  transactWrite: vi.fn(),
  update: vi.fn(),
  unsubscribeMemberFromEmailCategory: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/config", () => ({
  EMAIL_TRACKING_SECRET: "test-email-tracking-secret",
  EMAIL_TRACKING_SECRET_PREVIOUS: "previous-test-email-tracking-secret",
  BETTER_AUTH_SECRET: undefined,
  NEXTAUTH_SECRET: undefined,
}));
vi.mock("@/lib/dynamodb", () => ({
  TABLE_NAME: "TestTable",
  documentClient: {
    get: mocks.get,
    put: vi.fn(),
    transactWrite: mocks.transactWrite,
    update: mocks.update,
  },
}));
vi.mock("@/lib/email-preferences", () => ({
  unsubscribeMemberFromEmailCategory: mocks.unsubscribeMemberFromEmailCategory,
}));

const trackingItem = (allowedClickDestinationDigests: string[]) => ({
  trackingId: "tracking-1",
  newsletterId: "newsletter-1",
  messageType: "policy_update",
  audienceMode: "all_active_members",
  sentAt: "2026-07-19T12:00:00.000Z",
  firstClickedAt: null,
  clickCount: 0,
  allowedClickDestinationDigests,
});

describe("stored tracked-click destinations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.update.mockResolvedValue({});
    mocks.transactWrite.mockResolvedValue({});
    mocks.unsubscribeMemberFromEmailCategory.mockResolvedValue(true);
  });

  it("binds an immutable destination digest set to the tracking record", async () => {
    const { bindNewsletterTrackingDestinations } = await import("@/lib/admin/email-tracking");
    const digests = await bindNewsletterTrackingDestinations("tracking-1", [
      "https://external.example/article",
    ]);

    expect(digests).toHaveLength(1);
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        ConditionExpression:
          "attribute_exists(pk) AND attribute_not_exists(allowedClickDestinationDigests)",
        ExpressionAttributeValues: { ":digests": digests },
      }),
    );
  });

  it("records only a destination present in the stored digest set", async () => {
    const { bindNewsletterTrackingDestinations, recordNewsletterClick } = await import(
      "@/lib/admin/email-tracking"
    );
    const allowedUrl = "https://external.example/article";
    const [allowedDigest] = await bindNewsletterTrackingDestinations("tracking-1", [allowedUrl]);
    mocks.update.mockClear();
    mocks.get.mockResolvedValue({ Item: trackingItem([allowedDigest]) });

    const allowed = await recordNewsletterClick("tracking-1", allowedUrl);
    expect(allowed?.lastClickedUrl).toBe(allowedUrl);
    expect(mocks.update).toHaveBeenCalledOnce();

    mocks.update.mockClear();
    const rejected = await recordNewsletterClick(
      "tracking-1",
      "https://attacker.example/not-allowed",
    );
    expect(rejected).toBeNull();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("uses one canonical absolute HTTP(S) value for binding and recording", async () => {
    const { bindNewsletterTrackingDestinations, recordNewsletterClick } = await import(
      "@/lib/admin/email-tracking"
    );
    const [rootDigest] = await bindNewsletterTrackingDestinations("tracking-1", [
      "https://example.com",
    ]);
    mocks.update.mockClear();
    mocks.get.mockResolvedValue({ Item: trackingItem([rootDigest]) });

    const recorded = await recordNewsletterClick("tracking-1", "https://example.com/");
    expect(recorded?.lastClickedUrl).toBe("https://example.com/");

    await expect(
      bindNewsletterTrackingDestinations("tracking-2", ["mailto:user@example.com"]),
    ).rejects.toThrow("absolute HTTP(S) URLs");
  });

  it("accepts a destination digest stored before a secret rotation", async () => {
    const { recordNewsletterClick } = await import("@/lib/admin/email-tracking");
    const allowedUrl = "https://external.example/historical";
    const previousDigest = createHmac(
      "sha256",
      "previous-test-email-tracking-secret",
    )
      .update(
        JSON.stringify([
          "email-click-destination-v1",
          "tracking-1",
          allowedUrl,
        ]),
      )
      .digest("hex");
    mocks.get.mockResolvedValue({ Item: trackingItem([previousDigest]) });

    const recorded = await recordNewsletterClick("tracking-1", allowedUrl);
    expect(recorded?.lastClickedUrl).toBe(allowedUrl);
    expect(mocks.update).toHaveBeenCalledOnce();
  });

  it("unsubscribes the category stored on the tracking record", async () => {
    const { recordNewsletterUnsubscribe } = await import("@/lib/admin/email-tracking");
    mocks.get.mockResolvedValue({
      Item: {
        ...trackingItem([]),
        userId: "member-1",
        sendRunId: "send-run-1",
        unsubscribedAt: null,
      },
    });

    await recordNewsletterUnsubscribe("tracking-1");

    expect(mocks.unsubscribeMemberFromEmailCategory).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "member-1",
        category: "policy_update",
      }),
    );
    expect(mocks.unsubscribeMemberFromEmailCategory.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.transactWrite.mock.invocationCallOrder[0],
    );
    expect(mocks.transactWrite).toHaveBeenCalledWith({
      TransactItems: [
        expect.objectContaining({
          Update: expect.objectContaining({
            ConditionExpression: expect.stringContaining("attribute_not_exists(#unsubscribedAt)"),
          }),
        }),
        expect.objectContaining({
          Update: expect.objectContaining({
            Key: {
              pk: "POLICY_UPDATE_SEND#send-run-1",
              sk: "POLICY_UPDATE_SEND#send-run-1",
            },
            ExpressionAttributeNames: { "#unsubscribeCount": "unsubscribeCount" },
          }),
        }),
      ],
    });
  });

  it("leaves tracking retryable when the member preference update fails", async () => {
    const { recordNewsletterUnsubscribe } = await import("@/lib/admin/email-tracking");
    mocks.get.mockResolvedValue({
      Item: { ...trackingItem([]), userId: "member-1", unsubscribedAt: null },
    });
    mocks.unsubscribeMemberFromEmailCategory.mockRejectedValueOnce(new Error("DynamoDB unavailable"));

    await expect(recordNewsletterUnsubscribe("tracking-1")).rejects.toThrow("DynamoDB unavailable");
    expect(mocks.transactWrite).not.toHaveBeenCalled();

    mocks.unsubscribeMemberFromEmailCategory.mockResolvedValue(true);
    await expect(recordNewsletterUnsubscribe("tracking-1")).resolves.toMatchObject({
      trackingId: "tracking-1",
      unsubscribedAt: expect.any(String),
    });
    expect(mocks.transactWrite).toHaveBeenCalledOnce();
  });

  it("treats a concurrent winning unsubscribe as idempotent without a second count", async () => {
    const { recordNewsletterUnsubscribe } = await import("@/lib/admin/email-tracking");
    mocks.get
      .mockResolvedValueOnce({
        Item: {
          ...trackingItem([]),
          userId: "member-1",
          sendRunId: "send-run-1",
          unsubscribedAt: null,
        },
      })
      .mockResolvedValueOnce({
        Item: {
          ...trackingItem([]),
          userId: "member-1",
          sendRunId: "send-run-1",
          unsubscribedAt: "2026-07-19T13:00:00.000Z",
        },
      });
    const canceled = new Error("another request won");
    canceled.name = "TransactionCanceledException";
    mocks.transactWrite.mockRejectedValueOnce(canceled);

    await expect(recordNewsletterUnsubscribe("tracking-1")).resolves.toMatchObject({
      unsubscribedAt: "2026-07-19T13:00:00.000Z",
    });
    expect(mocks.transactWrite).toHaveBeenCalledOnce();
    expect(mocks.get.mock.calls[1][0]).toEqual(expect.objectContaining({ ConsistentRead: true }));
  });
});
