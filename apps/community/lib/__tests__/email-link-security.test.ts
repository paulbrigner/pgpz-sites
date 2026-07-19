import { describe, expect, it } from "vitest";
import {
  buildPolicyUpdateEmailAssetPath,
  buildTrackedClickUrl,
  listUnsubscribeHeaders,
  resolveEmailTrackingSecret,
  verifyPolicyUpdateEmailAsset,
  verifyTrackedClickDestination,
} from "@/lib/email-link-security";

describe("email link security", () => {
  it("requires a dedicated tracking secret in production", () => {
    expect(() =>
      resolveEmailTrackingSecret({
        emailTrackingSecret: "",
        fallbackSecret: "another-production-secret",
        nodeEnv: "production",
      }),
    ).toThrow("EMAIL_TRACKING_SECRET is required in production");
    expect(
      resolveEmailTrackingSecret({
        emailTrackingSecret: "dedicated-secret",
        fallbackSecret: null,
        nodeEnv: "production",
      }),
    ).toBe("dedicated-secret");
  });

  it("keeps local and test environments usable without production fallback behavior", () => {
    expect(
      resolveEmailTrackingSecret({
        emailTrackingSecret: "",
        fallbackSecret: "local-auth-secret",
        nodeEnv: "test",
      }),
    ).toBe("local-auth-secret");
    expect(
      resolveEmailTrackingSecret({
        emailTrackingSecret: "",
        fallbackSecret: "",
        nodeEnv: "development",
      }),
    ).toBe("pgpz-email-tracking-development-only");
  });

  it("binds a tracked destination to its tracking record", () => {
    const built = new URL(
      buildTrackedClickUrl(
        "https://example.test",
        "tracking-1",
        "https://external.example/article",
      ),
    );
    const destination = built.searchParams.get("url")!;
    const signature = built.searchParams.get("sig");

    expect(
      verifyTrackedClickDestination({ trackingId: "tracking-1", destination, signature }),
    ).toBe(true);
    expect(
      verifyTrackedClickDestination({
        trackingId: "tracking-1",
        destination: "https://attacker.example/phish",
        signature,
      }),
    ).toBe(false);
    expect(
      verifyTrackedClickDestination({ trackingId: "tracking-2", destination, signature }),
    ).toBe(false);
  });

  it("canonicalizes root destinations before signing and rejects non-HTTP URLs", () => {
    const built = new URL(
      buildTrackedClickUrl("https://site.example", "tracking-1", "https://example.com"),
    );
    expect(built.searchParams.get("url")).toBe("https://example.com/");
    expect(() =>
      buildTrackedClickUrl("https://site.example", "tracking-1", "mailto:user@example.com"),
    ).toThrow("absolute HTTP(S) URLs");
  });

  it("creates capability URLs for email-only draft assets", () => {
    const path = buildPolicyUpdateEmailAssetPath(
      "update-1",
      "chart.png",
      "materialization-1",
    );
    const url = new URL(path, "https://example.test");
    const signature = url.searchParams.get("sig");

    expect(
      verifyPolicyUpdateEmailAsset({
        slug: "update-1",
        asset: "chart.png",
        materializationId: "materialization-1",
        signature,
      }),
    ).toBe(true);
    expect(
      verifyPolicyUpdateEmailAsset({
        slug: "update-1",
        asset: "other.png",
        materializationId: "materialization-1",
        signature,
      }),
    ).toBe(false);
    expect(
      verifyPolicyUpdateEmailAsset({
        slug: "update-1",
        asset: "chart.png",
        materializationId: "materialization-2",
        signature,
      }),
    ).toBe(false);
  });

  it("provides RFC 8058 one-click unsubscribe headers", () => {
    expect(listUnsubscribeHeaders("https://example.test/unsubscribe/1")).toEqual({
      "List-Unsubscribe": "<https://example.test/unsubscribe/1>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
    expect(listUnsubscribeHeaders(null)).toBeUndefined();
  });
});
