// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PDFDocument, PDFDict, PDFName, PDFArray, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import JSZip from "jszip";
import { buildAdoptionPacket, MAX_PACKET_SOURCE_BYTES } from "./adoption-packet";
import { adoptedFixture } from "./test-support/adoption";
import { consentDigest, consentPayload } from "./written-consent-integrity";

describe("adoption packets", () => {
  it("adds an approval cover before the original and signatures, preserving the exact original and consent evidence", async () => {
    const source = await PDFDocument.create(); source.addPage([300, 400]).drawText("APPROVED ORIGINAL");
    const original = await source.save(); const before = Buffer.from(original);
    const input = adoptedFixture(original, "application/pdf");
    const packet = await buildAdoptionPacket(input);
    expect(packet.mimeType).toBe("application/pdf");
    expect(Buffer.from(original)).toEqual(before);
    const result = await PDFDocument.load(packet.bytes);
    expect(result.getPageCount()).toBeGreaterThan(2);
    expect(result.getPage(0).getSize()).toEqual({ width: 612, height: 792 });
    expect(result.getPage(1).getSize()).toEqual({ width: 300, height: 400 });
    expect(result.getTitle()).toBe("Policy - Board-approved copy - Version 1");
    const contents = result.getPage(0).node.lookup(PDFName.of("Contents"), PDFArray);
    const cover = Buffer.from(decodePDFRawStream(contents.lookup(0, PDFRawStream)).decode()).toString();
    for (const label of ["Board-approved copy", "Policy - Version 1", "By unanimous written consent: 5 of 5 directors.", "Effective October 1, 2026, subject to the conditions in the resolution."]) {
      expect(cover).toContain(Buffer.from(label).toString("hex").toUpperCase());
    }
    const names = result.catalog.lookup(PDFName.of("Names"), PDFDict).lookup(PDFName.of("EmbeddedFiles"), PDFDict).lookup(PDFName.of("Names"), PDFArray);
    const file = result.context.lookup(names.lookup(1, PDFDict).lookup(PDFName.of("EF"), PDFDict).get(PDFName.of("F"))) as PDFRawStream;
    expect(Buffer.from(decodePDFRawStream(file).decode())).toEqual(before);
    expect(names.size()).toBe(6);
  });
  it("uses a ZIP for other formats, preserving original bytes, Unicode signatures and complete history", async () => {
    const input = adoptedFixture();
    input.receipts[0].signatureName = "李 Director";
    const packet = await buildAdoptionPacket(input);
    const zip = await JSZip.loadAsync(packet.bytes);
    expect(packet.mimeType).toBe("application/zip");
    expect(await zip.file("original/policy.txt")!.async("uint8array")).toEqual(input.bytes);
    const record = JSON.parse(await zip.file("consent-record.json")!.async("string"));
    expect(record.signatures[0].signatureName).toBe("李 Director");
    expect(record.canonicalPayload.adoption.targets).toEqual(input.ballot.adoption!.targets);
    expect(await zip.file("consent-record.html")!.async("string")).toContain('href="https://board.example.invalid/api/');
    expect(await zip.file("README.txt")!.async("string")).toContain("BOARD-APPROVED COPY\nPolicy - Version 1\nAdopted: 2026-09-11T12:00:00Z\nSigned consents: 5 of 5 directors");
  });
  it("paginates long approval terms before the original without changing the signed record", async () => {
    const source = await PDFDocument.create(); source.addPage([300, 400]);
    const input = adoptedFixture(await source.save(), "application/pdf");
    input.ballot.adoption!.effectiveTerms = "Condition applies.\n".repeat(95).trim();
    input.ballot.consent!.contentHash = consentDigest(consentPayload(input.ballot, input.ballot.consent!));
    input.receipts.forEach((receipt) => { receipt.contentHash = input.ballot.consent!.contentHash; });
    const packet = await buildAdoptionPacket(input);
    expect(packet.mimeType).toBe("application/pdf");
    const result = await PDFDocument.load(packet.bytes);
    expect(result.getPages().findIndex((page) => page.getWidth() === 300)).toBeGreaterThan(1);
  });
  it("preserves unsupported cover characters in a ZIP rather than relabeling the approved document", async () => {
    const source = await PDFDocument.create(); source.addPage();
    const input = adoptedFixture(await source.save(), "application/pdf");
    input.ballot.attachments![0].title = "政策";
    input.ballot.consent!.contentHash = consentDigest(consentPayload(input.ballot, input.ballot.consent!));
    input.receipts.forEach((receipt) => { receipt.contentHash = input.ballot.consent!.contentHash; });
    const packet = await buildAdoptionPacket(input);
    expect(packet.mimeType).toBe("application/zip");
    const zip = await JSZip.loadAsync(packet.bytes);
    expect(await zip.file("README.txt")!.async("string")).toContain("政策 - Version 1");
    expect(await zip.file("original/policy.pdf")!.async("uint8array")).toEqual(input.bytes);
  });
  it("falls back without altering an interactive PDF or substituting signed characters", async () => {
    const source = await PDFDocument.create(); const page = source.addPage();
    source.getForm().createTextField("name").addToPage(page);
    const packet = await buildAdoptionPacket(adoptedFixture(await source.save(), "application/pdf"));
    expect(packet.mimeType).toBe("application/zip");
  });
  it("fails closed on incomplete signatures, source corruption, oversized sources and missing receipts", async () => {
    const input = adoptedFixture();
    await expect(buildAdoptionPacket({ ...input, bytes: new Uint8Array([1]) })).rejects.toThrow(/integrity/);
    await expect(buildAdoptionPacket({ ...input, receipts: [] })).rejects.toThrow(/history/);
    await expect(buildAdoptionPacket({ ...input, ballot: { ...input.ballot, status: "open" } })).rejects.toThrow(/verified adoption/);
    const large = adoptedFixture(new Uint8Array(MAX_PACKET_SOURCE_BYTES + 1));
    await expect(buildAdoptionPacket(large)).rejects.toThrow(/too large/);
  });
});
