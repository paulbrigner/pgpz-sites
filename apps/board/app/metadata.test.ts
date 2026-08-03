import { describe, expect, it } from "vitest";
import { boardMetadata } from "@/config/metadata";
import robots from "./robots";

describe("board metadata", () => {
  it("uses the canonical board origin and refuses indexing", () => {
    expect(boardMetadata.metadataBase?.toString()).toBe("https://board.pgpz.org/");
    expect(boardMetadata.robots).toMatchObject({ index: false, follow: false, nocache: true });
    expect(boardMetadata.alternates).toEqual({ canonical: "https://board.pgpz.org" });
    expect(robots()).toEqual({ rules: [{ userAgent: "*", disallow: "/" }] });
  });
});
