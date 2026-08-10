import { describe, expect, it, vi } from "vitest";
import {
  createNewsletterRouteHandlers,
  type NewsletterRouteDependencies,
  type NewsletterRouteResponse,
} from "./newsletter-route";

function jsonResponse(
  body: unknown,
  init?: { status?: number },
): NewsletterRouteResponse {
  return {
    status: init?.status ?? 200,
    json: async () => body,
  };
}

function handlers(
  overrides: Partial<NewsletterRouteDependencies>,
) {
  return createNewsletterRouteHandlers({
    jsonResponse,
    ...overrides,
  } as NewsletterRouteDependencies);
}

describe("newsletter route handler factory", () => {
  it("adapts failed admin authorization to the existing 403 response", async () => {
    const route = handlers({
      requireAdminSession: vi.fn(async () => {
        throw new Error("forbidden");
      }),
    });

    const response = await route.GET();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Admin access required",
    });
  });

  it("preserves invalid JSON handling behind the request adapter", async () => {
    const route = handlers({
      requireAdminSession: vi.fn(async () => ({ user: { id: "admin-1" } })),
    });

    const response = await route.POST({
      headers: { get: () => null },
      json: async () => {
        throw new SyntaxError("invalid JSON");
      },
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid JSON body",
    });
  });
});
