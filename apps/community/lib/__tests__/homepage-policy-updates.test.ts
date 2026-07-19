import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPolicyUpdate: vi.fn(),
  getPublishedPolicyUpdates: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("next/cache", () => ({
  unstable_cache: (loader: () => unknown) => loader,
}));

vi.mock("@/lib/admin/policy-update-uploads", () => ({
  getPublishedPolicyUpdates: mocks.getPublishedPolicyUpdates,
}));

vi.mock("@/lib/policy-updates", () => ({
  getPolicyUpdate: mocks.getPolicyUpdate,
}));

const update = (slug: string, title: string) => ({
  slug,
  categoryLabel: "Policy update",
  title,
  shortTitle: title,
  summary: `${title} summary`,
  emailPreheader: `${title} preheader`,
  coverImage: `/${slug}.png`,
  portalPath: `/updates/${slug}`,
});

describe("Community homepage policy-update loading", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPolicyUpdate.mockImplementation((slug: string) => update(slug, `Fallback ${slug}`));
  });

  it("uses the newest published records", async () => {
    mocks.getPublishedPolicyUpdates.mockResolvedValue([
      update("published-1", "Published one"),
      update("published-2", "Published two"),
      update("published-3", "Published three"),
    ]);
    const { loadFeaturedPolicyUpdates } = await import("../homepage-policy-updates");

    await expect(loadFeaturedPolicyUpdates()).resolves.toEqual([
      update("published-1", "Published one"),
      update("published-2", "Published two"),
    ]);
  });

  it("keeps the public homepage usable when DynamoDB is unavailable", async () => {
    mocks.getPublishedPolicyUpdates.mockRejectedValue(new Error("DynamoDB unavailable"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { loadFeaturedPolicyUpdates } = await import("../homepage-policy-updates");

    const featured = await loadFeaturedPolicyUpdates();

    expect(featured).toHaveLength(2);
    expect(featured[0].slug).toBe("1H2026-us-digital-asset-policy");
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
