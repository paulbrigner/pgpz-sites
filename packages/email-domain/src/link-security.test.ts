import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createEmailLinkSecurity,
  listUnsubscribeHeaders,
  resolveEmailTrackingSecret,
  resolveEmailTrackingSecrets,
  safeHttpDestination,
  signEmailTrackingValues,
  verifyEmailTrackingValues,
} from "./link-security";

const currentSecret = "current-email-tracking-secret-at-least-32-chars";
const previousSecret = "previous-email-tracking-secret-at-least-32-chars";

describe("email link security", () => {
  it("preserves production secret validation and local fallback behavior", () => {
    expect(() =>
      resolveEmailTrackingSecret({
        emailTrackingSecret: "",
        fallbackSecret: "another-production-secret",
        nodeEnv: "production",
      }),
    ).toThrow("EMAIL_TRACKING_SECRET is required in production");
    expect(
      resolveEmailTrackingSecret({
        emailTrackingSecret: "",
        fallbackSecret: "local-auth-secret",
        nodeEnv: "test",
      }),
    ).toBe("local-auth-secret");
    expect(resolveEmailTrackingSecret({ nodeEnv: "development" })).toBe(
      "pgpz-email-tracking-development-only",
    );
  });

  it("uses the current key for signing and both rotation keys for verification", () => {
    const purpose = "email-click-v1";
    const values = ["tracking-1", "https://example.test/"];
    const currentSignature = signEmailTrackingValues({
      secret: currentSecret,
      purpose,
      values,
    });
    const previousSignature = signEmailTrackingValues({
      secret: previousSecret,
      purpose,
      values,
    });

    expect(currentSignature).toMatch(/^h1\.[A-Za-z0-9_-]{12}\./);
    expect(
      verifyEmailTrackingValues({
        signature: previousSignature,
        currentSecret,
        previousSecret,
        purpose,
        values,
      }),
    ).toBe(true);
  });

  it("verifies legacy raw HMAC signatures during rotation", () => {
    const purpose = "policy-update-email-asset-v2";
    const values = ["materialization-1", "update-1", "chart.png"];
    const signature = createHmac("sha256", previousSecret)
      .update(JSON.stringify([purpose, ...values]))
      .digest("base64url");

    expect(
      verifyEmailTrackingValues({
        signature,
        currentSecret,
        previousSecret,
        purpose,
        values,
      }),
    ).toBe(true);
  });

  it("rejects duplicate rotation keys", () => {
    expect(() =>
      resolveEmailTrackingSecrets({
        currentSecret,
        previousSecret: currentSecret,
        nodeEnv: "production",
      }),
    ).toThrow("must differ");
  });

  it("creates destination-bound click and asset capabilities", () => {
    const security = createEmailLinkSecurity({ currentSecret, previousSecret });
    const click = new URL(
      security.buildTrackedClickUrl(
        "https://example.test",
        "tracking-1",
        "https://external.example/article",
      ),
    );
    const destination = click.searchParams.get("url")!;

    expect(
      security.verifyTrackedClickDestination({
        trackingId: "tracking-1",
        destination,
        signature: click.searchParams.get("sig"),
      }),
    ).toBe(true);
    expect(
      security.verifyTrackedClickDestination({
        trackingId: "tracking-1",
        destination: "https://attacker.example/phish",
        signature: click.searchParams.get("sig"),
      }),
    ).toBe(false);

    const assetPath = security.buildPolicyUpdateEmailAssetPath(
      "update-1",
      "chart.png",
      "materialization-1",
    );
    const assetUrl = new URL(assetPath, "https://example.test");
    expect(
      security.verifyPolicyUpdateEmailAsset({
        slug: "update-1",
        asset: "chart.png",
        materializationId: "materialization-1",
        signature: assetUrl.searchParams.get("sig"),
      }),
    ).toBe(true);
  });

  it("canonicalizes HTTP destinations and creates RFC 8058 headers", () => {
    expect(safeHttpDestination("https://example.com")).toBe(
      "https://example.com/",
    );
    expect(safeHttpDestination("mailto:user@example.com")).toBeNull();
    expect(
      listUnsubscribeHeaders("https://example.test/unsubscribe/1"),
    ).toEqual({
      "List-Unsubscribe": "<https://example.test/unsubscribe/1>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
  });
});
