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
const PAGE_BREAK_TOKEN = "[[PGPZ_PAGE_BREAK]]";
const EMUS_PER_POINT = 12_700;

export type PolicyUpdateTextRun = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  href?: string;
  pageBreakBefore?: boolean;
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
  displayWidthPt?: number;
  displayHeightPt?: number;
  href?: string;
  pageBreakBefore?: boolean;
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
  displayWidthPt?: number;
  displayHeightPt?: number;
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
  coverCta?: PolicyUpdateDocumentImage;
  sourcePageCount?: number;
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
      ...(raw.pageBreakBefore ? { pageBreakBefore: true } : {}),
    };
    const previous = runs.at(-1);
    if (previous && !next.pageBreakBefore && sameRunStyle(previous, next)) previous.text += next.text;
    else runs.push(next);
  }

  if (!runs.length) return runs;
  runs[0].text = runs[0].text.replace(/^\s+/, "");
  runs[runs.length - 1].text = runs[runs.length - 1].text.replace(/\s+$/, "");
  return runs.filter((run) => run.text.length > 0);
}

function splitPageBreakRuns(input: PolicyUpdateTextRun[]) {
  const runs: PolicyUpdateTextRun[] = [];
  let pendingPageBreak = false;

  for (const raw of input) {
    const parts = raw.text.split(PAGE_BREAK_TOKEN);
    parts.forEach((part, index) => {
      if (index > 0) pendingPageBreak = true;
      if (!part) return;
      runs.push({
        ...raw,
        text: part,
        ...(pendingPageBreak ? { pageBreakBefore: true } : {}),
      });
      pendingPageBreak = false;
    });
  }

  return {
    runs: compactRuns(runs),
    trailingPageBreak: pendingPageBreak,
  };
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

function relationshipTargets(xml: string) {
  const targets = new Map<string, string>();
  for (const match of xml.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const attributes = match[1] || "";
    const id = attributes.match(/\bId="([^"]+)"/)?.[1];
    const target = attributes.match(/\bTarget="([^"]+)"/)?.[1];
    if (id && target) targets.set(id, target.replace(/\\/g, "/"));
  }
  return targets;
}

async function imageDisplaySizeBySha256(
  zip: JSZip,
  documentXml: string,
  relationshipsXml: string,
) {
  const targets = relationshipTargets(relationshipsXml);
  const sizes = new Map<
    string,
    Array<{ displayWidthPt: number; displayHeightPt: number }>
  >();

  for (const match of documentXml.matchAll(/<w:drawing\b[\s\S]*?<\/w:drawing>/g)) {
    const drawing = match[0];
    const extent = drawing.match(
      /<wp:extent\b[^>]*\bcx="(\d+)"[^>]*\bcy="(\d+)"[^>]*\/?>/,
    );
    const relationshipId = drawing.match(/<a:blip\b[^>]*\br:embed="([^"]+)"/)?.[1];
    if (!extent || !relationshipId) continue;

    const target = targets.get(relationshipId);
    if (!target) continue;
    const normalizedTarget = target.replace(/^\/+/, "").replace(/^word\//, "");
    const entry = zip.file(`word/${normalizedTarget}`);
    if (!entry) continue;

    const bytes = Buffer.from(await entry.async("nodebuffer"));
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const occurrences = sizes.get(sha256) || [];
    occurrences.push({
      displayWidthPt: Number(extent[1]) / EMUS_PER_POINT,
      displayHeightPt: Number(extent[2]) / EMUS_PER_POINT,
    });
    sizes.set(sha256, occurrences);
  }

  return sizes;
}

function sourcePageCountFromAppXml(xml: string) {
  const value = Number(xml.match(/<(?:\w+:)?Pages>\s*(\d+)\s*<\/(?:\w+:)?Pages>/i)?.[1]);
  return Number.isInteger(value) && value > 0 && value <= 10_000 ? value : undefined;
}

