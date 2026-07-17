import type {
  ZecShelfClientConfig,
  ZecShelfResource,
} from "@pgpz/zec-shelf";

const SEEDED_AT = "2026-07-17T00:00:00.000Z";

function resource(
  id: string,
  position: number,
  title: string,
  url: string,
  description: string,
  category: string,
): ZecShelfResource {
  return {
    id,
    position,
    title,
    url,
    description,
    category,
    contentSignature: null,
    lastCheckedAt: null,
    lastChangedAt: null,
    lastHttpStatus: null,
    checkState: "unchecked",
    previewUrl: null,
    previewUpdatedAt: null,
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
  };
}

export const referenceZecShelfResources = [
  resource(
    "zcash-protocol",
    0,
    "Zcash Protocol Specification",
    "https://zips.z.cash/protocol/protocol.pdf",
    "The technical specification for the Zcash protocol, consensus rules, and privacy-preserving transaction system.",
    "Protocol",
  ),
  resource(
    "zips",
    1,
    "Zcash Improvement Proposals",
    "https://zips.z.cash/",
    "The public proposal index for changes to the Zcash protocol, standards, processes, and ecosystem conventions.",
    "Governance",
  ),
  resource(
    "zcash-docs",
    2,
    "Zcash Documentation",
    "https://zcash.readthedocs.io/",
    "Guides and references for operating Zcash software and understanding core network concepts.",
    "Documentation",
  ),
  resource(
    "zebra-book",
    3,
    "The Zebra Book",
    "https://zebra.zfnd.org/",
    "Operator and developer documentation for Zebra, the independent Rust implementation of a Zcash full node.",
    "Infrastructure",
  ),
  resource(
    "orchard-book",
    4,
    "The Orchard Book",
    "https://zcash.github.io/orchard/",
    "A developer-oriented explanation of Orchard, including its design, protocol components, and implementation guidance.",
    "Privacy Engineering",
  ),
  resource(
    "zcash-github",
    5,
    "Zcash on GitHub",
    "https://github.com/zcash",
    "Open-source repositories for Zcash protocol development, wallet libraries, tooling, and supporting specifications.",
    "Development",
  ),
] as const satisfies readonly ZecShelfResource[];

export const referenceZecShelfConfig = {
  apiBasePath: "/api/zec-shelf",
  title: "Reference ZEC Shelf",
  heroEyebrow: "Public feature package",
  description:
    "A neutral, app-owned catalog demonstrating how the shared ZEC Shelf package can be configured without Community or Coalition content.",
  collectionEyebrow: "Synthetic seed catalog",
  collectionTitle: "Open Zcash references",
  curatedForLabel: "Read-only in this non-production reference application",
  suggestedCategories: [
    "Protocol",
    "Governance",
    "Documentation",
    "Infrastructure",
    "Privacy Engineering",
    "Development",
  ],
  defaultCategory: "Documentation",
  fallbackPreviewByResourceId: {},
  theme: {
    ink: "#17242B",
    secondary: "#355C70",
    accent: "#F2C14E",
    accentSoft: "#FAE6A4",
    accentSubtle: "rgba(242, 193, 78, 0.16)",
    accentText: "#725514",
    ice: "#EEF3F2",
    teal: "#347A70",
    surface: "linear-gradient(140deg, rgba(238, 243, 242, 0.94), rgba(255, 255, 255, 0.88))",
    focusRing: "rgba(53, 92, 112, 0.28)",
    overlay: "rgba(23, 36, 43, 0.75)",
    heroBackground: "linear-gradient(125deg, #17242B 0%, #355C70 58%, #6C5B7B 100%)",
    heroBorder: "rgba(242, 193, 78, 0.3)",
  },
  heroClassName: "reference-shelf-hero",
} as const satisfies ZecShelfClientConfig;
