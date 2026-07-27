import { describe, expect, it } from "vitest";
import {
  isFeatureEnabled,
  siteFeatures,
} from "./features";

describe("Coalition feature registration", () => {
  it("enables managed public files alongside Coalition's existing features", () => {
    expect(siteFeatures).toEqual({
      personalHome: false,
      updates: true,
      newsletters: true,
      memberDirectory: true,
      zecShelf: false,
      publicFiles: true,
      letterSignons: true,
    });
    expect(isFeatureEnabled("publicFiles")).toBe(true);
    expect(isFeatureEnabled("letterSignons")).toBe(true);
  });
});
