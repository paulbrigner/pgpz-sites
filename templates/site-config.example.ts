import { defineSiteConfig } from "@pgpz/core";

/**
 * Client-safe configuration for a PGPZ site.
 *
 * Copy this file into an application-owned module. Never add table names,
 * credentials, auth secrets, sender credentials, or storage configuration;
 * those belong in a server-only configuration module.
 */
export const siteConfig = defineSiteConfig({
  name: "PGPZ Example",
  canonicalUrl: "https://example.pgpz.org",
  logo: {
    src: "/logo.svg",
    alt: "PGPZ Example",
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
    { label: "ZEC Shelf", href: "/zec-shelf", feature: "zecShelf" },
  ],
  legal: {
    entityName: "Replace with site operator",
    termsUrl: "/terms",
    privacyUrl: "/privacy",
    contactEmail: "replace@example.invalid",
  },
  membershipMode: "externally-managed",
  features: {
    updates: false,
    newsletters: false,
    memberDirectory: false,
    zecShelf: true,
  },
});

// Package-specific labels remain client-safe, but catalog records stay in the
// consuming application rather than this template or a shared package.
export const zecShelfPresentation = {
  eyebrow: "Example feature",
  title: "Resource library",
  description: "Application-owned content rendered by the shared ZEC Shelf package.",
  searchPlaceholder: "Search resources...",
} as const;
