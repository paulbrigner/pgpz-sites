import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

describe("reference response headers", () => {
  it("blocks framing and restricts content to the reference origin", async () => {
    const rules = await nextConfig.headers?.();
    const headers = Object.fromEntries(
      (rules?.[0]?.headers || []).map(({ key, value }) => [key, value]),
    );

    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["Content-Security-Policy"]).toContain("default-src 'self'");
    expect(headers["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(headers["Content-Security-Policy"]).toContain("form-action 'none'");
  });
});
