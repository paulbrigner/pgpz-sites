// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";
import { resolutionReviewFixture } from "./test-support/resolution-review";
import { resolutionReviewRecord, resolutionReviewRecordHtml, resolutionReviewPacket } from "./resolution-review-record";
import { resolutionReviewRecordHash } from "./resolution-review-integrity";

describe("director review records", () => {
  it("exports superseded reviews without claiming the current materials were reviewed", async () => {
    const ballot = resolutionReviewFixture();
    const history = [{ action: "review-submitted", detail: ballot.review!.round }];
    const record = resolutionReviewRecord({ ...ballot, review: { ...ballot.review!, everStarted: true, round: null } }, history);
    expect(record.integrityVerified).toBeNull();
    expect(record.finalizedReviewHash).toBeNull();
    const html = resolutionReviewRecordHtml(record);
    expect(html).toContain("Current resolution - not reviewed");
    expect(html).toContain('class="history" open');
    expect(html).toContain("PRIVATE_REVIEW");
    expect(html).not.toContain("0 of 0 ready");
    const packet = await resolutionReviewPacket(record);
    expect(packet.mimeType).toBe("application/pdf");
    expect((await PDFDocument.load(packet.bytes)).getPageCount()).toBeGreaterThan(1);
  });
  it("labels incomplete reviews honestly and preserves exact sources and escaped assessments", () => {
    const ballot = resolutionReviewFixture();
    const record = resolutionReviewRecord(ballot, []);
    expect(record.progress).toMatchObject({ ready: 1, pending: 4, complete: false });
    expect(record.finalizedReviewHash).toBeNull();
    expect(record.integrityVerified).toBe(true);
    const html = resolutionReviewRecordHtml({ ...record, instructions: '<script>alert("x")</script>' });
    expect(html).toContain("&lt;script&gt;"); expect(html).not.toContain('<script>');
    expect(html).toContain("No completion or conflict determination is assumed");
    expect(html).toContain("v2");
  });
  it("produces a readable PDF with embedded evidence and falls back losslessly for unsupported Unicode", async () => {
    const record = resolutionReviewRecord(resolutionReviewFixture(true), [{ action: "review-submitted", detail: "Retained evidence" }]);
    const packet = await resolutionReviewPacket(record);
    expect(packet.mimeType).toBe("application/pdf");
    expect((await PDFDocument.load(packet.bytes)).getPageCount()).toBeGreaterThan(1);
    const unicode = await resolutionReviewPacket({ ...record, title: "Review 董事 📝" });
    expect(unicode.mimeType).toBe("application/zip");
    const zip = await JSZip.loadAsync(unicode.bytes);
    expect(await zip.file("review-record.json")!.async("string")).toContain("Review 董事 📝");
  });
  it("reconstructs a stable finalized record digest across DynamoDB property reordering", () => {
    const ballot = resolutionReviewFixture(true);
    const review = { ...ballot.review!, round: { ...ballot.review!.round!, finalization: { findings: "Reviewed findings", confirmedAt: "2026-09-10T12:00:00Z", confirmedBy: "chair@example.invalid" } } };
    // Captured before adding reply support: already signed schema 4 records
    // must retain their exact digest, not merely agree with a new algorithm.
    expect(resolutionReviewRecordHash(review)).toBe("5072dea18b6c5edaf0a48e19088470d726716067020d382a8da9c0996a3f308e");
    function reverse(value: unknown): unknown {
      if (Array.isArray(value)) return value.map(reverse);
      if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).reverse().map(([k, v]) => [k, reverse(v)]));
      return value;
    }
    expect(resolutionReviewRecordHash(reverse(review) as typeof review)).toBe(resolutionReviewRecordHash(review));
    expect(resolutionReviewRecordHash({ ...review, round: { ...review.round, submissions: review.round.submissions.map((s, i) => i ? s : { ...s, assessment: "Changed" }) } })).not.toBe(resolutionReviewRecordHash(review));
  });
});
