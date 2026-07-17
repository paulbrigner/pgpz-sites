import { describe, expect, expectTypeOf, it } from "vitest";
import {
  ConfigValidationError,
  MEMBERSHIP_MODES,
  SITE_FEATURES,
  defineSiteConfig,
  isSiteFeatureEnabled,
  parseSiteConfig,
  visibleSiteNavigation,
  type MembershipMode,
  type SiteConfig,
} from "./index";

const validInput = () => ({
  name: "Reference Site",
  canonicalUrl: "https://reference.example.test/",
  logo: { src: "/logo.svg", alt: "Reference Site" },
  colors: {
    primary: "#111827",
    secondary: "#475569",
    accent: "#22c55e",
    background: "#ffffff",
    foreground: "#0f172a",
  },
  navigation: [
    { label: "Home", href: "/" },
    { label: "Updates", href: "/updates", feature: "updates" },
    { label: "Members", href: "/members", feature: "memberDirectory" },
    { label: "External", href: "https://example.test/about" },
  ],
  legal: {
    entityName: "Reference Organization",
    termsUrl: "/terms",
    privacyUrl: "/privacy",
    guidelinesUrl: "/guidelines",
    contactEmail: "Hello@Example.Test",
  },
  membershipMode: "admin-approved",
  features: {
    updates: true,
    newsletters: false,
    memberDirectory: false,
    zecShelf: true,
  },
});

describe("SiteConfig", () => {
  it("runtime-validates and normalizes the client-safe surface", () => {
    const parsed = parseSiteConfig(validInput());

    expect(parsed.canonicalUrl).toBe("https://reference.example.test");
    expect(parsed.legal.contactEmail).toBe("hello@example.test");
    expect(parsed.membershipMode).toBe("admin-approved");
    expect(Object.keys(parsed.features).sort()).toEqual([...SITE_FEATURES].sort());
    expect(MEMBERSHIP_MODES).toEqual([
      "admin-approved",
      "invitation-only",
      "externally-managed",
    ]);
  });

  it("preserves literal types through defineSiteConfig", () => {
    const config = defineSiteConfig(validInput() as SiteConfig);
    expectTypeOf(config).toMatchTypeOf<SiteConfig>();
    expect(config.name).toBe("Reference Site");
  });

  it("filters feature-gated navigation without changing the configured list", () => {
    const config = parseSiteConfig(validInput());

    expect(isSiteFeatureEnabled(config, "zecShelf")).toBe(true);
    expect(visibleSiteNavigation(config).map(({ label }) => label)).toEqual([
      "Home",
      "Updates",
      "External",
    ]);
    expect(config.navigation).toHaveLength(4);
  });

  it.each<MembershipMode>(["admin-approved", "invitation-only", "externally-managed"])(
    "accepts the %s membership mode",
    (membershipMode) => {
      expect(parseSiteConfig({ ...validInput(), membershipMode }).membershipMode).toBe(membershipMode);
    },
  );

  it("allows http only for local development URLs", () => {
    expect(
      parseSiteConfig({ ...validInput(), canonicalUrl: "http://localhost:3000" }).canonicalUrl,
    ).toBe("http://localhost:3000");
    expect(() => parseSiteConfig({ ...validInput(), canonicalUrl: "http://example.test" })).toThrow(
      "must use https",
    );
  });

  it("rejects omitted or mistyped feature switches", () => {
    const missing = validInput();
    delete (missing.features as Partial<typeof missing.features>).newsletters;
    expect(() => parseSiteConfig(missing)).toThrow("site.features.newsletters must be a boolean");

    expect(() =>
      parseSiteConfig({
        ...validInput(),
        features: { ...validInput().features, zecShelf: "yes" },
      }),
    ).toThrow("site.features.zecShelf must be a boolean");
  });

  it("strictly rejects server-only or unknown fields from the public config", () => {
    expect(() =>
      parseSiteConfig({
        ...validInput(),
        auth: { secret: "must-not-enter-a-client-bundle" },
      }),
    ).toThrow("site.auth is not a supported configuration field");
  });

  it("reports multiple actionable validation issues", () => {
    try {
      parseSiteConfig({
        ...validInput(),
        membershipMode: "open",
        navigation: [{ label: "", href: "javascript:alert(1)", feature: "chat" }],
        legal: { ...validInput().legal, contactEmail: "not-an-email" },
      });
      throw new Error("expected validation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigValidationError);
      expect((error as ConfigValidationError).issues).toEqual(
        expect.arrayContaining([
          expect.stringContaining("membershipMode"),
          expect.stringContaining("navigation[0].label"),
          expect.stringContaining("navigation[0].href"),
          expect.stringContaining("navigation[0].feature"),
          expect.stringContaining("contactEmail"),
        ]),
      );
    }
  });
});
