import "server-only";

import { createHash } from "crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { PNG } from "pngjs";
import {
  POLICY_UPDATE_GENERATION_BASE_URL,
  POLICY_UPDATE_GENERATION_MAX_TOKENS,
  POLICY_UPDATE_GENERATION_MODEL,
  POLICY_UPDATE_GENERATION_TIMEOUT_MS,
  VENICE_API_KEY,
} from "@/lib/config";
import { s3Client } from "@/lib/s3";
import {
  normalizeGeneratedPolicyUpdateContent,
  type GeneratedPolicyUpdateContent,
} from "@/lib/policy-update-generated-content";
import type { UploadedPolicyUpdateRecord } from "@/lib/admin/policy-update-uploads";
import type { PolicyUpdateImage } from "@/lib/policy-updates";

type ExtractedPolicyUpdatePdf = {
  text: string;
  tables: unknown[];
  links: Array<{
    page: number;
    text: string;
    href: string;
  }>;
  images: ExtractedPolicyUpdateImage[];
  sourceTextLength: number;
  sourceTextSha256: string;
};

type ExtractedPolicyUpdateImage = PolicyUpdateImage & {
  page: number;
  role: "signal-chat" | "x-post-of-the-week" | "notable-post" | "notable-posts" | "source-graphic";
};

type LinkAnnotation = {
  page: number;
  text: string;
  href: string;
  rect: number[];
};

type ViewportRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

type PdfMatrix = [number, number, number, number, number, number];

const MAX_METADATA_TEXT_CHARS = 18000;
const MAX_METADATA_MODEL_TOKENS = 1800;
const MIN_EXTRACTED_TEXT_CHARS = 200;
const MAX_FALLBACK_PARAGRAPHS = 6;
const MAX_EXTRACTED_IMAGES = 8;
const PDF_IMAGE_OBJECT_TIMEOUT_MS = 5000;
const MONTH_NAME_PATTERN =
  "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";
const ARTICLE_BODY_START_PATTERN = `On\\s+${MONTH_NAME_PATTERN}\\s+\\d{1,2}(?:,\\s+\\d{4})?\\b`;

class VeniceTimeoutError extends Error {
  timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`Venice generation timed out after ${timeoutMs}ms.`);
    this.name = "VeniceTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

function isVeniceTimeoutError(err: unknown) {
  return err instanceof VeniceTimeoutError || /Venice generation timed out/i.test((err as any)?.message || "");
}

function isAbortLikeError(err: unknown) {
  const name = typeof (err as any)?.name === "string" ? (err as any).name : "";
  const message = typeof (err as any)?.message === "string" ? (err as any).message : "";
  return name === "AbortError" || /aborted/i.test(message);
}

function compactWhitespace(value: string) {
  return value
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function stripPdfChrome(value: string) {
  return value
    .replace(/PGPZ Community\s+Member Policy Resource/gi, " ")
    .replace(/community\.pgpz\.org\s*\|\s*PGPZ Community\s*\|\s*Page\s+\d+/gi, " ")
    .replace(/--- Page \d+ of \d+ ---/gi, " ")
    .replace(/https:\/\/community\.pgpz\.org\/updates\/[^\s]+/gi, " ")
    .replace(/\bNot a PGPZ member\?\s*Sign up here:?\b/gi, " ")
    .replace(
      /We are excited to announce the launch of the PGPZ Community Signal chat[\s\S]*?scan the QR code to get started!?/gi,
      " ",
    );
}

function sourceTextForGeneration(value: string) {
  return compactWhitespace(
    stripPdfChrome(value)
      .replace(/\s+(Key Takeaways)\b/gi, "\n\n$1\n")
      .replace(/\s+(Action Items?)\b/gi, "\n\n$1\n")
      .replace(/\s+(X Post of the Week:)\s*/gi, "\n\n$1\n")
      .replace(/\s+(Notable Posts?:)\s*/gi, "\n\n$1\n")
      .replace(/\s+(Why this matters for Zcash:?)/gi, "\n\n$1")
      .replace(/\s+(Policy Developments?:)/gi, "\n\n$1")
      .replace(/\s+(Regulatory Developments?:)/gi, "\n\n$1")
      .replace(/\s+(Executive Summary)\b/gi, "\n\n$1\n")
      .replace(/\s+[•]\s+/g, "\n- ")
      .replace(/\s+l\s+(?=[A-Z0-9])/g, "\n- "),
  );
}

function truncateMetadataPromptText(value: string) {
  if (value.length <= MAX_METADATA_TEXT_CHARS) return value;
  return `${value.slice(0, MAX_METADATA_TEXT_CHARS)}\n\n[Source text truncated for metadata generation.]`;
}

function sentenceCase(value: string) {
  const clean = value.trim();
  return clean ? `${clean.charAt(0).toUpperCase()}${clean.slice(1)}` : "";
}

function splitSourceLines(value: string) {
  return sourceTextForGeneration(value)
    .split(/\n+/g)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .filter((line) => !/^--- Page \d+ of \d+ ---$/i.test(line))
    .filter((line) => !/^PGPZ Community$/i.test(line))
    .filter((line) => !/^Member Policy Resource$/i.test(line))
    .filter((line) => !/^community\.pgpz\.org\b/i.test(line))
    .filter((line) => !/^[:;]+$/.test(line))
    .filter((line) => !/^\d+$/.test(line));
}

function splitParagraphsFromText(value: string) {
  return sourceTextForGeneration(value)
    .split(/\n{2,}/g)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter((paragraph) => paragraph.length > 80)
    .filter((paragraph) => !/^--- Page \d+ of \d+ ---$/i.test(paragraph));
}

function sentenceItemsFromText(value: string, maxItems: number) {
  return value
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/g)
    .map((sentence) => sentenceCase(sentence.replace(/^[-*•l]\s*/i, "").trim()))
    .filter((sentence) => sentence.length > 40)
    .slice(0, maxItems);
}

