import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => {
  class AdminAccessError extends Error {}
  return { AdminAccessError, requireAdminSession: vi.fn() };
});
const briefingMocks = vi.hoisted(() => {
  class AdminXMonitorBriefingError extends Error {
    status: number;
    constructor(message: string, status = 400) {
      super(message);
      this.status = status;
    }
  }
  return {
    AdminXMonitorBriefingError,
    list: vi.fn(),
    create: vi.fn(),
  };
});
const enabledMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/admin/auth", () => ({
  AdminAccessError: authMocks.AdminAccessError,
  requireAdminSession: authMocks.requireAdminSession,
}));
vi.mock("@/lib/admin/x-monitor-briefings", () => ({
  AdminXMonitorBriefingError: briefingMocks.AdminXMonitorBriefingError,
  listCuratedBriefingTopics: briefingMocks.list,
  createCuratedBriefingTopic: briefingMocks.create,
}));
vi.mock("@/lib/x-monitor-public", () => ({
  isCommunityXMonitorBriefingsEnabled: enabledMock,
}));

import { GET, POST } from "./route";

describe("admin Topic Briefings route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.requireAdminSession.mockResolvedValue({ user: { id: "admin-1" } });
    enabledMock.mockReturnValue(true);
    briefingMocks.list.mockResolvedValue({ items: [] });
    briefingMocks.create.mockResolvedValue({ topic_id: "topic-1" });
  });

  it("requires an administrator before loading the server-only backend", async () => {
    authMocks.requireAdminSession.mockRejectedValueOnce(new authMocks.AdminAccessError());
    const response = await GET();

    expect(response.status).toBe(403);
    expect(briefingMocks.list).not.toHaveBeenCalled();
  });

  it("keeps the rollout gate closed for admin operations", async () => {
    enabledMock.mockReturnValueOnce(false);
    const response = await GET();

    expect(response.status).toBe(404);
    expect(briefingMocks.list).not.toHaveBeenCalled();
  });

  it("passes administrator-curated topic input through the bounded server client", async () => {
    const payload = {
      slug: "three-z-architecture",
      question: "What is the 3Z architecture and its current status?",
      order: 1,
    };
    const response = await POST(new Request("https://community.example/api/admin/x-monitor/briefings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }));

    expect(response.status).toBe(201);
    expect(briefingMocks.create).toHaveBeenCalledWith(payload);
  });
});
