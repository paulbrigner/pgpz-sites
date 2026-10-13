import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPublicPolicyService } from "../public-policy-updates";

const slug = "2026-10-12-weekly-policy-memo";
const bucket = "community-policy-test";
const prefix = "policy-updates/uploads";
function record(overrides: Record<string, unknown> = {}) {
  return {
    slug, category: "weekly", title: "Weekly policy memo", shortTitle: "October 12 memo",
    publishedAt: "2026-10-12", displayDate: "Week of October 12, 2026", summary: "Public analysis.",
    visibilityStatus: "published", sourceFormat: "docx", s3Bucket: bucket,
    s3Key: `${prefix}/${slug}/source.docx`, pdfS3Key: `${prefix}/${slug}/reviews/review.pdf`,
    coverImage: `/api/policy-updates/${slug}/assets/docx-image-01.png`,
    uploadedBy: "PRIVATE-USER-ID", generatedModel: "PRIVATE-MODEL", generationError: "PRIVATE-ERROR",
    keyTakeaways: ["Takeaway"], actionItems: ["Action"],
    sections: [{ heading: "Policy development", body: ["The revised text."], bodyRuns: [[{ text: "The " }, { text: "revised", href: "https://example.org/text" }, { text: " text." }]], dividerAfter: true,
      images: [{ src: `/api/policy-updates/${slug}/assets/docx-image-02.jpg`, alt: "A public source post", displayWidthPt: 200, href: "https://example.org/post" }] }],
    ...overrides,
  };
}
const readRecord = vi.fn();
const listCandidateSlugs = vi.fn();
const service = () => createPublicPolicyService({ bucket, uploadPrefix: prefix, readRecord, listCandidateSlugs });
beforeEach(() => { vi.clearAllMocks(); readRecord.mockResolvedValue(record()); listCandidateSlugs.mockResolvedValue([slug]); });

describe("public policy publication boundary", () => {
  it("projects public fields and preserves rich text, source dividers, and referenced media", async () => {
    const entry = await service().load(slug);
    expect(entry?.document.canonicalUrl).toBe(`https://pgpz.org/updates/${slug}`);
    expect(entry?.document.pdfUrl).toBe(`https://pgpz.org/updates/${slug}/document.pdf`);
    expect(entry?.document.sections[0].bodyRuns?.[0].map((run) => run.text).join("")).toBe("The revised text.");
    expect(entry?.document.sections[0].dividerAfter).toBe(true);
    expect(entry?.media.get("document.pdf")).toMatchObject({ kind: "s3", key: `${prefix}/${slug}/reviews/review.pdf` });
    expect(entry?.media.get("assets/docx-image-02.jpg")).toMatchObject({ key: `${prefix}/${slug}/assets/docx-image-02.jpg` });
    expect(entry?.media.has("assets/source.docx")).toBe(false);
    expect(entry?.media.has("assets/unreferenced.png")).toBe(false);
    const json = JSON.stringify(entry?.document);
    for (const secret of ["PRIVATE-", "s3Bucket", "s3Key", "pdfS3Key", "generationError", "generatedModel", "uploadedBy", "source.docx"]) expect(json).not.toContain(secret);
  });
  it.each(["draft", "unpublished", "", undefined])("conceals %s status", async (visibilityStatus) => {
    readRecord.mockResolvedValue(record({ visibilityStatus }));
    expect(await service().load(slug)).toBeNull();
  });
  it("rechecks current status for stale index candidates and successive media loads", async () => {
    const reader = service();
    expect(await reader.load(slug)).not.toBeNull();
    readRecord.mockResolvedValue(record({ visibilityStatus: "unpublished" }));
    expect(await reader.load(slug)).toBeNull();
    expect((await reader.list()).some((item) => item.slug === slug)).toBe(false);
    expect(readRecord).toHaveBeenCalledTimes(3);
  });
  it("does not turn database failures into stale public content", async () => {
    readRecord.mockRejectedValue(new Error("database unavailable"));
    await expect(service().list()).rejects.toThrow("database unavailable");
  });
  it.each([
    { s3Bucket: "coalition-private" },
    { s3Key: `${prefix}/another-slug/source.docx` },
    { pdfS3Key: `${prefix}/another-slug/resource.pdf` },
    { pdfS3Key: `${prefix}/${slug}/../private.pdf` },
    { pdfS3Key: `${prefix}/${slug}/source.docx` },
    { category: "private" },
    { slug: "some-other-record" },
  ])("rejects malformed or cross-boundary records %j", async (overrides) => {
    readRecord.mockResolvedValue(record(overrides));
    expect(await service().load(slug)).toBeNull();
  });
  it("does not translate other slugs, arbitrary URLs, or unreferenced paths into media", async () => {
    readRecord.mockResolvedValue(record({ sections: [{ heading: "Images", body: [], images: [
      { src: "/api/policy-updates/private-draft/assets/private.png", alt: "Private" },
      { src: "https://elsewhere.example/secret.png", alt: "Untrusted source" },
      { src: `/api/policy-updates/${slug}/assets/../source.docx`, alt: "Traversal" },
    ] }] }));
    const result = await service().load(slug);
    expect(result?.document.sections[0].images).toEqual([]);
    expect(result?.media.size).toBe(2);
  });
  it("removes dangerous links without dropping their displayed text", async () => {
    readRecord.mockResolvedValue(record({ sections: [{ heading: "Links", body: ["Read this"], links: [{ text: "this", href: "javascript:alert(1)" }], images: [{ src: `/api/policy-updates/${slug}/assets/public.png`, alt: "Image", href: "javascript:alert(2)" }] }] }));
    const document = (await service().load(slug))?.document;
    expect(JSON.stringify(document)).not.toContain("javascript:");
    expect(document?.sections[0].body).toEqual(["Read this"]);
  });
  it("preserves mixed-case legacy PDF uploads and the two historical static publications", async () => {
    const legacySlug = "20260625-Stablecoin-NPRM";
    readRecord.mockResolvedValue(record({ slug: legacySlug, category: "special", sourceFormat: "legacy_pdf", s3Key: `${prefix}/${legacySlug}.pdf`, pdfS3Key: null }));
    const reader = service();
    expect((await reader.load(legacySlug))?.media.get("document.pdf")).toMatchObject({ key: `${prefix}/${legacySlug}.pdf` });
    const historical = await reader.load("1H2026-us-digital-asset-policy");
    expect(historical?.document.category).toBe("special");
    expect(historical?.media.get("document.pdf")).toEqual({ kind: "bundled", fileName: "1H2026-us-digital-asset-policy.pdf", contentType: "application/pdf" });
    expect((await reader.load("2026-06-08-weekly-policy-memo"))?.document.category).toBe("weekly");
  });
  it("returns summary-only feed entries", async () => {
    const list = await service().list();
    expect(list).toHaveLength(3);
    expect(list[0].slug).toBe(slug);
    expect(list.every((item) => !("sections" in item) && !("media" in item) && !("emailSubject" in item))).toBe(true);
  });
});