function isBoilerplateGeneratedSummary(value: string) {
  const clean = value.replace(/\s+/g, " ").trim().toLowerCase();
  return (
    !clean ||
    /pgpz community signal chat/.test(clean) ||
    /not a pgpz member/.test(clean) ||
    /scan (?:the )?qr code/.test(clean) ||
    /join here/.test(clean)
  );
}

function linesBetweenHeadings(lines: string[], startPattern: RegExp, endPatterns: RegExp[] = []) {
  const start = lines.findIndex((line) => startPattern.test(line));
  if (start < 0) return [];

  const selected: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (endPatterns.some((pattern) => pattern.test(line))) break;
    selected.push(line);
  }

  return selected;
}

function listItemsFromLines(lines: string[], maxItems: number) {
  const joined = lines.join("\n");
  const bulletSegments = joined
    .split(/(?:^|\n)\s*(?:[-*•]|\bl\b|\d+\.)\s+/g)
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter((item) => item.length > 25);

  const source = bulletSegments.length > 1 ? bulletSegments : lines;
  return source
    .map((item) => sentenceCase(item.replace(/^[-*•l]\s*/i, "").trim()))
    .filter((item) => item.length > 25)
    .slice(0, maxItems);
}

function splitReadableParagraphs(value: string, maxLength = 760) {
  const sentences = value
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+/g)
    .filter(Boolean);
  const paragraphs: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    const next = current ? `${current} ${sentence}` : sentence;
    if (current && next.length > maxLength) {
      paragraphs.push(current);
      current = sentence;
    } else {
      current = next;
    }
  }

  if (current) paragraphs.push(current);
  return paragraphs.length ? paragraphs : value.trim() ? [value.replace(/\s+/g, " ").trim()] : [];
}

function splitFallbackHeading(line: string) {
  const clean = line.replace(/\s+/g, " ").trim();

  const why = clean.match(/^(Why this matters for Zcash:?)(.*)$/i);
  if (why) {
    return {
      heading: "Why this matters for Zcash",
      remainder: why[2].replace(/^[:\s-]+/, "").trim(),
    };
  }

  const action = clean.match(/^(Action Items?:?)(.*)$/i);
  if (action) {
    return {
      heading: action[1].replace(/:$/, ""),
      remainder: action[2].replace(/^[:\s-]+/, "").trim(),
    };
  }

  return null;
}

function socialMarkerHeading(line: string) {
  const clean = line.replace(/\s+/g, " ").trim().replace(/:$/, "");
  if (/^X Post of the Week$/i.test(clean)) return "X Post of the Week";
  if (/^Notable Post$/i.test(clean)) return "Notable Post";
  if (/^Notable Posts$/i.test(clean)) return "Notable Posts";
  return null;
}

function isArticleBodyStart(line: string) {
  return new RegExp(`^${ARTICLE_BODY_START_PATTERN}`).test(line);
}

function inlineArticleHeading(line: string) {
  const match = line
    .replace(/\s+/g, " ")
    .trim()
    .match(new RegExp(`^(.*?)\\s+(${ARTICLE_BODY_START_PATTERN}.*)$`));
  if (!match) return null;

  const heading = match[1].replace(/\s+/g, " ").trim();
  const body = match[2].replace(/\s+/g, " ").trim();
  if (!heading || !body) return null;
  if (heading.length < 24 || heading.length > 240) return null;
  if (socialMarkerHeading(heading) || splitFallbackHeading(heading)) return null;
  if (/^(Key Takeaways|Action Items?|Policy Developments?|Regulatory Developments?)$/i.test(heading)) {
    return null;
  }

  return { heading, body };
}

function articleHeadingAt(lines: string[], index: number) {
  const headingLines: string[] = [];

  for (let offset = 0; offset < 4 && index + offset < lines.length; offset += 1) {
    const line = lines[index + offset];
    if (isArticleBodyStart(line)) {
      return headingLines.length
        ? {
            heading: headingLines.join(" "),
            bodyStartIndex: index + offset,
          }
        : null;
    }
    if (
      socialMarkerHeading(line) ||
      splitFallbackHeading(line) ||
      /^Key Takeaways$/i.test(line) ||
      /^Action Items?$/i.test(line)
    ) {
      return null;
    }
    headingLines.push(line);
  }

  return null;
}

function fallbackBodyFromLines(lines: string[]) {
  const bodyLines: string[] = [];
  const bullets: string[] = [];

  for (const line of lines) {
    const clean = line.replace(/\s+/g, " ").trim();
    if (!clean) continue;
    if (/^[-*•]\s+/.test(clean)) {
      bullets.push(sentenceCase(clean.replace(/^[-*•]\s+/, "")));
    } else {
      bodyLines.push(clean);
    }
  }

  return {
    body: splitReadableParagraphs(sentenceCase(bodyLines.join(" "))),
    bullets: bullets.map((item) => splitReadableParagraphs(item, 520).join(" ")),
  };
}

