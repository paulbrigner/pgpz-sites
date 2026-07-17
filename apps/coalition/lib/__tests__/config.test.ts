import { describe, expect, it } from "vitest";
import { DEFAULT_SITE_URL, resolveSiteUrl } from "@/lib/config";

describe("resolveSiteUrl", () => {
  it("uses the configured public site URL", () => {
    expect(
      resolveSiteUrl({
        nextPublicSiteUrl: "https://coalition.pgpz.org",
        nextAuthUrl: "https://localhost:3000",
        nodeEnv: "production",
      }),
    ).toBe("https://coalition.pgpz.org");
  });

  it("falls back to the coalition site when production is configured with localhost", () => {
    expect(
      resolveSiteUrl({
        nextPublicSiteUrl: "https://localhost:3000",
        nextAuthUrl: null,
        nodeEnv: "production",
      }),
    ).toBe(DEFAULT_SITE_URL);
  });

  it("allows localhost during local development", () => {
    expect(
      resolveSiteUrl({
        nextPublicSiteUrl: "http://localhost:3000",
        nextAuthUrl: null,
        nodeEnv: "development",
      }),
    ).toBe("http://localhost:3000");
  });
});
