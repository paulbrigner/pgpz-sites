import { describe, expect, it } from "vitest";
import {
  clickDestinationDigest,
  newsletterTrackingRecordFromItem,
  normalizeTrackingId,
  openClientFingerprint,
  trackingClientInfoFromHeaders,
} from "./tracking";

describe("email tracking domain", () => {
  it("normalizes legacy pixel tracking IDs", () => {
    expect(normalizeTrackingId(" tracking-1.PNG ")).toBe("tracking-1");
  });

  it("reads proxy-aware client information", () => {
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.1, 10.0.0.1",
      "user-agent": "Example Agent",
      "accept-language": "en-US",
    });
    expect(trackingClientInfoFromHeaders(headers)).toEqual({
      ip: "203.0.113.1",
      userAgent: "Example Agent",
      acceptLanguage: "en-US",
    });
  });

  it("creates stable, privacy-preserving client fingerprints", () => {
    const secret = "test-email-tracking-secret";
    const first = openClientFingerprint(
      { ip: "203.0.113.1", userAgent: "Agent", acceptLanguage: "EN-US" },
      secret,
    );
    const second = openClientFingerprint(
      { ip: "203.0.113.1", userAgent: "Agent", acceptLanguage: "en-us" },
      secret,
    );
    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{32}$/);
    expect(openClientFingerprint({}, secret)).toBeNull();
  });

  it("normalizes persisted tracking records with backward-compatible defaults", () => {
    expect(
      newsletterTrackingRecordFromItem({
        trackingId: "tracking-1",
        newsletterId: "newsletter-1",
        messageType: "policy_update",
        audienceMode: "selected_members",
        openFingerprints: ["valid", 42],
      }),
    ).toMatchObject({
      trackingId: "tracking-1",
      newsletterId: "newsletter-1",
      messageType: "policy_update",
      audienceMode: "selected_members",
      openFingerprints: ["valid"],
      uniqueOpenClientCount: 1,
      openCount: 0,
    });
  });

  it("binds destination digests to canonical URLs and normalized IDs", () => {
    const secret = "test-email-tracking-secret";
    expect(
      clickDestinationDigest("tracking-1.png", "https://example.com", secret),
    ).toBe(
      clickDestinationDigest("tracking-1", "https://example.com/", secret),
    );
    expect(() =>
      clickDestinationDigest("tracking-1", "mailto:user@example.com", secret),
    ).toThrow("absolute HTTP(S) URLs");
  });
});
