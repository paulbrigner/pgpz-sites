import JSZip from "jszip";
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
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl7o9sAAAAASUVORK5CYII=",
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

describe("policy update DOCX pipeline", () => {
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

  it("preserves and coalesces DOCX page-break markers on the next visible content", async () => {
    const parsed = await parsePolicyUpdateDocx(await exampleDocxWithPageBreakMarkers(), {
      assetBasePath: "/api/policy-updates/example/assets",
    });

    expect(parsed.sections[0].headingRuns?.[0]).toMatchObject({
      text: "Policy Development Heading",
      pageBreakBefore: true,
    });
    expect(parsed.sections[0].bodyRuns?.[0]?.[0]).toMatchObject({
      text: "Read the ",
      pageBreakBefore: true,
    });
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
    // This compact fixture has no source page break. A footer overflow
    // regression previously added an otherwise blank second page.
    expect(pdfPageCount(pdf)).toBe(1);
  });
});
