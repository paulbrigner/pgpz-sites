import {
  ConfigValidationError,
  absoluteWebUrl,
  isRecord,
  pathOrAbsoluteWebUrl,
  rejectUnknownKeys,
  requiredString,
} from "./validation";

export const MEMBERSHIP_MODES = [
  "admin-approved",
  "invitation-only",
  "externally-managed",
] as const;

export type MembershipMode = (typeof MEMBERSHIP_MODES)[number];

export const SITE_FEATURES = [
  "updates",
  "newsletters",
  "memberDirectory",
  "zecShelf",
] as const;

export type SiteFeature = (typeof SITE_FEATURES)[number];
export type FeatureSwitches = Readonly<Record<SiteFeature, boolean>>;

export type SiteLogo = Readonly<{
  src: string;
  alt: string;
}>;

export type SiteColorTokens = Readonly<{
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  foreground: string;
}>;

export type SiteNavigationItem = Readonly<{
  label: string;
  href: string;
  feature?: SiteFeature;
}>;

export type SiteLegalIdentity = Readonly<{
  entityName: string;
  termsUrl: string;
  privacyUrl: string;
  guidelinesUrl?: string;
  contactEmail?: string;
}>;

export type SiteConfig = Readonly<{
  name: string;
  canonicalUrl: string;
  logo: SiteLogo;
  colors: SiteColorTokens;
  navigation: readonly SiteNavigationItem[];
  legal: SiteLegalIdentity;
  membershipMode: MembershipMode;
  features: FeatureSwitches;
}>;

const membershipModes = new Set<string>(MEMBERSHIP_MODES);
const siteFeatures = new Set<string>(SITE_FEATURES);

export function isMembershipMode(value: unknown): value is MembershipMode {
  return typeof value === "string" && membershipModes.has(value);
}

export function isSiteFeature(value: unknown): value is SiteFeature {
  return typeof value === "string" && siteFeatures.has(value);
}

function parseLogo(value: unknown, issues: string[]): SiteLogo {
  if (!isRecord(value)) {
    issues.push("site.logo must be an object");
    return { src: "", alt: "" };
  }
  rejectUnknownKeys(value, ["src", "alt"], "site.logo", issues);
  return {
    src: pathOrAbsoluteWebUrl(value.src, "site.logo.src", issues),
    alt: requiredString(value.alt, "site.logo.alt", issues, { maxLength: 160 }),
  };
}

function parseColors(value: unknown, issues: string[]): SiteColorTokens {
  const keys = ["primary", "secondary", "accent", "background", "foreground"] as const;
  if (!isRecord(value)) {
    issues.push("site.colors must be an object");
    return { primary: "", secondary: "", accent: "", background: "", foreground: "" };
  }
  rejectUnknownKeys(value, keys, "site.colors", issues);
  return Object.fromEntries(
    keys.map((key) => [key, requiredString(value[key], `site.colors.${key}`, issues)]),
  ) as SiteColorTokens;
}

function parseFeatures(value: unknown, issues: string[]): FeatureSwitches {
  if (!isRecord(value)) {
    issues.push("site.features must be an object");
    return { updates: false, newsletters: false, memberDirectory: false, zecShelf: false };
  }
  rejectUnknownKeys(value, SITE_FEATURES, "site.features", issues);
  return Object.fromEntries(
    SITE_FEATURES.map((feature) => {
      if (typeof value[feature] !== "boolean") {
        issues.push(`site.features.${feature} must be a boolean`);
      }
      return [feature, value[feature] === true];
    }),
  ) as FeatureSwitches;
}

