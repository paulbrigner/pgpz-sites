import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  AdminXMonitorBriefingError,
  createCuratedBriefingTopic,
  listCuratedBriefingTopics,
  normalizeCuratedBriefingDraftInput,
  normalizeCuratedBriefingTopicInput,
  readBriefingAdminConfiguration,
  refreshCuratedBriefingTopic,
} from "./x-monitor-briefings";

const environment = () => ({
  NODE_ENV: "production",
  XMONITOR_READ_API_BASE_URL: "https://monitor.example/v1",
  XMONITOR_READ_CLIENT_ID: "pgpz-community",
  XMONITOR_READ_CLIENT_SECRET: "r".repeat(43),
  XMONITOR_BRIEFINGS_ADMIN_CLIENT_ID: "pgpz-community-briefings-admin",
  XMONITOR_BRIEFINGS_ADMIN_CLIENT_SECRET: "m".repeat(43),
  XMONITOR_BRIEFINGS_ADMIN_TIMEOUT_MS: "15000",
});

describe("Community Topic Briefings admin boundary", () => {
  beforeEach(() => {
    for (const [key, value] of Object.entries(environment())) vi.stubEnv(key, value);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ items: [] })));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("requires a distinct, strong server-only manage credential", () => {
    expect(readBriefingAdminConfiguration(environment()).clientId)
      .toBe("pgpz-community-briefings-admin");
    expect(() => readBriefingAdminConfiguration({
      ...environment(),
      XMONITOR_BRIEFINGS_ADMIN_CLIENT_ID: "pgpz-community",
    })).toThrow("not configured");
    expect(() => readBriefingAdminConfiguration({
      ...environment(),
      XMONITOR_BRIEFINGS_ADMIN_CLIENT_SECRET: "r".repeat(43),
    })).toThrow("not configured");
    expect(() => readBriefingAdminConfiguration({
      ...environment(),
      XMONITOR_BRIEFINGS_ADMIN_CLIENT_SECRET: "short",
    })).toThrow("not configured");
  });

  it("forwards only the admin client and only to fixed curated-briefing paths", async () => {
    await listCuratedBriefingTopics();

    const [input, init] = vi.mocked(fetch).mock.calls[0];
    expect(String(input)).toBe("https://monitor.example/v1/admin/curated-briefings");
    expect(init?.method).toBe("GET");
    expect(init?.cache).toBe("no-store");
    expect(init?.redirect).toBe("manual");
    const headers = new Headers(init?.headers);
    expect(headers.get("x-xmonitor-client-id")).toBe("pgpz-community-briefings-admin");
    expect(headers.get("x-xmonitor-client-secret")).toBe("m".repeat(43));
    expect(headers.has("cookie")).toBe(false);

    expect(() => refreshCuratedBriefingTopic("../compose"))
      .toThrow(AdminXMonitorBriefingError);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("maps the administrator display order to the backend order contract", async () => {
    await createCuratedBriefingTopic({
      slug: "three-z-architecture",
      question: "What is the 3Z architecture and its current status?",
      order: 4,
      refresh_interval_minutes: 1440,
      retrieval_config: { lookback_hours: 720 },
      enabled: true,
    });

    const [input, init] = vi.mocked(fetch).mock.calls[0];
    expect(String(input)).toBe("https://monitor.example/v1/admin/curated-briefings/topics");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      slug: "three-z-architecture",
      order: 4,
    });
    expect(JSON.parse(String(init?.body))).not.toHaveProperty("display_order");
  });

  it("bounds topic and immutable editorial revision inputs", () => {
    expect(normalizeCuratedBriefingTopicInput({
      order: 8,
    }, { partial: true })).toEqual({ order: 8 });
    expect(() => normalizeCuratedBriefingTopicInput({
      display_order: 8,
    }, { partial: true })).toThrow("At least one topic field");
    expect(normalizeCuratedBriefingDraftInput({
      answer_text: "A reviewed answer.",
      key_points: ["One point"],
    })).toEqual({
      answer_text: "A reviewed answer.",
      key_points: ["One point"],
    });
    expect(() => normalizeCuratedBriefingDraftInput({ key_points: new Array(13).fill("point") }))
      .toThrow("at most 12");
  });
});
