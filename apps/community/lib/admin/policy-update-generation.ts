import "server-only";

import { createHash } from "crypto";
import {
  POLICY_UPDATE_GENERATION_BASE_URL,
  POLICY_UPDATE_GENERATION_MAX_TOKENS,
  POLICY_UPDATE_GENERATION_MODEL,
  POLICY_UPDATE_GENERATION_TIMEOUT_MS,
  VENICE_API_KEY,
} from "@/lib/config";
import {
  normalizeGeneratedPolicyUpdateContent,
  type GeneratedPolicyUpdateContent,
} from "@/lib/policy-update-generated-content";
import type { UploadedPolicyUpdateRecord } from "@/lib/admin/policy-update-uploads";

type ExtractedPolicyUpdatePdf = {
  text: string;
  tables: unknown[];
  links: Array<{
    page: number;
    text: string;
    href: string;
  }>;
  sourceTextLength: number;
  sourceTextSha256: string;
};

const MAX_PDF_TEXT_CHARS = 60000;
const MAX_TABLES_FOR_PROMPT = 10;
const MIN_EXTRACTED_TEXT_CHARS = 200;
const MAX_FALLBACK_PARAGRAPHS = 6;
const MONTH_NAME_PATTERN =
  "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";

class VeniceTimeoutError extends Error {
  constructor() {
    super("Venice generation timed out.");
    this.name = "VeniceTimeoutError";
  }
}

function isVeniceTimeoutError(err: unknown) {
  return err instanceof VeniceTimeoutError || (err as any)?.message === "Venice generation timed out.";
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
    .replace(/\bNot a PGPZ member\?\s*Sign up here:?\b/gi, " ");
}

function sourceTextForGeneration(value: string) {
  return compactWhitespace(
    stripPdfChrome(value)
      .replace(/\s+(Key Takeaways)\b/gi, "\n\n$1\n")
      .replace(/\s+(Action Items?)\b/gi, "\n\n$1\n")
      .replace(/\s+(X Post of the Week:)/gi, "\n\n$1")
      .replace(/\s+(Notable Posts?:)/gi, "\n\n$1")
      .replace(/\s+(Why this matters for Zcash:?)/gi, "\n\n$1")
      .replace(/\s+(Policy Developments?:)/gi, "\n\n$1")
      .replace(/\s+(Regulatory Developments?:)/gi, "\n\n$1")
      .replace(/\s+(Executive Summary)\b/gi, "\n\n$1\n")
      .replace(/\s+[•]\s+/g, "\n- ")
      .replace(/\s+l\s+(?=[A-Z0-9])/g, "\n- "),
  );
}

