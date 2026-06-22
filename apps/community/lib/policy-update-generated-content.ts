import type { PolicyUpdateSection } from "@/lib/policy-updates";
import { isPolicyUpdateDisplayImageAllowed } from "@/lib/policy-update-images";

export type GeneratedPolicyUpdateContent = {
  shortTitle?: string;
  summary: string;
  emailSubject?: string;
  emailPreheader: string;
  keyTakeaways: string[];
  actionItems: string[];
  sections: PolicyUpdateSection[];
};

type GeneratedPolicyUpdateFallback = {
  shortTitle: string;
  summary: string;
  emailSubject: string;
  emailPreheader: string;
  keyTakeaways: string[];
  actionItems: string[];
  sections: PolicyUpdateSection[];
};

const MAX_SHORT_TITLE_CHARS = 96;
const MAX_SUMMARY_CHARS = 850;
const MAX_EMAIL_SUBJECT_CHARS = 140;
const MAX_EMAIL_PREHEADER_CHARS = 220;
const MAX_ITEM_CHARS = 420;
const MAX_PARAGRAPH_CHARS = 1400;
const MAX_HEADING_CHARS = 120;
const MAX_SECTIONS = 10;
const MAX_SECTION_PARAGRAPHS = 7;
const MAX_SECTION_BULLETS = 10;
const MAX_LINKS_PER_SECTION = 8;
const MAX_TABLE_COLUMNS = 5;
const MAX_TABLE_ROWS = 24;
const MAX_TABLE_CELL_CHARS = 520;
const MAX_IMAGES_PER_SECTION = 4;

const markdownLinkPattern = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/gi;

function cleanText(value: unknown, maxLength = MAX_ITEM_CHARS) {
  if (typeof value !== "string") return "";
  return value
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maxLength)
    .trim();
}

function cleanParagraph(value: unknown) {
  return cleanText(value, MAX_PARAGRAPH_CHARS);
}

function textArray(value: unknown, maxItems: number, maxLength = MAX_ITEM_CHARS) {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/\n{2,}|(?:^|\n)\s*[-*]\s+/g)
      : [];
  return source
    .map((item) => cleanText(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeUrl(value: unknown) {
  const href = cleanText(value, 600);
  if (!href) return "";
  try {
    const parsed = new URL(href);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : "";
  } catch {
    return "";
  }
}

function normalizeLinks(value: unknown) {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const text = cleanText(record.text, 120);
      const href = normalizeUrl(record.href);
      const key = `${text}|${href}`;
      if (!text || !href || seen.has(key)) return null;
      seen.add(key);
      return { text, href };
    })
    .filter((link): link is { text: string; href: string } => !!link)
    .slice(0, MAX_LINKS_PER_SECTION);
}

function normalizeImageSrc(value: unknown) {
  const src = cleanText(value, 700);
  if (!src) return "";
  if (src.startsWith("/")) return src;
  return normalizeUrl(src);
}

function normalizeImages(value: unknown) {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const src = normalizeImageSrc(record.src);
      const alt = cleanText(record.alt, 180);
      const caption = cleanText(record.caption, 260);
      const width = Number(record.width);
      const height = Number(record.height);
      if (!src || !alt || seen.has(src)) return null;
      seen.add(src);
      const image = {
        src,
        alt,
        ...(caption ? { caption } : {}),
        ...(Number.isFinite(width) && width > 0 ? { width } : {}),
        ...(Number.isFinite(height) && height > 0 ? { height } : {}),
      };
      return isPolicyUpdateDisplayImageAllowed(image) ? image : null;
    })
    .filter((image): image is {
      src: string;
      alt: string;
      caption?: string;
      width?: number;
      height?: number;
    } => !!image)
    .slice(0, MAX_IMAGES_PER_SECTION);
}