function parseNavigation(value: unknown, issues: string[]): SiteNavigationItem[] {
  if (!Array.isArray(value)) {
    issues.push("site.navigation must be an array");
    return [];
  }
  const seenHrefs = new Set<string>();
  return value.map((item, index) => {
    const path = `site.navigation[${index}]`;
    if (!isRecord(item)) {
      issues.push(`${path} must be an object`);
      return { label: "", href: "" };
    }
    rejectUnknownKeys(item, ["label", "href", "feature"], path, issues);
    const href = pathOrAbsoluteWebUrl(item.href, `${path}.href`, issues);
    if (href && seenHrefs.has(href)) issues.push(`${path}.href duplicates another navigation item`);
    if (href) seenHrefs.add(href);
    if (item.feature !== undefined && !isSiteFeature(item.feature)) {
      issues.push(`${path}.feature must be one of ${SITE_FEATURES.join(", ")}`);
    }
    return {
      label: requiredString(item.label, `${path}.label`, issues, { maxLength: 80 }),
      href,
      ...(isSiteFeature(item.feature) ? { feature: item.feature } : {}),
    };
  });
}

function parseLegalIdentity(value: unknown, issues: string[]): SiteLegalIdentity {
  if (!isRecord(value)) {
    issues.push("site.legal must be an object");
    return { entityName: "", termsUrl: "", privacyUrl: "" };
  }
  rejectUnknownKeys(
    value,
    ["entityName", "termsUrl", "privacyUrl", "guidelinesUrl", "contactEmail"],
    "site.legal",
    issues,
  );
  const contactEmail = value.contactEmail === undefined
    ? undefined
    : requiredString(value.contactEmail, "site.legal.contactEmail", issues).toLowerCase();
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    issues.push("site.legal.contactEmail must be a valid email address");
  }
  return {
    entityName: requiredString(value.entityName, "site.legal.entityName", issues, { maxLength: 160 }),
    termsUrl: pathOrAbsoluteWebUrl(value.termsUrl, "site.legal.termsUrl", issues),
    privacyUrl: pathOrAbsoluteWebUrl(value.privacyUrl, "site.legal.privacyUrl", issues),
    ...(value.guidelinesUrl === undefined
      ? {}
      : { guidelinesUrl: pathOrAbsoluteWebUrl(value.guidelinesUrl, "site.legal.guidelinesUrl", issues) }),
    ...(contactEmail === undefined ? {} : { contactEmail }),
  };
}

export function parseSiteConfig(input: unknown): SiteConfig {
  const issues: string[] = [];
  if (!isRecord(input)) throw new ConfigValidationError("SiteConfig", ["site must be an object"]);
  rejectUnknownKeys(
    input,
    ["name", "canonicalUrl", "logo", "colors", "navigation", "legal", "membershipMode", "features"],
    "site",
    issues,
  );

  if (!isMembershipMode(input.membershipMode)) {
    issues.push(`site.membershipMode must be one of ${MEMBERSHIP_MODES.join(", ")}`);
  }

  const parsed: SiteConfig = {
    name: requiredString(input.name, "site.name", issues, { maxLength: 120 }),
    canonicalUrl: absoluteWebUrl(input.canonicalUrl, "site.canonicalUrl", issues),
    logo: parseLogo(input.logo, issues),
    colors: parseColors(input.colors, issues),
    navigation: parseNavigation(input.navigation, issues),
    legal: parseLegalIdentity(input.legal, issues),
    membershipMode: isMembershipMode(input.membershipMode)
      ? input.membershipMode
      : "externally-managed",
    features: parseFeatures(input.features, issues),
  };

  if (issues.length) throw new ConfigValidationError("SiteConfig", issues);
  return parsed;
}

export function assertSiteConfig(input: unknown): asserts input is SiteConfig {
  parseSiteConfig(input);
}

export function defineSiteConfig<const T extends SiteConfig>(config: T): T {
  assertSiteConfig(config);
  return config;
}

export function isSiteFeatureEnabled(config: SiteConfig, feature: SiteFeature) {
  return config.features[feature];
}

export function visibleSiteNavigation(config: SiteConfig): readonly SiteNavigationItem[] {
  return config.navigation.filter(
    (item) => item.feature === undefined || isSiteFeatureEnabled(config, item.feature),
  );
}
