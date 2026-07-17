import { describe, expect, it } from "vitest";
import {
  BETTER_AUTH_CLIENT_IP_HEADER,
  cloudFrontViewerIp,
  withTrustedBetterAuthClientIp,
  withTrustedBetterAuthRequestIp,
} from "@/lib/better-auth-client-ip";

describe("Better Auth trusted client IP handling", () => {
  it.each([
    ["198.51.100.10:46532", "198.51.100.10"],
    ["[2001:db8::1]:46532", "2001:db8::1"],
    ["2001:db8::1:46532", "2001:db8::1"],
  ])("extracts the CloudFront viewer IP from %s", (value, expected) => {
    expect(cloudFrontViewerIp(value)).toBe(expected);
  });

  it.each([
    null,
    "",
    "198.51.100.10",
    "198.51.100.10:0",
    "198.51.100.10:65536",
    "198.51.100.10:not-a-port",
    "198.51.100.10:1e2",
    " 198.51.100.10:443",
    "198.51.100.10:443, 203.0.113.9:443",
    "not-an-ip:443",
  ])("rejects an invalid CloudFront viewer address: %s", (value) => {
    expect(cloudFrontViewerIp(value)).toBeNull();
  });

  it("derives an internal header from CloudFront's immutable viewer address", () => {
    const source = new Headers({
      "cloudfront-viewer-address": "198.51.100.10:46532",
      "x-forwarded-for": "spoofed.example, 198.51.100.10, 203.0.113.5",
    });

    const result = withTrustedBetterAuthClientIp(source);

    expect(result).not.toBe(source);
    expect(result.get(BETTER_AUTH_CLIENT_IP_HEADER)).toBe("198.51.100.10");
    expect(result.get("x-forwarded-for")).toBe(
      "spoofed.example, 198.51.100.10, 203.0.113.5",
    );
  });

  it("removes a caller-supplied internal header when CloudFront did not set an address", () => {
    const source = new Headers({ [BETTER_AUTH_CLIENT_IP_HEADER]: "203.0.113.9" });

    const result = withTrustedBetterAuthClientIp(source);

    expect(result.has(BETTER_AUTH_CLIENT_IP_HEADER)).toBe(false);
  });

  it("preserves header identity when no sanitization is needed", () => {
    const source = new Headers({ cookie: "session=token" });
    expect(withTrustedBetterAuthClientIp(source)).toBe(source);
  });

  it("passes the trusted IP to Better Auth without changing the original request", async () => {
    const request = new Request("https://example.test/api/better-auth/sign-in/magic-link", {
      method: "POST",
      headers: {
        "cloudfront-viewer-address": "198.51.100.10:46532",
        "content-type": "application/json",
        cookie: "session=token",
        [BETTER_AUTH_CLIENT_IP_HEADER]: "203.0.113.9",
      },
      body: JSON.stringify({ email: "member@example.test" }),
    });

    const result = withTrustedBetterAuthRequestIp(request);

    expect(result).not.toBe(request);
    expect(result.url).toBe(request.url);
    expect(result.method).toBe("POST");
    expect(result.headers.get(BETTER_AUTH_CLIENT_IP_HEADER)).toBe("198.51.100.10");
    expect(result.headers.get("content-type")).toBe("application/json");
    expect(result.headers.get("cookie")).toBe("session=token");
    expect(request.headers.get(BETTER_AUTH_CLIENT_IP_HEADER)).toBe("203.0.113.9");
    expect(await result.json()).toEqual({ email: "member@example.test" });
  });
});
