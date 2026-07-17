import { describe, expect, it, vi } from "vitest";
import { parseSiteConfig } from "../index";
import {
  assertMembershipModeAlignment,
  defineServerConfig,
  parseServerConfig,
  resolveActiveMembership,
  type MembershipAdapter,
  type ServerConfig,
} from "./index";

const adapter = (mode: MembershipAdapter["mode"]): MembershipAdapter => ({
  mode,
  async resolve(subject) {
    return { active: subject.email === "active@example.test", reason: "fixture" };
  },
});

const validServerInput = (mode: MembershipAdapter["mode"] = "admin-approved") => ({
  dynamodb: {
    client: { send: vi.fn() },
    tableName: "ReferenceTable",
    partitions: { zecShelf: "REFERENCE_ZEC_SHELF" },
  },
  email: {
    transport: { sendMail: vi.fn() },
    from: "Reference Site <hello@example.test>",
  },
  auth: {
    secret: "ci-only-reference-secret-at-least-32-characters",
    baseUrl: "http://localhost:3000",
    trustedOrigins: ["http://localhost:3000"],
    adapter: { id: "injected-auth-adapter" },
  },
  storage: {
    client: { send: vi.fn() },
    bucket: "reference-fixtures",
    prefix: "/reference/content/",
  },
  membership: { adapter: adapter(mode) },
});

const siteForMode = (membershipMode: MembershipAdapter["mode"]) =>
  parseSiteConfig({
    name: "Reference",
    canonicalUrl: "http://localhost:3000",
    logo: { src: "/logo.svg", alt: "Reference" },
    colors: {
      primary: "black",
      secondary: "gray",
      accent: "green",
      background: "white",
      foreground: "black",
    },
    navigation: [],
    legal: { entityName: "Reference", termsUrl: "/terms", privacyUrl: "/privacy" },
    membershipMode,
    features: { updates: false, newsletters: false, memberDirectory: false, zecShelf: false },
  });

describe("ServerConfig", () => {
  it("validates generic injected resources without reading environment variables", () => {
    const input = validServerInput();
    const parsed = parseServerConfig(input);

    expect(parsed.dynamodb.tableName).toBe("ReferenceTable");
    expect(parsed.dynamodb.client).toBe(input.dynamodb.client);
    expect(parsed.storage.prefix).toBe("reference/content");
    expect(parsed.membership.adapter.mode).toBe("admin-approved");
  });

  it("preserves typed injected clients through defineServerConfig", () => {
    const config = defineServerConfig(validServerInput() as unknown as ServerConfig);
    expect(config.auth.adapter).toEqual({ id: "injected-auth-adapter" });
  });

  it.each(["admin-approved", "invitation-only", "externally-managed"] as const)(
    "aligns the %s adapter with the public membership mode",
    (mode) => {
      const server = parseServerConfig(validServerInput(mode));
      expect(() => assertMembershipModeAlignment(siteForMode(mode), server)).not.toThrow();
    },
  );

  it("rejects a public/server membership mode mismatch", () => {
    const server = parseServerConfig(validServerInput("invitation-only"));
    expect(() => assertMembershipModeAlignment(siteForMode("admin-approved"), server)).toThrow(
      "does not match",
    );
  });

  it("executes an adapter through a validated, normalized membership contract", async () => {
    const resolve = vi.fn(async (subject) => ({
      active: subject.email === "active@example.test",
      attributes: { source: "fixture" },
    }));
    const membershipAdapter: MembershipAdapter = { mode: "externally-managed", resolve };

    await expect(
      resolveActiveMembership(membershipAdapter, { email: " ACTIVE@EXAMPLE.TEST " }),
    ).resolves.toEqual({ active: true, attributes: { source: "fixture" } });
    expect(resolve).toHaveBeenCalledWith({ email: "active@example.test" });
  });

  it("rejects malformed membership subjects and adapter results", async () => {
    await expect(resolveActiveMembership(adapter("admin-approved"), {})).rejects.toThrow(
      "requires an id or email",
    );
    await expect(
      resolveActiveMembership(
        { mode: "admin-approved", resolve: async () => ({ active: "yes" } as never) },
        { id: "member-1" },
      ),
    ).rejects.toThrow("active boolean");
  });

  it("rejects missing secrets, resources, and branded or unknown server fields", () => {
    expect(() =>
      parseServerConfig({
        ...validServerInput(),
        auth: { ...validServerInput().auth, secret: "too-short" },
        dynamodb: { tableName: "NextAuth", client: null },
        NEXTAUTH_TABLE: "must-not-be-a-core-convention",
      }),
    ).toThrow(/at least 32 characters/);

    try {
      parseServerConfig({
        ...validServerInput(),
        auth: { ...validServerInput().auth, secret: "too-short" },
        dynamodb: { tableName: "Reference", client: null },
        NEXTAUTH_TABLE: "forbidden",
      });
    } catch (error) {
      expect(String(error)).toContain("server.NEXTAUTH_TABLE is not a supported configuration field");
      expect(String(error)).toContain("server.dynamodb.client must be an injected object or function");
    }
  });

  it("requires trusted origins to be origins rather than path URLs", () => {
    expect(() =>
      parseServerConfig({
        ...validServerInput(),
        auth: {
          ...validServerInput().auth,
          trustedOrigins: ["https://reference.example.test/callback"],
        },
      }),
    ).toThrow("must contain an origin without a path");
  });
});
