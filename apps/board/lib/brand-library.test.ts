import { describe, expect, it } from "vitest";
import { BRAND_DOCUMENT_CATEGORY, BRAND_LIBRARY_ENTRIES } from "@/lib/brand-library";

describe("Board brand library registry", () => {
  it("keeps one curated entry for each governed record", () => {
    expect(BRAND_DOCUMENT_CATEGORY).toBe("brand-trademark");
    expect(new Set(BRAND_LIBRARY_ENTRIES.map((entry) => entry.title)).size).toBe(BRAND_LIBRARY_ENTRIES.length);
    expect(BRAND_LIBRARY_ENTRIES.filter((entry) => entry.kind === "package")).toHaveLength(2);
    expect(BRAND_LIBRARY_ENTRIES.filter((entry) => entry.kind === "guidelines")).toHaveLength(2);
  });
});
