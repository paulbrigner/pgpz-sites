import type { Metadata, Viewport } from "next";
import { REFERENCE_CANONICAL_URL, referenceSiteConfig } from "./site";

export const referenceMetadata: Metadata = {
  metadataBase: new URL(REFERENCE_CANONICAL_URL),
  title: {
    default: "PGPZ Reference",
    template: "%s | PGPZ Reference",
  },
  description:
    "A non-production executable example proving that shared PGPZ packages can power an independently configured site.",
  alternates: { canonical: REFERENCE_CANONICAL_URL },
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
  openGraph: {
    type: "website",
    url: REFERENCE_CANONICAL_URL,
    siteName: referenceSiteConfig.name,
    title: "PGPZ Reference",
    description: "Neutral configuration, isolated content, and safe non-production defaults.",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "PGPZ Reference — A clean starting point for the next PGPZ site.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "PGPZ Reference",
    description: "Neutral configuration, isolated content, and safe non-production defaults.",
    images: ["/og.png"],
  },
};

export const referenceViewport: Viewport = {
  themeColor: "#F6F7F2",
  colorScheme: "light",
};
