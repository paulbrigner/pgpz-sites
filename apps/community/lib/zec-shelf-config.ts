import type { ZecShelfClientConfig, ZecShelfSeedResource } from "@pgpz/zec-shelf";

export const COMMUNITY_ZEC_SHELF_PARTITION_KEY = "ZEC_SHELF";

export const COMMUNITY_ZEC_SHELF_INITIAL_RESOURCES = [
  {
    id: "zcash-community",
    title: "Zcash Community",
    url: "https://www.zcashcommunity.com/",
    description: "An independent community hub for Zcash education, wallets, mining guides, developer resources, projects, and news.",
    category: "Community",
  },
  {
    id: "zcash-ecosystem",
    title: "Zcash Ecosystem",
    url: "https://z.cash/ecosystem/",
    description: "The official directory of wallets, exchanges, builders, explorers, contributors, payment tools, and other Zcash projects.",
    category: "Official",
  },
  {
    id: "cipherscan",
    title: "CipherScan",
    url: "https://cipherscan.app/",
    description: "A privacy-first Zcash block explorer with live blocks, transactions, shielded-pool activity, privacy scores, and network health.",
    category: "Explorers",
  },
  {
    id: "zec-stats",
    title: "ZEC Stats",
    url: "https://zecstats.com/",
    description: "A deep analytics dashboard for ZEC markets, shielded adoption, network activity, supply, hashrate, liquidity, and long-range trends.",
    category: "Analytics",
  },
  {
    id: "scifi-money",
    title: "SCIFI.MONEY",
    url: "https://scifi.money/",
    description: "A curated collection of writing, podcasts, and videos about Zcash, privacy, freedom, and the encrypted-money thesis.",
    category: "Research & Media",
  },
  {
    id: "mastering-zcash",
    title: "Mastering Zcash",
    url: "https://maxdesalle.com/mastering-zcash/",
    description: "Maxime Desalle's comprehensive study of private money, covering Zcash history, mechanics, privacy philosophy, economics, comparisons, and the road ahead.",
    category: "Learning",
  },
  {
    id: "perfect-money",
    title: "Perfect Money",
    url: "https://github.com/perfect-money/perfect-money-book",
    description: "The free source repository, PDF, and EPUB for Frank Michael Porter's book on financial surveillance, zero-knowledge proofs, and Zcash.",
    category: "Learning",
  },
] as const satisfies readonly ZecShelfSeedResource[];

export const COMMUNITY_ZEC_SHELF_CLIENT_CONFIG = {
  apiBasePath: "/api/zec-shelf",
  title: "ZEC Shelf",
  heroEyebrow: "Member resource library",
  description: "A curated home for useful Zcash websites, tools, research, and references.",
  collectionEyebrow: "The collection",
  collectionTitle: "Resource library",
  curatedForLabel: "Curated for PGPZ Community members",
  suggestedCategories: [
    "Community",
    "Official",
    "Explorers",
    "Analytics",
    "Research & Media",
    "Learning",
    "Development",
    "Wallets & Payments",
    "Other",
  ],
  defaultCategory: "Community",
  fallbackPreviewByResourceId: {
    "zcash-community": {
      url: "https://www.zcashcommunity.com/",
      src: "/zec-shelf/zcash-community.png",
    },
    "zcash-ecosystem": {
      url: "https://z.cash/ecosystem/",
      src: "/zec-shelf/zcash-ecosystem.png",
    },
    cipherscan: {
      url: "https://cipherscan.app/",
      src: "/zec-shelf/cipherscan.png",
    },
    "zec-stats": {
      url: "https://zecstats.com/",
      src: "/zec-shelf/zec-stats.png",
    },
    "scifi-money": {
      url: "https://scifi.money/",
      src: "/zec-shelf/scifi-money.png",
    },
    "mastering-zcash": {
      url: "https://maxdesalle.com/mastering-zcash/",
      src: "/zec-shelf/mastering-zcash.png",
    },
    "perfect-money": {
      url: "https://github.com/perfect-money/perfect-money-book",
      src: "/zec-shelf/perfect-money.png",
    },
  },
  theme: {
    ink: "#1E1E1E",
    secondary: "#7A5200",
    accent: "#F5A800",
    accentSoft: "#FFE6A3",
    accentSubtle: "rgba(245, 168, 0, 0.14)",
    accentText: "#7A5200",
    ice: "#FFF9EA",
    teal: "#1F6F68",
    surface: "linear-gradient(135deg, rgba(255, 230, 163, 0.32), rgba(255, 255, 255, 0.88))",
    focusRing: "rgba(245, 168, 0, 0.24)",
    overlay: "rgba(23, 19, 10, 0.72)",
    heroBackground: "linear-gradient(125deg, #17130A 0%, #2A2111 48%, #7A5200 100%)",
    heroBorder: "rgba(245, 168, 0, 0.28)",
  },
  heroClassName: "community-hero",
  heroFrameClassName: "community-hero__frame",
} as const satisfies ZecShelfClientConfig;
