import { describe, expect, it } from "vitest";
import { referenceMetadata } from "@/config/metadata";
import robots from "./robots";

describe("reference metadata", () => {
  it("uses the canonical reference origin and refuses indexing", () => {
    expect(referenceMetadata.metadataBase?.toString()).toBe("https://reference.pgpz.org/");
    expect(referenceMetadata.robots).toMatchObject({ index: false, follow: false, nocache: true });
    expect(referenceMetadata.openGraph).toMatchObject({
      images: [expect.objectContaining({ url: "/og.png", width: 1200, height: 630 })],
    });
    expect(robots()).toEqual({ rules: [{ userAgent: "*", disallow: "/" }] });
  });
});
