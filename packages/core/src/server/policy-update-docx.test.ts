import JSZip from "jszip";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import {
  parsePolicyUpdateDocx,
  policyUpdateArtifactPrefix,
  policyUpdateAssetObjectKey,
  policyUpdateEmailAssetObjectPrefix,
  policyUpdatePdfObjectKey,
  policyUpdateSourceObjectKey,
  renderPolicyUpdatePdf,
  validatePolicyUpdateDocx,
} from "./policy-update-docx";

async function exampleDocx() {
  const zip = new JSZip();
  zip.file(
    "docProps/app.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
        <Pages>1</Pages>
      </Properties>`,
  );
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
        <Default Extension="xml" ContentType="application/xml"/>
        <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
        <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
        <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
      </Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
      </Relationships>`,
  );
  zip.file(
    "word/_rels/document.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
        <Relationship Id="rIdNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
        <Relationship Id="rIdLink" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.org/source" TargetMode="External"/>
      </Relationships>`,
  );
  zip.file(
    "word/styles.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:style w:type="paragraph" w:styleId="Normal" w:default="1"><w:name w:val="Normal"/></w:style>
        <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/></w:style>
      </w:styles>`,
  );
  zip.file(
    "word/numbering.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:abstractNum w:abstractNumId="0">
          <w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/></w:lvl>
        </w:abstractNum>
        <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
      </w:numbering>`,
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
        xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
        <w:body>
          <w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t>Weekly Policy Memo: Week of July 20, 2026</w:t></w:r></w:p>
          <w:tbl><w:tr>
            <w:tc>
              <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Key Takeaways</w:t></w:r></w:p>
              <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>First takeaway.</w:t></w:r></w:p>
            </w:tc>
            <w:tc>
              <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Action Items</w:t></w:r></w:p>
              <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>First action.</w:t></w:r></w:p>
            </w:tc>
          </w:tr></w:tbl>
          <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Policy Development Heading</w:t></w:r></w:p>
          <w:p>
            <w:r><w:t xml:space="preserve">Read the </w:t></w:r>
            <w:hyperlink r:id="rIdLink"><w:r><w:rPr><w:b/></w:rPr><w:t>primary source</w:t></w:r></w:hyperlink>
            <w:r><w:t xml:space="preserve"> for details.</w:t></w:r>
          </w:p>
          <w:sectPr/>
        </w:body>
      </w:document>`,
  );
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

async function exampleDocxWithoutSummaryWithImage() {
  const zip = await JSZip.loadAsync(await exampleDocx());
  const documentXml = await zip.file("word/document.xml")!.async("string");
  const relationshipsXml = await zip.file("word/_rels/document.xml.rels")!.async("string");
  const contentTypesXml = await zip.file("[Content_Types].xml")!.async("string");
  const imageParagraph = `
    <w:p><w:r><w:drawing><wp:inline>
      <wp:extent cx="9525" cy="9525"/>
      <wp:docPr id="1" name="Picture 1" descr="Source graphic"/>
      <wp:cNvGraphicFramePr/>
      <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
        <pic:pic>
          <pic:nvPicPr><pic:cNvPr id="1" name="Picture 1" descr="Source graphic"/><pic:cNvPicPr/></pic:nvPicPr>
          <pic:blipFill><a:blip r:embed="rIdImage"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
          <pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="9525" cy="9525"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>
        </pic:pic>
      </a:graphicData></a:graphic>
    </wp:inline></w:drawing></w:r></w:p>`;

  zip.file(
    "word/document.xml",
    documentXml
      .replace(
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"',
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"',
      )
      .replace(/<w:tbl>[\s\S]*?<\/w:tbl>/, "")
      .replace(
        /(<w:p><w:r><w:rPr><w:b\/><\/w:rPr><w:t>Policy Development Heading<\/w:t><\/w:r><\/w:p>)/,
        `$1${imageParagraph}`,
      ),
  );
  zip.file(
    "word/_rels/document.xml.rels",
    relationshipsXml.replace(
      "</Relationships>",
      '<Relationship Id="rIdImage" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/></Relationships>',
    ),
  );
  zip.file(
    "[Content_Types].xml",
    contentTypesXml.replace(
      "</Types>",
      '<Default Extension="png" ContentType="image/png"/></Types>',
    ),
  );
  zip.file(
    "word/media/image1.png",
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC",
      "base64",
    ),
  );
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

async function exampleDocxWithReusedImageSizes() {
  const zip = await JSZip.loadAsync(await exampleDocxWithoutSummaryWithImage());
  const documentXml = await zip.file("word/document.xml")!.async("string");
  const imageParagraph = documentXml.match(
    /<w:p><w:r><w:drawing>[\s\S]*?<\/w:drawing><\/w:r><\/w:p>/,
  )?.[0];
  if (!imageParagraph) throw new Error("Expected an image paragraph in the fixture.");
  zip.file(
    "word/document.xml",
    documentXml.replace(
      imageParagraph,
      `${imageParagraph}${imageParagraph.replaceAll("9525", "19050")}`,
    ),
  );
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

async function exampleDocxWithMismatchedImageBytes() {
  const zip = await JSZip.loadAsync(await exampleDocxWithoutSummaryWithImage());
  zip.file("word/media/image1.png", Buffer.from("not-a-png"));
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

async function exampleDocxWithPageBreakMarkers() {
  const zip = await JSZip.loadAsync(await exampleDocx());
  const documentXml = await zip.file("word/document.xml")!.async("string");
  zip.file(
    "word/document.xml",
    documentXml
      .replace(
        /(<w:p><w:r><w:rPr><w:b\/><\/w:rPr><w:t>Policy Development Heading<\/w:t><\/w:r><\/w:p>)/,
        '<w:p><w:r><w:br w:type="page"/></w:r></w:p><w:p><w:r><w:lastRenderedPageBreak/></w:r></w:p>$1',
      )
      .replace(
        '<w:r><w:t xml:space="preserve">Read the </w:t></w:r>',
        '<w:r><w:lastRenderedPageBreak/><w:t xml:space="preserve">Read the </w:t></w:r>',
      ),
  );
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

async function exampleDocxWithDividers() {
  const zip = await JSZip.loadAsync(await exampleDocx());
  const documentXml = await zip.file("word/document.xml")!.async("string");
  const divider =
    '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="12" w:space="1" w:color="F79646"/></w:pBdr></w:pPr></w:p>';
  zip.file(
    "word/document.xml",
    documentXml
      .replace(
        /(<w:p><w:r><w:rPr><w:b\/><\/w:rPr><w:t>Policy Development Heading<\/w:t><\/w:r><\/w:p>)/,
        `${divider}$1`,
      )
      .replace(
        "<w:sectPr/>",
        `${divider}
          <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Second Policy Heading</w:t></w:r></w:p>
          <w:p><w:r><w:t>Second policy body.</w:t></w:r></w:p>
          ${divider}
          <w:sectPr/>`,
      ),
  );
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

const pdfPageCount = (pdf: Buffer) =>
  pdf.toString("latin1").match(/\/Type\s*\/Page\b/g)?.length || 0;

async function docxWithParagraphs(paragraphs: string, styles = "", finalSection = "<w:sectPr/>") {
  const zip = await JSZip.loadAsync(await exampleDocx());
  const xml = await zip.file("word/document.xml")!.async("string");
  zip.file("word/document.xml", xml.replace(
    /<w:body>[\s\S]*?<\/w:body>/,
    `<w:body><w:p><w:r><w:t>Weekly Policy Memo</w:t></w:r></w:p>
      ${paragraphs}${finalSection}</w:body>`,
  ));
  const styleXml = await zip.file("word/styles.xml")!.async("string");
  zip.file("word/styles.xml", styleXml.replace("</w:styles>", `${styles}</w:styles>`));
  return zip.generateAsync({ type: "nodebuffer" });
}

const pdfOptions = { brandName: "PGPZ Community", categoryLabel: "Weekly Policy Memo" };

async function readPdfPages(pdf: Buffer) {
  const document = await getDocument({ data: new Uint8Array(pdf), useSystemFonts: true }).promise;
  try {
    return await Promise.all(Array.from({ length: document.numPages }, async (_, index) => {
      const page = await document.getPage(index + 1);
      const text = await page.getTextContent();
      const operators = await page.getOperatorList();
      const pageHeight = page.view[3] - page.view[1];
      const imageBounds: Array<{ top: number; bottom: number }> = [];
      let transform = [1, 0, 0, 1, 0, 0];
      const transforms: number[][] = [];
      operators.fnArray.forEach((operator, index) => {
        if (operator === OPS.save) transforms.push([...transform]);
        else if (operator === OPS.restore) transform = transforms.pop() || transform;
        else if (operator === OPS.transform) {
          const [a, b, c, d, e, f] = operators.argsArray[index] as number[];
          const [g, h, i, j, k, l] = transform;
          transform = [g * a + i * b, h * a + j * b, g * c + i * d, h * c + j * d, g * e + i * f + k, h * e + j * f + l];
        } else if ([OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject].includes(operator)) {
          const ys = [transform[5], transform[1] + transform[5], transform[3] + transform[5], transform[1] + transform[3] + transform[5]];
          imageBounds.push({ top: pageHeight - Math.max(...ys), bottom: pageHeight - Math.min(...ys) });
        }
      });
      return {
        text: text.items.map((item) => "str" in item ? item.str + (item.hasEOL ? "\n" : "") : "")
          .join("").replace(/\s+/g, " "),
        items: text.items.flatMap((item) => {
          if (!("str" in item) || !item.str.trim()) return [];
          const fontSize = Math.hypot(item.transform[2], item.transform[3]);
          const style = text.styles[item.fontName];
          const baseline = pageHeight - item.transform[5];
          return [{
            text: item.str,
            x: item.transform[4],
            right: item.transform[4] + item.width,
            top: baseline - (style.ascent ?? 1) * fontSize,
            bottom: baseline - (style.descent ?? 0) * fontSize,
            fontSize,
          }];
        }),
        hasImage: operators.fnArray.some((op) =>
          [OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject].includes(op),
        ),
        imageBounds,
      };
    }));
  } finally {
    await document.destroy();
  }
}

function pageContentItems(page: Awaited<ReturnType<typeof readPdfPages>>[number]) {
  return page.items.filter((item) =>
    item.text !== "PGPZ Community" && item.text !== "PGPZ Coalition" &&
    item.text !== "Member Policy Resource" &&
    !(item.fontSize === 8 && item.top > 740),
  );
}

function expectReadablePageContent(pages: Awaited<ReturnType<typeof readPdfPages>>) {
  for (const page of pages) {
    const items = pageContentItems(page);
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.top, `Text above the one-inch margin: ${item.text}`).toBeGreaterThanOrEqual(71.95);
      expect(item.bottom, `Text below the content area: ${item.text}`).toBeLessThanOrEqual(738);
      expect(item.x, `Text outside the left margin: ${item.text}`).toBeGreaterThanOrEqual(71.95);
      expect(item.right, `Text outside the right margin: ${item.text}`).toBeLessThanOrEqual(540.05);
    }
  }
}

describe("policy update DOCX pipeline", () => {
  it.each(["PGPZ Community", "PGPZ Coalition"])(
    "uses a one-inch top margin on forced odd and even pages for %s", async (brandName) => {
      const bytes = await docxWithParagraphs(Array.from({ length: 3 }, (_, index) => `
        <w:p><w:pPr><w:pageBreakBefore/></w:pPr><w:r><w:rPr><w:b/></w:rPr>
          <w:t>Forced heading ${index + 1}</w:t></w:r></w:p>
        <w:p><w:r><w:t>Following body ${index + 1}.</w:t></w:r></w:p>`).join(""));
      const parsed = await parsePolicyUpdateDocx(bytes, { assetBasePath: "/assets" });
      const pages = await readPdfPages(await renderPolicyUpdatePdf(parsed, { ...pdfOptions, brandName }));
      expect(pages).toHaveLength(4);
      expectReadablePageContent(pages);
      for (let index = 1; index <= 3; index += 1) {
        expect(pages[index].text).toContain(`Forced heading ${index} Following body ${index}.`);
        const heading = pages[index].items.find((item) => item.text === `Forced heading ${index}`)!;
        expect(heading.top).toBeCloseTo(72, 1);
      }
    },
  );

  it("keeps automatically overflowing body text below the same top margin on odd and even pages", async () => {
    const words = Array.from({ length: 1800 }, (_, index) => `word${String(index).padStart(4, "0")}`);
    const parsed = await parsePolicyUpdateDocx(await docxWithParagraphs(`
      <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Long flowing article</w:t></w:r></w:p>
      <w:p><w:r><w:t>${words.join(" ")}</w:t></w:r></w:p>`), { assetBasePath: "/assets" });
    const pages = await readPdfPages(await renderPolicyUpdatePdf(parsed, pdfOptions));
    expect(pages.length).toBeGreaterThanOrEqual(4);
    expectReadablePageContent(pages);
    expect(pages.flatMap((page) => page.items).flatMap((item) => item.text.match(/word\d{4}/g) || []))
      .toEqual(words);
    for (const page of pages.slice(1)) {
      expect(pageContentItems(page)[0].top).toBeCloseTo(72, 1);
    }
  });

  it.each(["PGPZ Community", "PGPZ Coalition"])(
    "paginates readable summary columns without losing, overlapping, or mixing article content for %s", async (brandName) => {
      const parsed = await parsePolicyUpdateDocx(await exampleDocxWithoutSummaryWithImage(), { assetBasePath: "/assets" });
      const tokens = (prefix: string, count: number) => Array.from({ length: count }, (_, index) => `${prefix}${String(index).padStart(3, "0")}`).join(" ");
      const keyTakeaways = [tokens("k", 450), ...Array.from({ length: 4 }, (_, index) => tokens(`t${index}`, 40))];
      const actionItems = Array.from({ length: 7 }, (_, index) => tokens(`a${index}`, 40));
      const articleHeading = "First article after complete summary";
      const coverCta = {
        src: "/assets/docx-image-01.png",
        alt: "Membership QR code",
        caption: "Not a PGPZ member? Sign up here:",
      };
      const pages = await readPdfPages(await renderPolicyUpdatePdf({
        ...parsed, keyTakeaways, actionItems, coverCta,
        sections: [{ heading: articleHeading, body: ["Article text follows every summary item."] }],
      }, { ...pdfOptions, brandName, portalUrl: "https://community.pgpz.org/updates/example" }));
      const articlePageIndex = pages.findIndex((page) => page.text.includes(articleHeading));
      expect(articlePageIndex).toBeGreaterThanOrEqual(2);
      expect(pages).toHaveLength(articlePageIndex + 1);
      expectReadablePageContent(pages);
      expect(pages[0].text).toContain(coverCta.caption);
      expect(pages[0].hasImage).toBe(true);
      expect(pages[0].imageBounds).toHaveLength(1);
      expect(pages[0].imageBounds[0].top).toBeGreaterThanOrEqual(72);
      const summaryPages = pages.slice(0, articlePageIndex);
      expect(summaryPages.some((page) => /Key Takeaways\s*\(continued\)/i.test(page.text))).toBe(true);
      expect(summaryPages.some((page) => /Action Items\s*\(continued\)/i.test(page.text))).toBe(true);

      for (const [label, expected] of [["Key Takeaways", keyTakeaways], ["Action Items", actionItems]] as const) {
        const columns = summaryPages.map((page) => {
          const headings = page.items.filter((item) => /^(?:Key Takeaways|Action Items)/.test(item.text))
            .sort((a, b) => a.x - b.x);
          const index = headings.findIndex((item) => item.text.startsWith(label));
          if (index < 0) return { items: [], right: 540, headingBottom: 0 };
          const left = headings[index].x - 8;
          const right = headings[index + 1] ? headings[index + 1].x - 8 : 540;
          return {
            items: pageContentItems(page).filter((item) =>
              item.x >= left && item.x < right && Math.abs(item.fontSize - 10.5) < 0.01,
            ),
            right,
            headingBottom: headings[index].bottom,
          };
        });
        const text = columns.flatMap((column) => column.items).map((item) => item.text).join(" ").replace(/\s+/g, " ");
        expect(text).toBe(expected.join(" "));
        for (const column of columns) {
          const rows: Array<{ top: number; bottom: number }> = [];
          for (const item of column.items) {
            expect(item.right, `Summary line crosses its column: ${JSON.stringify(item)}`).toBeLessThanOrEqual(column.right + 0.05);
            expect(item.top, "Summary text overlaps the column heading").toBeGreaterThanOrEqual(column.headingBottom);
            const row = rows.find((candidate) => Math.abs(candidate.top - item.top) < 0.25);
            if (row) row.bottom = Math.max(row.bottom, item.bottom);
            else rows.push({ top: item.top, bottom: item.bottom });
          }
          rows.sort((a, b) => a.top - b.top);
          for (let index = 1; index < rows.length; index += 1) {
            expect(rows[index].top, "Summary lines overlap vertically").toBeGreaterThanOrEqual(rows[index - 1].bottom - 0.05);
          }
        }
      }
      // The single first takeaway is longer than one full page: both halves
      // must survive the split, with all later items retained in order.
      expect(summaryPages.filter((page) => /\bk\d{3}\b/.test(page.text)).length).toBeGreaterThan(1);
      const articlePage = pages[articlePageIndex];
      expect(articlePage.text).not.toMatch(/\b(?:k|t\d|a\d)\d{3}\b/);
      expect(pageContentItems(articlePage)[0].text).toBe(articleHeading);
      expect(pageContentItems(articlePage)[0].top).toBeCloseTo(72, 1);
    },
  );

  it.each(["direct", "inherited", "run", "saved"])("does not leak %s page-break markers into cover summaries", async (kind) => {
    const zip = await JSZip.loadAsync(await exampleDocx());
    const xml = await zip.file("word/document.xml")!.async("string");
    zip.file("word/document.xml", kind === "run" || kind === "saved"
      ? xml.replace("<w:t>First takeaway.</w:t>", `${kind === "run" ? '<w:br w:type="page"/>' : "<w:lastRenderedPageBreak/>"}<w:t>First takeaway.</w:t>`)
      : xml.replace("<w:numPr>", `${kind === "direct" ? "<w:pageBreakBefore/>" : '<w:pStyle w:val="PageStart"/>'}<w:numPr>`),
    );
    const styles = await zip.file("word/styles.xml")!.async("string");
    zip.file("word/styles.xml", styles.replace("</w:styles>",
      '<w:style w:type="paragraph" w:styleId="PageStart"><w:name w:val="Page start"/><w:pPr><w:pageBreakBefore/></w:pPr></w:style></w:styles>',
    ));
    const parsed = await parsePolicyUpdateDocx(await zip.generateAsync({ type: "nodebuffer" }), { assetBasePath: "/assets" });
    expect(parsed.keyTakeaways).toEqual(["First takeaway."]);
    expect(parsed.actionItems).toEqual(["First action."]);
    expect(parsed.sourceText).not.toContain("[[PGPZ_");
    const pages = await readPdfPages(await renderPolicyUpdatePdf(parsed, pdfOptions));
    expect(pages[0].text).toContain("First takeaway.");
    expect(pages.map((page) => page.text).join("")).not.toContain("[[PGPZ_");
  });

  it("preserves whitespace owned by nested links and styles without inserting spaces before punctuation", async () => {
    const bytes = await docxWithParagraphs(`
      <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Policy Heading</w:t></w:r></w:p>
      <w:p><w:r><w:t>Remains uncertain. The</w:t></w:r>
        <w:hyperlink r:id="rIdLink"><w:r><w:rPr><w:b/><w:u w:val="single"/></w:rPr>
          <w:t xml:space="preserve"> revised Senate text </w:t></w:r></w:hyperlink>
        <w:r><w:t>is publicly available</w:t></w:r>
        <w:r><w:rPr><w:i/></w:rPr><w:t>.</w:t></w:r></w:p>
      <w:p><w:r><w:t>One</w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve"> </w:t></w:r>
        <w:r><w:t>two</w:t></w:r><w:hyperlink r:id="rIdLink"><w:r><w:t>,three</w:t></w:r></w:hyperlink></w:p>`);
    const parsed = await parsePolicyUpdateDocx(bytes, { assetBasePath: "/assets" });
    expect(parsed.sections[0].body).toEqual([
      "Remains uncertain. The revised Senate text is publicly available.", "One two,three",
    ]);
    expect(parsed.sections[0].bodyRuns?.[0]).toContainEqual({
      text: " revised Senate text ", bold: true, underline: true, href: "https://example.org/source",
    });
    const pages = await readPdfPages(await renderPolicyUpdatePdf(parsed, pdfOptions));
    expect(pages[0].text).toContain("The revised Senate text is publicly available.");
    expect(pages[0].text).toContain("One two,three");
  });

  it("preserves paragraph and inherited style page breaks and respects explicit off values", async () => {
    const paragraph = (text: string, properties = "") =>
      `<w:p><w:pPr>${properties}</w:pPr><w:r><w:t>${text}</w:t></w:r></w:p>`;
    const bytes = await docxWithParagraphs(
      paragraph("First paragraph.") +
      paragraph("Direct break.", '<w:pageBreakBefore/>') +
      paragraph("Inherited break.", '<w:pStyle w:val="Derived"/>') +
      paragraph("Disabled break.", '<w:pStyle w:val="Derived"/><w:pageBreakBefore w:val="0"/>'),
      `<w:style w:type="paragraph" w:styleId="PageStart"><w:name w:val="Page start"/><w:pPr><w:pageBreakBefore/></w:pPr></w:style>
       <w:style w:type="paragraph" w:styleId="Derived"><w:name w:val="Derived"/><w:basedOn w:val="PageStart"/></w:style>`,
    );
    const parsed = await parsePolicyUpdateDocx(bytes, { assetBasePath: "/assets" });
    expect(parsed.sections[0].bodyRuns?.map((runs) => !!runs[0].pageBreakBefore))
      .toEqual([false, true, true, false]);
    const pages = await readPdfPages(await renderPolicyUpdatePdf(parsed, pdfOptions));
    expect(pages).toHaveLength(3);
    expect(pages[0].text).toContain("First paragraph.");
    expect(pages[1].text).toContain("Direct break.");
    expect(pages[2].text).toContain("Inherited break. Disabled break.");
  });

  it("reflows saved mid-paragraph page boundaries while retaining explicit run page breaks", async () => {
    const parsed = await parsePolicyUpdateDocx(await docxWithParagraphs(`
      <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Boundary comparison</w:t></w:r></w:p>
      <w:p><w:r><w:t xml:space="preserve">Before saved </w:t><w:lastRenderedPageBreak/>
        <w:t>after saved.</w:t></w:r></w:p>
      <w:p><w:r><w:t xml:space="preserve">Before explicit </w:t><w:br w:type="page"/>
        <w:t>after explicit.</w:t></w:r></w:p>`), { assetBasePath: "/assets" });
    expect(parsed.sections[0].body).toEqual(["Before saved after saved.", "Before explicit after explicit."]);
    expect(parsed.sections[0].bodyRuns?.[0]).toEqual([{ text: "Before saved after saved." }]);
    expect(parsed.sections[0].bodyRuns?.[1]).toEqual([
      { text: "Before explicit " }, { text: "after explicit.", pageBreakBefore: true },
    ]);
    const pages = await readPdfPages(await renderPolicyUpdatePdf(parsed, pdfOptions));
    expect(pages).toHaveLength(2);
    expect(pages[0].text).toContain("Before saved after saved.");
    expect(pages[0].text).toContain("Before explicit");
    expect(pages[0].text).not.toContain("after explicit.");
    expect(pages[1].text).toContain("after explicit.");
    expectReadablePageContent(pages);
  });

  it.each(["nextPage", "continuous"])("uses each upcoming section's type, including the final %s section", async (finalType) => {
    const bytes = await docxWithParagraphs(`
      <w:p><w:pPr><w:sectPr/></w:pPr><w:r><w:t>Section one.</w:t></w:r></w:p>
      <w:p><w:pPr><w:sectPr><w:type w:val="continuous"/></w:sectPr></w:pPr>
        <w:r><w:t>Section two.</w:t></w:r></w:p>
      <w:p><w:r><w:t>Section three.</w:t></w:r></w:p>`, "",
      `<w:sectPr><w:type w:val="${finalType}"/></w:sectPr>`,
    );
    const parsed = await parsePolicyUpdateDocx(bytes, { assetBasePath: "/assets" });
    expect(parsed.sections[0].bodyRuns?.map((runs) => !!runs[0].pageBreakBefore))
      .toEqual([false, false, finalType === "nextPage"]);
    const pages = await readPdfPages(await renderPolicyUpdatePdf(parsed, pdfOptions));
    expect(pages).toHaveLength(finalType === "nextPage" ? 2 : 1);
    expect(pages[0].text).toContain("Section one. Section two.");
    expect(pages.at(-1)?.text).toContain("Section three.");
  });

  it("carries a page break across blank styled text and a divider to the next heading", async () => {
    const bytes = await docxWithParagraphs(`
      <w:p><w:r><w:t>First paragraph.</w:t></w:r></w:p>
      <w:p><w:pPr><w:pageBreakBefore/><w:pBdr><w:bottom w:val="single"/></w:pBdr></w:pPr></w:p>
      <w:p><w:r><w:br w:type="page"/><w:t xml:space="preserve"> </w:t></w:r>
        <w:r><w:rPr><w:b/></w:rPr><w:t>Next heading</w:t></w:r></w:p>
      <w:p><w:r><w:t>Following content.</w:t></w:r></w:p>`);
    const parsed = await parsePolicyUpdateDocx(bytes, { assetBasePath: "/assets" });
    expect(parsed.sections[1].headingRuns?.[0]).toMatchObject({ text: "Next heading", pageBreakBefore: true });
  });

  it.each(["paragraph", "bullet", "image", "body-break", "heading-break-divider"])(
    "keeps the whole heading with its first %s at a page boundary", async (kind) => {
      const parsed = await parsePolicyUpdateDocx(await exampleDocxWithoutSummaryWithImage(), { assetBasePath: "/assets" });
      const heading = "A long policy heading that must remain with its following content ".repeat(4).trim();
      const body = "The first body line must share a page with the complete heading.";
      const section = {
        heading, headingRuns: [{ text: heading, bold: true, pageBreakBefore: kind === "heading-break-divider" }],
        dividerBefore: kind === "heading-break-divider",
        body: kind === "paragraph" || kind === "body-break" || kind === "heading-break-divider" ? [body] : [],
        bodyRuns: [[{ text: body, pageBreakBefore: kind === "body-break" }]],
        bullets: kind === "bullet" ? [body] : [],
        images: kind === "image" ? [{ ...parsed.sections[0].images![0], displayWidthPt: 250, displayHeightPt: 250 }] : [],
      };
      const pdf = await renderPolicyUpdatePdf({
        ...parsed, keyTakeaways: ["Cover summary."], sections: [section], sourcePageCount: 1,
      }, pdfOptions);
      const pages = await readPdfPages(pdf);
      expect(pages).toHaveLength(2);
      expect(pages[0].text).not.toContain("A long policy heading");
      expect(pages[1].text).toContain(heading);
      if (kind === "image") expect(pages[1].hasImage).toBe(true);
      else expect(pages[1].text).toContain(body);
    },
  );

  it("keeps a short first paragraph whole with its heading near a page boundary", async () => {
    const heading = "Short paragraph belongs with this heading";
    const paragraph = Array.from({ length: 9 }, (_, index) =>
      `Provision ${index + 1} describes the committee's expected review of the draft and next steps.`,
    ).join(" ");
    const parsed = await parsePolicyUpdateDocx(await exampleDocx(), { assetBasePath: "/assets" });
    const pages = await readPdfPages(await renderPolicyUpdatePdf({
      ...parsed,
      summary: "",
      keyTakeaways: [],
      actionItems: [],
      sections: [
        { heading: "Earlier discussion", body: Array.from({ length: 19 }, (_, index) => `Earlier paragraph ${index + 1}.`) },
        { heading, body: [paragraph] },
      ],
    }, pdfOptions));
    expect(pages).toHaveLength(2);
    expect(pages[0].text).toContain("Earlier paragraph 19.");
    expect(pages[0].text).not.toContain(heading);
    expect(pages[0].text).not.toContain("Provision 1");
    expect(pages[1].text).toContain(`${heading} ${paragraph}`);
    expectReadablePageContent(pages);
  });

  it("validates and parses Word structure, direct bold headings, and hyperlinks", async () => {
    const bytes = await exampleDocx();
    const validation = await validatePolicyUpdateDocx(bytes);
    expect(validation.entryCount).toBeGreaterThanOrEqual(6);

    const parsed = await parsePolicyUpdateDocx(bytes, {
      assetBasePath: "/api/policy-updates/example/assets",
    });

    expect(parsed.title).toBe("Weekly Policy Memo: Week of July 20, 2026");
    expect(parsed.sourcePageCount).toBe(1);
    expect(parsed.summary).toBe("A new PGPZ policy update is available.");
    expect(parsed.keyTakeaways).toEqual(["First takeaway."]);
    expect(parsed.actionItems).toEqual(["First action."]);
    expect(parsed.sections).toEqual([
      expect.objectContaining({
        heading: "Policy Development Heading",
        headingRuns: [expect.objectContaining({ bold: true })],
        body: ["Read the primary source for details."],
        bodyRuns: [
          expect.arrayContaining([
            expect.objectContaining({
              text: "primary source",
              bold: true,
              href: "https://example.org/source",
            }),
          ]),
        ],
        links: [
          {
            text: "primary source",
            href: "https://example.org/source",
          },
        ],
      }),
    ]);
  });

  it("uses each Word display extent when the same image bytes are reused", async () => {
    const parsed = await parsePolicyUpdateDocx(await exampleDocxWithReusedImageSizes(), {
      assetBasePath: "/api/policy-updates/example/assets",
    });

    expect(parsed.sections[0].images).toEqual([
      expect.objectContaining({ displayWidthPt: 0.75, displayHeightPt: 0.75 }),
      expect.objectContaining({ displayWidthPt: 1.5, displayHeightPt: 1.5 }),
    ]);
  });

  it("retains section images when a DOCX does not include a summary table", async () => {
    const parsed = await parsePolicyUpdateDocx(
      await exampleDocxWithoutSummaryWithImage(),
      {
        assetBasePath: "/api/policy-updates/example/assets",
      },
    );

    expect(parsed.keyTakeaways).toEqual([]);
    expect(parsed.actionItems).toEqual([]);
    expect(parsed.assets[0]).toMatchObject({
      contentType: "image/png",
      width: 1,
      height: 1,
    });
    expect(parsed.sections[0]).toMatchObject({
      heading: "Policy Development Heading",
      images: [
        {
          src: "/api/policy-updates/example/assets/docx-image-01.png",
          alt: "Source graphic",
          displayWidthPt: 0.75,
          displayHeightPt: 0.75,
        },
      ],
    });
  });

  it("does not inspect dimensions when embedded image bytes do not match their type", async () => {
    const parsed = await parsePolicyUpdateDocx(await exampleDocxWithMismatchedImageBytes(), {
      assetBasePath: "/api/policy-updates/example/assets",
    });

    expect(parsed.assets[0]).toMatchObject({ contentType: "image/png" });
    expect(parsed.assets[0]).not.toHaveProperty("width");
    expect(parsed.assets[0]).not.toHaveProperty("height");
  });

  it("preserves explicit DOCX page breaks and ignores saved layout boundaries", async () => {
    const parsed = await parsePolicyUpdateDocx(await exampleDocxWithPageBreakMarkers(), {
      assetBasePath: "/api/policy-updates/example/assets",
    });

    expect(parsed.sections[0].headingRuns?.[0]).toMatchObject({
      text: "Policy Development Heading",
      pageBreakBefore: true,
    });
    expect(parsed.sections[0].bodyRuns?.[0]?.[0]).toMatchObject({
      text: "Read the ",
    });
    expect(parsed.sections[0].bodyRuns?.[0]?.[0]).not.toHaveProperty("pageBreakBefore");
  });

  it("preserves only the horizontal dividers explicitly present in the DOCX", async () => {
    const parsed = await parsePolicyUpdateDocx(await exampleDocxWithDividers(), {
      assetBasePath: "/api/policy-updates/example/assets",
    });

    expect(parsed.sections).toHaveLength(2);
    expect(parsed.sections[0]).toMatchObject({
      heading: "Policy Development Heading",
      dividerBefore: true,
      dividerAfter: true,
    });
    expect(parsed.sections[1]).toMatchObject({
      heading: "Second Policy Heading",
      dividerAfter: true,
    });
    expect(parsed.sections[1]).not.toHaveProperty("dividerBefore");
  });

  it.each([false, true])("preserves a bottom-bordered image and one divider (adjacent empty border: %s)", async (adjacent) => {
    const zip = await JSZip.loadAsync(await exampleDocxWithoutSummaryWithImage());
    const xml = await zip.file("word/document.xml")!.async("string");
    const border = '<w:pPr><w:pBdr><w:bottom w:val="single" w:sz="12" w:color="F79646"/></w:pBdr></w:pPr>';
    zip.file("word/document.xml", xml.replace(
      /<w:p><w:r><w:drawing>[\s\S]*?<\/w:drawing><\/w:r><\/w:p>/,
      (image) => image.replace("<w:p>", `<w:p>${border}`) +
        (adjacent ? `<w:p>${border}<w:r><w:t> </w:t></w:r></w:p>` : "") +
        '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Following article</w:t></w:r></w:p>',
    ));
    const parsed = await parsePolicyUpdateDocx(await zip.generateAsync({ type: "nodebuffer" }), {
      assetBasePath: "/api/policy-updates/example/assets",
    });
    expect(parsed.sections).toHaveLength(2);
    expect(parsed.sections[0]).toMatchObject({ heading: "Policy Development Heading", dividerAfter: true });
    expect(parsed.sections[0].images).toHaveLength(1);
    expect(parsed.sections[1]).toMatchObject({ heading: "Following article", body: ["Read the primary source for details."] });
    expect(parsed.sections[1].dividerBefore).toBeUndefined();
    expect(parsed.assets).toHaveLength(1);
    expect(parsed.sourceText).not.toContain("[[PGPZ_");
    const pages = await readPdfPages(await renderPolicyUpdatePdf(parsed, pdfOptions));
    expect(pages.some((page) => page.hasImage)).toBe(true);
    expect(pages.map((page) => page.text).join(" ")).toContain("Following article");
  });

  it("places borders around a group of text paragraphs without splitting its content", async () => {
    const border = '<w:pBdr><w:top w:val="single" w:sz="12"/><w:bottom w:val="single" w:sz="12"/></w:pBdr>';
    const reorderedBorder = '<w:pBdr><w:bottom w:sz="12" w:val="single"/><w:top w:sz="12" w:val="single"/></w:pBdr>';
    const bytes = await docxWithParagraphs(`
      <w:p><w:pPr>${border}</w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Bordered article</w:t></w:r></w:p>
      <w:p><w:pPr>${reorderedBorder}</w:pPr><w:r><w:t>First paragraph.</w:t></w:r></w:p>
      <w:p><w:pPr>${border}</w:pPr><w:r><w:t>Second paragraph.</w:t></w:r></w:p>
      <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Next article</w:t></w:r></w:p>
      <w:p><w:r><w:t>Next body.</w:t></w:r></w:p>`);
    const parsed = await parsePolicyUpdateDocx(bytes, { assetBasePath: "/assets" });
    expect(parsed.sections).toEqual([
      expect.objectContaining({ heading: "Bordered article", body: ["First paragraph.", "Second paragraph."], dividerBefore: true, dividerAfter: true }),
      expect.objectContaining({ heading: "Next article", body: ["Next body."] }),
    ]);
    expect(parsed.sections[1].dividerBefore).toBeUndefined();
    expect(parsed.sections[1].dividerAfter).toBeUndefined();
  });

  it.each(["nil", "none"])("ignores disabled %s horizontal borders on text", async (value) => {
    const parsed = await parsePolicyUpdateDocx(await docxWithParagraphs(`
      <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Article heading</w:t></w:r></w:p>
      <w:p><w:pPr><w:pBdr><w:bottom w:val="${value}"/></w:pBdr></w:pPr><w:r><w:t>Article body.</w:t></w:r></w:p>`),
    { assetBasePath: "/assets" });
    expect(parsed.sections).toHaveLength(1);
    expect(parsed.sections[0].dividerAfter).toBeUndefined();
  });

  it("rejects non-DOCX and macro-enabled packages", async () => {
    await expect(validatePolicyUpdateDocx(Buffer.from("%PDF-1.7"))).rejects.toThrow(
      /valid DOCX/,
    );
    const bytes = await exampleDocx();
    const zip = await JSZip.loadAsync(bytes);
    zip.file("word/vbaProject.bin", Buffer.from("macro"));
    await expect(
      validatePolicyUpdateDocx(await zip.generateAsync({ type: "nodebuffer" })),
    ).rejects.toThrow(/Macro-enabled/);

    const traversalZip = await JSZip.loadAsync(bytes);
    traversalZip.file("../outside.xml", "<unsafe/>");
    await expect(
      validatePolicyUpdateDocx(
        await traversalZip.generateAsync({ type: "nodebuffer" }),
      ),
    ).rejects.toThrow(/unsafe entry path/);
  });

  it("uses one backward-compatible artifact layout for legacy PDF and DOCX records", () => {
    expect(policyUpdateSourceObjectKey("policy-updates/uploads", "memo")).toBe(
      "policy-updates/uploads/memo/source.docx",
    );
    expect(
      policyUpdateArtifactPrefix("policy-updates/uploads/memo/source.docx"),
    ).toBe("policy-updates/uploads/memo");
    expect(policyUpdateArtifactPrefix("policy-updates/uploads/memo.pdf")).toBe(
      "policy-updates/uploads/memo",
    );
    expect(
      policyUpdatePdfObjectKey("policy-updates/uploads/memo/source.docx"),
    ).toBe("policy-updates/uploads/memo/resource.pdf");
    expect(
      policyUpdateAssetObjectKey(
        "policy-updates/uploads/memo/source.docx",
        "image.png",
      ),
    ).toBe("policy-updates/uploads/memo/assets/image.png");
    expect(
      policyUpdateEmailAssetObjectPrefix(
        "policy-updates/uploads/memo/source.docx",
        "materialization",
      ),
    ).toBe("policy-updates/uploads/memo/email-assets/materialization");
  });

  it("renders the same parsed model as a downloadable PDF", async () => {
    const parsed = await parsePolicyUpdateDocx(await exampleDocx(), {
      assetBasePath: "/api/policy-updates/example/assets",
    });
    const pdf = await renderPolicyUpdatePdf(parsed, {
      brandName: "PGPZ Community",
      categoryLabel: "Weekly Policy Memo",
      portalUrl: "https://community.pgpz.org/updates/example",
      publishedAt: "Week of July 20, 2026",
    });

    expect(pdf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1_000);
    // The cover summary owns its page even without a source page break;
    // the article starts on the next page, with no blank furniture page.
    expect(pdfPageCount(pdf)).toBe(2);
    const pages = await readPdfPages(pdf);
    expect(pages[0].text).toContain("First takeaway.");
    expect(pages[0].text).not.toContain("Policy Development Heading");
    expect(pages[1].text).toContain("Policy Development Heading Read the primary source for details.");
  });
});
