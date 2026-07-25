import { describe, expect, it } from "vitest";
import { policyUpdateImageDisplaySizePx } from "@/lib/policy-update-images";

describe("policyUpdateImageDisplaySizePx", () => {
  it("converts authored Word image dimensions from points to CSS pixels", () => {
    expect(
      policyUpdateImageDisplaySizePx({
        displayWidthPt: 300.5581102362205,
        displayHeightPt: 319.11818897637795,
      }),
    ).toEqual({ width: 401, height: 425 });

    const precedingImage = policyUpdateImageDisplaySizePx({
      displayWidthPt: 298.3063779527559,
    });
    expect(Math.abs((precedingImage.width || 0) - 401)).toBeLessThanOrEqual(3);

    expect(
      policyUpdateImageDisplaySizePx({
        width: 600,
        height: 300,
        displayWidthPt: 300,
      }),
    ).toEqual({ width: 400, height: 200 });
  });

  it("ignores invalid or implausibly large authored dimensions", () => {
    expect(
      policyUpdateImageDisplaySizePx({
        displayWidthPt: Number.NaN,
        displayHeightPt: 2_000,
      }),
    ).toEqual({});
  });
});
