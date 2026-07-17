import {
  isSiteFeatureEnabled,
  parseSiteConfig,
  visibleSiteNavigation,
} from "@pgpz/core";
import { describe, expect, it } from "vitest";
import { REFERENCE_CANONICAL_URL, referenceSiteConfig } from "./site";

describe("reference site configuration", () => {
  it("is accepted by the shared public configuration contract", () => {
    expect(parseSiteConfig(referenceSiteConfig)).toEqual(referenceSiteConfig);
    expect(referenceSiteConfig.canonicalUrl).toBe(REFERENCE_CANONICAL_URL);
    expect(referenceSiteConfig.membershipMode).toBe("externally-managed");
  });

  it("exposes only the enabled feature navigation", () => {
    expect(isSiteFeatureEnabled(referenceSiteConfig, "zecShelf")).toBe(true);
    expect(isSiteFeatureEnabled(referenceSiteConfig, "newsletters")).toBe(false);
    expect(visibleSiteNavigation(referenceSiteConfig).map((item) => item.label)).toEqual([
      "Home",
      "Architecture",
      "ZEC Shelf",
    ]);
  });

  it("keeps every branded production feature off by default", () => {
    expect(referenceSiteConfig.features).toEqual({
      updates: false,
      newsletters: false,
      memberDirectory: false,
      zecShelf: true,
    });
  });
});
