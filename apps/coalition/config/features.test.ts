import { describe, expect, it } from "vitest";
import {
  isFeatureEnabled,
  siteFeatures,
} from "./features";

describe("Coalition feature registration", () => {
  it("enables managed public files alongside Coalition's existing features", () => {
    expect(siteFeatures).toEqual({
      updates: true,
      newsletters: true,
      memberDirectory: true,
      zecShelf: false,
      publicFiles: true,
    });
    expect(isFeatureEnabled("publicFiles")).toBe(true);
  });
});