function fallbackSectionsFromText(
  record: UploadedPolicyUpdateRecord,
  extracted: ExtractedPolicyUpdatePdf,
) {
  const lines = splitSourceLines(extracted.text);
  const sections: GeneratedPolicyUpdateContent["sections"] = [];
  let current:
    | {
        heading: string;
        lines: string[];
      }
    | null = null;
  let skippingSidebar: "keyTakeaways" | "actionItems" | null = null;

  const flush = () => {
    if (!current) return;
    const { body, bullets } = fallbackBodyFromLines(current.lines);
    if (body.length || bullets.length) {
      const section: GeneratedPolicyUpdateContent["sections"][number] = {
        heading: current.heading,
        body: body.length ? body.slice(0, 5) : ["Review the corresponding section in the source PDF."],
      };
      if (bullets.length) section.bullets = bullets.slice(0, 8);
      section.links = extracted.links
        .filter((link) =>
          [section.heading, ...section.body, ...(section.bullets || [])].some((text) =>
            text.toLowerCase().includes(link.text.toLowerCase()),
          ),
        )
        .slice(0, 8)
        .map((link) => ({ text: link.text, href: link.href }));
      if (!section.links.length) delete section.links;
      sections.push(section);
    }
    current = null;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (/^Weekly Policy Memo:/i.test(line) || /^https?:\/\/community\.pgpz\.org\b/i.test(line)) {
      continue;
    }

    if (/^Key Takeaways$/i.test(line)) {
      flush();
      skippingSidebar = "keyTakeaways";
      continue;
    }
    if (/^Action Items?$/i.test(line)) {
      flush();
      skippingSidebar = "actionItems";
      continue;
    }

    const socialHeading = socialMarkerHeading(line);
    if (socialHeading) {
      flush();
      skippingSidebar = null;
      sections.push({ heading: socialHeading, body: [] });
      continue;
    }

    const inlineArticle = inlineArticleHeading(line);
    if (inlineArticle) {
      flush();
      skippingSidebar = null;
      current = { heading: inlineArticle.heading, lines: [inlineArticle.body] };
      continue;
    }

    const articleHeading = articleHeadingAt(lines, index);
    if (articleHeading) {
      flush();
      skippingSidebar = null;
      current = { heading: articleHeading.heading, lines: [lines[articleHeading.bodyStartIndex]] };
      index = articleHeading.bodyStartIndex;
      continue;
    }

    const heading = splitFallbackHeading(line);
    if (heading) {
      skippingSidebar = null;
      if (!current) {
        current = {
          heading: record.category === "weekly" ? "Weekly Policy Update" : "Policy Update",
          lines: [],
        };
      }
      if (!/^Action Items?$/i.test(heading.heading)) current.lines.push(heading.heading);
      if (heading.remainder) current.lines.push(heading.remainder);
      continue;
    }

    if (skippingSidebar) continue;
    if (!current) {
      current = {
        heading: record.category === "weekly" ? "Weekly Policy Update" : "Policy Update",
        lines: [],
      };
    }
    current.lines.push(line);
  }

  flush();
  return sections.length ? sections.slice(0, 10) : undefined;
}

export function fallbackPolicyUpdateContent(
  record: UploadedPolicyUpdateRecord,
  extracted: ExtractedPolicyUpdatePdf,
): GeneratedPolicyUpdateContent {
  const lines = splitSourceLines(extracted.text);
  const paragraphs = splitParagraphsFromText(extracted.text);
  const recordSummary = isBoilerplateGeneratedSummary(record.summary) ? "" : record.summary.trim();
  const summary =
    recordSummary ||
    record.emailPreheader ||
    paragraphs.find((paragraph) => !isBoilerplateGeneratedSummary(paragraph) && !paragraph.includes(record.title) && paragraph.length <= 850) ||
    extracted.text.slice(0, 850);

  const keyTakeawayLines = linesBetweenHeadings(lines, /^Key Takeaways$/i, [
    /^Action Items$/i,
    /^Policy Developments?/i,
    /^Implications?/i,
  ]);
  const actionItemLines = linesBetweenHeadings(lines, /^Action Items$/i, [
    /^Policy Developments?/i,
    /^Implications?/i,
    /^Additional/i,
  ]);

  const keyTakeaways = listItemsFromLines(keyTakeawayLines, 5);
  const actionItems = listItemsFromLines(actionItemLines, 5);
  const sections = fallbackSectionsFromText(record, extracted);
  const overviewParagraphs = paragraphs
    .filter((paragraph) => !/^Detected PDF links:/i.test(paragraph))
    .slice(0, MAX_FALLBACK_PARAGRAPHS);

  return {
    shortTitle: record.shortTitle,
    summary,
    emailSubject: record.emailSubject,
    emailPreheader: record.emailPreheader || summary.slice(0, 220),
    keyTakeaways: keyTakeaways.length ? keyTakeaways : sentenceItemsFromText(summary, 3),
    actionItems: actionItems.length ? actionItems : record.actionItems,
    sections: sections || [
      {
        heading: record.category === "weekly" ? "Weekly Policy Update" : "Policy Update",
        body: overviewParagraphs.length ? overviewParagraphs : [summary],
        links: extracted.links.slice(0, 8).map((link) => ({
          text: link.text,
          href: link.href,
        })),
      },
    ],
  };
}

function extractJsonObject(value: string) {
  const clean = value
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(clean);
  } catch {
    const first = clean.indexOf("{");
    const last = clean.lastIndexOf("}");
    if (first < 0 || last <= first) throw new Error("Venice response was not valid JSON.");
    return JSON.parse(clean.slice(first, last + 1));
  }
}

function responseContentText(payload: any) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && typeof part.text === "string") return part.text;
        return "";
      })
      .join("")
      .trim();
  }
  return "";
}

function ensurePdfRuntimePolyfills() {
  const scope = globalThis as any;

  if (typeof scope.DOMMatrix === "undefined") {
    scope.DOMMatrix = class DOMMatrix {
      a = 1;
      b = 0;
      c = 0;
      d = 1;
      e = 0;
      f = 0;

      constructor(_init?: unknown) {}

      multiplySelf() {
        return this;
      }

      preMultiplySelf() {
        return this;
      }

      translateSelf() {
        return this;
      }

      scaleSelf() {
        return this;
      }

      rotateSelf() {
        return this;
      }

      invertSelf() {
        return this;
      }

      transformPoint(point: unknown) {
        return point;
      }
    };
  }

  if (typeof scope.ImageData === "undefined") {
    scope.ImageData = class ImageData {
      data: Uint8ClampedArray;
      width: number;
      height: number;

      constructor(dataOrWidth: Uint8ClampedArray | number, width?: number, height?: number) {
        if (typeof dataOrWidth === "number") {
          this.width = dataOrWidth;
          this.height = typeof width === "number" ? width : 0;
          this.data = new Uint8ClampedArray(this.width * this.height * 4);
        } else {
          this.data = dataOrWidth;
          this.width = typeof width === "number" ? width : 0;
          this.height = typeof height === "number" ? height : 0;
        }
      }
    };
  }

  if (typeof scope.Path2D === "undefined") {
    scope.Path2D = class Path2D {
      constructor(_path?: unknown) {}
      addPath() {}
      closePath() {}
      moveTo() {}
      lineTo() {}
      bezierCurveTo() {}
      quadraticCurveTo() {}
      arc() {}
      arcTo() {}
      ellipse() {}
      rect() {}
    };
  }
}

