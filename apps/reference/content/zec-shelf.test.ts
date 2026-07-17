import { describe, expect, it } from "vitest";
import { referenceZecShelfConfig, referenceZecShelfResources } from "./zec-shelf";

describe("reference-owned ZEC Shelf seed catalog", () => {
  it("has stable, unique ids, positions, and secure URLs", () => {
    expect(new Set(referenceZecShelfResources.map((item) => item.id)).size).toBe(
      referenceZecShelfResources.length,
    );
    expect(referenceZecShelfResources.map((item) => item.position)).toEqual(
      referenceZecShelfResources.map((_, index) => index),
    );
    for (const item of referenceZecShelfResources) {
      expect(new URL(item.url).protocol).toBe("https:");
    }
  });

  it("does not contain branded catalog or mutation configuration", () => {
    expect(referenceZecShelfConfig.apiBasePath).toBe("/api/zec-shelf");
    expect(JSON.stringify(referenceZecShelfResources)).not.toMatch(/PGPZ Community|PGPZ Coalition/);
  });
});
