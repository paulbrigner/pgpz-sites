import {
  isSiteFeatureEnabled,
  parseSiteConfig,
  visibleSiteNavigation,
} from "@pgpz/core";
import { describe, expect, it } from "vitest";
import { BOARD_CANONICAL_URL, boardSiteConfig } from "./site";

describe("board site configuration", () => {
  it("is accepted by the shared public configuration contract", () => {
    expect(parseSiteConfig(boardSiteConfig)).toEqual(boardSiteConfig);
    expect(boardSiteConfig.canonicalUrl).toBe(BOARD_CANONICAL_URL);
    expect(boardSiteConfig.canonicalUrl).toBe("https://board.pgpz.org");
    expect(boardSiteConfig.membershipMode).toBe("externally-managed");
  });

  it("exposes only the enabled feature navigation", () => {
    expect(isSiteFeatureEnabled(boardSiteConfig, "zecShelf")).toBe(false);
    expect(isSiteFeatureEnabled(boardSiteConfig, "newsletters")).toBe(false);
    expect(visibleSiteNavigation(boardSiteConfig).map((item) => item.label)).toEqual([
      "Home",
    ]);
  });

  it("keeps every shared production feature off except the private document vault", () => {
    expect(boardSiteConfig.features).toEqual({
      personalHome: false,
      updates: false,
      newsletters: false,
      memberDirectory: false,
      zecShelf: false,
      publicFiles: false,
      letterSignons: false,
      documentVault: true,
    });
  });
});
