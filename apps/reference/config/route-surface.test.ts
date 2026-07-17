import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { referenceSiteConfig } from "./site";

const appRoot = path.resolve(process.cwd(), "app");
const componentsRoot = path.resolve(process.cwd(), "components");

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

describe("disabled reference feature surface", () => {
  it.each([
    ["updates", "updates"],
    ["newsletters", "newsletters"],
    ["memberDirectory", "members"],
  ] as const)("does not create a route for disabled %s", (feature, route) => {
    expect(referenceSiteConfig.features[feature]).toBe(false);
    expect(existsSync(path.join(appRoot, route))).toBe(false);
  });

  it.each(["admin", "signin", "signup"])("does not expose /%s", (route) => {
    expect(existsSync(path.join(appRoot, route))).toBe(false);
  });

  it("keeps server-only configuration out of layouts, pages, and shared UI", () => {
    const clientSurfaceFiles = [...findTsxFiles(appRoot), ...findTsxFiles(componentsRoot)];

    for (const file of clientSurfaceFiles) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/@pgpz\/core\/server|config\/server/);
      expect(source, file).not.toMatch(
        /DYNAMODB_TABLE|BETTER_AUTH_SECRET|BETTER_AUTH_TRUSTED_ORIGINS|EMAIL_FROM/,
      );
    }
  });
});
