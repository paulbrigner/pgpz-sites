import { describe, expect, it } from "vitest";
import { isFeatureEnabled, siteFeatures } from "./features";

describe("Community feature registration", () => {
  it("enables the personal member home and managed public file library", () => {
    expect(siteFeatures.personalHome).toBe(true);
    expect(isFeatureEnabled("personalHome")).toBe(true);
    expect(siteFeatures.publicFiles).toBe(true);
    expect(isFeatureEnabled("publicFiles")).toBe(true);
    expect(siteFeatures.letterSignons).toBe(false);
    expect(isFeatureEnabled("letterSignons")).toBe(false);
  });
});
