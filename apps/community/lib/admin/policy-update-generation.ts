import "server-only";

import { createHash } from "crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { PNG } from "pngjs";
import { s3Client } from "@/lib/s3";
import type { GeneratedPolicyUpdateContent } from "@/lib/policy-update-generated-content";
import type { UploadedPolicyUpdateRecord } from "@/lib/admin/policy-update-uploads";
import type { PolicyUpdateImage } from "@/lib/policy-updates";

type ExtractedPolicyUpdatePdf = {
  text: string;
  tables: ExtractedPolicyUpdateTable[];
  links: Array<{
    page: number;
    text: string;
    href: string;
  }>;
  images: ExtractedPolicyUpdateImage[];
  sourceTextLength: number;
  sourceTextSha256: string;
};

type ExtractedPolicyUpdateTable = {
  columns: string[];
  rows: string[][];
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

type PositionedTextItem = {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type PositionedTextLine = {
  y: number;
  items: PositionedTextItem[];
};

const MIN_EXTRACTED_TEXT_CHARS = 200;
const MAX_EXTRACTED_IMAGES = 8;
const PDF_IMAGE_OBJECT_TIMEOUT_MS = 5000;
const SOURCE_EXACT_GENERATION_MODEL = "pdf-source-exact";
const MONTH_NAME_PATTERN =
  "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";
const ARTICLE_BODY_START_PATTERN = `On\\s+${MONTH_NAME_PATTERN}\\s+\\d{1,2}(?:,\\s+\\d{4})?\\b`;

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
    .replace(/PGPZ Community\s+Member Policy Resource/gi, "")
    .replace(/community\.pgpz\.org\s*\|\s*PGPZ Community\s*\|\s*Page\s+\d+/gi, "")
    .replace(/\n?\s*--- Page \d+ of \d+ ---\s*\n?/gi, "\n")
    .replace(/https:\/\/community\.pgpz\.org\/updates\/[^\s]+/gi, "")
    .replace(/\bNot a PGPZ member\?\s*Sign up here:?\b/gi, "")
    .replace(
      /We are excited to announce the launch of the PGPZ Community Signal chat[\s\S]*?scan the QR code to get started!?/gi,
      "",
    );
}

function sourceTextForExactConversion(value: string) {
  return compactWhitespace(
    stripPdfChrome(value)
      .replace(/\s+(Key Takeaways)\b/gi, "\n\n$1\n")
      .replace(/\s+(Action Items?:?)/gi, "\n\n$1\n")
      .replace(/\s+(X Post of the Week:)\s*/gi, "\n\n$1\n")
      .replace(/\s+(Notable Posts?:)\s*/gi, "\n\n$1\n")
      .replace(/\s+(Why this matters for Zcash:?)/gi, "\n\n$1")
      .replace(/\s+(Policy Developments?:)/gi, "\n\n$1")
      .replace(/\s+(Regulatory Developments?:)/gi, "\n\n$1")
      .replace(/\s+(Executive Summary)\b/gi, "\n\n$1\n")
      .replace(/\s+[•]\s+/g, "\n• "),
  );
}

function normalizeSourceLine(value: string) {
  const clean = value.replace(/\s+/g, " ").trim();
  if (!clean) return "";
  return clean.replace(/^(?:l|[-*•])\s+(?=\S)/, "• ");
}

function splitSourceLines(value: string, { keepBlank = false }: { keepBlank?: boolean } = {}) {
  const lines = sourceTextForExactConversion(value)
    .split(/\n/g)
    .map(normalizeSourceLine)
    .filter((line) => !/^--- Page \d+ of \d+ ---$/i.test(line))
    .filter((line) => !/^PGPZ Community$/i.test(line))
    .filter((line) => !/^Member Policy Resource$/i.test(line))
    .filter((line) => !/^community\.pgpz\.org\b/i.test(line))
    .filter((line) => !/^[:;]+$/.test(line))
    .filter((line) => !/^\d+$/.test(line));

  return keepBlank ? lines : lines.filter(Boolean);
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

function isBulletLine(line: string) {
  return /^[-*•]\s+/.test(line);
}

function stripBulletMarker(line: string) {
  return line.replace(/^[-*•]\s+/, "").trim();
}

function appendWrappedLine(current: string, line: string) {
  const next = line.replace(/\s+/g, " ").trim();
  if (!next) return current.trim();
  if (!current) return next;
  if (/-$/.test(current)) return `${current}${next}`.replace(/\s+/g, " ").trim();
  return `${current} ${next}`.replace(/\s+/g, " ").trim();
}

function exactItemsFromLines(lines: string[]) {
  const items: string[] = [];
  const looseLines: string[] = [];
  let current = "";

  const flushCurrent = () => {
    const clean = current.trim();
    if (clean) items.push(clean);
    current = "";
  };

  for (const line of lines) {
    if (!line) {
      flushCurrent();
      continue;
    }

    if (isBulletLine(line)) {
      flushCurrent();
      current = stripBulletMarker(line);
      continue;
    }

    if (current) {
      current = appendWrappedLine(current, line);
    } else {
      looseLines.push(line);
    }
  }

  flushCurrent();

  if (items.length) return items;

  return exactParagraphsFromLines(looseLines);
}

function exactNumberedItemsFromLines(lines: string[]) {
  const items: string[] = [];
  let current = "";

  const flushCurrent = () => {
    const clean = current.trim();
    if (clean) items.push(clean);
    current = "";
  };

  for (const line of lines) {
    if (!line) {
      flushCurrent();
      continue;
    }

    const numbered = line.match(/^\d+\.\s+(.*)$/);
    if (numbered) {
      flushCurrent();
      current = numbered[1].trim();
      continue;
    }

    if (current) current = appendWrappedLine(current, line);
  }

  flushCurrent();
  return items;
}

function firstIndexMatching(lines: string[], pattern: RegExp, fromIndex = 0) {
  return lines.findIndex((line, index) => index >= fromIndex && pattern.test(line));
}

function linesBetweenIndexes(lines: string[], startIndex: number, endIndex: number) {
  if (startIndex < 0) return [];
  const end = endIndex >= 0 ? endIndex : lines.length;
  return lines.slice(startIndex + 1, end);
}

function isCategoryDateLine(line: string) {
  return /^(?:Special Update|Weekly Policy Memo)\s*\|/i.test(line);
}

function meaningfulTitleFromLines(lines: string[], record: UploadedPolicyUpdateRecord) {
  const introIndex = lines.findIndex(isArticleBodyStart);
  const titleLines = lines
    .slice(0, introIndex >= 0 ? introIndex : Math.min(lines.length, 6))
    .filter((line) => line && !isCategoryDateLine(line))
    .filter((line) => !/^https?:\/\//i.test(line))
    .filter((line) => !/^Key Takeaways$/i.test(line))
    .filter((line) => !/^Action Items?$/i.test(line));

  const title = titleLines.join(" ").replace(/\s+/g, " ").trim();
  if (!title) return record.title;
  return title.slice(0, 180);
}

function openingSummaryFromLines(lines: string[], fallback: string) {
  const introIndex = lines.findIndex(isArticleBodyStart);
  if (introIndex < 0) return fallback;

  const endCandidates = [
    firstIndexMatching(lines, /^Key Takeaways$/i, introIndex + 1),
    firstIndexMatching(lines, /^Executive Summary$/i, introIndex + 1),
    firstIndexMatching(lines, /^Key Themes$/i, introIndex + 1),
  ].filter((index) => index >= 0);
  const endIndex = endCandidates.length ? Math.min(...endCandidates) : lines.length;
  const summary = exactParagraphsFromLines(lines.slice(introIndex, endIndex))[0] || "";
  return summary || fallback;
}

function buildStructuredSectionsFromSource(
  extracted: ExtractedPolicyUpdatePdf,
  linesWithBlanks: string[],
) {
  const sections: GeneratedPolicyUpdateContent["sections"] = [];

  const executiveIndex = firstIndexMatching(linesWithBlanks, /^Executive Summary$/i);
  const keyThemesIndex = firstIndexMatching(linesWithBlanks, /^Key Themes$/i);
  const recommendationsIndex = firstIndexMatching(
    linesWithBlanks,
    /^Actionable Recommendations for Zcash Stakeholders$/i,
  );
  const commentsIndex = firstIndexMatching(linesWithBlanks, /^Summary of Comments$/i);

  if (executiveIndex >= 0) {
    const end = [keyThemesIndex, recommendationsIndex, commentsIndex]
      .filter((index) => index > executiveIndex)
      .sort((a, b) => a - b)[0] ?? linesWithBlanks.length;
    const body = exactParagraphsFromLines(linesBetweenIndexes(linesWithBlanks, executiveIndex, end));
    if (body.length) sections.push({ heading: "Executive Summary", body });
  }

  if (keyThemesIndex >= 0) {
    const end = [recommendationsIndex, commentsIndex]
      .filter((index) => index > keyThemesIndex)
      .sort((a, b) => a - b)[0] ?? linesWithBlanks.length;
    const keyThemeLines = linesBetweenIndexes(linesWithBlanks, keyThemesIndex, end);
    const firstBullet = keyThemeLines.findIndex(isBulletLine);
    const body =
      firstBullet > 0 ? exactParagraphsFromLines(keyThemeLines.slice(0, firstBullet)) : [];
    const bullets = exactItemsFromLines(firstBullet >= 0 ? keyThemeLines.slice(firstBullet) : keyThemeLines);
    if (body.length || bullets.length) {
      sections.push({
        heading: "Key Themes",
        body,
        ...(bullets.length ? { bullets } : {}),
      });
    }
  }

  if (recommendationsIndex >= 0) {
    const end = commentsIndex > recommendationsIndex ? commentsIndex : linesWithBlanks.length;
    const recommendationLines = linesBetweenIndexes(linesWithBlanks, recommendationsIndex, end);
    const firstNumbered = recommendationLines.findIndex((line) => /^\d+\.\s+/.test(line));
    const body =
      firstNumbered > 0
        ? exactParagraphsFromLines(recommendationLines.slice(0, firstNumbered))
        : [];
    const bullets = exactNumberedItemsFromLines(
      firstNumbered >= 0 ? recommendationLines.slice(firstNumbered) : recommendationLines,
    );
    if (body.length || bullets.length) {
      sections.push({
        heading: "Actionable Recommendations for Zcash Stakeholders",
        body,
        ...(bullets.length ? { bullets } : {}),
      });
    }
  }

  if (commentsIndex >= 0) {
    const commentLines = linesBetweenIndexes(linesWithBlanks, commentsIndex, linesWithBlanks.length);
    const firstTableHeader = commentLines.findIndex((line) =>
      /^Commenter\s*\/\s*Organization\b/i.test(line),
    );
    const body = exactParagraphsFromLines(
      firstTableHeader >= 0 ? commentLines.slice(0, firstTableHeader) : commentLines,
    );
    const table = extracted.tables[0];
    if (body.length || table) {
      sections.push({
        heading: "Summary of Comments",
        body,
        ...(table ? { table } : {}),
      });
    }
  }

  return sections;
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
  let sawHeadingText = false;

  for (let offset = 0; offset < 6 && index + offset < lines.length; offset += 1) {
    const line = lines[index + offset];
    if (!line) {
      if (sawHeadingText) continue;
      return null;
    }
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
    sawHeadingText = true;
  }

  return null;
}

function fallbackBodyFromLines(lines: string[]) {
  const body: string[] = [];
  const bullets: string[] = [];
  let currentParagraph = "";
  let currentBullet = "";

  const flushParagraph = () => {
    const clean = currentParagraph.trim();
    if (clean) body.push(clean);
    currentParagraph = "";
  };

  const flushBullet = () => {
    const clean = currentBullet.trim();
    if (clean) bullets.push(clean);
    currentBullet = "";
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    if (!line) {
      flushParagraph();
      continue;
    }

    if (isBulletLine(line)) {
      flushParagraph();
      flushBullet();
      currentBullet = stripBulletMarker(line);
      continue;
    }

    if (currentBullet) {
      currentBullet = appendWrappedLine(currentBullet, line);
    } else {
      currentParagraph = appendWrappedLine(currentParagraph, line);
    }
  }

  flushParagraph();
  flushBullet();

  return { body, bullets };
}

function exactParagraphsFromLines(lines: string[]) {
  return fallbackBodyFromLines(lines).body;
}

function fallbackSectionsFromText(
  record: UploadedPolicyUpdateRecord,
  extracted: ExtractedPolicyUpdatePdf,
) {
  const lines = splitSourceLines(extracted.text, { keepBlank: true });
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
        body,
      };
      if (bullets.length) section.bullets = bullets;
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
    if (!line) {
      if (current) current.lines.push("");
      continue;
    }

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
      flush();
      skippingSidebar = null;
      current = {
        heading: heading.heading,
        lines: [],
      };
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
  return sections.length ? sections : undefined;
}

export function sourcePolicyUpdateContent(
  record: UploadedPolicyUpdateRecord,
  extracted: ExtractedPolicyUpdatePdf,
): GeneratedPolicyUpdateContent {
  const lines = splitSourceLines(extracted.text);
  const linesWithBlanks = splitSourceLines(extracted.text, { keepBlank: true });
  const title = meaningfulTitleFromLines(lines, record);
  const recordSummary = isBoilerplateGeneratedSummary(record.summary) ? "" : record.summary.trim();
  const sourceIntroSummary = openingSummaryFromLines(linesWithBlanks, "");
  const summary =
    sourceIntroSummary ||
    recordSummary ||
    record.emailPreheader ||
    exactParagraphsFromLines(lines)
      .find((paragraph) => !isBoilerplateGeneratedSummary(paragraph) && !paragraph.includes(record.title) && paragraph.length <= 850) ||
    extracted.text.replace(/\s+/g, " ").trim().slice(0, 850);

  const keyTakeawayLines = linesBetweenHeadings(lines, /^Key Takeaways$/i, [
    /^Action Items$/i,
    /^Executive Summary$/i,
    /^Key Themes$/i,
    /^Actionable Recommendations/i,
    /^Summary of Comments$/i,
    /^Policy Developments?/i,
    /^Implications?/i,
    /^X Post of the Week:?$/i,
    /^Notable Posts?:?$/i,
  ]);
  const actionItemLines = linesBetweenHeadings(lines, /^Action Items$/i, [
    /^Executive Summary$/i,
    /^Key Themes$/i,
    /^Actionable Recommendations/i,
    /^Summary of Comments$/i,
    /^Policy Developments?/i,
    /^Implications?/i,
    /^Additional/i,
    /^X Post of the Week:?$/i,
    /^Notable Posts?:?$/i,
    /^Why this matters for Zcash:?$/i,
  ]);

  const keyTakeaways = exactItemsFromLines(keyTakeawayLines);
  const actionItems = exactItemsFromLines(actionItemLines);
  const structuredSections = buildStructuredSectionsFromSource(extracted, linesWithBlanks);
  const sections = structuredSections.length ? structuredSections : fallbackSectionsFromText(record, extracted);
  const emailSubject = record.emailSubject.includes(record.title)
    ? `PGPZ ${record.category === "weekly" ? "Weekly Policy Memo" : "Special Update"}: ${title}`
    : record.emailSubject;

  return {
    title,
    shortTitle: title.slice(0, 96),
    summary,
    emailSubject,
    emailPreheader: record.emailPreheader || summary.slice(0, 220),
    keyTakeaways: keyTakeaways.length ? keyTakeaways : record.keyTakeaways,
    actionItems: actionItems.length ? actionItems : record.actionItems,
    sections: sections || [
      {
        heading: record.category === "weekly" ? "Weekly Policy Update" : "Policy Update",
        body: [summary],
        links: extracted.links.slice(0, 8).map((link) => ({
          text: link.text,
          href: link.href,
        })),
      },
    ],
  };
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
    const yDelta = lastY === null ? 0 : Math.abs(y - lastY);
    const movedToNewLine = lastY !== null && yDelta > 3.5;
    if (movedToNewLine && output.length && output[output.length - 1] !== "\n") {
      output.push(yDelta > 20 ? "\n\n" : "\n");
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

function positionedLinesFromTextContent(content: any) {
  const items: PositionedTextItem[] = (Array.isArray(content?.items) ? content.items : [])
    .map((item: any) => {
      if (!item || typeof item.str !== "string" || !item.str.trim()) return null;
      const transform = Array.isArray(item.transform) ? item.transform : [];
      return {
        str: item.str,
        x: typeof transform[4] === "number" ? transform[4] : 0,
        y: typeof transform[5] === "number" ? transform[5] : 0,
        width: typeof item.width === "number" ? item.width : 0,
        height: typeof item.height === "number" ? item.height : 0,
      };
    })
    .filter((item: PositionedTextItem | null): item is PositionedTextItem => !!item)
    .sort((a: PositionedTextItem, b: PositionedTextItem) => b.y - a.y || a.x - b.x);

  const lines: PositionedTextLine[] = [];
  for (const item of items) {
    const line = lines.find((candidate) => Math.abs(candidate.y - item.y) <= 2);
    if (line) {
      line.items.push(item);
      line.items.sort((a, b) => a.x - b.x);
      continue;
    }
    lines.push({ y: item.y, items: [item] });
  }

  return lines;
}

function appendTableCellLine(current: string, line: string) {
  const next = line
    .replace(/\s+/g, " ")
    .replace(/\s*-\s*/g, "-")
    .trim();
  if (!next) return current.trim();
  if (!current) return next;
  if (/-$/.test(current)) return `${current}${next}`.replace(/\s+/g, " ").trim();
  return `${current} ${next}`.replace(/\s+/g, " ").trim();
}

function cleanTableCell(value: string) {
  return value
    .replace(/\s+-\s*/g, "-")
    .replace(/\s*-\s+/g, "-")
    .replace(/\b([A-Za-z]+-[A-Za-z]{1,3})\s+([a-z]{3,})\b/g, "$1$2")
    .replace(/\bC\s+orp\./g, "Corp.")
    .replace(/\bI\s+ndemnification\b/g, "Indemnification")
    .replace(/\bo\s+verbroad\b/g, "overbroad")
    .replace(/\boverbro\s+ad\b/g, "overbroad")
    .replace(/\s+/g, " ")
    .trim();
}

function isWrappedOrganizationContinuation(organization: string, previousOrganization: string) {
  const clean = organization.trim();
  if (!clean || !previousOrganization.trim()) return false;
  if (/,$/.test(previousOrganization.trim())) return true;
  if (/^\([^)]+\)$/.test(clean)) return true;
  if (/^(?:Inc\.?|Corp\.?|LLC|Ltd\.?)$/i.test(clean)) return true;
  if (/^International\b/i.test(clean)) return true;
  return false;
}

function normalizeSummaryCommentsTableRows(table: ExtractedPolicyUpdateTable) {
  const rows: string[][] = [];

  for (const row of table.rows) {
    const previous = rows[rows.length - 1];
    if (previous && isWrappedOrganizationContinuation(row[0], previous[0])) {
      previous[0] = appendTableCellLine(previous[0], row[0]);
      previous[1] = appendTableCellLine(previous[1], row[1]);
      previous[2] = appendTableCellLine(previous[2], row[2]);
      continue;
    }

    rows.push(row.map(cleanTableCell));
  }

  for (const row of rows) {
    row[0] = cleanTableCell(row[0]);
    row[1] = cleanTableCell(row[1]);
    row[2] = cleanTableCell(row[2]);
  }

  table.rows = rows;
  return table;
}

function extractSummaryCommentsTableFromPage({
  content,
  pageWidth,
  pageHeight,
  table,
}: {
  content: any;
  pageWidth: number;
  pageHeight: number;
  table: ExtractedPolicyUpdateTable;
}) {
  if (pageWidth <= pageHeight) return;

  const lines = positionedLinesFromTextContent(content)
    .filter((line) => line.y < pageHeight - 56 && line.y > 52)
    .map((line) => {
      const col1Start = pageWidth * 0.25;
      const col2Start = pageWidth * 0.48;
      const cells = ["", "", ""];

      for (const item of line.items) {
        const text = item.str.replace(/\s+/g, " ").trim();
        if (!text) continue;
        const column = item.x >= col2Start ? 2 : item.x >= col1Start ? 1 : 0;
        cells[column] = appendTableCellLine(cells[column], text);
      }

      const combined = cells.filter(Boolean).join(" ");
      return { y: line.y, cells, combined };
    })
    .filter((line) => line.combined);

  if (!lines.some((line) => /Commenter\s*\/\s*Organization/i.test(line.combined))) return;

  for (const line of lines) {
    if (/Commenter\s*\/\s*Organization/i.test(line.combined)) continue;
    if (/^Summary of Comments$/i.test(line.combined)) continue;
    if (/^The table below summarizes/i.test(line.combined)) continue;

    let [organization, topics] = line.cells;
    const position = line.cells[2];
    const inlineTopic = organization.match(/^(.*?)\s+[•l]\s+(.*)$/);
    if (inlineTopic) {
      organization = inlineTopic[1].trim();
      topics = appendTableCellLine(`• ${inlineTopic[2].trim()}`, topics);
    }

    const hasOrganization = !!organization.trim();
    const currentRow = table.rows[table.rows.length - 1];
    if (hasOrganization) {
      table.rows.push([organization.trim(), topics.trim(), position.trim()]);
      continue;
    }

    if (!currentRow) continue;
    if (topics) currentRow[1] = appendTableCellLine(currentRow[1], topics);
    if (position) currentRow[2] = appendTableCellLine(currentRow[2], position);
  }
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

function escapeSvgText(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapSvgText(value: string, maxChars: number, maxLines: number) {
  const words = value.replace(/\s+/g, " ").trim().split(/\s+/g).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
    if (lines.length >= maxLines) break;
  }

  if (current && lines.length < maxLines) lines.push(current);
  return lines;
}

function generatedCoverSvg({
  record,
  title,
  summary,
}: {
  record: UploadedPolicyUpdateRecord;
  title: string;
  summary: string;
}) {
  const titleLines = wrapSvgText(title, 28, 4);
  const summaryLines = wrapSvgText(summary, 38, 4);
  const titleTspans = titleLines
    .map((line, index) => `<tspan x="42" dy="${index === 0 ? 0 : 34}">${escapeSvgText(line)}</tspan>`)
    .join("");
  const summaryTspans = summaryLines
    .map((line, index) => `<tspan x="42" dy="${index === 0 ? 0 : 22}">${escapeSvgText(line)}</tspan>`)
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="840" viewBox="0 0 640 840" role="img" aria-label="${escapeSvgText(title)} cover preview">
  <rect width="640" height="840" rx="28" fill="#fafafa"/>
  <rect x="0" y="0" width="640" height="104" rx="28" fill="#1c180f"/>
  <rect x="0" y="78" width="640" height="26" fill="#1c180f"/>
  <rect x="0" y="104" width="640" height="12" fill="#1f7870"/>
  <text x="42" y="61" font-family="Arial, Helvetica, sans-serif" font-size="25" font-weight="700" letter-spacing="2" fill="#ffe7a6">PGPZ COMMUNITY</text>
  <text x="42" y="184" font-family="Arial, Helvetica, sans-serif" font-size="36" font-weight="700" fill="#222222">${titleTspans}</text>
  <text x="42" y="358" font-family="Arial, Helvetica, sans-serif" font-size="19" font-weight="700" letter-spacing="2" fill="#7a5007">${escapeSvgText(record.category === "weekly" ? "WEEKLY MEMO" : "FEATURED UPDATE")}</text>
  <text x="42" y="404" font-family="Arial, Helvetica, sans-serif" font-size="21" fill="#334155">${summaryTspans}</text>
  <rect x="42" y="548" width="556" height="38" rx="10" fill="#1c180f"/>
  <rect x="42" y="610" width="156" height="38" rx="6" fill="#f2f5f9" stroke="#dde2ea"/>
  <rect x="222" y="610" width="156" height="38" rx="6" fill="#f2f5f9" stroke="#dde2ea"/>
  <rect x="402" y="610" width="156" height="38" rx="6" fill="#f2f5f9" stroke="#dde2ea"/>
  <rect x="42" y="674" width="516" height="18" rx="9" fill="#e3e8ef"/>
  <rect x="42" y="712" width="438" height="18" rx="9" fill="#e3e8ef"/>
  <rect x="42" y="750" width="478" height="18" rx="9" fill="#e3e8ef"/>
</svg>`;
}

async function uploadGeneratedCoverAsset({
  record,
  title,
  summary,
}: {
  record: UploadedPolicyUpdateRecord;
  title: string;
  summary: string;
}) {
  const assetName = "cover.svg";
  await s3Client.send(
    new PutObjectCommand({
      Bucket: record.s3Bucket,
      Key: assetObjectKey(record.s3Key, assetName),
      Body: Buffer.from(generatedCoverSvg({ record, title, summary }), "utf8"),
      ContentType: "image/svg+xml; charset=utf-8",
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
    const summaryCommentsTable: ExtractedPolicyUpdateTable = {
      columns: [
        "Commenter / Organization",
        "Relevant Topics/Issue Areas",
        "Position Summary and Relevance to the Zcash Ecosystem",
      ],
      rows: [],
    };

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
        extractSummaryCommentsTableFromPage({
          content,
          pageWidth: Number(page.view?.[2] || 0),
          pageHeight: Number(page.view?.[3] || 0),
          table: summaryCommentsTable,
        });
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
      tables: summaryCommentsTable.rows.length ? [normalizeSummaryCommentsTableRows(summaryCommentsTable)] : [],
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
  const sourceContent = mergeExtractedImagesIntoContent(
    sourcePolicyUpdateContent(record, extracted),
    extracted.images,
  );
  const coverImage = await uploadGeneratedCoverAsset({
    record,
    title: sourceContent.title || record.title,
    summary: sourceContent.summary,
  });

  return {
    ...sourceContent,
    coverImage,
    generatedModel: SOURCE_EXACT_GENERATION_MODEL,
    sourceTextLength: extracted.sourceTextLength,
    sourceTextSha256: extracted.sourceTextSha256,
  };
}
