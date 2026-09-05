import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getMemberAccess: vi.fn(),
  getResources: vi.fn(),
  isMemberPreviewRequest: vi.fn(),
  redirect: vi.fn((url: string): never => { throw new Error(`REDIRECT:${url}`); }),
}));
vi.mock("@/lib/member-access", () => ({ getMemberAccess: mocks.getMemberAccess }));
vi.mock("@/lib/zec-shelf-server", () => ({ communityZecShelfRepository: { getResources: mocks.getResources } }));
vi.mock("@/lib/admin/member-preview-server", () => ({ isMemberPreviewRequest: mocks.isMemberPreviewRequest }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import ZecShelfPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isMemberPreviewRequest.mockResolvedValue(false);
  mocks.getResources.mockResolvedValue([
    { id: "guide", title: "Learning guide", url: "https://example.com/guide", description: "A guide", category: "Learning", position: 0, checkState: "unchecked" },
    { id: "tool", title: "Other tool", url: "https://example.com/tool", description: "A tool", category: "Tools", position: 1, checkState: "unchecked" },
  ]);
});

describe("ZEC Shelf shared category links", () => {
  it.each(["Learning", "Research & Media"])("preserves %s through the sign-in callback", async (category) => {
    mocks.getMemberAccess.mockResolvedValue({ authenticated: false, user: null });
    await expect(ZecShelfPage({ searchParams: Promise.resolve({ category }) })).rejects.toThrow("REDIRECT:");
    const destination = new URL(mocks.redirect.mock.calls[0][0], "https://community.pgpz.org");
    const callback = new URL(destination.searchParams.get("callbackUrl")!, destination.origin);
    expect(destination.pathname).toBe("/signin");
    expect(callback.pathname).toBe("/zec-shelf");
    expect(callback.searchParams.get("category")).toBe(category);
    expect(mocks.getResources).not.toHaveBeenCalled();
  });

  it("keeps the existing unfiltered sign-in destination", async () => {
    mocks.getMemberAccess.mockResolvedValue({ authenticated: false, user: null });
    await expect(ZecShelfPage({})).rejects.toThrow("REDIRECT:");
    expect(mocks.redirect).toHaveBeenCalledWith("/signin?callbackUrl=%2Fzec-shelf");
  });

  it("renders the requested category on the server for active members", async () => {
    mocks.getMemberAccess.mockResolvedValue({ authenticated: true, user: { membershipStatus: "active", isAdmin: false } });
    const markup = renderToStaticMarkup(await ZecShelfPage({ searchParams: Promise.resolve({ category: "Learning" }) }));
    expect(markup).toContain("Learning guide");
    expect(markup).not.toContain("Other tool");
  });

  it("retains the membership requirement for shared links", async () => {
    mocks.getMemberAccess.mockResolvedValue({ authenticated: true, user: { membershipStatus: "pending", isAdmin: false } });
    const markup = renderToStaticMarkup(await ZecShelfPage({ searchParams: Promise.resolve({ category: "Learning" }) }));
    expect(markup).toContain("Membership required");
    expect(mocks.getResources).not.toHaveBeenCalled();
  });
});
