export const BRAND_DOCUMENT_CATEGORY = "brand-trademark";

export type BrandLibraryEntry = Readonly<{
  key: string;
  title: string;
  family: "identity" | "social";
  kind: "guidelines" | "package" | "governance" | "verification";
  description: string;
}>;

/**
 * Curated presentation metadata only. The corresponding file and version
 * remain owned by the Board document vault and are never copied into a second
 * storage system.
 */
export const BRAND_LIBRARY_ENTRIES: ReadonlyArray<BrandLibraryEntry> = [
  {
    key: "identity-guidelines-v4",
    title: "PGPZ Brand Guidelines — Symbol as Z — Version 4",
    family: "identity",
    kind: "guidelines",
    description: "Current identity standards for the PGPZ primary signature, wordmark, symbol, color, typography, and usage.",
  },
  {
    key: "identity-package-v4",
    title: "PGPZ Brand Package — Symbol as Z — Version 4",
    family: "identity",
    kind: "package",
    description: "Complete Version 4 identity package, including artwork, templates, tokens, fonts, guidance, and integrity records.",
  },
  {
    key: "social-guidelines-v4-companion-v1",
    title: "PGPZ Social Media Brand Guidelines — Version 4 Companion Version 1",
    family: "social",
    kind: "guidelines",
    description: "Current social-media guidance for profiles, posts, documents, video, copy, accessibility, and platform usage.",
  },
  {
    key: "social-package-v4-companion-v1",
    title: "PGPZ Social Brand Package — Version 4 Companion Version 1",
    family: "social",
    kind: "package",
    description: "Complete social companion package with production artwork, editable templates, examples, copy guidance, and integrity records.",
  },
  {
    key: "trademark-use-conditions-v4",
    title: "PGPZ Trademark Use Conditions — Version 4",
    family: "identity",
    kind: "governance",
    description: "Conditions governing use of the PGPZ and incorporated Zcash marks in the Version 4 identity system.",
  },
  {
    key: "trademark-use-checklist-social-v1",
    title: "PGPZ Social Trademark Use Checklist — Companion Version 1",
    family: "social",
    kind: "governance",
    description: "Operational checklist for applying the trademark conditions to social-media materials.",
  },
  {
    key: "identity-manifest-v4",
    title: "PGPZ Brand Package Manifest — Version 4",
    family: "identity",
    kind: "verification",
    description: "Machine-readable inventory for the Version 4 identity package.",
  },
  {
    key: "identity-checksums-v4",
    title: "PGPZ Brand Package Checksums — Version 4",
    family: "identity",
    kind: "verification",
    description: "SHA-256 checksums for verifying the contents of the Version 4 identity package.",
  },
  {
    key: "social-manifest-v4-companion-v1",
    title: "PGPZ Social Brand Package Manifest — Version 4 Companion Version 1",
    family: "social",
    kind: "verification",
    description: "Machine-readable inventory for the Version 4 social companion package.",
  },
  {
    key: "social-checksums-v4-companion-v1",
    title: "PGPZ Social Brand Package Checksums — Version 4 Companion Version 1",
    family: "social",
    kind: "verification",
    description: "SHA-256 checksums for verifying the contents of the Version 4 social companion package.",
  },
] as const;
