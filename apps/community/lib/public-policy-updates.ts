import { sectionArrayOrFallback, textArrayOrFallback } from "./policy-update-content";
import { createHash } from "node:crypto";
import { getPublicPolicyUpdateUrl, getPublicPolicyUpdatePdfUrl } from "./policy-update-urls";
import { normalizePolicyUpdateSectionLayout } from "./policy-update-sections";
import { policyUpdates, policyUpdateCategoryLabels, type PolicyUpdate, type PolicyUpdateSection } from "./policy-updates";

export const PUBLIC_POLICY_ORIGIN = "https://pgpz.org";
export const LEGACY_POLICY_FILES = [
  "2026-06-08-weekly-policy-memo.pdf",
  "2026-06-08-weekly-policy-memo-cover.png",
  "1H2026-us-digital-asset-policy.pdf",
  "1H2026-us-digital-asset-policy-cover.png",
] as const;

export type PublicPolicySummary = {
  slug: string;
  category: "weekly" | "special";
  categoryLabel: string;
  title: string;
  shortTitle: string;
  publishedAt: string;
  displayDate: string;
  summary: string;
  canonicalUrl: string;
  pdfUrl: string;
  coverUrl: string;
};
export type PublicPolicyDocument = PublicPolicySummary & {
  sourceFormat?: "docx" | "legacy_pdf";
  keyTakeaways: string[];
  actionItems: string[];
  sections: PolicyUpdateSection[];
};
export type PublicPolicyMedia =
  | { kind: "s3"; bucket: string; key: string; contentType: string; fileName: string }
  | { kind: "bundled"; fileName: typeof LEGACY_POLICY_FILES[number]; contentType: string };
export type PublicPolicyEntry = {
  document: PublicPolicyDocument;
  media: Map<string, PublicPolicyMedia>;
  sortKey: string;
  revision: string;
};
export type PublicPolicyDependencies = {
  bucket: string;
  uploadPrefix: string;
  /** Must use a strongly consistent canonical-record read, never a GSI projection. */
  readRecord: (slug: string) => Promise<Record<string, unknown> | undefined>;
  listCandidateSlugs: () => Promise<string[]>;
};

const text = (value: unknown) => typeof value === "string" ? value : "";
export const isPublicPolicySlug = (slug: string) => /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(slug);
export const isPublicPolicyAsset = (asset: string) => /^[a-z0-9][a-z0-9._-]{0,180}\.(?:png|jpe?g|gif|webp)$/i.test(asset) && !asset.includes("..");
export function publicPolicyUrl(slug: string) {
  return getPublicPolicyUpdateUrl(slug);
}
export function safePolicyHttpUrl(value: unknown) {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : undefined;
  } catch { return undefined; }
}
const imageType = (name: string) => /\.svg$/i.test(name) ? "image/svg+xml" : /\.jpe?g$/i.test(name) ? "image/jpeg" : /\.gif$/i.test(name) ? "image/gif" : /\.webp$/i.test(name) ? "image/webp" : "image/png";

