import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
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

afterEach(() => vi.useRealTimers());

describe("ZEC Shelf checker contract", () => {
  it("bounds stalled DNS and prevents a late resolution from starting a request", async () => {
    vi.useFakeTimers();
    let finishDns!: (addresses: string[]) => void;
    const pageFetchImpl = vi.fn();
    const saveCheckResult = vi.fn();
    const checker = createZecShelfChecker({
      repository: repositoryWithSave(saveCheckResult),
      resolve4: () => new Promise((resolve) => { finishDns = resolve; }),
      resolve6: async () => [],
      pageFetchImpl,
    });
    const pending = checker.checkOne(RESOURCE);

    await vi.advanceTimersByTimeAsync(12_000);
    await expect(pending).resolves.toMatchObject({ ok: false, error: "The site took too long to respond." });
    finishDns(["93.184.216.34"]);
    await vi.advanceTimersByTimeAsync(1);
    expect(pageFetchImpl).not.toHaveBeenCalled();
    expect(saveCheckResult).toHaveBeenCalledOnce();
  });

  it("shares the page deadline across redirects instead of restarting it", async () => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    const pageFetchImpl = vi.fn(async (_target, { signal }) => {
      signals.push(signal);
      await new Promise((resolve) => setTimeout(resolve, 7_000));
      return new Response(null, { status: 302, headers: { Location: "https://redirect.example/" } });
    });
    const checker = createZecShelfChecker({
      repository: repositoryWithSave(),
      resolve4: async () => ["93.184.216.34"],
      resolve6: async () => [],
      pageFetchImpl,
    });
    const pending = checker.checkOne(RESOURCE);

    await vi.advanceTimersByTimeAsync(12_000);
    await expect(pending).resolves.toMatchObject({ ok: false, error: "The site took too long to respond." });
    expect(pageFetchImpl).toHaveBeenCalledTimes(2);
    expect(signals[0]).toBe(signals[1]);
    expect(signals[1].aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(pageFetchImpl).toHaveBeenCalledTimes(2);
  });

  it("limits page plus preview work to 20 seconds while preserving the page check and existing preview", async () => {
    vi.useFakeTimers();
    const saveCheckResult = vi.fn();
    let previewSignal: AbortSignal | undefined;
    const checker = createZecShelfChecker({
      repository: repositoryWithSave(saveCheckResult),
      resolve4: async () => ["93.184.216.34"],
      resolve6: async () => [],
      pageFetchImpl: async () => {
        await new Promise((resolve) => setTimeout(resolve, 11_000));
        return new Response("Changed page");
      },
      previewFetchImpl: vi.fn(async (_url, init) => {
        previewSignal = init?.signal as AbortSignal;
        return new Promise<Response>(() => {});
      }) as typeof fetch,
    });
    const resource = { ...RESOURCE, previewUrl: "https://cdn.microlink.io/old.jpg" };
    const pending = checker.checkOne(resource);

    await vi.advanceTimersByTimeAsync(19_999);
    expect(saveCheckResult).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toMatchObject({ ok: true, state: "baseline", previewRefreshed: false, previewError: "The preview service took too long to respond." });
    expect(previewSignal?.aborted).toBe(true);
    expect(saveCheckResult).toHaveBeenCalledWith(expect.objectContaining({ checkState: "baseline", previewUrl: resource.previewUrl }));
    expect(saveCheckResult).toHaveBeenCalledOnce();
  });
  it("records a baseline and an allowlisted Microlink preview through a pinned address", async () => {
    const saveCheckResult = vi.fn();
    const pageFetchImpl = vi.fn(async (target: ZecShelfResolvedPage) => {
      expect(target.url.toString()).toBe(RESOURCE.url);
      expect(target).toMatchObject({ address: "93.184.216.34", family: 4 });
      return new Response("<html><body>Stable page</body></html>", { status: 200 });
    });
    const previewFetchImpl = vi.fn(async (_url, init) => {
      if (init?.method === "HEAD") return new Response(null, { headers: { "content-type": "image/jpeg" } });
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
    expect(previewFetchImpl).toHaveBeenCalledTimes(2);
  });


  it("keeps an unchanged page's healthy preview without calling the capture API", async () => {
    const previewFetchImpl = vi.fn(async () => new Response(null, { headers: { "content-type": "image/jpeg" } }));
    const checker = createZecShelfChecker({
      repository: repositoryWithSave(),
      resolve4: async () => ["93.184.216.34"],
      resolve6: async () => [],
      pageFetchImpl: async () => new Response("stable"),
      previewFetchImpl,
    });
    await expect(checker.checkOne({
      ...RESOURCE,
      contentSignature: createHash("sha256").update("||stable").digest("hex"),
      previewUrl: "https://cdn.microlink.io/healthy.jpg",
    })).resolves.toMatchObject({ ok: true, state: "same", previewRefreshed: false, previewError: null });
    expect(previewFetchImpl).toHaveBeenCalledExactlyOnceWith("https://cdn.microlink.io/healthy.jpg", expect.objectContaining({
      method: "HEAD", redirect: "manual", cache: "no-store",
    }));
  });

  it.each([403, 404, 302])("repairs a missing preview (%s) even when its page is unchanged", async (status) => {
    const saveCheckResult = vi.fn();
    const previewFetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status, headers: { Location: "http://localhost/private" } }))
      .mockResolvedValueOnce(Response.json({ data: { screenshot: { url: "https://iad.microlink.io/fresh.jpg" } } }))
      .mockResolvedValueOnce(new Response(null, { headers: { "content-type": "image/jpeg" } }));
    const checker = createZecShelfChecker({
      repository: repositoryWithSave(saveCheckResult),
      resolve4: async () => ["93.184.216.34"],
      resolve6: async () => [],
      pageFetchImpl: async () => new Response("stable"),
      previewFetchImpl,
      microlinkApiKey: "test-api-key",
      now: () => "2026-09-05T12:00:00.000Z",
    });
    await expect(checker.checkOne({
      ...RESOURCE,
      contentSignature: createHash("sha256").update("||stable").digest("hex"),
      previewUrl: "https://cdn.microlink.io/expired.jpg",
    })).resolves.toMatchObject({ ok: true, state: "same", previewRefreshed: true, previewError: null });
    expect(previewFetchImpl).toHaveBeenCalledTimes(3);
    const [endpoint, init] = previewFetchImpl.mock.calls[1];
    expect(endpoint.origin).toBe("https://pro.microlink.io");
    expect(endpoint.searchParams.get("force")).toBe("true");
    expect(init.headers["x-api-key"]).toBe("test-api-key");
    for (const index of [0, 2]) {
      expect(previewFetchImpl.mock.calls[index][1]).toMatchObject({ method: "HEAD", redirect: "manual" });
      expect(previewFetchImpl.mock.calls[index][1].headers).not.toHaveProperty("x-api-key");
    }
    expect(saveCheckResult).toHaveBeenCalledWith(expect.objectContaining({
      checkState: "same", previewUrl: "https://iad.microlink.io/fresh.jpg", previewUpdatedAt: "2026-09-05T12:00:00.000Z",
    }));
  });

  it.each([
    [403, "application/xml"],
    [200, "text/html"],
    [302, "image/jpeg"],
  ])("does not save an unusable replacement image (%s, %s)", async (status, contentType) => {
    const saveCheckResult = vi.fn();
    const previewFetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockResolvedValueOnce(Response.json({ data: { screenshot: { url: "https://iad.microlink.io/unavailable.jpg" } } }))
      .mockResolvedValueOnce(new Response(null, { status, headers: { "content-type": contentType } }));
    const checker = createZecShelfChecker({
      repository: repositoryWithSave(saveCheckResult),
      resolve4: async () => ["93.184.216.34"],
      resolve6: async () => [],
      pageFetchImpl: async () => new Response("stable"),
      previewFetchImpl,
    });
    const oldPreview = { previewUrl: "https://cdn.microlink.io/old.jpg", previewUpdatedAt: "2026-07-17T00:00:00.000Z" };
    await expect(checker.checkOne({ ...RESOURCE, ...oldPreview })).resolves.toMatchObject({
      ok: true, previewRefreshed: false, previewError: "The preview service returned an unavailable image.",
    });
    expect(saveCheckResult).toHaveBeenCalledWith(expect.objectContaining(oldPreview));
  });

  it("does not probe a saved preview outside the HTTPS Microlink allowlist", async () => {
    const previewFetchImpl = vi.fn()
      .mockResolvedValueOnce(Response.json({ data: { screenshot: { url: "https://iad.microlink.io/fresh.jpg" } } }))
      .mockResolvedValueOnce(new Response(null, { headers: { "content-type": "image/jpeg" } }));
    const checker = createZecShelfChecker({
      repository: repositoryWithSave(),
      resolve4: async () => ["93.184.216.34"],
      resolve6: async () => [],
      pageFetchImpl: async () => new Response("stable"),
      previewFetchImpl,
    });
    await expect(checker.checkOne({ ...RESOURCE, previewUrl: "https://localhost/private" })).resolves.toMatchObject({ previewRefreshed: true });
    expect(previewFetchImpl).toHaveBeenCalledTimes(2);
    expect(previewFetchImpl.mock.calls[0][0].hostname).toBe("api.microlink.io");
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