function truncatePromptText(value: string) {
  if (value.length <= MAX_PDF_TEXT_CHARS) return value;
  return `${value.slice(0, MAX_PDF_TEXT_CHARS)}\n\n[Source text truncated for generation.]`;
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
  const datedBodyPattern = new RegExp(`\\s+(On\\s+${MONTH_NAME_PATTERN}\\s+\\d{1,2},\\s+\\d{4}\\b.*)$`, "i");
  const datedBody = clean.match(datedBodyPattern);

  if (/^(X Post of the Week:|Notable Posts?:)/i.test(clean)) {
    if (datedBody?.index && datedBody.index > 20) {
      return {
        heading: clean.slice(0, datedBody.index).trim(),
        remainder: datedBody[1].trim(),
      };
    }
    return { heading: clean, remainder: "" };
  }

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

  for (const line of lines) {
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

    const heading = splitFallbackHeading(line);
    if (heading && !/^Action Items?$/i.test(heading.heading)) {
      flush();
      skippingSidebar = null;
      current = { heading: heading.heading, lines: heading.remainder ? [heading.remainder] : [] };
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

function fallbackPolicyUpdateContent(
  record: UploadedPolicyUpdateRecord,
  extracted: ExtractedPolicyUpdatePdf,
): GeneratedPolicyUpdateContent {
  const lines = splitSourceLines(extracted.text);
  const paragraphs = splitParagraphsFromText(extracted.text);
  const summary =
    paragraphs.find((paragraph) => !paragraph.includes(record.title) && paragraph.length <= 850) ||
    record.summary;

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

function fallbackFromRecord(record: UploadedPolicyUpdateRecord) {
  return {
    shortTitle: record.shortTitle,
    summary: record.summary,
    emailSubject: record.emailSubject,
    emailPreheader: record.emailPreheader,
    keyTakeaways: record.keyTakeaways,
    actionItems: record.actionItems,
    sections: record.sections,
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
    };
  }
}

async function loadPdfJs() {
  ensurePdfRuntimePolyfills();
  return import("pdfjs-dist/legacy/build/pdf.mjs");
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
      };
    })
    .filter((link): link is { page: number; text: string; href: string } => Boolean(link));
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

function formatDetectedLinks(links: ExtractedPolicyUpdatePdf["links"]) {
  if (!links.length) return "";

  return links
    .map((link) => `- Page ${link.page}: ${link.text} -> ${link.href}`)
    .join("\n");
}

function promptForPolicyUpdate(record: UploadedPolicyUpdateRecord, extracted: ExtractedPolicyUpdatePdf) {
  const tables = extracted.tables.length
    ? JSON.stringify(extracted.tables.slice(0, MAX_TABLES_FOR_PROMPT), null, 2)
    : "No structured tables were detected by the PDF parser. If the extracted text clearly contains tabular content, recreate it as a table.";

  return `Convert the uploaded PDF source into faithful, well-structured PGPZ Community page content.

Your job is document conversion, not article writing. The generated page should closely track the source document while fitting the existing PGPZ Community page/email design. The website will apply the visual palette and typography; you supply clean structured content.

Return strict JSON only. Do not wrap the response in markdown.

Required JSON shape:
{
  "shortTitle": "Concise archive/card title",
  "summary": "One short paragraph for the page hero and email intro",
  "emailSubject": "PGPZ subject line",
  "emailPreheader": "Short email preview text",
  "keyTakeaways": ["2-7 concise takeaways"],
  "actionItems": ["1-6 concrete actions for PGPZ Community members"],
  "sections": [
    {
      "heading": "Section heading",
      "body": ["Paragraph text"],
      "table": { "columns": ["Column"], "rows": [["Cell"]] },
      "bullets": ["Optional bullet"],
      "bodyAfterBullets": ["Optional paragraph after bullets"],
      "images": [{ "src": "/api/policy-updates/example/assets/image.png", "alt": "Descriptive alt text", "caption": "Optional caption", "href": "Optional source URL for the image itself", "width": 1198, "height": 794 }],
      "links": [{ "text": "Visible link text that appears in body", "href": "https://example.com" }]
    }
  ]
}

Rules:
- Treat the PDF source text as authoritative. Use only facts, claims, dates, links, and framing present in the source text or metadata.
- Preserve the source document's order, section hierarchy, and emphasis as closely as the JSON schema allows.
- Use the source's actual headings where possible. Do not collapse the document into one generic "Policy Update" section.
- For source social-post blocks labeled "X Post of the Week:", "Notable Post:", or "Notable Posts:", preserve them as their own section in the same source order, with heading exactly "X Post of the Week", "Notable Post", or "Notable Posts". These sections may have an empty body when the source block is only a label plus social screenshot.
- Put embedded X/social screenshot asset paths in the closest matching social-post section's images array, not in an unrelated policy update section. If the PDF annotations include a link for the social image, set that URL as the image object's "href".
- Convert each meaningful source section into its own section object. For recurring source headings such as "Why this matters for Zcash" or "Action Item", keep them attached to the relevant nearby development rather than moving them to an unrelated section.
- Keep the source's analytical tone and Zcash policy lens. Lightly clean extraction artifacts, but do not rewrite into marketing copy.
- Copy the source key takeaways and action items into the sidebar arrays when the source contains those lists. Do not invent new takeaways or actions.
- Weekly updates should not include an "Executive Summary" section unless the source document explicitly has that section. Put the overview in "summary" instead.
- Special/featured updates may include "Executive Summary" only when the source document supports it.
- Reproduce meaningful source tables as JSON table objects in the relevant section. Do not simply refer to "the table" if the table content is available.
- Preserve embedded source links. If source text uses Markdown links like [label](https://example.com) or the detected PDF links list includes a matching label/URL, put the readable label in body text and add a matching links entry.
- If image asset paths are already present in existing metadata or source content, place them in the closest relevant section's images array. Do not invent image URLs.
- Never include generic PGPZ Community signup/member QR images, "Not a PGPZ member?" QR images, or QR images whose purpose is joining the PGPZ Community itself. Signal chat QR images are allowed when they are part of the source document content.
- Ignore repeated PDF chrome such as PGPZ Community headers, footers, page numbers, member-resource labels, QR-code captions, and community signup boilerplate unless it is part of the actual policy content.
- Do not add filler such as "open the PDF resource", "the source PDF includes links", "this draft page can be published", or "review the source document".
- The page content should be useful without opening the PDF: include the substantive body text, bullets, and tables from the source, not just a summary.
- Keep paragraphs readable for the portal: usually 80-180 words each, split long source paragraphs at natural sentence boundaries, and use bullets for source bullet lists.
- Avoid markdown formatting in strings.

Metadata:
- Category: ${record.category}
- Category label: ${record.category === "special" ? "Featured update" : "Weekly policy memo"}
- Title: ${record.title}
- Short title: ${record.shortTitle}
- Display date: ${record.displayDate}
- Published date: ${record.publishedAt}
- Existing admin summary: ${record.summary}

Detected tables:
${tables}

Detected PDF links:
${formatDetectedLinks(extracted.links) || "No external PDF link annotations were detected."}

Cleaned extracted PDF text:
${truncatePromptText(sourceTextForGeneration(extracted.text))}`;
}

async function postVeniceChat(requestBody: Record<string, unknown>, useJsonMode = true) {
  if (!VENICE_API_KEY?.trim()) {
    throw new Error("Venice API key is not configured.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), POLICY_UPDATE_GENERATION_TIMEOUT_MS);
  const body = {
    ...requestBody,
    ...(useJsonMode ? { response_format: { type: "json_object" } } : {}),
  };

  try {
    const res = await fetch(`${POLICY_UPDATE_GENERATION_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${VENICE_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message =
        typeof payload?.error?.message === "string"
          ? payload.error.message
          : `Venice generation failed with status ${res.status}.`;
      const error = new Error(message) as Error & { status?: number };
      error.status = res.status;
      throw error;
    }

    return payload;
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new VeniceTimeoutError();
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

async function generateJsonFromVenice(record: UploadedPolicyUpdateRecord, extracted: ExtractedPolicyUpdatePdf) {
  const baseUrl = POLICY_UPDATE_GENERATION_BASE_URL.toLowerCase();
  const requestBody: Record<string, unknown> = {
    model: POLICY_UPDATE_GENERATION_MODEL,
    temperature: 0.1,
    max_tokens: POLICY_UPDATE_GENERATION_MAX_TOKENS,
    messages: [
      {
        role: "system",
        content:
          "You are a meticulous PGPZ Community document-conversion editor. Preserve the source document faithfully, clean PDF extraction artifacts, and output valid JSON only.",
      },
      {
        role: "user",
        content: promptForPolicyUpdate(record, extracted),
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

  try {
    return await postVeniceChat(requestBody, useJsonMode);
  } catch (err: any) {
    if (useJsonMode && (err?.status === 400 || err?.status === 422)) {
      return postVeniceChat(requestBody, false);
    }
    throw err;
  }
}

export async function extractPolicyUpdatePdfContent(bytes: Buffer): Promise<ExtractedPolicyUpdatePdf> {
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
        const pageText = textContentToPageText(content);
        if (pageText) {
          pageTexts.push(`${pageText}\n\n--- Page ${pageNumber} of ${document.numPages} ---`);
        }
        detectedLinks.push(...linksFromAnnotations(pageNumber, annotations));
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
  const extracted = await extractPolicyUpdatePdfContent(bytes);
  let normalized: GeneratedPolicyUpdateContent;
  let generatedModel = POLICY_UPDATE_GENERATION_MODEL;

  try {
    const response = await generateJsonFromVenice(record, extracted);
    const contentText = responseContentText(response);
    if (!contentText) throw new Error("Venice response did not include generated content.");

    const parsed = extractJsonObject(contentText);
    normalized = normalizeGeneratedPolicyUpdateContent(parsed, fallbackFromRecord(record));
  } catch (err) {
    if (!isVeniceTimeoutError(err)) throw err;
    normalized = normalizeGeneratedPolicyUpdateContent(
      fallbackPolicyUpdateContent(record, extracted),
      fallbackFromRecord(record),
    );
    generatedModel = `${POLICY_UPDATE_GENERATION_MODEL}+pdf-fallback`;
  }

  return {
    ...normalized,
    generatedModel,
    sourceTextLength: extracted.sourceTextLength,
    sourceTextSha256: extracted.sourceTextSha256,
  };
}
