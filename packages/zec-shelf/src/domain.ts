export type ZecShelfCheckState = "unchecked" | "baseline" | "same" | "changed" | "error";

export type ZecShelfResource = {
  id: string;
  title: string;
  url: string;
  description: string;
  category: string;
  position: number;
  contentSignature: string | null;
  lastCheckedAt: string | null;
  lastChangedAt: string | null;
  lastHttpStatus: number | null;
  checkState: ZecShelfCheckState;
  previewUrl: string | null;
  previewUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ZecShelfResourceDraft = Pick<ZecShelfResource, "title" | "url" | "description" | "category">;

export type ZecShelfSeedResource = ZecShelfResourceDraft & { id: string };

export type ZecShelfFallbackPreview = {
  /** The exact canonical resource URL this bundled preview represents. */
  url: string;
  src: string;
};

export type ZecShelfTheme = {
  ink: string;
  secondary: string;
  accent: string;
  accentSoft: string;
  accentSubtle: string;
  accentText: string;
  ice: string;
  teal: string;
  surface: string;
  focusRing: string;
  overlay: string;
  heroBackground: string;
  heroBorder: string;
};

export type ZecShelfClientConfig = {
  apiBasePath: string;
  title: string;
  heroEyebrow: string;
  description: string;
  collectionEyebrow: string;
  collectionTitle: string;
  curatedForLabel: string;
  suggestedCategories: readonly string[];
  defaultCategory: string;
  fallbackPreviewByResourceId: Readonly<Record<string, ZecShelfFallbackPreview>>;
  theme: ZecShelfTheme;
  /** Optional app-owned enhancement hooks; the package renders fully without them. */
  heroClassName?: string;
  heroFrameClassName?: string;
};

export type MoveDestination = -1 | 1 | "top" | "bottom";

export function cleanZecShelfDraft(input: Partial<ZecShelfResourceDraft>): ZecShelfResourceDraft {
  return {
    title: cleanText(input.title, "Name", 120),
    url: cleanUrl(input.url || ""),
    description: cleanText(input.description, "Description", 500),
    category: cleanText(input.category, "Category", 60),
  };
}

function cleanText(value: string | undefined, label: string, maxLength: number) {
  const cleaned = value?.trim() || "";
  if (!cleaned) throw new Error(`${label} is required.`);
  if (cleaned.length > maxLength) throw new Error(`${label} is too long.`);
  return cleaned;
}

function cleanUrl(value: string) {
  const parsed = new URL(value.trim());
  if (parsed.protocol !== "https:") throw new Error("Please use a secure https:// website address.");
  parsed.hash = "";
  return parsed.toString();
}

export function reorderClientResources(
  resources: ZecShelfResource[],
  id: string,
  destination: MoveDestination,
) {
  const index = resources.findIndex((resource) => resource.id === id);
  if (index < 0) return resources;
  const targetIndex = destination === "top"
    ? 0
    : destination === "bottom"
      ? resources.length - 1
      : index + destination;
  if (targetIndex < 0 || targetIndex >= resources.length || targetIndex === index) return resources;
  const reordered = [...resources];
  const [resource] = reordered.splice(index, 1);
  reordered.splice(targetIndex, 0, resource);
  return reordered;
}