async function loadPdfJs() {
  ensurePdfRuntimePolyfills();
  return import("pdfjs-dist/build/pdf.mjs");
}

function textItemPosition(item: any) {
  const transform = Array.isArray(item?.transform) ? item.transform : [];
  return {
    x: typeof transform[4] === "number" ? transform[4] : 0,
    y: typeof transform[5] === "number" ? transform[5] : 0,
  };
}

function textContentToPageText(content: any) {
  const output: string[] = [];
  let lastY: number | null = null;

  for (const item of Array.isArray(content?.items) ? content.items : []) {
    if (!item || typeof item.str !== "string") continue;

    const { y } = textItemPosition(item);
    const movedToNewLine = lastY !== null && Math.abs(y - lastY) > 3.5;
    if (movedToNewLine && output.length && output[output.length - 1] !== "\n") {
      output.push("\n");
    }

    if (item.str) {
      output.push(item.str);
      if (item.hasEOL && output[output.length - 1] !== "\n") {
        output.push("\n");
      }
    }

    lastY = y;
  }

  return compactWhitespace(output.join(""));
}

function linkTextFromAnnotation(annotation: any) {
  const candidates = [
    annotation?.overlaidText,
    annotation?.contentsObj?.str,
    annotation?.titleObj?.str,
    annotation?.url,
    annotation?.unsafeUrl,
  ];
  return (
    candidates
      .find((candidate) => typeof candidate === "string" && candidate.trim())
      ?.trim()
      .replace(/\s+/g, " ") || "PDF link"
  );
}

function linksFromAnnotations(pageNumber: number, annotations: any[]) {
  return annotations
    .map((annotation) => {
      const href =
        typeof annotation?.url === "string" && annotation.url.trim()
          ? annotation.url.trim()
          : typeof annotation?.unsafeUrl === "string" && annotation.unsafeUrl.trim()
            ? annotation.unsafeUrl.trim()
            : "";
      if (!href) return null;

      return {
        page: pageNumber,
        text: linkTextFromAnnotation(annotation),
        href,
        rect: Array.isArray(annotation?.rect) ? annotation.rect : [],
      };
    })
    .filter((link): link is LinkAnnotation => Boolean(link?.href));
}

