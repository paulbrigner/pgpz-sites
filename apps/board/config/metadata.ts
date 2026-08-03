import type { Metadata, Viewport } from "next";
import { BOARD_CANONICAL_URL } from "./site";

export const boardMetadata: Metadata = {
  metadataBase: new URL(BOARD_CANONICAL_URL),
  title: {
    default: "PGPZ Board",
    template: "%s | PGPZ Board",
  },
  description:
    "Private portal for the PGPZ Board of Directors. Authorized members only.",
  alternates: { canonical: BOARD_CANONICAL_URL },
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
};

export const boardViewport: Viewport = {
  themeColor: "#F6F7F2",
  colorScheme: "light",
};
