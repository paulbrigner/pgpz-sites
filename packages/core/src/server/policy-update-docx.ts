import { createHash } from "node:crypto";
import JSZip from "jszip";
import mammoth from "mammoth";
import { parseDocument } from "htmlparser2";
import PDFDocument from "pdfkit";
import { imageSize } from "image-size";

const MAX_DOCX_BYTES = 25 * 1024 * 1024;
const MAX_DOCX_ENTRIES = 2_000;
const MAX_DOCX_EXPANDED_BYTES = 120 * 1024 * 1024;
const SAFE_URL_PATTERN = /^https?:\/\//i;
const ASSET_SCHEME = "pgpz-docx-asset:";

export type PolicyUpdateTextRun = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  href?: string;
};

export type PolicyUpdateDocumentLink = {
  text: string;
  href: string;
};

export type PolicyUpdateDocumentImage = {
  src: string;
  alt: string;
  caption?: string;
  width?: number;
  height?: number;
  href?: string;
};

export type PolicyUpdateDocumentSection = {
  heading: string;
  headingRuns?: PolicyUpdateTextRun[];
  body: string[];
  bodyRuns?: PolicyUpdateTextRun[][];
  bullets?: string[];
  bulletRuns?: PolicyUpdateTextRun[][];
  bodyAfterBullets?: string[];
  bodyAfterBulletsRuns?: PolicyUpdateTextRun[][];
  links?: PolicyUpdateDocumentLink[];
  images?: PolicyUpdateDocumentImage[];
};

export type PolicyUpdateDocxAsset = {
  fileName: string;
  contentType: string;
  bytes: Buffer;
  width?: number;
  height?: number;
};

export type ParsedPolicyUpdateDocx = {
  title: string;
  shortTitle: string;
  summary: string;
  emailPreheader: string;
  keyTakeaways: string[];
  actionItems: string[];
  sections: PolicyUpdateDocumentSection[];
  assets: PolicyUpdateDocxAsset[];
  sourceText: string;
  sourceTextSha256: string;
  warnings: string[];
};

type RunStyle = Omit<PolicyUpdateTextRun, "text">;