function uniquePdfLinks(links: ExtractedPolicyUpdatePdf["links"]) {
  const seen = new Set<string>();
  return links.filter((link) => {
    const key = `${link.page}\n${link.text}\n${link.href}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function assetObjectKey(pdfObjectKey: string, asset: string) {
  return pdfObjectKey.replace(/\.pdf$/i, `/assets/${asset}`);
}

function sanitizedAssetPart(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "source-graphic"
  );
}

function displayNameFromXHref(href: string) {
  try {
    const parsed = new URL(href);
    const username = parsed.pathname.split("/").filter(Boolean)[0] || "";
    const normalized = username.toLowerCase();
    if (normalized === "jswihart") return "Josh Swihart";
    if (normalized === "warrendavidson") return "Warren Davidson";
    if (normalized === "jbsdc") return "Justin Slaughter";
    if (normalized === "austincampbell") return "Austin Campbell";
    return username ? username.replace(/[-_]+/g, " ") : "X";
  } catch {
    return "X";
  }
}

function xAssetName(href: string, index: number) {
  try {
    const parsed = new URL(href);
    const username = parsed.pathname.split("/").filter(Boolean)[0] || `post-${index}`;
    const normalized = username.toLowerCase();
    if (normalized === "jswihart") return "x-josh-swihart.png";
    if (normalized === "warrendavidson") return "x-warren-davidson.png";
    if (normalized === "jbsdc") return "x-justin-slaughter.png";
    if (normalized === "austincampbell") return "x-austin-campbell.png";
    return `x-${sanitizedAssetPart(username)}-${index}.png`;
  } catch {
    return `x-post-${index}.png`;
  }
}

function xImageRole({
  href,
  pageText,
  documentSocialIndex,
}: {
  href: string;
  pageText: string;
  documentSocialIndex: number;
}): ExtractedPolicyUpdateImage["role"] {
  const text = href.toLowerCase();
  if (/\bjswihart\b/.test(text)) return "x-post-of-the-week";
  if (/\bwarrendavidson\b/.test(text)) return "notable-post";
  if (/\bjbsdc\b|\baustincampbell\b/.test(text)) return "notable-posts";
  if (/\bx post of the week\b/i.test(pageText)) return "x-post-of-the-week";
  if (/\bnotable posts\b/i.test(pageText)) return "notable-posts";
  if (/\bnotable post\b/i.test(pageText)) return "notable-post";
  if (documentSocialIndex === 1) return "x-post-of-the-week";
  if (documentSocialIndex === 2) return "notable-post";
  return "notable-posts";
}

function annotationRectToPdfRect(annotation: LinkAnnotation): ViewportRect | null {
  if (!annotation.rect.length) return null;
  const rect = annotation.rect;
  return {
    left: Math.min(rect[0], rect[2]),
    top: Math.min(rect[1], rect[3]),
    right: Math.max(rect[0], rect[2]),
    bottom: Math.max(rect[1], rect[3]),
  };
}

function rectArea(rect: ViewportRect) {
  return Math.max(0, rect.right - rect.left) * Math.max(0, rect.bottom - rect.top);
}

function rectIntersectionArea(a: ViewportRect, b: ViewportRect) {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.right, b.right);
  const bottom = Math.min(a.bottom, b.bottom);
  return Math.max(0, right - left) * Math.max(0, bottom - top);
}

function bestOverlappingLink(
  imageRect: ViewportRect,
  annotations: LinkAnnotation[],
) {
  let best: { annotation: LinkAnnotation; score: number } | null = null;

  for (const annotation of annotations) {
    const annotationRect = annotationRectToPdfRect(annotation);
    if (!annotationRect) continue;
    const overlap = rectIntersectionArea(imageRect, annotationRect);
    if (!overlap) continue;
    const score = overlap / Math.max(1, Math.min(rectArea(imageRect), rectArea(annotationRect)));
    if (!best || score > best.score) {
      best = { annotation, score };
    }
  }

  return best && best.score > 0.2 ? best.annotation : null;
}

const IDENTITY_MATRIX: PdfMatrix = [1, 0, 0, 1, 0, 0];

function multiplyPdfMatrix(current: PdfMatrix, transform: PdfMatrix): PdfMatrix {
  const [a1, b1, c1, d1, e1, f1] = current;
  const [a2, b2, c2, d2, e2, f2] = transform;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

function pdfMatrixFromArgs(args: unknown): PdfMatrix | null {
  if (!Array.isArray(args) || args.length < 6) return null;
  const values = args.slice(0, 6).map(Number);
  return values.every(Number.isFinite) ? (values as PdfMatrix) : null;
}

function transformPoint(matrix: PdfMatrix, x: number, y: number) {
  const [a, b, c, d, e, f] = matrix;
  return {
    x: a * x + c * y + e,
    y: b * x + d * y + f,
  };
}

function imageRectFromMatrix(matrix: PdfMatrix): ViewportRect {
  const points = [
    transformPoint(matrix, 0, 0),
    transformPoint(matrix, 1, 0),
    transformPoint(matrix, 0, 1),
    transformPoint(matrix, 1, 1),
  ];
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    left: Math.min(...xs),
    top: Math.min(...ys),
    right: Math.max(...xs),
    bottom: Math.max(...ys),
  };
}

function imageMetadataFromLink({
  href,
  page,
  pageText,
  documentSocialIndex,
  fallbackIndex,
}: {
  href: string;
  page: number;
  pageText: string;
  documentSocialIndex: number;
  fallbackIndex: number;
}): Omit<ExtractedPolicyUpdateImage, "src" | "width" | "height"> & { assetName: string } | null {
  const lowerHref = href.toLowerCase();
  if (lowerHref.includes("community.pgpz.org") && !lowerHref.includes("signal.group")) {
    return null;
  }

  if (lowerHref.includes("signal.group")) {
    return {
      page,
      role: "signal-chat",
      assetName: "signal-chat-qr.png",
      alt: "PGPZ Community Signal chat QR code",
      caption: "Scan to join the PGPZ Community Signal chat.",
      href,
    };
  }

  if (lowerHref.includes("x.com/") || lowerHref.includes("twitter.com/")) {
    const displayName = displayNameFromXHref(href);
    const role = xImageRole({ href, pageText, documentSocialIndex });
    return {
      page,
      role,
      assetName: xAssetName(href, documentSocialIndex),
      alt: `${displayName} X post screenshot`,
      caption: `${displayName} X post embedded in the source memo.`,
      href,
    };
  }

  return {
    page,
    role: "source-graphic",
    assetName: `source-graphic-page-${page}-${fallbackIndex}.png`,
    alt: `Embedded source graphic from page ${page}`,
    caption: "Embedded graphic from the source memo.",
    href,
  };
}

function imageMetadataFromDimensions({
  page,
  sourceWidth,
  sourceHeight,
  fallbackIndex,
}: {
  page: number;
  sourceWidth: number;
  sourceHeight: number;
  fallbackIndex: number;
}): Omit<ExtractedPolicyUpdateImage, "src" | "width" | "height" | "href"> & { assetName: string } | null {
  if (sourceWidth < 240 || sourceHeight < 180) return null;
  if (page === 1 && Math.abs(sourceWidth - sourceHeight) < 80) return null;
  if (sourceWidth < 700 && sourceHeight < 400) return null;

  return {
    page,
    role: "source-graphic",
    assetName: `source-graphic-page-${page}-${fallbackIndex}.png`,
    alt: `Embedded source graphic from page ${page}`,
    caption: "Embedded graphic from the source memo.",
  };
}

async function uploadExtractedImageAsset({
  record,
  assetName,
  bytes,
}: {
  record: UploadedPolicyUpdateRecord;
  assetName: string;
  bytes: Buffer;
}) {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: record.s3Bucket,
      Key: assetObjectKey(record.s3Key, assetName),
      Body: bytes,
      ContentType: "image/png",
      ServerSideEncryption: "AES256",
    }),
  );

  return `/api/policy-updates/${encodeURIComponent(record.slug)}/assets/${assetName}`;
}

function waitForPdfImageObject(page: any, objectId: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out extracting PDF image object ${objectId}.`)),
      PDF_IMAGE_OBJECT_TIMEOUT_MS,
    );

    try {
      page.objs.get(objectId, (data: unknown) => {
        clearTimeout(timer);
        resolve(data);
      });
    } catch (err) {
      clearTimeout(timer);
      reject(err);
    }
  });
}

function rgbaBytesFromPdfImage(image: any, imageKind: any) {
  const width = Number(image?.width || 0);
  const height = Number(image?.height || 0);
  const data = image?.data;
  if (!width || !height || !data || typeof data.length !== "number") return null;

  const pixelCount = width * height;
  const rgba = Buffer.alloc(pixelCount * 4);

  if (image.kind === imageKind?.RGBA_32BPP && data.length >= pixelCount * 4) {
    Buffer.from(data).copy(rgba, 0, 0, pixelCount * 4);
    return { width, height, data: rgba };
  }

  if (image.kind === imageKind?.RGB_24BPP && data.length >= pixelCount * 3) {
    for (let source = 0, target = 0; target < rgba.length; source += 3, target += 4) {
      rgba[target] = data[source];
      rgba[target + 1] = data[source + 1];
      rgba[target + 2] = data[source + 2];
      rgba[target + 3] = 255;
    }
    return { width, height, data: rgba };
  }

  if (image.kind === imageKind?.GRAYSCALE_1BPP) {
    for (let index = 0; index < pixelCount; index += 1) {
      const byte = data[index >> 3] || 0;
      const bit = 7 - (index & 7);
      const value = byte & (1 << bit) ? 255 : 0;
      const target = index * 4;
      rgba[target] = value;
      rgba[target + 1] = value;
      rgba[target + 2] = value;
      rgba[target + 3] = 255;
    }
    return { width, height, data: rgba };
  }

  return null;
}

