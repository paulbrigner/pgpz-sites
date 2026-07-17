import { describe, expect, it } from "vitest";
import { cleanZecShelfDraft, reorderClientResources, type ZecShelfResource } from "./domain";

const RESOURCE: ZecShelfResource = {
  id: "first",
  title: "First",
  url: "https://example.com/",
  description: "First resource",
  category: "Community",
  position: 0,
  contentSignature: null,
  lastCheckedAt: null,
  lastChangedAt: null,
  lastHttpStatus: null,
  checkState: "unchecked",
  previewUrl: null,
  previewUpdatedAt: null,
  createdAt: "2026-07-17T00:00:00.000Z",
  updatedAt: "2026-07-17T00:00:00.000Z",
};

describe("ZEC Shelf domain", () => {
  it("normalizes valid drafts and removes URL fragments", () => {
    expect(cleanZecShelfDraft({
      title: "  Example  ",
      url: "https://example.com/path#section",
      description: " Useful resource ",
      category: " Learning ",
    })).toEqual({
      title: "Example",
      url: "https://example.com/path",
      description: "Useful resource",
      category: "Learning",
    });
  });

  it("rejects insecure and incomplete drafts", () => {
    expect(() => cleanZecShelfDraft({
      title: "Example",
      url: "http://example.com",
      description: "Description",
      category: "Learning",
    })).toThrow("secure https://");
    expect(() => cleanZecShelfDraft({
      title: "",
      url: "https://example.com",
      description: "Description",
      category: "Learning",
    })).toThrow("Name is required");
  });

  it("supports every reorder destination without mutating the input", () => {
    const resources = [
      RESOURCE,
      { ...RESOURCE, id: "second", title: "Second", position: 1 },
      { ...RESOURCE, id: "third", title: "Third", position: 2 },
    ];

    expect(reorderClientResources(resources, "third", "top").map(({ id }) => id)).toEqual(["third", "first", "second"]);
    expect(reorderClientResources(resources, "first", "bottom").map(({ id }) => id)).toEqual(["second", "third", "first"]);
    expect(reorderClientResources(resources, "second", -1).map(({ id }) => id)).toEqual(["second", "first", "third"]);
    expect(reorderClientResources(resources, "second", 1).map(({ id }) => id)).toEqual(["first", "third", "second"]);
    expect(resources.map(({ id }) => id)).toEqual(["first", "second", "third"]);
  });
});
