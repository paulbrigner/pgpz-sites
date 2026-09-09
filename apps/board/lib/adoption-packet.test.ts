// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PDFDocument, PDFDict, PDFName, PDFArray, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import JSZip from "jszip";
import { buildAdoptionPacket, MAX_PACKET_SOURCE_BYTES } from "./adoption-packet";
import { adoptedFixture } from "./test-support/adoption";

describe("adoption packets", () => {
  it("appends signatures to a PDF and embeds the exact original and portable consent evidence", async () => {
    const source = await PDFDocument.create(); source.addPage([300, 400]).drawText("APPROVED ORIGINAL");
    const original = await source.save(); const before = Buffer.from(original);
    const input = adoptedFixture(original, "application/pdf");
    const packet = await buildAdoptionPacket(input);
    expect(packet.mimeType).toBe("application/pdf");
    expect(Buffer.from(original)).toEqual(before);
    const result = await PDFDocument.load(packet.bytes);
    expect(result.getPageCount()).toBeGreaterThan(1);
    expect(result.getPage(0).getSize()).toEqual({ width: 300, height: 400 });
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
