import {
  defineSiteConfig,
  type SiteConfig,
} from "@pgpz/core";

export const BOARD_CANONICAL_URL = "https://board.pgpz.org";

export const boardSiteConfig = defineSiteConfig({
  name: "PGPZ Board",
  canonicalUrl: BOARD_CANONICAL_URL,
  logo: {
    src: "/icon",
    alt: "PGPZ Board mark",
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
  ],
  legal: {
    entityName: "PGPZ Board of Directors",
    termsUrl: "/terms",
    privacyUrl: "/privacy",
    contactEmail: "board@pgpz.org",
  },
  membershipMode: "externally-managed",
  features: {
    personalHome: false,
    updates: false,
    newsletters: false,
    memberDirectory: false,
    zecShelf: false,
    publicFiles: false,
    letterSignons: false,
  },
} satisfies SiteConfig);
