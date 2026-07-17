import { describe, expect, it, vi } from "vitest";
import type { ZecShelfResource } from "../domain";
import { createZecShelfChecker, type ZecShelfResolvedPage } from "./checker";
import type { ZecShelfRepository } from "./repository";

const RESOURCE: ZecShelfResource = {
  id: "resource",
  title: "Resource",
  url: "https://resource.example/",
  description: "Resource description",
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

function repositoryWithSave(saveCheckResult = vi.fn()) {
  return {
    saveCheckResult,
  } as unknown as ZecShelfRepository;
}

describe("ZEC Shelf checker contract", () => {
  it("records a baseline and an allowlisted Microlink preview through a pinned address", async () => {
    const saveCheckResult = vi.fn();
    const pageFetchImpl = vi.fn(async (target: ZecShelfResolvedPage) => {
      expect(target.url.toString()).toBe(RESOURCE.url);
      expect(target).toMatchObject({ address: "93.184.216.34", family: 4 });
      return new Response("<html><body>Stable page</body></html>", { status: 200 });
    });
    const previewFetchImpl = vi.fn(async () => {
      return Response.json({ data: { screenshot: { url: "https://cdn.microlink.io/preview.jpg" } } });
    }) as typeof fetch;
    const checker = createZecShelfChecker({
      repository: repositoryWithSave(saveCheckResult),
      pageFetchImpl,
      previewFetchImpl,
      resolve4: async () => ["93.184.216.34"],
      resolve6: async () => [],
      now: () => "2026-07-17T02:00:00.000Z",
    });

    await expect(checker.checkOne(RESOURCE)).resolves.toMatchObject({
      id: "resource",
      ok: true,
      state: "baseline",
      previewRefreshed: true,
    });
    expect(saveCheckResult).toHaveBeenCalledWith(expect.objectContaining({
      checkState: "baseline",
      lastCheckedAt: "2026-07-17T02:00:00.000Z",
      lastHttpStatus: 200,
      previewUrl: "https://cdn.microlink.io/preview.jpg",
    }));
    expect(pageFetchImpl).toHaveBeenCalledOnce();
    expect(previewFetchImpl).toHaveBeenCalledOnce();
  });

  it("rejects hostnames resolving to private addresses before fetching", async () => {
    const saveCheckResult = vi.fn();
    const pageFetchImpl = vi.fn();
    const previewFetchImpl = vi.fn() as typeof fetch;
    const checker = createZecShelfChecker({
      repository: repositoryWithSave(saveCheckResult),
      pageFetchImpl,
      previewFetchImpl,
      resolve4: async () => ["127.0.0.1"],
      resolve6: async () => [],
      now: () => "2026-07-17T02:00:00.000Z",
    });

    await expect(checker.checkOne(RESOURCE)).resolves.toMatchObject({
      id: "resource",
      ok: false,
      error: "Only public HTTPS pages can be checked.",
    });
    expect(pageFetchImpl).not.toHaveBeenCalled();
    expect(previewFetchImpl).not.toHaveBeenCalled();
    expect(saveCheckResult).toHaveBeenCalledWith(expect.objectContaining({
      checkState: "error",
      lastHttpStatus: null,
    }));
  });

  it("uses the validated address without performing a second DNS resolution", async () => {
    const resolve4 = vi.fn()
      .mockResolvedValueOnce(["93.184.216.34"])
      .mockResolvedValueOnce(["127.0.0.1"]);
    const pageFetchImpl = vi.fn(async (target: ZecShelfResolvedPage) => {
      expect(target.address).toBe("93.184.216.34");
      return new Response("stable", { status: 200 });
    });
    const checker = createZecShelfChecker({
      repository: repositoryWithSave(),
      pageFetchImpl,
      previewFetchImpl: vi.fn(async () => Response.json({
        data: { screenshot: { url: "https://cdn.microlink.io/preview.jpg" } },
      })) as typeof fetch,
      resolve4,
      resolve6: async () => [],
    });

    await expect(checker.checkOne(RESOURCE)).resolves.toMatchObject({ ok: true });
    expect(resolve4).toHaveBeenCalledOnce();
    expect(pageFetchImpl).toHaveBeenCalledOnce();
  });

  it("revalidates every redirect and refuses a redirect that resolves privately", async () => {
    const pageFetchImpl = vi.fn(async () => new Response(null, {
      status: 302,
      headers: { Location: "https://private.example/admin" },
    }));
    const checker = createZecShelfChecker({
      repository: repositoryWithSave(),
      pageFetchImpl,
      previewFetchImpl: vi.fn() as typeof fetch,
      resolve4: async (hostname) => hostname === "resource.example"
        ? ["93.184.216.34"]
        : ["10.0.0.5"],
      resolve6: async () => [],
    });

    await expect(checker.checkOne(RESOURCE)).resolves.toMatchObject({
      ok: false,
      error: "Only public HTTPS pages can be checked.",
    });
    expect(pageFetchImpl).toHaveBeenCalledOnce();
  });
});
