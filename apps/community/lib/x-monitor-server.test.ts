import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  CommunityXMonitorConfigurationError,
  proxyCommunityXMonitorRead,
  queryCommunityXMonitorSemantic,
  readCommunityXMonitorConfiguration,
} from "./x-monitor-server";

const validEnvironment = () => ({
  NEXT_PUBLIC_XMONITOR_ENABLED: "true",
  XMONITOR_READ_API_BASE_URL: "https://monitor.example/v1",
  XMONITOR_READ_CLIENT_ID: "pgpz-community",
  XMONITOR_READ_CLIENT_SECRET: "s".repeat(43),
  XMONITOR_READ_TIMEOUT_MS: "5000",
});

describe("Community X Monitor server boundary", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ items: [] })));
    for (const [key, value] of Object.entries(validEnvironment())) vi.stubEnv(key, value);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("fails closed when disabled or given partial credentials", () => {
    expect(() => readCommunityXMonitorConfiguration({
      ...validEnvironment(),
      NEXT_PUBLIC_XMONITOR_ENABLED: "false",
    })).toThrow(CommunityXMonitorConfigurationError);
    expect(() => readCommunityXMonitorConfiguration({
      ...validEnvironment(),
      XMONITOR_READ_CLIENT_SECRET: "",
    })).toThrow(CommunityXMonitorConfigurationError);
    expect(() => readCommunityXMonitorConfiguration({
      ...validEnvironment(),
      NODE_ENV: "production",
      XMONITOR_READ_API_BASE_URL: "http://monitor.example/v1",
    })).toThrow(CommunityXMonitorConfigurationError);
    expect(() => readCommunityXMonitorConfiguration({
      ...validEnvironment(),
      NODE_ENV: "development",
      XMONITOR_READ_API_BASE_URL: "http://monitor.example/v1",
    })).toThrow(CommunityXMonitorConfigurationError);
    expect(readCommunityXMonitorConfiguration({
      ...validEnvironment(),
      NODE_ENV: "development",
      XMONITOR_READ_API_BASE_URL: "http://127.0.0.1:3001/v1",
    }).baseUrl).toBe("http://127.0.0.1:3001/v1");
  });

  it("bounds the timeout without exposing credential values", () => {
    expect(readCommunityXMonitorConfiguration({
      ...validEnvironment(),
      XMONITOR_READ_TIMEOUT_MS: "999999",
    }).timeoutMs).toBe(30_000);
  });

  it("ignores inbound credentials and forwards only the configured client", async () => {
    const response = await proxyCommunityXMonitorRead(
      "feed",
      new URLSearchParams({ q: "zcash" }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [input, init] = fetchMock.mock.calls[0];
    expect(String(input)).toBe("https://monitor.example/v1/feed?q=zcash");
    const headers = new Headers(init?.headers);
    expect(headers.get("x-xmonitor-client-id")).toBe("pgpz-community");
    expect(headers.get("x-xmonitor-client-secret")).toBe("s".repeat(43));
    expect(headers.has("cookie")).toBe(false);
    expect(init?.cache).toBe("no-store");
    expect(init?.redirect).toBe("manual");
  });

  it("refuses upstream redirects", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(null, { status: 307, headers: { location: "https://evil.example/" } }),
    );
    const response = await proxyCommunityXMonitorRead(
      "feed",
    );
    expect(response.status).toBe(502);
    expect(response.headers.has("location")).toBe(false);
  });

  it("does not expose upstream credential errors to members", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json({ error: "invalid backend client secret" }, { status: 401 }),
    );
    const response = await proxyCommunityXMonitorRead("feed");
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "X Monitor upstream request failed",
    });
  });

  it("reserializes JSON and refuses a non-JSON success body", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response("<script>alert(1)</script>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );
    const response = await proxyCommunityXMonitorRead("feed");
    expect(response.status).toBe(502);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toEqual({
      error: "X Monitor upstream returned an invalid response",
    });
  });

  it("refuses paths outside the read-only allowlist", async () => {
    await expect(proxyCommunityXMonitorRead("semantic-query")).rejects.toThrow(
      "upstream path is not allowed",
    );
    await expect(proxyCommunityXMonitorRead("../health")).rejects.toThrow(
      "upstream path is not allowed",
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("posts bounded semantic queries with only the configured client credential", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({
      items: [{ status_id: "123", score: 0.8 }],
      model: "text-embedding-bge-m3",
      retrieved_count: 1,
    }));

    const response = await queryCommunityXMonitorSemantic({
      q: "privacy as a useful product feature",
      tiers: ["ecosystem"],
      themes: ["Product / ecosystem"],
      significant: true,
      limit: 999,
    });
    expect(response.next_cursor).toBeNull();
    expect(response.items).toHaveLength(1);

    const [input, init] = vi.mocked(fetch).mock.calls[0];
    expect(String(input)).toBe("https://monitor.example/v1/query/semantic");
    expect(init?.method).toBe("POST");
    expect(init?.redirect).toBe("manual");
    const headers = new Headers(init?.headers);
    expect(headers.get("x-xmonitor-client-id")).toBe("pgpz-community");
    expect(headers.get("x-xmonitor-client-secret")).toBe("s".repeat(43));
    expect(headers.has("cookie")).toBe(false);
    expect(JSON.parse(String(init?.body))).toEqual({
      query_text: "privacy as a useful product feature",
      tiers: ["ecosystem"],
      themes: ["Product / ecosystem"],
      significant: true,
      limit: 24,
    });
  });
});
