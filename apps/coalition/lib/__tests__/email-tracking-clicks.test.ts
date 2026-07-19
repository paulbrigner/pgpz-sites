import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/config", () => ({
  EMAIL_TRACKING_SECRET: "test-email-tracking-secret",
  BETTER_AUTH_SECRET: undefined,
  NEXTAUTH_SECRET: undefined,
}));
vi.mock("@/lib/dynamodb", () => ({
  TABLE_NAME: "TestTable",
  documentClient: {
    get: mocks.get,
    put: vi.fn(),
    update: mocks.update,
  },
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
});