function encodePdfImageAsPng(image: any, imageKind: any) {
  const rgba = rgbaBytesFromPdfImage(image, imageKind);
  if (!rgba) return null;

  const png = new PNG({ width: rgba.width, height: rgba.height });
  png.data = rgba.data;
  return {
    bytes: PNG.sync.write(png),
    width: rgba.width,
    height: rgba.height,
  };
}

async function extractPageImageAssets({
  record,
  page,
  pageNumber,
  annotations,
  pageText,
  pdfjs,
  socialImageCounter,
}: {
  record: UploadedPolicyUpdateRecord;
  page: any;
  pageNumber: number;
  annotations: LinkAnnotation[];
  pageText: string;
  pdfjs: any;
  socialImageCounter: { count: number };
}) {
  const operatorList = await page.getOperatorList();
  const extracted: ExtractedPolicyUpdateImage[] = [];
  let imageIndex = 0;
  let currentMatrix: PdfMatrix = [...IDENTITY_MATRIX];
  const matrixStack: PdfMatrix[] = [];

  for (let opIndex = 0; opIndex < operatorList.fnArray.length; opIndex += 1) {
    const fn = operatorList.fnArray[opIndex];
    const args = operatorList.argsArray[opIndex] || [];

    if (fn === pdfjs.OPS.save) {
      matrixStack.push([...currentMatrix]);
      continue;
    }

    if (fn === pdfjs.OPS.restore) {
      currentMatrix = matrixStack.pop() || [...IDENTITY_MATRIX];
      continue;
    }

    if (fn === pdfjs.OPS.transform) {
      const transform = pdfMatrixFromArgs(args);
      if (transform) {
        currentMatrix = multiplyPdfMatrix(currentMatrix, transform);
      }
      continue;
    }

    if (fn !== pdfjs.OPS.paintImageXObject) continue;

    imageIndex += 1;
    const objectId = typeof args[0] === "string" ? args[0] : "";
    if (!objectId) continue;

    const sourceWidth = Number(args[1] || 0);
    const sourceHeight = Number(args[2] || 0);
    const imageRect = imageRectFromMatrix(currentMatrix);
    const displayWidth = Math.round(rectArea(imageRect) ? imageRect.right - imageRect.left : sourceWidth);
    const displayHeight = Math.round(rectArea(imageRect) ? imageRect.bottom - imageRect.top : sourceHeight);
    const link = bestOverlappingLink(imageRect, annotations);
    const isSocialLink = !!link && /(?:x|twitter)\.com\//i.test(link.href);
    if (!isSocialLink && (displayWidth < 120 || displayHeight < 120)) continue;
    if (isSocialLink && sourceWidth < 700 && sourceHeight < 400) continue;
    if (isSocialLink) socialImageCounter.count += 1;

    const metadata = link
      ? imageMetadataFromLink({
          href: link.href,
          page: pageNumber,
          pageText,
          documentSocialIndex: socialImageCounter.count,
          fallbackIndex: imageIndex,
        })
      : imageMetadataFromDimensions({
          page: pageNumber,
          sourceWidth,
          sourceHeight,
          fallbackIndex: imageIndex,
        });
    if (!metadata) continue;

    let encodedImage: { bytes: Buffer; width: number; height: number } | null = null;
    try {
      const image = await waitForPdfImageObject(page, objectId);
      encodedImage = encodePdfImageAsPng(image, pdfjs.ImageKind);
    } catch {
      encodedImage = null;
    }
    if (!encodedImage) continue;

    const src = await uploadExtractedImageAsset({
      record,
      assetName: metadata.assetName,
      bytes: encodedImage.bytes,
    });

    const href = "href" in metadata && typeof metadata.href === "string" ? metadata.href : undefined;
    extracted.push({
      src,
      alt: metadata.alt,
      caption: metadata.caption,
      ...(href ? { href } : {}),
      width: encodedImage.width,
      height: encodedImage.height,
      page: pageNumber,
      role: metadata.role,
    });

    if (extracted.length >= MAX_EXTRACTED_IMAGES) break;
  }

  return extracted;
}

function contentHasImage(sections: GeneratedPolicyUpdateContent["sections"], src: string) {
  return sections.some((section) => section.images?.some((image) => image.src === src));
}

function appendImageToFirstMatchingSection(
  sections: GeneratedPolicyUpdateContent["sections"],
  image: ExtractedPolicyUpdateImage,
  pattern: RegExp,
) {
  const section = sections.find((candidate) =>
    pattern.test(`${candidate.heading} ${candidate.body.join(" ")}`),
  );
  if (!section) return false;
  section.images = [...(section.images || []), image];
  return true;
}

function appendImageToNextMatchingSection(
  sections: GeneratedPolicyUpdateContent["sections"],
  image: ExtractedPolicyUpdateImage,
  pattern: RegExp,
) {
  const candidates = sections.filter((candidate) =>
    pattern.test(`${candidate.heading} ${candidate.body.join(" ")}`),
  );
  const section = candidates.find((candidate) => !(candidate.images || []).length) || candidates[0];
  if (!section) return false;
  section.images = [...(section.images || []), image];
  return true;
}

