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
    primary: "#0D1F20",
    secondary: "#475569",
    accent: "#F5A800",
    background: "#F6FAF2",
    foreground: "#102827",
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
