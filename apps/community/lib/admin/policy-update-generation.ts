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

function compactWhitespace(value: string) {
  return value
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function truncatePromptText(value: string) {
  if (value.length <= MAX_PDF_TEXT_CHARS) return value;
  return `${value.slice(0, MAX_PDF_TEXT_CHARS)}\n\n[Source text truncated for generation.]`;
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

  return `Create polished page content for a PGPZ Community policy update from the uploaded PDF source.

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
      "links": [{ "text": "Visible link text that appears in body", "href": "https://example.com" }]
    }
  ]
}

Rules:
- Use only facts from the source text and metadata. Do not invent citations, claims, dates, or events.
- Keep the tone analytical, concise, and policy-focused through the Zcash lens.
- Weekly updates should not include an "Executive Summary" section unless the source document explicitly has that section. Put the overview in "summary" instead.
- Special/featured updates may include "Executive Summary" only when the source document supports it.
- Reproduce meaningful source tables as JSON table objects in the relevant section. Do not simply refer to "the table" if the table content is available.
- Preserve embedded source links. If source text uses Markdown links like [label](https://example.com) or the detected PDF links list includes a matching label/URL, put the readable label in body text and add a matching links entry.
- Avoid markdown formatting in strings.
- The generated page should be useful without opening the PDF, while the PDF remains the complete source resource.

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

Extracted PDF text:
${truncatePromptText(extracted.text)}`;
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
      throw new Error("Venice generation timed out.");
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
          "You are a careful PGPZ Community policy editor. You transform PDF source material into structured website content and output valid JSON only.",
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

  try {
    return await postVeniceChat(requestBody, true);
  } catch (err: any) {
    if (err?.status === 400 || err?.status === 422) {
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
  const response = await generateJsonFromVenice(record, extracted);
  const contentText = responseContentText(response);
  if (!contentText) throw new Error("Venice response did not include generated content.");

  const parsed = extractJsonObject(contentText);
  const normalized = normalizeGeneratedPolicyUpdateContent(parsed, fallbackFromRecord(record));
  return {
    ...normalized,
    generatedModel: POLICY_UPDATE_GENERATION_MODEL,
    sourceTextLength: extracted.sourceTextLength,
    sourceTextSha256: extracted.sourceTextSha256,
  };
}