function safeExternalUrl(value: unknown) {
  const href = typeof value === "string" ? value.trim() : "";
  if (!SAFE_URL_PATTERN.test(href)) return undefined;
  try {
    const parsed = new URL(href);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

function normalizeInlineText(value: string) {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/ *\n */g, "\n");
}

function normalizeBlockText(value: string) {
  return normalizeInlineText(value).replace(/\n+/g, " ").replace(/\s+/g, " ").trim();
}

function sameRunStyle(left: PolicyUpdateTextRun, right: PolicyUpdateTextRun) {
  return (
    !!left.bold === !!right.bold &&
    !!left.italic === !!right.italic &&
    !!left.underline === !!right.underline &&
    (left.href || "") === (right.href || "")
  );
}

function compactRuns(input: PolicyUpdateTextRun[]) {
  const runs: PolicyUpdateTextRun[] = [];
  for (const raw of input) {
    const text = normalizeInlineText(raw.text);
    if (!text) continue;
    const next: PolicyUpdateTextRun = {
      text,
      ...(raw.bold ? { bold: true } : {}),
      ...(raw.italic ? { italic: true } : {}),
      ...(raw.underline ? { underline: true } : {}),
      ...(safeExternalUrl(raw.href) ? { href: safeExternalUrl(raw.href) } : {}),
    };
    const previous = runs.at(-1);
    if (previous && sameRunStyle(previous, next)) previous.text += next.text;
    else runs.push(next);
  }

  if (!runs.length) return runs;
  runs[0].text = runs[0].text.replace(/^\s+/, "");
  runs[runs.length - 1].text = runs[runs.length - 1].text.replace(/\s+$/, "");
  return runs.filter((run) => run.text.length > 0);
}

function elementName(node: any) {
  return typeof node?.name === "string" ? node.name.toLowerCase() : "";
}

function childNodes(node: any): any[] {
  return Array.isArray(node?.children) ? node.children : [];
}

function extractRuns(node: any, style: RunStyle = {}): PolicyUpdateTextRun[] {
  if (!node) return [];
  if (node.type === "text") return [{ text: String(node.data || ""), ...style }];

  const tag = elementName(node);
  if (tag === "br") return [{ text: "\n", ...style }];
  if (tag === "img" || tag === "table" || tag === "ul" || tag === "ol") return [];

  const nextStyle: RunStyle = {
    ...style,
    ...(tag === "strong" || tag === "b" ? { bold: true } : {}),
    ...(tag === "em" || tag === "i" ? { italic: true } : {}),
    ...(tag === "u" ? { underline: true } : {}),
  };
  if (tag === "a") {
    const href = safeExternalUrl(node.attribs?.href);
    if (href) nextStyle.href = href;
  }

  return compactRuns(childNodes(node).flatMap((child) => extractRuns(child, nextStyle)));
}

function runsText(runs: PolicyUpdateTextRun[]) {
  return normalizeBlockText(runs.map((run) => run.text).join(""));
}

function directElements(node: any, tag: string) {
  return childNodes(node).filter((child) => elementName(child) === tag);
}

function descendantElements(node: any, tag: string): any[] {
  const matches: any[] = [];
  for (const child of childNodes(node)) {
    if (elementName(child) === tag) matches.push(child);
    matches.push(...descendantElements(child, tag));
  }
  return matches;
}

function linksFromRuns(runs: PolicyUpdateTextRun[]) {
  const seen = new Set<string>();
  const links: PolicyUpdateDocumentLink[] = [];
  for (const run of runs) {
    const href = safeExternalUrl(run.href);
    const text = normalizeBlockText(run.text);
    if (!href || !text) continue;
    const key = `${text}\n${href}`;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({ text, href });
  }
  return links;
}

function mergeSectionLinks(section: PolicyUpdateDocumentSection, runs: PolicyUpdateTextRun[]) {
  const links = [...(section.links || []), ...linksFromRuns(runs)];
  const seen = new Set<string>();
  section.links = links.filter((link) => {
    const key = `${link.text}\n${link.href}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (!section.links.length) delete section.links;
}

function imageExtension(contentType: string) {
  if (/png/i.test(contentType)) return "png";
  if (/jpe?g/i.test(contentType)) return "jpg";
  if (/gif/i.test(contentType)) return "gif";
  if (/webp/i.test(contentType)) return "webp";
  return "bin";
}

function sourceImageNodes(node: any) {
  const images: Array<{ src: string; alt: string; href?: string }> = [];
  const walk = (current: any, inheritedHref?: string) => {
    const tag = elementName(current);
    const href = tag === "a" ? safeExternalUrl(current.attribs?.href) || inheritedHref : inheritedHref;
    if (tag === "img") {
      const src = typeof current.attribs?.src === "string" ? current.attribs.src : "";
      if (src.startsWith(ASSET_SCHEME)) {
        images.push({
          src,
          alt: normalizeBlockText(current.attribs?.alt || ""),
          ...(href ? { href } : {}),
        });
      }
      return;
    }
    for (const child of childNodes(current)) walk(child, href);
  };
  walk(node);
  return images;
}

function isAllBold(runs: PolicyUpdateTextRun[]) {
  const meaningful = runs.filter((run) => normalizeBlockText(run.text));
  return meaningful.length > 0 && meaningful.every((run) => run.bold);
}

function splitBoldPrefix(runs: PolicyUpdateTextRun[]) {
  const prefix: PolicyUpdateTextRun[] = [];
  const remainder: PolicyUpdateTextRun[] = [];
  let inPrefix = true;
  for (const run of runs) {
    if (inPrefix && run.bold) prefix.push(run);
    else {
      inPrefix = false;
      remainder.push(run);
    }
  }
  const prefixText = runsText(prefix);
  if (!prefixText.endsWith(":")) return null;
  return {
    headingRuns: compactRuns(prefix),
    heading: prefixText.replace(/:\s*$/, ""),
    remainderRuns: compactRuns(remainder),
  };
}

function looksLikeHeading(text: string, runs: PolicyUpdateTextRun[], tag: string) {
  if (/^h[1-6]$/.test(tag)) return true;
  if (/^(?:why this matters(?: for zcash)?|action items?|relevant posts?|x post of the week):?$/i.test(text)) {
    return true;
  }
  return isAllBold(runs) && text.length >= 3 && text.length <= 180;
}

function shouldIgnoreIntroParagraph(text: string) {
  return (
    !text ||
    /^not a pgpz member\??/i.test(text) ||
    /^https?:\/\/(?:community|coalition)\.pgpz\.org\/updates\//i.test(text)
  );
}

function tableSummary(table: any) {
  const result = { keyTakeaways: [] as string[], actionItems: [] as string[] };
  for (const cell of descendantElements(table, "td")) {
    const paragraphs = descendantElements(cell, "p");
    const label = paragraphs.length ? runsText(extractRuns(paragraphs[0])) : "";
    const items = descendantElements(cell, "li")
      .map((item) => runsText(extractRuns(item)))
      .filter(Boolean);
    if (/key takeaways?/i.test(label)) result.keyTakeaways.push(...items);
    if (/action items?/i.test(label)) result.actionItems.push(...items);
  }
  return result;
}

function appendParagraph(section: PolicyUpdateDocumentSection, runs: PolicyUpdateTextRun[]) {
  const text = runsText(runs);
  if (!text) return;
  section.body.push(text);
  section.bodyRuns = [...(section.bodyRuns || []), compactRuns(runs)];
  mergeSectionLinks(section, runs);
}

function appendBullets(section: PolicyUpdateDocumentSection, items: PolicyUpdateTextRun[][]) {
  const nonempty = items
    .map((runs) => compactRuns(runs))
    .filter((runs) => runsText(runs));
  if (!nonempty.length) return;
  section.bullets = [...(section.bullets || []), ...nonempty.map(runsText)];
  section.bulletRuns = [...(section.bulletRuns || []), ...nonempty];
  for (const runs of nonempty) mergeSectionLinks(section, runs);
}

function finalizeSection(section: PolicyUpdateDocumentSection | null) {
  if (!section) return null;
  if (!section.bodyRuns?.length) delete section.bodyRuns;
  if (!section.bulletRuns?.length) delete section.bulletRuns;
  if (!section.headingRuns?.length) delete section.headingRuns;
  if (!section.links?.length) delete section.links;
  if (!section.images?.length) delete section.images;
  return section.body.length || section.bullets?.length || section.images?.length ? section : null;
}

function summaryFromParsedContent(
  sections: PolicyUpdateDocumentSection[],
  keyTakeaways: string[],
) {
  const narrative = sections
    .filter((section) => !/^action items?$/i.test(section.heading))
    .flatMap((section) => section.body)
    .find((paragraph) => paragraph.length >= 80);
  const source = keyTakeaways.slice(0, 2).join(" ") || narrative;
  if (!source) return "A new PGPZ policy update is available.";
  const normalized = normalizeBlockText(source);
  return normalized.length <= 520 ? normalized : `${normalized.slice(0, 517).trimEnd()}...`;
}

export async function validatePolicyUpdateDocx(bytes: Buffer) {
  if (!bytes.length || bytes.length > MAX_DOCX_BYTES) {
    throw new Error("DOCX upload must be 25 MB or smaller.");
  }
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    throw new Error("Uploaded file is not a valid DOCX package.");
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes, {
      checkCRC32: false,
      createFolders: false,
    });
  } catch {
    throw new Error("Uploaded file is not a valid DOCX package.");
  }

  const entries = Object.values(zip.files);
  if (entries.length > MAX_DOCX_ENTRIES) {
    throw new Error("DOCX package contains too many entries.");
  }

  let expandedBytes = 0;
  for (const entry of entries) {
    const originalName: string =
      typeof (entry as any).unsafeOriginalName === "string"
        ? (entry as any).unsafeOriginalName
        : entry.name;
    const normalizedName = originalName.replace(/\\/g, "/");
    if (
      normalizedName.startsWith("/") ||
      normalizedName.split("/").some((part) => part === "..")
    ) {
      throw new Error("DOCX package contains an unsafe entry path.");
    }
    const uncompressedSize = Number((entry as any)?._data?.uncompressedSize || 0);
    const compressedSize = Number((entry as any)?._data?.compressedSize || 0);
    if (Number.isFinite(uncompressedSize)) expandedBytes += Math.max(0, uncompressedSize);
    if (
      uncompressedSize > 5 * 1024 * 1024 &&
      compressedSize > 0 &&
      uncompressedSize / compressedSize > 250
    ) {
      throw new Error("DOCX package contains an unsafe compression ratio.");
    }
    if (expandedBytes > MAX_DOCX_EXPANDED_BYTES) {
      throw new Error("DOCX package expands beyond the supported size.");
    }
  }

  if (!zip.file("[Content_Types].xml") || !zip.file("word/document.xml")) {
    throw new Error("Uploaded file is not a valid Word document.");
  }
  if (
    zip.file("word/vbaProject.bin") ||
    entries.some((entry) => /(?:^|\/)vbaProject\.bin$/i.test(entry.name))
  ) {
    throw new Error("Macro-enabled Word documents are not supported.");
  }

  const contentTypes = await zip.file("[Content_Types].xml")!.async("string");
  if (/macroEnabled/i.test(contentTypes)) {
    throw new Error("Macro-enabled Word documents are not supported.");
  }

  return { entryCount: entries.length, expandedBytes };
}

export function policyUpdateArtifactPrefix(sourceObjectKey: string) {
  const clean = sourceObjectKey.trim().replace(/\/+$/, "");
  if (/\/source\.docx$/i.test(clean)) return clean.replace(/\/source\.docx$/i, "");
  return clean.replace(/\.(?:docx|pdf)$/i, "");
}

export function policyUpdateSourceObjectKey(prefix: string, slug: string) {
  const root = prefix.trim().replace(/^\/+|\/+$/g, "");
  const cleanSlug = slug.trim().replace(/^\/+|\/+$/g, "");
  return root
    ? `${root}/${cleanSlug}/source.docx`
    : `${cleanSlug}/source.docx`;
}

export function policyUpdatePdfObjectKey(sourceObjectKey: string) {
  return `${policyUpdateArtifactPrefix(sourceObjectKey)}/resource.pdf`;
}

export function policyUpdateAssetObjectKey(sourceObjectKey: string, asset: string) {
  return `${policyUpdateArtifactPrefix(sourceObjectKey)}/assets/${asset}`;
}

export function policyUpdateEmailAssetObjectPrefix(
  sourceObjectKey: string,
  materializationId: string,
) {
  return `${policyUpdateArtifactPrefix(sourceObjectKey)}/email-assets/${materializationId}`;
}

export async function parsePolicyUpdateDocx(
  bytes: Buffer,
  options: { assetBasePath: string },
): Promise<ParsedPolicyUpdateDocx> {
  await validatePolicyUpdateDocx(bytes);

  const assets: PolicyUpdateDocxAsset[] = [];
  const conversion = await mammoth.convertToHtml(
    { buffer: bytes },
    {
      styleMap: [
        "p[style-name='Title'] => h1:fresh",
        "p[style-name='Heading 1'] => h2:fresh",
        "p[style-name='Heading 2'] => h3:fresh",
        "p[style-name='Heading 3'] => h4:fresh",
        "u => u",
      ],
      convertImage: mammoth.images.imgElement(async (image) => {
        const contentType = String(image.contentType || "application/octet-stream").toLowerCase();
        const imageBytes = Buffer.from(await image.read("base64"), "base64");
        const fileName = `docx-image-${String(assets.length + 1).padStart(2, "0")}.${imageExtension(contentType)}`;
        let dimensions: ReturnType<typeof imageSize> | undefined;
        try {
          dimensions = imageSize(imageBytes);
        } catch {
          dimensions = undefined;
        }
        assets.push({
          fileName,
          contentType,
          bytes: imageBytes,
          ...(dimensions?.width ? { width: dimensions.width } : {}),
          ...(dimensions?.height ? { height: dimensions.height } : {}),
        });
        return { src: `${ASSET_SCHEME}${fileName}` };
      }),
    },
  );

  const document = parseDocument(conversion.value);
  const rootElements = childNodes(document).filter((node) => elementName(node));
  let title = "";
  let currentSection: PolicyUpdateDocumentSection | null = null;
  const sections: PolicyUpdateDocumentSection[] = [];
  const keyTakeaways: string[] = [];
  const actionItems: string[] = [];
  const assetByName = new Map(assets.map((asset) => [asset.fileName, asset]));

  const pushCurrentSection = () => {
    const finalized = finalizeSection(currentSection);
    if (finalized) sections.push(finalized);
    currentSection = null;
  };

  for (const element of rootElements) {
    const tag = elementName(element);
    if (tag === "table") {
      const extracted = tableSummary(element);
      keyTakeaways.push(...extracted.keyTakeaways);
      actionItems.push(...extracted.actionItems);
      continue;
    }

    if (tag === "ul" || tag === "ol") {
      if (!currentSection) currentSection = { heading: "Overview", body: [] };
      appendBullets(
        currentSection,
        directElements(element, "li").map((item) => extractRuns(item)),
      );
      continue;
    }

    if (!/^h[1-6]$/.test(tag) && tag !== "p") continue;

    const runs = compactRuns(extractRuns(element));
    const text = runsText(runs);
    const imageNodes = sourceImageNodes(element);

    if (!title && text && (/^h1$/.test(tag) || /(?:weekly policy memo|special update)/i.test(text))) {
      title = text;
      continue;
    }

    if (shouldIgnoreIntroParagraph(text) && !imageNodes.length) continue;

    const boldPrefix = splitBoldPrefix(runs);
    const headingLike = text && looksLikeHeading(text, runs, tag);
    if (headingLike || boldPrefix) {
      pushCurrentSection();
      const headingRuns = boldPrefix?.headingRuns || runs;
      currentSection = {
        heading: (boldPrefix?.heading || text).replace(/:\s*$/, ""),
        headingRuns,
        body: [],
      };
      mergeSectionLinks(currentSection, headingRuns);
      if (boldPrefix?.remainderRuns.length) appendParagraph(currentSection, boldPrefix.remainderRuns);
    } else if (text) {
      if (!currentSection) currentSection = { heading: "Overview", body: [] };
      appendParagraph(currentSection, runs);
    }

    if (imageNodes.length) {
      if (!currentSection) continue;
      const headingLabel = currentSection.heading || title || "policy update";
      currentSection.images = [
        ...(currentSection.images || []),
        ...imageNodes.map((image, index) => {
          const fileName = image.src.slice(ASSET_SCHEME.length);
          const asset = assetByName.get(fileName);
          return {
            src: `${options.assetBasePath.replace(/\/+$/, "")}/${encodeURIComponent(fileName)}`,
            alt: image.alt || `${headingLabel} source graphic${imageNodes.length > 1 ? ` ${index + 1}` : ""}`,
            ...(asset?.width ? { width: asset.width } : {}),
            ...(asset?.height ? { height: asset.height } : {}),
            ...(image.href ? { href: image.href } : {}),
          };
        }),
      ];
      for (const image of imageNodes) {
        if (image.href) {
          mergeSectionLinks(currentSection, [
            { text: currentSection.heading, href: image.href },
          ]);
        }
      }
    }
  }
  pushCurrentSection();

  const finalTitle = title || "Policy Update";
  const summary = summaryFromParsedContent(sections, keyTakeaways);
  const sourceText = [
    finalTitle,
    ...keyTakeaways,
    ...actionItems,
    ...sections.flatMap((section) => [
      section.heading,
      ...section.body,
      ...(section.bullets || []),
    ]),
  ]
    .filter(Boolean)
    .join("\n");
  const emailPreheader =
    summary.length <= 220 ? summary : `${summary.slice(0, 217).trimEnd()}...`;

  return {
    title: finalTitle,
    shortTitle: finalTitle.replace(/^Weekly Policy Memo:\s*Week of\s*/i, "Weekly Policy Memo: "),
    summary,
    emailPreheader,
    keyTakeaways,
    actionItems,
    sections,
    assets,
    sourceText,
    sourceTextSha256: createHash("sha256").update(sourceText).digest("hex"),
    warnings: conversion.messages.map((message) => message.message).filter(Boolean),
  };
}

type RenderPdfOptions = {
  brandName: string;
  categoryLabel: string;
  portalUrl?: string;
  publishedAt?: string;
};

function pdfBufferFromDocument(doc: PDFKit.PDFDocument) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

function writePdfRuns(
  doc: PDFKit.PDFDocument,
  runs: PolicyUpdateTextRun[] | undefined,
  fallback: string,
  options: PDFKit.Mixins.TextOptions & { x?: number } = {},
) {
  const content = runs?.length ? runs : [{ text: fallback }];
  const { x = 54, ...textOptions } = options;
  const startY = doc.y;
  content.forEach((run, index) => {
    const configured = doc
      .font(run.bold ? "Helvetica-Bold" : run.italic ? "Helvetica-Oblique" : "Helvetica")
      .fillColor(run.href ? "#1f4f7a" : "#334155");
    const runOptions: PDFKit.Mixins.TextOptions = {
      ...textOptions,
      continued: index < content.length - 1,
      link: run.href || (null as unknown as string),
      underline: !!(run.href || run.underline),
    };
    if (index === 0) configured.text(run.text, x, startY, runOptions);
    else configured.text(run.text, runOptions);
  });
  doc.x = 54;
}

function ensurePdfSpace(doc: PDFKit.PDFDocument, height: number) {
  if (doc.y + height > doc.page.height - 64) doc.addPage();
}

export async function renderPolicyUpdatePdf(
  content: Pick<
    ParsedPolicyUpdateDocx,
    "title" | "summary" | "keyTakeaways" | "actionItems" | "sections" | "assets"
  >,
  options: RenderPdfOptions,
) {
  const doc = new PDFDocument({
    size: "LETTER",
    margins: { top: 70, right: 54, bottom: 62, left: 54 },
    info: {
      Title: content.title,
      Author: options.brandName,
      Subject: options.categoryLabel,
      Creator: `${options.brandName} DOCX policy-update pipeline`,
    },
    bufferPages: true,
    autoFirstPage: false,
  });
  const result = pdfBufferFromDocument(doc);
  const assetByName = new Map(content.assets.map((asset) => [asset.fileName, asset]));

  const drawHeader = () => {
    doc
      .save()
      .font("Helvetica-Bold")
      .fontSize(8.5)
      .fillColor("#1e293b")
      .text(options.brandName, 54, 30, { width: 300 });
    doc
      .font("Helvetica")
      .fillColor("#64748b")
      .text(options.categoryLabel, 330, 30, { width: 228, align: "right" })
      .moveTo(54, 47)
      .lineTo(558, 47)
      .lineWidth(1.5)
      .strokeColor("#f5a800")
      .stroke()
      .restore();
    doc.x = 54;
    doc.y = 70;
  };
  doc.on("pageAdded", drawHeader);
  doc.addPage();

  doc.font("Helvetica-Bold").fontSize(22).fillColor("#172033").text(content.title, {
    lineGap: 2,
  });
  doc.moveDown(0.5);
  const metadataLine = [options.categoryLabel, options.publishedAt].filter(Boolean).join("  •  ");
  if (metadataLine) {
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#946200").text(metadataLine.toUpperCase(), {
      characterSpacing: 0.45,
    });
    doc.moveDown(0.65);
  }
  if (options.portalUrl) {
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#1f4f7a")
      .text(options.portalUrl, { link: options.portalUrl, underline: true });
    doc.moveDown(0.8);
  }
  if (content.summary) {
    doc
      .font("Helvetica")
      .fontSize(10.5)
      .fillColor("#475569")
      .text(content.summary, { lineGap: 2 });
    doc.moveDown(1);
  }

  const writeSummaryList = (heading: string, items: string[]) => {
    if (!items.length) return;
    ensurePdfSpace(doc, 80);
    const blockTop = doc.y;
    doc
      .roundedRect(54, blockTop, 504, 26, 5)
      .fillAndStroke("#fff7df", "#e8c761");
    doc
      .font("Helvetica-Bold")
      .fontSize(11)
      .fillColor("#172033")
      .text(heading, 66, blockTop + 7, { width: 480 });
    doc.x = 54;
    doc.y = blockTop + 36;
    for (const item of items) {
      ensurePdfSpace(doc, 34);
      const y = doc.y + 5;
      doc.circle(62, y, 2).fill("#f5a800");
      doc
        .font("Helvetica")
        .fontSize(9.5)
        .fillColor("#334155")
        .text(item, 72, doc.y, { width: 474, lineGap: 1.5 });
      doc.moveDown(0.35);
    }
    doc.moveDown(0.65);
  };

  writeSummaryList("Key Takeaways", content.keyTakeaways);
  writeSummaryList("Action Items", content.actionItems);

  for (const section of content.sections) {
    ensurePdfSpace(doc, 70);
    doc
      .moveTo(54, doc.y)
      .lineTo(558, doc.y)
      .lineWidth(0.6)
      .strokeColor("#d9dee7")
      .stroke();
    doc.moveDown(0.75);
    doc.fontSize(14);
    writePdfRuns(doc, section.headingRuns, section.heading, {
      width: 504,
      lineGap: 1.5,
    });
    doc.moveDown(0.55);

    section.body.forEach((paragraph, index) => {
      doc.fontSize(10.25);
      writePdfRuns(doc, section.bodyRuns?.[index], paragraph, {
        width: 504,
        lineGap: 2,
      });
      doc.moveDown(0.65);
    });

    (section.bullets || []).forEach((item, index) => {
      ensurePdfSpace(doc, 30);
      const y = doc.y + 5;
      doc.circle(62, y, 2).fill("#f5a800");
      doc.fontSize(10);
      const startY = doc.y;
      writePdfRuns(doc, section.bulletRuns?.[index], item, {
        x: 72,
        width: 474,
        lineGap: 1.8,
      });
      if (doc.y === startY) doc.moveDown();
      doc.moveDown(0.35);
    });

    for (const image of section.images || []) {
      const fileName = decodeURIComponent(image.src.split("/").at(-1) || "");
      const asset = assetByName.get(fileName);
      if (!asset || !/image\/(?:png|jpe?g)/i.test(asset.contentType)) continue;
      const availableWidth = 480;
      const naturalWidth = asset.width || image.width || availableWidth;
      const naturalHeight = asset.height || image.height || 320;
      const scale = Math.min(1, availableWidth / naturalWidth, 420 / naturalHeight);
      const width = Math.max(1, naturalWidth * scale);
      const height = Math.max(1, naturalHeight * scale);
      ensurePdfSpace(doc, height + 24);
      const x = 54 + (504 - width) / 2;
      doc.image(asset.bytes, x, doc.y, {
        width,
        height,
        ...(image.href ? { link: image.href } : {}),
      });
      doc.y += height + 12;
    }
    doc.moveDown(0.4);
  }

  const range = doc.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index += 1) {
    doc.switchToPage(index);
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor("#64748b")
      .text(
        `${options.brandName}  •  ${index + 1} of ${range.count}`,
        54,
        doc.page.height - 38,
        { width: 504, align: "center" },
      );
  }
  doc.end();
  return result;
}
