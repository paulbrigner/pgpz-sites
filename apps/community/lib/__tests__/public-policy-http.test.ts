import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { createPublicPolicyService } from "../public-policy-updates";
import { createPublicPolicyHttpHandler } from "../public-policy-http";

const slug = "published-test";
function setup() {
  const readRecord = vi.fn().mockResolvedValue({ slug, category: "weekly", title: "Public title", visibilityStatus: "published", sourceFormat: "docx", s3Bucket: "community-test", s3Key: `policy-updates/uploads/${slug}/source.docx`, pdfS3Key: `policy-updates/uploads/${slug}/resource.pdf`, sections: [{ heading: "Source", body: ["Published content"], images: [{ src: `/api/policy-updates/${slug}/assets/source.png`, alt: "Public image" }] }] });
  const readMedia = vi.fn().mockResolvedValue({ body: Readable.from(["PDF BYTES"]), contentLength: 9 });
  const service = createPublicPolicyService({ bucket: "community-test", uploadPrefix: "policy-updates/uploads", readRecord, listCandidateSlugs: async () => [slug] });
  return { readRecord, readMedia, handle: createPublicPolicyHttpHandler({ service, readMedia }) };
}
describe("public policy HTTP routes", () => {
  it("serves anonymous archive, document, summary feed, and sitemap with no-store", async () => {
    const { handle } = setup();
    for (const rawPath of ["/updates", `/updates/${slug}`, "/updates/feed.json", "/updates/sitemap.xml"]) {
      const response = await handle({ method: "GET", rawPath });
      expect(response.statusCode).toBe(200);
      expect(response.headers["Cache-Control"]).toContain("no-store");
      expect(response.headers).not.toHaveProperty("Set-Cookie");
      expect(response.body).toContain(rawPath.endsWith(".xml") ? `https://pgpz.org/updates/${slug}` : "Public title");
    }
  });
  it("streams only referenced media and strongly reloads publication status for HEAD and GET", async () => {
    const { handle, readRecord, readMedia } = setup();
    for (const suffix of ["document.pdf", "cover", "assets/source.png"]) {
      const response = await handle({ method: "GET", rawPath: `/updates/${slug}/${suffix}` });
      expect(response.statusCode).toBe(200);
      expect(response.body).toBeInstanceOf(Readable);
    }
    const head = await handle({ method: "HEAD", rawPath: `/updates/${slug}/document.pdf` });
    expect(head.statusCode).toBe(200);
    expect(head.body).toBeUndefined();
    expect(readRecord).toHaveBeenCalledTimes(8);
    expect(readMedia).toHaveBeenLastCalledWith(expect.objectContaining({ contentType: "application/pdf" }), true);
    const denied = await handle({ method: "GET", rawPath: `/updates/${slug}/assets/unreferenced.png` });
    expect(denied.statusCode).toBe(404);
    expect(readMedia).toHaveBeenCalledTimes(4);
  });
  it.each(["draft", "unpublished"])("conceals %s document, metadata, and every media type", async (visibilityStatus) => {
    const { handle, readRecord, readMedia } = setup();
    readRecord.mockResolvedValue({ slug, visibilityStatus, title: "CONFIDENTIAL DRAFT" });
    for (const suffix of ["", "/document.pdf", "/cover", "/assets/source.png"]) {
      const result = await handle({ method: "GET", rawPath: `/updates/${slug}${suffix}` });
      expect(result.statusCode).toBe(404);
      expect(result.body).not.toContain("CONFIDENTIAL");
      expect(result.headers["Cache-Control"]).toContain("no-store");
    }
    expect(readMedia).not.toHaveBeenCalled();
  });
  it.each(["/api/admin/policy-updates", "/updates/../../admin", "/updates/%2fadmin", "/updates/%zz", `/updates/${slug}/source.docx`, `/updates/${slug}/assets/%2e%2e%2fsource.docx`, `/updates/${slug}/assets/x.svg`])("rejects unrecognized route %s", async (rawPath) => {
    const { handle, readMedia } = setup();
    expect((await handle({ method: "GET", rawPath })).statusCode).toBe(404);
    expect(readMedia).not.toHaveBeenCalled();
  });
  it("fails closed without returning SDK error details or stale HTML", async () => {
    const { handle, readRecord } = setup();
    readRecord.mockRejectedValue(new Error("PRIVATE BUCKET AND KEY"));
    const result = await handle({ method: "GET", rawPath: `/updates/${slug}` });
    expect(result.statusCode).toBe(503);
    expect(result.body).not.toContain("PRIVATE");
    expect(result.body).not.toContain("Public title");
  });
  it("returns 404 for missing S3 objects and disallows mutations", async () => {
    const { handle, readMedia } = setup();
    readMedia.mockRejectedValue({ name: "NoSuchKey" });
    expect((await handle({ method: "GET", rawPath: `/updates/${slug}/document.pdf` })).statusCode).toBe(404);
    expect((await handle({ method: "POST", rawPath: "/updates" })).statusCode).toBe(405);
  });
  it("preserves only the exact referenced legacy SVG cover with a restrictive sandbox", async () => {
    const { handle, readRecord, readMedia } = setup();
    readRecord.mockResolvedValue({ slug, category: "special", visibilityStatus: "published", s3Bucket: "community-test", s3Key: `policy-updates/uploads/${slug}.pdf`, coverImage: `/api/policy-updates/${slug}/assets/cover.svg` });
    const response = await handle({ method: "GET", rawPath: `/updates/${slug}/cover` });
    expect(response.statusCode).toBe(200);
    expect(response.headers["Content-Type"]).toBe("image/svg+xml");
    expect(response.headers["Content-Security-Policy"]).toBe("sandbox; default-src 'none'; style-src 'unsafe-inline'");
    expect(readMedia).toHaveBeenCalledWith(expect.objectContaining({ key: `policy-updates/uploads/${slug}/assets/cover.svg` }), false);
    expect((await handle({ method: "GET", rawPath: `/updates/${slug}/assets/cover.svg` })).statusCode).toBe(404);
  });
  it("does not expose media when unpublish or regeneration races its storage request", async () => {
    const { handle, readRecord, readMedia } = setup();
    const body = Readable.from(["UNREVIEWED BYTES"]);
    readMedia.mockImplementation(async () => {
      readRecord.mockResolvedValue({ slug, visibilityStatus: "unpublished" });
      return { body };
    });
    const result = await handle({ method: "GET", rawPath: `/updates/${slug}/document.pdf` });
    expect(result.statusCode).toBe(404);
    expect(result.body).not.toContain("UNREVIEWED");
    expect(body.destroyed).toBe(true);
  });
});