function legacyMedia(path: string): PublicPolicyMedia | null {
  const fileName = path.replace(/^\/resources\//, "");
  if (!(LEGACY_POLICY_FILES as readonly string[]).includes(fileName)) return null;
  return { kind: "bundled", fileName: fileName as typeof LEGACY_POLICY_FILES[number], contentType: fileName.endsWith(".pdf") ? "application/pdf" : "image/png" };
}

function sectionLinks(section: PolicyUpdateSection): PolicyUpdateSection {
  const runs = (items: NonNullable<PolicyUpdateSection["headingRuns"]> | undefined) => items?.map(({ href, ...run }) => ({ ...run, ...(safePolicyHttpUrl(href) ? { href: safePolicyHttpUrl(href) } : {}) }));
  return {
    ...section,
    headingRuns: runs(section.headingRuns),
    bodyRuns: section.bodyRuns?.map(runs) as PolicyUpdateSection["bodyRuns"],
    bulletRuns: section.bulletRuns?.map(runs) as PolicyUpdateSection["bulletRuns"],
    bodyAfterBulletsRuns: section.bodyAfterBulletsRuns?.map(runs) as PolicyUpdateSection["bodyAfterBulletsRuns"],
    links: section.links?.flatMap((link) => {
      const href = safePolicyHttpUrl(link.href);
      return href ? [{ text: link.text, href }] : [];
    }),
  };
}

export function publicPolicySummary(document: PublicPolicyDocument): PublicPolicySummary {
  const { slug, category, categoryLabel, title, shortTitle, publishedAt, displayDate, summary, canonicalUrl, pdfUrl, coverUrl } = document;
  return { slug, category, categoryLabel, title, shortTitle, publishedAt, displayDate, summary, canonicalUrl, pdfUrl, coverUrl };
}

export function createPublicPolicyService(deps: PublicPolicyDependencies) {
  if (!deps.bucket || !/^[a-z0-9][a-z0-9/._-]*[a-z0-9]$/i.test(deps.uploadPrefix) || deps.uploadPrefix.includes("..")) {
    throw new Error("Public policy storage configuration is invalid");
  }
  async function load(slug: string): Promise<PublicPolicyEntry | null> {
    if (!isPublicPolicySlug(slug)) return null;
    const legacy = policyUpdates.find((entry) => entry.slug === slug);
    const raw = legacy ? undefined : await deps.readRecord(slug);
    if (!legacy && (!raw || raw.slug !== slug || raw.visibilityStatus !== "published" || !["weekly", "special"].includes(text(raw.category)))) return null;
    const source = (legacy || raw!) as unknown as Record<string, unknown>;
    const category = source.category as "weekly" | "special";
    const canonicalUrl = publicPolicyUrl(slug);
    const media = new Map<string, PublicPolicyMedia>();
    const artifactPrefix = `${deps.uploadPrefix}/${slug}/`;
    const legacyPdfKey = `${deps.uploadPrefix}/${slug}.pdf`;
    const safeObjectKey = (key: string) => key.startsWith(artifactPrefix) && !/[\\%\x00-\x1f]/.test(key) && !key.split("/").some((part) => !part || part === "." || part === "..");
    if (legacy) {
      const pdf = legacyMedia(legacy.pdfHref);
      if (!pdf) return null;
      media.set("document.pdf", pdf);
    } else {
      if (raw!.s3Bucket !== deps.bucket || (text(raw!.s3Key) !== legacyPdfKey && !safeObjectKey(text(raw!.s3Key)))) return null;
      const pdfKey = text(raw!.pdfS3Key) || (raw!.sourceFormat !== "docx" ? text(raw!.s3Key) : "");
      if ((pdfKey !== legacyPdfKey && !safeObjectKey(pdfKey)) || !pdfKey.endsWith(".pdf")) return null;
      media.set("document.pdf", { kind: "s3", bucket: deps.bucket, key: pdfKey, contentType: "application/pdf", fileName: `${slug}.pdf` });
    }
    const resolveImage = (src: string, route: string): string | undefined => {
      const bundled = legacyMedia(src);
      if (bundled && bundled.contentType.startsWith("image/")) {
        media.set(route, bundled);
        return `${canonicalUrl}/${route}`;
      }
      let path = src;
      if (/^https?:/i.test(src)) {
        const href = safePolicyHttpUrl(src);
        if (!href) return undefined;
        const url = new URL(href);
        if (url.origin !== "https://community.pgpz.org") return undefined;
        path = url.pathname;
        if (url.search || url.hash) return undefined;
      }
      const base = `/api/policy-updates/${encodeURIComponent(slug)}/assets/`;
      if (!path.startsWith(base)) return undefined;
      const asset = path.slice(base.length);
      // Six historical generated covers are SVG. Only this exact referenced
      // filename is supported, through the sandboxed cover route.
      if (!isPublicPolicyAsset(asset) && !(route === "cover" && asset === "cover.svg")) return undefined;
      media.set(route, { kind: "s3", bucket: deps.bucket, key: `${artifactPrefix}assets/${asset}`, contentType: imageType(asset), fileName: asset });
      return `${canonicalUrl}/${route}`;
    };
    const defaultCover = category === "special" ? "/resources/1H2026-us-digital-asset-policy-cover.png" : "/resources/2026-06-08-weekly-policy-memo-cover.png";
    const coverUrl = resolveImage(text(source.coverImage), "cover") || resolveImage(defaultCover, "cover")!;
    const sections = normalizePolicyUpdateSectionLayout(sectionArrayOrFallback(source.sections, [])).map((section) => ({
      ...sectionLinks(section),
      images: section.images?.flatMap((image) => {
        const name = image.src.split("/").pop() || "";
        if (!isPublicPolicyAsset(name)) return [];
        const src = resolveImage(image.src, `assets/${name}`);
        if (!src) return [];
        const href = safePolicyHttpUrl(image.href);
        const { href: _href, ...safeImage } = image;
        return [{ ...safeImage, src, ...(href ? { href } : {}) }];
      }),
    }));
    const title = text(source.title) || slug;
    return {
      document: {
        slug, category, categoryLabel: policyUpdateCategoryLabels[category], title,
        shortTitle: text(source.shortTitle) || title,
        publishedAt: text(source.publishedAt), displayDate: text(source.displayDate) || text(source.publishedAt),
        summary: text(source.summary), canonicalUrl, pdfUrl: getPublicPolicyUpdatePdfUrl(slug), coverUrl,
        sourceFormat: source.sourceFormat === "docx" ? "docx" : "legacy_pdf",
        keyTakeaways: textArrayOrFallback(source.keyTakeaways, []), actionItems: textArrayOrFallback(source.actionItems, []), sections,
      },
      media,
      sortKey: text(source.publishedOn) || text(source.publishedAt),
      revision: createHash("sha256").update(JSON.stringify(source)).digest("hex"),
    };
  }
  async function list(): Promise<PublicPolicySummary[]> {
    const slugs = [...new Set([...policyUpdates.map((item: PolicyUpdate) => item.slug), ...await deps.listCandidateSlugs()])];
    const entries: PublicPolicyEntry[] = [];
    // Bound database concurrency while strongly checking every candidate.
    for (let offset = 0; offset < slugs.length; offset += 8) {
      const batch = await Promise.all(slugs.slice(offset, offset + 8).map(load));
      for (const entry of batch) if (entry) entries.push(entry);
    }
    return entries.sort((a, b) => b.sortKey.localeCompare(a.sortKey)).map(({ document }) => publicPolicySummary(document));
  }
  return { load, list };
}
