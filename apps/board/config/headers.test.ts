import { describe, expect, it } from "vitest";
import {
  boardStagingUploadOrigin,
  buildBoardContentSecurityPolicy,
  default as nextConfig,
} from "../next.config";

describe("board response headers", () => {
  it("blocks framing, restricts content, and refuses indexing", async () => {
    const rules = await nextConfig.headers?.();
    const headers = Object.fromEntries(
      (rules?.[0]?.headers || []).map(({ key, value }) => [key, value]),
    );

    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["X-Robots-Tag"]).toBe("noindex, nofollow, noarchive");
    expect(headers["Referrer-Policy"]).toBe("no-referrer");
    expect(headers["Content-Security-Policy"]).toContain("default-src 'self'");
    expect(headers["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(headers["Content-Security-Policy"]).toContain("form-action 'none'");
  });

  it("allows direct uploads only to the exact Board staging bucket origin", () => {
    const stagingOrigin = boardStagingUploadOrigin(
      "pgpz-board-staging",
      "us-east-1",
    );
    const policy = buildBoardContentSecurityPolicy({
      isDevelopment: false,
      stagingUploadOrigin: stagingOrigin,
    });

    expect(stagingOrigin).toBe("https://pgpz-board-staging.s3.us-east-1.amazonaws.com");
    expect(policy).toContain(
      "connect-src 'self' https://pgpz-board-staging.s3.us-east-1.amazonaws.com",
    );
    expect(policy).not.toContain("connect-src *");
    expect(policy).not.toContain("https://*.amazonaws.com");
  });

  it("rejects unsafe staging bucket and region values", () => {
    expect(() => boardStagingUploadOrigin("bucket; connect-src *", "us-east-1")).toThrow(
      "DNS-safe bucket name",
    );
    expect(() => boardStagingUploadOrigin("pgpz-board-staging", "us-east-1; https://example.com")).toThrow(
      "valid AWS region",
    );
    expect(boardStagingUploadOrigin("", "us-east-1")).toBeNull();
  });
});