function mergeExtractedImagesIntoContent(
  content: GeneratedPolicyUpdateContent,
  images: ExtractedPolicyUpdateImage[],
): GeneratedPolicyUpdateContent {
  if (!images.length) return content;
  const sections = content.sections.map((section) => ({
    ...section,
    body: [...section.body],
    ...(section.images ? { images: [...section.images] } : {}),
  }));

  const notablePosts: ExtractedPolicyUpdateImage[] = [];

  for (const image of images) {
    if (contentHasImage(sections, image.src)) continue;

    if (image.role === "signal-chat") {
      if (!appendImageToFirstMatchingSection(sections, image, /\bsignal\b|\bcommunity chat\b/i)) {
        sections.unshift({ heading: "PGPZ Community Signal Chat", body: [], images: [image] });
      }
      continue;
    }

    if (image.role === "x-post-of-the-week") {
      if (!appendImageToNextMatchingSection(sections, image, /^X Post of the Week\b/i)) {
        sections.push({ heading: "X Post of the Week", body: [], images: [image] });
      }
      continue;
    }

    if (image.role === "notable-post") {
      if (!appendImageToNextMatchingSection(sections, image, /^Notable Post\b/i)) {
        sections.push({ heading: "Notable Post", body: [], images: [image] });
      }
      continue;
    }

    if (image.role === "notable-posts") {
      if (!appendImageToNextMatchingSection(sections, image, /^Notable Posts\b/i)) {
        notablePosts.push(image);
      }
      continue;
    }

    appendImageToFirstMatchingSection(sections, image, /graphic|image|figure|screenshot/i);
  }

  if (notablePosts.length) {
    const notablePostsSection = sections.find((section) => /^Notable Posts\b/i.test(section.heading));
    if (notablePostsSection) {
      notablePostsSection.images = [...(notablePostsSection.images || []), ...notablePosts];
    } else {
      sections.push({ heading: "Notable Posts", body: [], images: notablePosts });
    }
  }

  return {
    ...content,
    sections,
  };
}

