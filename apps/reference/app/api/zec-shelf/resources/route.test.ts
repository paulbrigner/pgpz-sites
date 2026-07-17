import { describe, expect, it } from "vitest";
import * as route from "./route";

describe("public reference ZEC Shelf API", () => {
  it("exports read-only HTTP handlers", () => {
    expect(Object.keys(route).sort()).toEqual(
      ["GET", "HEAD", "OPTIONS", "POST", "PATCH", "DELETE", "dynamic"].sort(),
    );
  });

  it("returns the synthetic catalog with public caching", async () => {
    const response = route.GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("allow")).toBe("GET, HEAD, OPTIONS");
    expect(response.headers.get("cache-control")).toContain("max-age=300");
    expect(body.resources).toHaveLength(6);
  });

  it.each([route.POST, route.PATCH, route.DELETE])("rejects every mutation method", async (handler) => {
    const response = handler();
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, HEAD, OPTIONS");
    await expect(response.json()).resolves.toEqual({
      error: "PGPZ Reference exposes a read-only catalog.",
    });
  });
});