function stripMarkdownLinks(
  paragraphs: string[],
  links: Array<{ text: string; href: string }>,
) {
  const seen = new Set(links.map((link) => `${link.text}|${link.href}`));
  const cleanedParagraphs = paragraphs.map((paragraph) =>
    paragraph.replace(markdownLinkPattern, (_match, label: string, href: string) => {
      const text = cleanText(label, 120);
      const normalizedHref = normalizeUrl(href);
      const key = `${text}|${normalizedHref}`;
      if (text && normalizedHref && !seen.has(key) && links.length < MAX_LINKS_PER_SECTION) {
        links.push({ text, href: normalizedHref });
        seen.add(key);
      }
      return text || label;
    }),
  );

  return cleanedParagraphs.map((paragraph) => cleanParagraph(paragraph)).filter(Boolean);
}

function normalizeTable(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  const table = value as Record<string, unknown>;
  const columns = textArray(table.columns, MAX_TABLE_COLUMNS, 140);
  if (columns.length < 2) return undefined;

  const rows = Array.isArray(table.rows)
    ? table.rows
        .map((row) => {
          const cells = textArray(row, columns.length, MAX_TABLE_CELL_CHARS);
          if (!cells.length) return null;
          return columns.map((_, index) => cells[index] || "");
        })
        .filter((row): row is string[] => !!row)
        .slice(0, MAX_TABLE_ROWS)
    : [];

  return rows.length ? { columns, rows } : undefined;
}

function normalizeSections(value: unknown, fallback: PolicyUpdateSection[]) {
  if (!Array.isArray(value)) return fallback;

  const sections = value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const heading = cleanText(record.heading, MAX_HEADING_CHARS);
      const links = normalizeLinks(record.links);
      const body = stripMarkdownLinks(
        textArray(record.body, MAX_SECTION_PARAGRAPHS, MAX_PARAGRAPH_CHARS),
        links,
      );
      if (!heading || !body.length) return null;

      const section: PolicyUpdateSection = { heading, body };
      const table = normalizeTable(record.table);
      const bullets = textArray(record.bullets, MAX_SECTION_BULLETS, MAX_ITEM_CHARS);
      const images = normalizeImages(record.images);
      const bodyAfterBullets = stripMarkdownLinks(
        textArray(record.bodyAfterBullets, MAX_SECTION_PARAGRAPHS, MAX_PARAGRAPH_CHARS),
        links,
      );

      if (table) section.table = table;
      if (bullets.length) section.bullets = bullets;
      if (images.length) section.images = images;
      if (bodyAfterBullets.length) section.bodyAfterBullets = bodyAfterBullets;
      if (links.length) section.links = links;

      return section;
    })
    .filter((section): section is PolicyUpdateSection => !!section)
    .slice(0, MAX_SECTIONS);

  return sections.length ? sections : fallback;
}

function generatedObject(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const nested = record.content;
  if (nested && typeof nested === "object") return nested as Record<string, unknown>;
  return record;
}

export function normalizeGeneratedPolicyUpdateContent(
  value: unknown,
  fallback: GeneratedPolicyUpdateFallback,
): GeneratedPolicyUpdateContent {
  const record = generatedObject(value);
  if (!record) {
    throw new Error("Venice response did not include a content object.");
  }

  const summary = cleanText(record.summary, MAX_SUMMARY_CHARS) || fallback.summary;
  const emailPreheader =
    cleanText(record.emailPreheader, MAX_EMAIL_PREHEADER_CHARS) ||
    summary.replace(/\s+/g, " ").slice(0, MAX_EMAIL_PREHEADER_CHARS).trim() ||
    fallback.emailPreheader;
  const keyTakeaways = textArray(record.keyTakeaways, 7, MAX_ITEM_CHARS);
  const actionItems = textArray(record.actionItems, 6, MAX_ITEM_CHARS);
  const sections = normalizeSections(record.sections, fallback.sections);

  return {
    shortTitle: cleanText(record.shortTitle, MAX_SHORT_TITLE_CHARS) || fallback.shortTitle,
    summary,
    emailSubject: cleanText(record.emailSubject, MAX_EMAIL_SUBJECT_CHARS) || fallback.emailSubject,
    emailPreheader,
    keyTakeaways: keyTakeaways.length ? keyTakeaways : fallback.keyTakeaways,
    actionItems: actionItems.length ? actionItems : fallback.actionItems,
    sections,
  };
}