function docxWithPageBreakTokens(zip: JSZip, documentXml: string) {
  const tokenRun = `<w:t>${PAGE_BREAK_TOKEN}</w:t>`;
  const markedDocumentXml = documentXml
    .replace(/<w:lastRenderedPageBreak\s*\/>/g, tokenRun)
    .replace(/<w:br\b[^>]*\bw:type="page"[^>]*\/>/g, tokenRun);
  zip.file("word/document.xml", markedDocumentXml);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
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

  const zip = await JSZip.loadAsync(bytes);
  const documentXml = await zip.file("word/document.xml")!.async("string");
  const relationshipsXml =
    (await zip.file("word/_rels/document.xml.rels")?.async("string")) || "";
  const appXml = (await zip.file("docProps/app.xml")?.async("string")) || "";
  const sourcePageCount = sourcePageCountFromAppXml(appXml);
  const displaySizeBySha256 = await imageDisplaySizeBySha256(
    zip,
    documentXml,
    relationshipsXml,
  );
  const displaySizeOccurrenceBySha256 = new Map<string, number>();
  const mammothBytes = await docxWithPageBreakTokens(zip, documentXml);
  const assets: PolicyUpdateDocxAsset[] = [];
  const conversion = await mammoth.convertToHtml(
    { buffer: mammothBytes },
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
        const sha256 = createHash("sha256").update(imageBytes).digest("hex");
        const displaySizes = displaySizeBySha256.get(sha256) || [];
        const occurrence = displaySizeOccurrenceBySha256.get(sha256) || 0;
        const displaySize = displaySizes[Math.min(occurrence, displaySizes.length - 1)];
        displaySizeOccurrenceBySha256.set(sha256, occurrence + 1);
        assets.push({
          fileName,
          contentType,
          bytes: imageBytes,
          ...(dimensions?.width ? { width: dimensions.width } : {}),
          ...(dimensions?.height ? { height: dimensions.height } : {}),
          ...(displaySize?.displayWidthPt
            ? { displayWidthPt: displaySize.displayWidthPt }
            : {}),
          ...(displaySize?.displayHeightPt
            ? { displayHeightPt: displaySize.displayHeightPt }
            : {}),
        });
        return { src: `${ASSET_SCHEME}${fileName}` };
      }),
    },
  );

  const document = parseDocument(conversion.value);
  const rootElements = childNodes(document).filter((node) => elementName(node));
  let title = "";
  let currentSection: PolicyUpdateDocumentSection | null = null;
  let coverCta: PolicyUpdateDocumentImage | undefined;
  let pendingCoverCtaCaption = "";
  let pendingPageBreak = false;
  const sections: PolicyUpdateDocumentSection[] = [];
  const keyTakeaways: string[] = [];
  const actionItems: string[] = [];
  const assetByName = new Map(assets.map((asset) => [asset.fileName, asset]));

  const pushCurrentSection = () => {
    const finalized = finalizeSection(currentSection);
    if (finalized) sections.push(finalized);
    currentSection = null;
  };

  const prepareRuns = (rawRuns: PolicyUpdateTextRun[]) => {
    const inheritedPageBreak = pendingPageBreak;
    const split = splitPageBreakRuns(rawRuns);
    const runs = split.runs;
    if (inheritedPageBreak && runs.length) {
      runs[0] = { ...runs[0], pageBreakBefore: true };
    }
    pendingPageBreak =
      split.trailingPageBreak || (inheritedPageBreak && runs.length === 0);
    return runs;
  };

  const documentImageFromNode = (
    image: { src: string; alt: string; href?: string },
    headingLabel: string,
    index: number,
    count: number,
    pageBreakBefore = false,
  ): PolicyUpdateDocumentImage => {
    const fileName = image.src.slice(ASSET_SCHEME.length);
    const asset = assetByName.get(fileName);
    return {
      src: `${options.assetBasePath.replace(/\/+$/, "")}/${encodeURIComponent(fileName)}`,
      alt: image.alt || `${headingLabel} source graphic${count > 1 ? ` ${index + 1}` : ""}`,
      ...(asset?.width ? { width: asset.width } : {}),
      ...(asset?.height ? { height: asset.height } : {}),
      ...(asset?.displayWidthPt ? { displayWidthPt: asset.displayWidthPt } : {}),
      ...(asset?.displayHeightPt ? { displayHeightPt: asset.displayHeightPt } : {}),
      ...(image.href ? { href: image.href } : {}),
      ...(pageBreakBefore ? { pageBreakBefore: true } : {}),
    };
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
      const items = directElements(element, "li").map((item) =>
        prepareRuns(extractRuns(item)),
      );
      appendBullets(currentSection, items);
      continue;
    }

    const imageNodes = sourceImageNodes(element);
    if (!/^h[1-6]$/.test(tag) && tag !== "p" && !imageNodes.length) continue;

    const runs = prepareRuns(extractRuns(element));
    const text = runsText(runs);

    if (!title && text && (/^h1$/.test(tag) || /(?:weekly policy memo|special update)/i.test(text))) {
      title = text;
      continue;
    }

    if (/^not a pgpz member\??/i.test(text)) {
      pendingCoverCtaCaption = text;
      if (!imageNodes.length) continue;
    }

    if (
      imageNodes.length &&
      !currentSection &&
      sections.length === 0 &&
      (pendingCoverCtaCaption || imageNodes[0]?.alt.toLowerCase().includes("qr"))
    ) {
      const imageBreak = pendingPageBreak;
      pendingPageBreak = false;
      coverCta = {
        ...documentImageFromNode(
          imageNodes[0],
          title || "policy update",
          0,
          1,
          imageBreak,
        ),
        ...(pendingCoverCtaCaption ? { caption: pendingCoverCtaCaption } : {}),
      };
      pendingCoverCtaCaption = "";
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
      if (!currentSection) currentSection = { heading: "Overview", body: [] };
      const headingLabel = currentSection.heading || title || "policy update";
      const imageBreak = pendingPageBreak;
      pendingPageBreak = false;
      currentSection.images = [
        ...(currentSection.images || []),
        ...imageNodes.map((image, index) =>
          documentImageFromNode(
            image,
            headingLabel,
            index,
            imageNodes.length,
            imageBreak && index === 0,
          ),
        ),
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
  const summary = "A new PGPZ policy update is available.";
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
    ...(coverCta ? { coverCta } : {}),
    ...(sourcePageCount ? { sourcePageCount } : {}),
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
  const content: PolicyUpdateTextRun[] = runs?.length ? runs : [{ text: fallback }];
  const { x = 54, ...textOptions } = options;
  const groups: PolicyUpdateTextRun[][] = [];
  const groupStartsWithPageBreak: boolean[] = [];
  for (const run of content) {
    if (run.pageBreakBefore || !groups.length) {
      groups.push([]);
      groupStartsWithPageBreak.push(!!run.pageBreakBefore);
    }
    groups.at(-1)!.push({ ...run, pageBreakBefore: undefined });
  }

  groups.forEach((group, groupIndex) => {
    if (
      (groupIndex > 0 || groupStartsWithPageBreak[groupIndex]) &&
      !isAtPdfContentTop(doc)
    ) {
      doc.addPage();
    }
    const startY = doc.y;
    group.forEach((run, index) => {
      const configured = doc
        .font(run.bold ? "Helvetica-Bold" : run.italic ? "Helvetica-Oblique" : "Helvetica")
        .fillColor(run.href ? "#1f4f7a" : "#172033");
      const runOptions: PDFKit.Mixins.TextOptions = {
        ...textOptions,
        continued: index < group.length - 1,
        ...(run.href ? { link: run.href } : {}),
        underline: !!(run.href || run.underline),
      };
      if (index === 0) configured.text(run.text, x, startY, runOptions);
      else configured.text(run.text, runOptions);
    });
  });
  doc.x = 72;
}

const pdfContentTop = new WeakMap<PDFKit.PDFDocument, number>();

function isAtPdfContentTop(doc: PDFKit.PDFDocument) {
  return doc.y <= (pdfContentTop.get(doc) || doc.page.margins.top) + 2;
}

function addSourcePdfPage(doc: PDFKit.PDFDocument) {
  if (!isAtPdfContentTop(doc)) doc.addPage();
}

function ensurePdfSpace(doc: PDFKit.PDFDocument, height: number) {
  if (doc.y + height > doc.page.height - doc.page.margins.bottom - 8) doc.addPage();
}

export async function renderPolicyUpdatePdf(
  content: Pick<
    ParsedPolicyUpdateDocx,
    | "title"
    | "summary"
    | "keyTakeaways"
    | "actionItems"
    | "sections"
    | "assets"
    | "coverCta"
    | "sourcePageCount"
  >,
  options: RenderPdfOptions,
) {
  const doc = new PDFDocument({
    size: "LETTER",
    margins: { top: 70, right: 72, bottom: 54, left: 72 },
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
  const pageWidth = 612;
  const contentLeft = 72;
  const contentWidth = 468;
  let createdPageCount = 0;

  const drawPageFurniture = () => {
    createdPageCount += 1;
    const isOddPage = createdPageCount % 2 === 1;
    if (isOddPage) {
      doc
        .save()
        .rect(0, 0, pageWidth, 37.3)
        .fill("#17130a")
        .font("Helvetica")
        .fontSize(11)
        .fillColor("#ffe6a3")
        .text(options.brandName, contentLeft, 22, {
          width: 220,
          lineBreak: false,
          height: 12,
        })
        .text("Member Policy Resource", 320, 22, {
          width: 220,
          align: "right",
          lineBreak: false,
          height: 12,
        })
        .restore();
    }
    const top = isOddPage ? 70 : 16;
    pdfContentTop.set(doc, top);
    doc.x = contentLeft;
    doc.y = top;
  };
  doc.on("pageAdded", drawPageFurniture);
  doc.addPage();

  const coverImageFileName = content.coverCta
    ? decodeURIComponent(content.coverCta.src.split("/").at(-1) || "")
    : "";
  const coverImageAsset = coverImageFileName
    ? assetByName.get(coverImageFileName)
    : undefined;
  const coverTitleWidth = coverImageAsset ? 380 : contentWidth;
  doc
    .font("Helvetica")
    .fontSize(14)
    .fillColor("#111111")
    .text(content.title, contentLeft, 82, {
      width: coverTitleWidth,
      lineGap: 1,
    });
  if (options.portalUrl) {
    doc
      .font("Helvetica-Bold")
      .fontSize(9.5)
      .fillColor("#946200")
      .text(options.portalUrl, contentLeft, Math.max(105, doc.y + 7), {
        width: coverTitleWidth,
        link: options.portalUrl,
        underline: false,
      });
  }

  if (coverImageAsset && /image\/(?:png|jpe?g)/i.test(coverImageAsset.contentType)) {
    const qrLeft = 465;
    const qrTop = 68;
    const qrSize = 75.25;
    doc
      .font("Helvetica")
      .fontSize(6.5)
      .fillColor("#111111")
      .text(content.coverCta?.caption || "Not a PGPZ member? Sign up here:", qrLeft - 4, 51, {
        width: qrSize + 8,
        height: 20,
        lineGap: 0,
      })
      .rect(qrLeft - 1, qrTop - 1, qrSize + 2, qrSize + 2)
      .lineWidth(0.6)
      .strokeColor("#f5a800")
      .stroke()
      .image(coverImageAsset.bytes, qrLeft, qrTop, {
        width: qrSize,
        height: qrSize,
      });
  }

  doc
    .moveTo(contentLeft, 158)
    .lineTo(contentLeft + contentWidth, 158)
    .lineWidth(6)
    .strokeColor("#f5a800")
    .stroke();

  const drawCoverListColumn = ({
    x,
    top,
    width,
    height,
    heading,
    items,
    fill,
  }: {
    x: number;
    top: number;
    width: number;
    height: number;
    heading: string;
    items: string[];
    fill: string;
  }) => {
    doc
      .save()
      .rect(x, top, width, height)
      .lineWidth(1)
      .fillAndStroke(fill, "#111111")
      .font("Helvetica-Bold")
      .fontSize(11.5)
      .fillColor("#111111")
      .text(heading, x + 8, top + 9, {
        width: width - 16,
        height: 16,
        lineBreak: false,
      });

    const itemWidth = width - 42;
    const availableHeight = height - 44;
    let fontSize = 10.5;
    const measuredHeight = (size: number) =>
      items.reduce(
        (sum, item) =>
          sum +
          doc
            .font("Helvetica")
            .fontSize(size)
            .heightOfString(item, { width: itemWidth, lineGap: 1.5 }) +
          8,
        0,
      );
    while (fontSize > 7.75 && measuredHeight(fontSize) > availableHeight) {
      fontSize -= 0.25;
    }

    let y = top + 35;
    for (const item of items) {
      const itemHeight = doc
        .font("Helvetica")
        .fontSize(fontSize)
        .heightOfString(item, { width: itemWidth, lineGap: 1.5 });
      doc
        .circle(x + 20, y + Math.min(5, itemHeight / 2), 2.5)
        .fill("#111111")
        .font("Helvetica")
        .fontSize(fontSize)
        .fillColor("#111111")
        .text(item, x + 32, y, {
          width: itemWidth,
          lineGap: 1.5,
          height: Math.max(itemHeight + 2, 10),
        });
      y += itemHeight + 8;
    }
    doc.restore();
  };

  if (content.keyTakeaways.length || content.actionItems.length) {
    const tableTop = 194;
    const tableHeight = 466;
    const columnWidth = contentWidth / 2;
    drawCoverListColumn({
      x: contentLeft,
      top: tableTop,
      width: columnWidth,
      height: tableHeight,
      heading: "Key Takeaways",
      items: content.keyTakeaways,
      fill: "#fff3ca",
    });
    drawCoverListColumn({
      x: contentLeft + columnWidth,
      top: tableTop,
      width: columnWidth,
      height: tableHeight,
      heading: "Action Items",
      items: content.actionItems,
      fill: "#fff9ea",
    });
    doc.x = contentLeft;
    doc.y = tableTop + tableHeight;
  } else if (content.summary) {
    doc
      .roundedRect(contentLeft, 194, contentWidth, 90, 2)
      .fillAndStroke("#fff9ea", "#111111")
      .font("Helvetica")
      .fontSize(11)
      .fillColor("#111111")
      .text(content.summary, contentLeft + 12, 208, {
        width: contentWidth - 24,
        lineGap: 2,
      });
  }

  const sectionStartsWithPageBreak = (section: PolicyUpdateDocumentSection) =>
    !!section.headingRuns?.[0]?.pageBreakBefore;

  for (const section of content.sections) {
    if (sectionStartsWithPageBreak(section)) addSourcePdfPage(doc);
    ensurePdfSpace(doc, 38);

    const isArticleHeading = !/^(?:overview|why this matters(?: for zcash)?|action items?|relevant posts?|x post of the week)$/i.test(
      section.heading,
    );
    if (isArticleHeading) {
      doc
        .moveTo(contentLeft, doc.y)
        .lineTo(contentLeft + contentWidth, doc.y)
        .lineWidth(1.5)
        .strokeColor("#f79646")
        .stroke();
      doc.moveDown(0.8);
    }

    doc.fontSize(isArticleHeading ? 14 : 13);
    writePdfRuns(doc, section.headingRuns, section.heading, {
      x: contentLeft,
      width: contentWidth,
      lineGap: 1.5,
    });
    doc.moveDown(0.55);

    section.body.forEach((paragraph, index) => {
      doc.fontSize(10.5);
      writePdfRuns(doc, section.bodyRuns?.[index], paragraph, {
        x: contentLeft,
        width: contentWidth,
        lineGap: 2,
      });
      doc.moveDown(0.65);
    });

    (section.bullets || []).forEach((item, index) => {
      const sourceRuns = section.bulletRuns?.[index];
      const startsWithPageBreak = !!sourceRuns?.[0]?.pageBreakBefore;
      if (startsWithPageBreak) addSourcePdfPage(doc);
      const bulletRuns = startsWithPageBreak
        ? sourceRuns?.map((run, runIndex) =>
            runIndex === 0 ? { ...run, pageBreakBefore: undefined } : run,
          )
        : sourceRuns;
      ensurePdfSpace(doc, 28);
      const y = doc.y + 5;
      doc.circle(contentLeft + 8, y, 1.6).fill("#111111");
      doc.fontSize(10.25);
      writePdfRuns(doc, bulletRuns, item, {
        x: contentLeft + 22,
        width: contentWidth - 22,
        lineGap: 1.6,
      });
      doc.moveDown(0.3);
    });

    for (const image of section.images || []) {
      if (image.pageBreakBefore) addSourcePdfPage(doc);
      const fileName = decodeURIComponent(image.src.split("/").at(-1) || "");
      const asset = assetByName.get(fileName);
      if (!asset || !/image\/(?:png|jpe?g)/i.test(asset.contentType)) continue;

      const naturalWidth =
        image.displayWidthPt ||
        asset.displayWidthPt ||
        (image.width || asset.width || contentWidth) * 0.75;
      const naturalHeight =
        image.displayHeightPt ||
        asset.displayHeightPt ||
        (image.height || asset.height || 320) * 0.75;
      const scale = Math.min(1, contentWidth / naturalWidth, 430 / naturalHeight);
      let width = Math.max(1, naturalWidth * scale);
      let height = Math.max(1, naturalHeight * scale);
      const remainingHeight =
        doc.page.height - doc.page.margins.bottom - 8 - doc.y;
      if (
        !image.pageBreakBefore &&
        height > remainingHeight &&
        remainingHeight >= Math.max(120, height * 0.72)
      ) {
        const remainingScale = remainingHeight / height;
        width *= remainingScale;
        height = remainingHeight;
      } else {
        ensurePdfSpace(doc, height + 8);
      }

      const x = contentLeft + (contentWidth - width) / 2;
      doc.image(asset.bytes, x, doc.y, {
        width,
        height,
        ...(image.href ? { link: image.href } : {}),
      });
      doc.y += height + 10;
    }
    doc.moveDown(0.25);
  }

  const range = doc.bufferedPageRange();
  const siteHost = (() => {
    try {
      return options.portalUrl ? new URL(options.portalUrl).host : "";
    } catch {
      return "";
    }
  })();
  for (let index = range.start; index < range.start + range.count; index += 1) {
    doc.switchToPage(index);
    const pageNumber = index - range.start + 1;
    const previousBottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor("#111111")
      .text(
        pageNumber % 2 === 1
          ? `${siteHost || options.brandName} | ${options.brandName} | Page ${pageNumber}`
          : String(pageNumber),
        contentLeft,
        doc.page.height - 34,
        {
          width: contentWidth,
          align: pageNumber % 2 === 1 ? "center" : "right",
          height: 10,
          lineBreak: false,
        },
      );
    doc.page.margins.bottom = previousBottomMargin;
  }
  const renderedPageCount = doc.bufferedPageRange().count;
  doc.end();
  const pdf = await result;
  if (content.sourcePageCount && renderedPageCount !== content.sourcePageCount) {
    throw new Error(
      `Generated PDF has ${renderedPageCount} pages, but the Word source has ${content.sourcePageCount}. Review the DOCX page breaks before publishing.`,
    );
  }
  return pdf;
}
