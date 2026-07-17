import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveAppSession: vi.fn(),
  getResource: vi.fn(),
  getResources: vi.fn(),
  checkMany: vi.fn(),
}));

vi.mock("@/lib/app-session", () => ({
  resolveAppSession: mocks.resolveAppSession,
}));

vi.mock("@/lib/zec-shelf-server", () => ({
  communityZecShelfRepository: {
    getResource: mocks.getResource,
    getResources: mocks.getResources,
  },
  communityZecShelfChecker: {
    checkMany: mocks.checkMany,
  },
}));

const resource = { id: "resource-1", url: "https://example.test/" };
const inactiveMembershipStatuses = ["none", "invited", "pending", null] as const;

function session(membershipStatus: string | null, isAdmin = false) {
  mocks.resolveAppSession.mockResolvedValue({
    user: { id: "user-1", membershipStatus, isAdmin },
  });
}

async function post(body: Record<string, unknown> = {}) {
  const { POST } = await import("./route");
  return POST(new Request("https://example.test/api/zec-shelf/check", {
    method: "POST",
    body: JSON.stringify(body),
  }));
}

function expectNoCheckWork() {
  expect(mocks.getResource).not.toHaveBeenCalled();
  expect(mocks.getResources).not.toHaveBeenCalled();
  expect(mocks.checkMany).not.toHaveBeenCalled();
}

describe("ZEC Shelf update-check route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getResource.mockResolvedValue(resource);
    mocks.getResources.mockResolvedValue([resource]);
    mocks.checkMany.mockResolvedValue([{ id: "resource-1", ok: true, state: "same" }]);
  });

  it("returns 401 to an unauthenticated caller", async () => {
    mocks.resolveAppSession.mockResolvedValue(null);

    expect((await post()).status).toBe(401);
    expectNoCheckWork();
  });

  it.each(inactiveMembershipStatuses)(
    "returns 403 to a non-admin member with status %s",
    async (membershipStatus) => {
      session(membershipStatus);

      expect((await post()).status).toBe(403);
      expectNoCheckWork();
    },
  );

  it("returns 403 to an active non-admin member", async () => {
    session("active");

    expect((await post()).status).toBe(403);
    expectNoCheckWork();
  });

  it("checks the complete catalog for an administrator regardless of membership status", async () => {
    session("none", true);

    const response = await post();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      results: [{ id: "resource-1", ok: true, state: "same" }],
    });
    expect(mocks.getResources).toHaveBeenCalledOnce();
    expect(mocks.getResource).not.toHaveBeenCalled();
    expect(mocks.checkMany).toHaveBeenCalledWith([resource]);
  });

  it("checks only the requested resource for an administrator", async () => {
    session("active", true);

    const response = await post({ id: "resource-1" });

    expect(response.status).toBe(200);
    expect(mocks.getResource).toHaveBeenCalledWith("resource-1");
    expect(mocks.getResources).not.toHaveBeenCalled();
    expect(mocks.checkMany).toHaveBeenCalledWith([resource]);
  });

  it("returns 404 without running a check when an id is missing", async () => {
    session("none", true);
    mocks.getResource.mockResolvedValue(null);

    const response = await post({ id: "missing" });

    expect(response.status).toBe(404);
    expect(mocks.checkMany).not.toHaveBeenCalled();
  });
});
