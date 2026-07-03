import type {
  PolicyUpdate,
  PolicyUpdateImage,
  PolicyUpdateLink,
  PolicyUpdateSection,
  PolicyUpdateTable,
} from "@/lib/policy-updates";
import { isPolicyUpdateRelevantPostImage, policyUpdateImageHref } from "@/lib/policy-update-images";
import { isPgpzProgressSummarySection, progressSummaryItems } from "@/lib/policy-update-progress-summary";
import {
  isPolicyUpdateSocialPostSection,
  normalizePolicyUpdateSectionLayout,
  policyUpdateSectionHeadingLink,
  splitPolicyUpdateSocialPostHeading,
} from "@/lib/policy-update-sections";

export type PolicyUpdateMarkdownOptions = {
  siteUrl?: string | null;
  greeting?: string;
};

const trackingMarkers = [
  "/api/email/click/",
  "/api/email/open/",
  "/api/email/unsubscribe/",
  "unsubscribe from member emails",
  "cid:",
];

function normalizeBaseUrl(value?: string | null) {
  return (value || "https://community.pgpz.org").trim().replace(/\/+$/, "");
}

function normalizeSpaces(value: string) {
  return value.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim();
}

function escapeMarkdownText(value: string) {
  return normalizeSpaces(value)
    .replace(/\\/g, "\\\\")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

function markdownTextSegment(value: string) {
  return value.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ");
}

function linkedTextParts(text: string, links: PolicyUpdateLink[] = []) {
  const matches = links
    .map((link) => ({ link, index: text.indexOf(link.text) }))
    .filter((match) => match.index >= 0)
    .sort((a, b) => a.index - b.index);

  if (!matches.length) return [{ text }];

  const parts: Array<{ text: string; link?: PolicyUpdateLink }> = [];
  let cursor = 0;

  for (const { link, index } of matches) {
    if (index < cursor) continue;
    if (index > cursor) parts.push({ text: text.slice(cursor, index) });
    parts.push({ text: link.text, link });
    cursor = index + link.text.length;
  }

  if (cursor < text.length) parts.push({ text: text.slice(cursor) });
  return parts;
}

function linkifyText(text: string, links: PolicyUpdateLink[] = []) {
  return linkedTextParts(text, links)
    .map((part) => {
      if (!part.link) return markdownTextSegment(part.text);
      return `[${escapeMarkdownText(part.text)}](${part.link.href})`;
    })
    .join("")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function tableCell(value: string) {
  return normalizeSpaces(value).replace(/\|/g, "\\|").replace(/\n+/g, "<br>");
}

function renderTable(table: PolicyUpdateTable) {
  const columns = table.columns.map(tableCell);
  const divider = columns.map(() => "---");
  const rows = table.rows.map((row) => `| ${row.map(tableCell).join(" | ")} |`);
  return [`| ${columns.join(" | ")} |`, `| ${divider.join(" | ")} |`, ...rows].join("\n");
}

export function policyUpdateMarkdownFileName(update: Pick<PolicyUpdate, "slug" | "category">) {
  const prefix = update.category === "weekly" ? "zcash-forum-weekly-policy-memo" : "zcash-forum-policy-update";
  return `${prefix}-${update.slug}.md`;
}

export function policyUpdateMarkdownEmailAssetSrc(src: string, siteUrl?: string | null) {
  const base = normalizeBaseUrl(siteUrl);
  if (/^https?:\/\//i.test(src)) {
    const url = new URL(src);
    url.pathname = url.pathname.replace(/\/assets\//, "/email-assets/");
    url.search = "";
    return url.toString();
  }

  const clean = src.split("?")[0] || src;
  const emailPath = clean.replace(/\/assets\//, "/email-assets/");
  return `${base}${emailPath.startsWith("/") ? "" : "/"}${emailPath}`;
}

function renderImage({
  image,
  href,
  siteUrl,
}: {
  image: PolicyUpdateImage;
  href?: string | null;
  siteUrl: string;
}) {
  const src = policyUpdateMarkdownEmailAssetSrc(image.src, siteUrl);
  const alt = escapeMarkdownText(image.alt || image.caption || "Source image");
  const imageMarkdown = `![${alt}](${src})`;
  return href ? `[${imageMarkdown}](${href})` : imageMarkdown;
}

function isRelevantPostsMarker(text: string) {
  return /^Relevant Posts?:$/i.test(text.trim());
}

function sectionHasRelevantPostsMarker(section: PolicyUpdateSection) {
  return [...section.body, ...(section.bodyAfterBullets || [])].some(isRelevantPostsMarker);
}

function renderParagraph(paragraph: string, links: PolicyUpdateLink[]) {
  return isRelevantPostsMarker(paragraph) ? "## Relevant Posts" : linkifyText(paragraph, links);
}

function policyUpdateMarkdownIntro(update: Pick<PolicyUpdate, "category" | "summary">) {
  const summary = normalizeSpaces(update.summary);
  if (!summary) {
    return update.category === "weekly"
      ? "This week's PGPZ Community policy memo is now available."
      : "This PGPZ Community update is now available.";
  }

  if (/[.!?]$/.test(summary)) return summary;

  const prefix =
    update.category === "weekly"
      ? "This week's PGPZ Community policy memo covers"
      : "This PGPZ Community update covers";
  return `${prefix} ${summary}.`;
}

function renderList(heading: string, items: string[]) {
  if (!items.length) return "";
  return [`## ${heading}`, "", ...items.map((item) => `- ${escapeMarkdownText(item)}`)].join("\n");
}

function renderProgressSummaryMarkdown(section: PolicyUpdateSection) {
  return progressSummaryItems(section).flatMap((item) => [
    `- **${escapeMarkdownText(item.label)}**`,
    ...(item.details || []).flatMap((detail) => [
      `  - ${linkifyText(detail.text, section.links)}`,
      ...(detail.children || []).map((child) => `    - ${linkifyText(child, section.links)}`),
    ]),
  ]);
}

function renderSection(section: PolicyUpdateSection, siteUrl: string) {
  const lines: string[] = [];
  const socialHeading = splitPolicyUpdateSocialPostHeading(section.heading);
  const isSocial = isPolicyUpdateSocialPostSection(section);
  const isProgressSummary = isPgpzProgressSummarySection(section);
  const headingLink = policyUpdateSectionHeadingLink(section);
  const imageHrefFallback = headingLink?.href || section.links?.[0]?.href || null;
  const renderRelevantPostsImageLabel =
    !isSocial && !sectionHasRelevantPostsMarker(section) && (section.images || []).some(isPolicyUpdateRelevantPostImage);

  if (socialHeading) {
    lines.push(`## ${escapeMarkdownText(socialHeading.label)}`);
    for (const image of section.images || []) {
      lines.push(
        "",
        renderImage({
          image,
          href: policyUpdateImageHref(image, imageHrefFallback),
          siteUrl,
        }),
      );
    }
    if (socialHeading.title) {
      lines.push("", `## ${escapeMarkdownText(socialHeading.title)}`);
    }
  } else if (section.heading) {
    const heading = headingLink
      ? `[${escapeMarkdownText(section.heading)}](${headingLink.href})`
      : escapeMarkdownText(section.heading);
    lines.push(`## ${heading}`);
  }

  if (isSocial && !socialHeading) {
    for (const image of section.images || []) {
      lines.push(
        "",
        renderImage({
          image,
          href: policyUpdateImageHref(image, imageHrefFallback),
          siteUrl,
        }),
      );
    }
  }

  for (const paragraph of section.body) {
    lines.push("", renderParagraph(paragraph, section.links || []));
  }

  if (isProgressSummary) {
    const progressLines = renderProgressSummaryMarkdown(section);
    if (progressLines.length) lines.push("", ...progressLines);
  }

  if (!isSocial) {
    if (renderRelevantPostsImageLabel) lines.push("", "## Relevant Posts");
    for (const image of section.images || []) {
      lines.push(
        "",
        renderImage({
          image,
          href: policyUpdateImageHref(image, imageHrefFallback),
          siteUrl,
        }),
      );
    }
  }

  if (section.table) lines.push("", renderTable(section.table));

  if (!isProgressSummary && section.bullets?.length) {
    lines.push("", ...section.bullets.map((item) => `- ${linkifyText(item, section.links)}`));
  }

  for (const paragraph of isProgressSummary ? [] : (section.bodyAfterBullets || [])) {
    lines.push("", renderParagraph(paragraph, section.links || []));
  }

  return lines
    .filter((line, index, all) => !(line === "" && all[index - 1] === ""))
    .join("\n")
    .trim();
}

export function buildPolicyUpdateForumMarkdown(
  update: PolicyUpdate,
  options: PolicyUpdateMarkdownOptions = {},
) {
  const siteUrl = normalizeBaseUrl(options.siteUrl);
  const greeting = options.greeting?.trim() || "Hi everyone,";
  const sections = normalizePolicyUpdateSectionLayout(update.sections)
    .map((section) => renderSection(section, siteUrl))
    .filter(Boolean);

  const markdown = [
    `# ${escapeMarkdownText(update.title)}`,
    [greeting, "", policyUpdateMarkdownIntro(update)].join("\n"),
    renderList("Key Takeaways", update.keyTakeaways),
    renderList("Action Items", update.actionItems),
    "---",
    sections.join("\n\n---\n\n"),
  ]
    .filter((part) => part.trim())
    .join("\n\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trimEnd()
    .concat("\n");

  assertPolicyUpdateMarkdownHasNoTracking(markdown);
  return markdown;
}

export function assertPolicyUpdateMarkdownHasNoTracking(markdown: string) {
  const lower = markdown.toLowerCase();
  const marker = trackingMarkers.find((candidate) => lower.includes(candidate));
  if (marker) {
    throw new Error(`Output contains tracking-only marker: ${marker}`);
  }
}

export function policyUpdateMarkdownImageUrls(markdown: string) {
  return [...markdown.matchAll(/!\[[^\]]*\]\((https?:\/\/[^)]+\/email-assets\/[^)]+)\)/g)].map(
    (match) => match[1],
  );
}
