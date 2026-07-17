import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveAppSession: vi.fn(),
  getResources: vi.fn(),
  createResource: vi.fn(),
  updateResource: vi.fn(),
  reorderResources: vi.fn(),
  deleteResource: vi.fn(),
}));

vi.mock("@/lib/app-session", () => ({
  resolveAppSession: mocks.resolveAppSession,
}));

vi.mock("@/lib/zec-shelf-server", () => ({
  communityZecShelfRepository: {
    getResources: mocks.getResources,
    createResource: mocks.createResource,
    updateResource: mocks.updateResource,
    reorderResources: mocks.reorderResources,
    deleteResource: mocks.deleteResource,
  },
}));

const resource = {
  id: "resource-1",
  title: "Resource",
  url: "https://example.test/",
  description: "A test resource",
  category: "Learning",
};

const inactiveMembershipStatuses = ["none", "invited", "pending", null] as const;

function session(membershipStatus: string | null, isAdmin = false) {
  mocks.resolveAppSession.mockResolvedValue({
    user: { id: "user-1", membershipStatus, isAdmin },
  });
}

function expectNoRepositoryWrite() {
  expect(mocks.createResource).not.toHaveBeenCalled();
  expect(mocks.updateResource).not.toHaveBeenCalled();
  expect(mocks.reorderResources).not.toHaveBeenCalled();
  expect(mocks.deleteResource).not.toHaveBeenCalled();
}

const writeCases = [
  {
    method: "POST" as const,
    expectedStatus: 201,
    request: () => new Request("https://example.test/api/zec-shelf/resources", {
      method: "POST",
      body: JSON.stringify(resource),
    }),
    expectWrite: () => expect(mocks.createResource).toHaveBeenCalledWith(resource),
  },
  {
    method: "PATCH" as const,
    expectedStatus: 200,
    request: () => new Request("https://example.test/api/zec-shelf/resources", {
      method: "PATCH",
      body: JSON.stringify(resource),
    }),
    expectWrite: () => expect(mocks.updateResource).toHaveBeenCalledWith(resource.id, resource),
  },
  {
    method: "DELETE" as const,
    expectedStatus: 200,
    request: () => new Request(`https://example.test/api/zec-shelf/resources?id=${resource.id}`, {
      method: "DELETE",
    }),
    expectWrite: () => expect(mocks.deleteResource).toHaveBeenCalledWith(resource.id),
  },
];

describe("ZEC Shelf resource routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getResources.mockResolvedValue([resource]);
    mocks.createResource.mockResolvedValue(resource);
    mocks.updateResource.mockResolvedValue(resource);
    mocks.reorderResources.mockResolvedValue(undefined);
    mocks.deleteResource.mockResolvedValue(undefined);
  });

  describe("GET", () => {
    it("returns 401 to an unauthenticated reader", async () => {
      mocks.resolveAppSession.mockResolvedValue(null);
      const { GET } = await import("./route");

      const response = await GET(new Request("https://example.test/api/zec-shelf/resources"));

      expect(response.status).toBe(401);
      expect(mocks.getResources).not.toHaveBeenCalled();
    });

    it.each(inactiveMembershipStatuses)(
      "returns 403 to a non-active member with status %s",
      async (membershipStatus) => {
        session(membershipStatus);
        const { GET } = await import("./route");

        const response = await GET(new Request("https://example.test/api/zec-shelf/resources"));

        expect(response.status).toBe(403);
        expect(mocks.getResources).not.toHaveBeenCalled();
      },
    );

    it("allows an active member to read the configured catalog", async () => {
      session("active");
      const { GET } = await import("./route");

      const response = await GET(new Request("https://example.test/api/zec-shelf/resources"));

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ resources: [resource] });
      expect(mocks.getResources).toHaveBeenCalledOnce();
    });

    it("allows an administrator to read regardless of membership status", async () => {
      session("none", true);
      const { GET } = await import("./route");

      const response = await GET(new Request("https://example.test/api/zec-shelf/resources"));

      expect(response.status).toBe(200);
      expect(mocks.getResources).toHaveBeenCalledOnce();
    });
  });

  describe.each(writeCases)("$method", ({ method, expectedStatus, request, expectWrite }) => {
    it("returns 401 to an unauthenticated caller", async () => {
      mocks.resolveAppSession.mockResolvedValue(null);
      const routes = await import("./route");

      const response = await routes[method](request());

      expect(response.status).toBe(401);
      expectNoRepositoryWrite();
    });

    it.each(inactiveMembershipStatuses)(
      "returns 403 to a non-admin member with status %s",
      async (membershipStatus) => {
        session(membershipStatus);
        const routes = await import("./route");

        const response = await routes[method](request());

        expect(response.status).toBe(403);
        expectNoRepositoryWrite();
      },
    );

    it("returns 403 to an active non-admin member", async () => {
      session("active");
      const routes = await import("./route");

      const response = await routes[method](request());

      expect(response.status).toBe(403);
      expectNoRepositoryWrite();
    });

    it("allows an administrator regardless of membership status", async () => {
      session("none", true);
      const routes = await import("./route");

      const response = await routes[method](request());

      expect(response.status).toBe(expectedStatus);
      expectWrite();
    });
  });

  it("allows an administrator to reorder resources", async () => {
    session("none", true);
    const { PATCH } = await import("./route");

    const response = await PATCH(new Request("https://example.test/api/zec-shelf/resources", {
      method: "PATCH",
      body: JSON.stringify({ order: ["resource-2", "resource-1"] }),
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(mocks.reorderResources).toHaveBeenCalledWith(["resource-2", "resource-1"]);
    expect(mocks.updateResource).not.toHaveBeenCalled();
  });
});
