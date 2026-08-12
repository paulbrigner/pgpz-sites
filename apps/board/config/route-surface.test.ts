import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { boardSiteConfig } from "./site";

const appRoot = path.resolve(process.cwd(), "app");
const componentsRoot = path.resolve(process.cwd(), "components");
const apiRoot = path.join(appRoot, "api");

function findTsxFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "api" ? [] : findTsxFiles(absolutePath);
    }
    return entry.isFile() && entry.name.endsWith(".tsx") && !entry.name.endsWith(".test.tsx")
      ? [absolutePath]
      : [];
  });
}

function findRouteHandlers(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(root, entry.name);
    if (entry.isDirectory()) return findRouteHandlers(absolutePath);
    return entry.isFile() && entry.name === "route.ts" ? [absolutePath] : [];
  });
}

describe("private board feature surface", () => {
  it.each([
    ["updates", "updates"],
    ["newsletters", "newsletters"],
    ["memberDirectory", "members"],
    ["publicFiles", "resources"],
    ["zecShelf", "zec-shelf"],
  ] as const)("does not create a route for disabled %s", (feature, route) => {
    expect(boardSiteConfig.features[feature]).toBe(false);
    expect(existsSync(path.join(appRoot, route))).toBe(false);
  });

  it("exposes only sign-in anonymously and keeps administration server-rendered", () => {
    expect(existsSync(path.join(appRoot, "signin"))).toBe(true);
    expect(existsSync(path.join(appRoot, "signup"))).toBe(false);
    expect(existsSync(path.join(appRoot, "(portal)", "admin", "page.tsx"))).toBe(true);
    expect(existsSync(path.join(appRoot, "(portal)", "admin", "audit", "page.tsx"))).toBe(true);
    expect(existsSync(path.join(appRoot, "(portal)", "brand", "page.tsx"))).toBe(true);
    expect(existsSync(path.join(appRoot, "api", "admin", "audit", "route.ts"))).toBe(true);
  });

  it("exposes only the Better Auth, admin audit, and document vault API routes", () => {
    const routes = findRouteHandlers(apiRoot).map((route) =>
      path.relative(appRoot, route).split(path.sep).join("/"),
    );

    expect(routes.sort()).toEqual([
      "api/admin/audit/route.ts",
      "api/better-auth/[...all]/route.ts",
      "api/documents/[id]/download/route.ts",
      "api/documents/route.ts",
    ].sort());
  });

  it("keeps server-only configuration out of client components", () => {
    const clientSurfaceFiles = [...findTsxFiles(appRoot), ...findTsxFiles(componentsRoot)].filter((file) => {
      const source = readFileSync(file, "utf8");
      return source.includes('"use client"') || source.includes("'use client'");
    });
    expect(clientSurfaceFiles.length).toBeGreaterThan(0);

    for (const file of clientSurfaceFiles) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/@pgpz\/core\/server|config\/server|from "@\/lib\/auth"/);
      expect(source, file).not.toMatch(
        /NEXTAUTH_TABLE|BETTER_AUTH_SECRET|BETTER_AUTH_TRUSTED_ORIGINS/,
      );
    }
  });
});