async function postVeniceChat(
  requestBody: Record<string, unknown>,
  {
    useJsonMode = true,
    timeoutMs = POLICY_UPDATE_GENERATION_TIMEOUT_MS,
  }: {
    useJsonMode?: boolean;
    timeoutMs?: number;
  } = {},
) {
  if (!VENICE_API_KEY?.trim()) {
    throw new Error("Venice API key is not configured.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const body = {
    ...requestBody,
    ...(useJsonMode ? { response_format: { type: "json_object" } } : {}),
  };
  const startedAt = Date.now();

  try {
    const res = await fetch(`${POLICY_UPDATE_GENERATION_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${VENICE_API_KEY}`,
        "content-type": "application/json",
        "user-agent": "pgpz-policy-update-generator/1.0",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      let payload: any = {};
      try {
        payload = bodyText ? JSON.parse(bodyText) : {};
      } catch {
        payload = {};
      }
      const message =
        typeof payload?.error?.message === "string"
          ? payload.error.message
          : `Venice generation failed with status ${res.status}${bodyText ? `: ${bodyText.trim().slice(0, 240)}` : ""}.`;
      const error = new Error(message) as Error & { status?: number; retryable?: boolean };
      error.status = res.status;
      error.retryable = res.status >= 500 || res.status === 429;
      throw error;
    }

    const payload = await res.json().catch(() => ({}));
    console.log(
      JSON.stringify({
        event: "policy_update_generation_model_call",
        model: requestBody.model,
        latency_ms: Date.now() - startedAt,
        usage: payload?.usage || null,
      }),
    );
    return payload;
  } catch (err: any) {
    if (isAbortLikeError(err)) {
      throw new VeniceTimeoutError(timeoutMs);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

async function postVeniceChatWithJsonFallback(
  requestBody: Record<string, unknown>,
  useJsonMode: boolean,
  timeoutMs: number,
) {
  try {
    return await postVeniceChat(requestBody, { useJsonMode, timeoutMs });
  } catch (err: any) {
    if (useJsonMode && (err?.status === 400 || err?.status === 422)) {
      return postVeniceChat(requestBody, { useJsonMode: false, timeoutMs });
    }
    throw err;
  }
}

async function postVeniceChatWithRetry(
  requestBody: Record<string, unknown>,
  useJsonMode: boolean,
) {
  const initialTimeoutMs = POLICY_UPDATE_GENERATION_TIMEOUT_MS;
  try {
    return await postVeniceChatWithJsonFallback(requestBody, useJsonMode, initialTimeoutMs);
  } catch (err) {
    if (!isVeniceTimeoutError(err)) throw err;

    const configuredMaxTokens = Number(requestBody.max_tokens || POLICY_UPDATE_GENERATION_MAX_TOKENS);
    const retryTimeoutMs = Math.max(30000, Math.floor(initialTimeoutMs * 0.5));
    const retryMaxTokens = Number.isFinite(configuredMaxTokens)
      ? Math.max(1200, Math.floor(configuredMaxTokens * 0.6))
      : 3000;
    console.log(
      JSON.stringify({
        event: "policy_update_generation_model_retry",
        reason: "timeout_abort",
        model: requestBody.model,
        initial_timeout_ms: initialTimeoutMs,
        retry_timeout_ms: retryTimeoutMs,
        configured_max_tokens: configuredMaxTokens,
        retry_max_tokens: retryMaxTokens,
      }),
    );

    return postVeniceChatWithJsonFallback(
      {
        ...requestBody,
        max_tokens: retryMaxTokens,
      },
      useJsonMode,
      retryTimeoutMs,
    );
  }
}

function promptForPolicyUpdateMetadata(
  record: UploadedPolicyUpdateRecord,
  extracted: ExtractedPolicyUpdatePdf,
  sourceContent: GeneratedPolicyUpdateContent,
) {
  return `Generate only the metadata and sidebar fields for a PGPZ Community policy-update page.

The substantive page sections have already been converted deterministically from the uploaded PDF. Do not rewrite the document body and do not return sections. Your job is to produce concise page/email metadata from the source document.

Return strict JSON only. Do not wrap the response in markdown.

Required JSON shape:
{
  "shortTitle": "Concise archive/card title",
  "summary": "One short paragraph for the page hero and email intro",
  "emailSubject": "PGPZ subject line",
  "emailPreheader": "Short email preview text",
  "keyTakeaways": ["2-7 concise takeaways copied or closely derived from the source"],
  "actionItems": ["1-6 concrete actions copied or closely derived from the source"]
}

Rules:
- Treat the PDF source text as authoritative. Use only facts, claims, dates, links, and framing present in the source text or metadata.
- Prefer the source document's own overview, key takeaways, and action items when present.
- Weekly updates should not invent an "Executive Summary"; put the overview in "summary".
- Do not include generic PGPZ signup/member QR boilerplate, page chrome, footers, or draft-review language.
- Keep the same analytical policy tone and Zcash lens as the source.
- Keep the summary under 850 characters and the preheader under 220 characters.

Metadata:
- Category: ${record.category}
- Category label: ${record.category === "special" ? "Featured update" : "Weekly policy memo"}
- Title: ${record.title}
- Short title: ${record.shortTitle}
- Display date: ${record.displayDate}
- Published date: ${record.publishedAt}
- Existing admin summary: ${record.summary}

Deterministic source-converted sidebar draft:
${JSON.stringify(
  {
    shortTitle: sourceContent.shortTitle,
    summary: sourceContent.summary,
    emailSubject: sourceContent.emailSubject,
    emailPreheader: sourceContent.emailPreheader,
    keyTakeaways: sourceContent.keyTakeaways,
    actionItems: sourceContent.actionItems,
  },
  null,
  2,
)}

Cleaned extracted PDF text:
${truncateMetadataPromptText(sourceTextForGeneration(extracted.text))}`;
}

async function generateJsonFromVenice(
  record: UploadedPolicyUpdateRecord,
  extracted: ExtractedPolicyUpdatePdf,
  sourceContent: GeneratedPolicyUpdateContent,
) {
  const baseUrl = POLICY_UPDATE_GENERATION_BASE_URL.toLowerCase();
  const requestBody: Record<string, unknown> = {
    model: POLICY_UPDATE_GENERATION_MODEL,
    temperature: 0.1,
    max_tokens: Math.min(POLICY_UPDATE_GENERATION_MAX_TOKENS, MAX_METADATA_MODEL_TOKENS),
    messages: [
      {
        role: "system",
        content:
          "You are a meticulous PGPZ Community policy-update editor. Produce concise metadata from the source document and output valid JSON only.",
      },
      {
        role: "user",
        content: promptForPolicyUpdateMetadata(record, extracted, sourceContent),
      },
    ],
  };

  if (baseUrl.includes("venice.ai")) {
    requestBody.venice_parameters = {
      disable_thinking: true,
      strip_thinking_response: true,
    };
  }

  const useJsonMode = !baseUrl.includes("venice.ai");

  return postVeniceChatWithRetry(requestBody, useJsonMode);
}

export async function extractPolicyUpdatePdfContent(
  bytes: Buffer,
  record?: UploadedPolicyUpdateRecord,
): Promise<ExtractedPolicyUpdatePdf> {
  const pdfjs = await loadPdfJs();
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    disableWorker: true,
    isEvalSupported: false,
    useWorkerFetch: false,
  } as any);
  const document = await loadingTask.promise;

  try {
    const pageTexts: string[] = [];
    const detectedLinks: ExtractedPolicyUpdatePdf["links"] = [];
    const extractedImages: ExtractedPolicyUpdateImage[] = [];
    const socialImageCounter = { count: 0 };

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      try {
        const [content, annotations] = await Promise.all([
          page.getTextContent({
            includeMarkedContent: false,
            disableNormalization: false,
          }),
          page.getAnnotations({ intent: "display" }).catch(() => []),
        ]);
        const pageLinks = linksFromAnnotations(pageNumber, annotations);
        const pageText = textContentToPageText(content);
        if (pageText) {
          pageTexts.push(`${pageText}\n\n--- Page ${pageNumber} of ${document.numPages} ---`);
        }
        detectedLinks.push(...pageLinks);
        if (record && extractedImages.length < MAX_EXTRACTED_IMAGES) {
          const images = await extractPageImageAssets({
            record,
            page,
            pageNumber,
            annotations: pageLinks,
            pageText,
            pdfjs,
            socialImageCounter,
          });
          extractedImages.push(...images);
        }
      } finally {
        page.cleanup();
      }
    }

    const links = uniquePdfLinks(detectedLinks);
    const text = compactWhitespace(pageTexts.join("\n\n"));
    if (text.length < MIN_EXTRACTED_TEXT_CHARS) {
      throw new Error("Could not extract enough text from the PDF to generate page content.");
    }

    return {
      text,
      tables: [],
      links,
      images: extractedImages.slice(0, MAX_EXTRACTED_IMAGES),
      sourceTextLength: text.length,
      sourceTextSha256: createHash("sha256").update(text).digest("hex"),
    };
  } finally {
    await document.destroy();
  }
}

export async function generatePolicyUpdatePageContent(
  record: UploadedPolicyUpdateRecord,
  bytes: Buffer,
): Promise<
  GeneratedPolicyUpdateContent & {
    generatedModel: string;
    sourceTextLength: number;
    sourceTextSha256: string;
  }
> {
  const extracted = await extractPolicyUpdatePdfContent(bytes, record);
  const generatedModel = POLICY_UPDATE_GENERATION_MODEL;
  const sourceContent = mergeExtractedImagesIntoContent(
    fallbackPolicyUpdateContent(record, extracted),
    extracted.images,
  );

  const response = await generateJsonFromVenice(record, extracted, sourceContent);
  const contentText = responseContentText(response);
  if (!contentText) throw new Error("Venice response did not include generated content.");

  const parsed = extractJsonObject(contentText);
  const sourceFallback = {
    shortTitle: sourceContent.shortTitle || record.shortTitle,
    summary: sourceContent.summary,
    emailSubject: sourceContent.emailSubject || record.emailSubject,
    emailPreheader: sourceContent.emailPreheader,
    keyTakeaways: sourceContent.keyTakeaways,
    actionItems: sourceContent.actionItems,
    sections: sourceContent.sections,
  };
  const normalized = normalizeGeneratedPolicyUpdateContent(
    {
      ...(typeof parsed === "object" && parsed ? parsed : {}),
      sections: sourceContent.sections,
    },
    sourceFallback,
  );

  return {
    ...normalized,
    sections: sourceContent.sections,
    generatedModel,
    sourceTextLength: extracted.sourceTextLength,
    sourceTextSha256: extracted.sourceTextSha256,
  };
}
