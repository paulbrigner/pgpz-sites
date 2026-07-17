import { describe, expect, it } from "vitest";

describe("CI failure proof", () => {
  it("deliberately fails so required checks can be observed", () => {
    expect("blocked").toBe("allowed");
  });
});
