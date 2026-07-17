import {
  defineSiteConfig,
  type SiteConfig,
} from "@pgpz/core";

export const REFERENCE_CANONICAL_URL = "https://reference.pgpz.org";

export const referenceSiteConfig = defineSiteConfig({
  name: "PGPZ Reference",
  canonicalUrl: REFERENCE_CANONICAL_URL,
  logo: {
    src: "/icon",
    alt: "PGPZ Reference mark",
  },
  colors: {
    primary: "#355C70",
    secondary: "#6C5B7B",
    accent: "#F2C14E",
    background: "#F6F7F2",
    foreground: "#17242B",
  },
  navigation: [
    { label: "Home", href: "/" },
    { label: "Architecture", href: "/architecture" },
    { label: "ZEC Shelf", href: "/zec-shelf", feature: "zecShelf" },
  ],
  legal: {
    entityName: "PGPZ Reference",
    termsUrl: "/terms",
    privacyUrl: "/privacy",
    guidelinesUrl: "/reference-notice",
    contactEmail: "admin@pgpz.org",
  },
  membershipMode: "externally-managed",
  features: {
    updates: false,
    newsletters: false,
    memberDirectory: false,
    zecShelf: true,
  },
} satisfies SiteConfig);
