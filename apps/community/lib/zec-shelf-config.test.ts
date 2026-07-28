import { describe, expect, it } from "vitest";
import {
  COMMUNITY_ZEC_SHELF_CLIENT_CONFIG,
  COMMUNITY_ZEC_SHELF_INITIAL_RESOURCES,
} from "@/lib/zec-shelf-config";

describe("Community ZEC Shelf configuration", () => {
  it("registers the locally hosted How Zcash Works guide as a Learning resource", () => {
    const resource = COMMUNITY_ZEC_SHELF_INITIAL_RESOURCES.find(
      (item) => item.id === "how-zcash-works",
    );

    expect(resource).toMatchObject({
      title: "How Zcash Works",
      url: "https://community.pgpz.org/zec-shelf/how-zcash-works.html",
      category: "Learning",
    });
    expect(
      COMMUNITY_ZEC_SHELF_CLIENT_CONFIG.fallbackPreviewByResourceId["how-zcash-works"],
    ).toEqual({
      url: "https://community.pgpz.org/zec-shelf/how-zcash-works.html",
      src: "/zec-shelf/how-zcash-works.png",
    });
  });
});
