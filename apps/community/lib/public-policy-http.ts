import type { Readable } from "node:stream";
import { createPublicPolicyService, isPublicPolicyAsset, isPublicPolicySlug, type PublicPolicyMedia } from "./public-policy-updates";
import { escapePolicyHtml, renderPublicPolicyArchive, renderPublicPolicyDocument, renderPublicPolicyError } from "./policy-update-public-html";

export type PublicPolicyHttpResponse = { statusCode: number; headers: Record<string, string>; body?: string | Readable };
export type PublicPolicyHttpDependencies = {
  service: ReturnType<typeof createPublicPolicyService>;
  readMedia: (media: PublicPolicyMedia, headOnly: boolean) => Promise<{ body?: Readable; contentLength?: number }>;
};
const headers = {
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};
const htmlHeaders = {
  ...headers,
  "Content-Type": "text/html; charset=utf-8",
  "Content-Security-Policy": "default-src 'none'; img-src 'self' https://pgpz.org; font-src https://pgpz.org; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
};
function missing(headOnly: boolean): PublicPolicyHttpResponse {
  return { statusCode: 404, headers: { ...htmlHeaders, "X-Robots-Tag": "noindex" }, ...(headOnly ? {} : { body: renderPublicPolicyError(404) }) };
}
export function createPublicPolicyHttpHandler(deps: PublicPolicyHttpDependencies) {
  return async ({ method, rawPath }: { method: string; rawPath: string }): Promise<PublicPolicyHttpResponse> => {
    const headOnly = method === "HEAD";
    if (method !== "GET" && !headOnly) return { statusCode: 405, headers: { ...headers, Allow: "GET, HEAD" } };
    try {
      if (rawPath === "/updates" || rawPath === "/updates/") {
        const updates = await deps.service.list();
        return { statusCode: 200, headers: htmlHeaders, ...(headOnly ? {} : { body: renderPublicPolicyArchive(updates) }) };
      }
      if (rawPath === "/updates/feed.json" || rawPath === "/updates/sitemap.xml") {
        const updates = await deps.service.list();
        const isFeed = rawPath.endsWith(".json");
        const body = isFeed ? JSON.stringify({ updates }) : `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://pgpz.org/updates</loc></url>${updates.map((item) => `<url><loc>${escapePolicyHtml(item.canonicalUrl)}</loc></url>`).join("")}</urlset>`;
        return { statusCode: 200, headers: { ...headers, "Content-Type": isFeed ? "application/json; charset=utf-8" : "application/xml; charset=utf-8" }, ...(headOnly ? {} : { body }) };
      }
      const parts = rawPath.split("/");
      if (parts[0] !== "" || parts[1] !== "updates" || parts.length < 3 || parts.length > 5) return missing(headOnly);
      let slug: string;
      let asset: string;
      try { slug = decodeURIComponent(parts[2]); asset = decodeURIComponent(parts[4] || ""); } catch { return missing(headOnly); }
      if (!isPublicPolicySlug(slug)) return missing(headOnly);
      const isDetail = parts.length === 3;
      const isPdf = parts.length === 4 && parts[3] === "document.pdf";
      const isCover = parts.length === 4 && parts[3] === "cover";
      const isAsset = parts.length === 5 && parts[3] === "assets" && isPublicPolicyAsset(asset);
      if (!isDetail && !isPdf && !isCover && !isAsset) return missing(headOnly);
      // Deliberately load on EVERY detail/media/HEAD request. No warm-Lambda cache.
      const entry = await deps.service.load(slug);
      if (!entry) return missing(headOnly);
      if (isDetail) return { statusCode: 200, headers: htmlHeaders, ...(headOnly ? {} : { body: renderPublicPolicyDocument(entry.document) }) };
      const media = entry.media.get(isPdf ? "document.pdf" : isCover ? "cover" : `assets/${asset}`);
      if (!media) return missing(headOnly);
      const object = await deps.readMedia(media, headOnly);
      // A generation can begin after unpublish while the object request is in
      // flight. Recheck before exposing any bytes, and reject changed revisions.
      let current;
      try { current = await deps.service.load(slug); }
      catch (error) { object.body?.destroy(); throw error; }
      if (!current || current.revision !== entry.revision) {
        object.body?.destroy();
        return missing(headOnly);
      }
      return {
        statusCode: 200,
        headers: {
          ...headers,
          "Content-Type": media.contentType,
          ...(media.contentType === "image/svg+xml" ? { "Content-Security-Policy": "sandbox; default-src 'none'; style-src 'unsafe-inline'" } : {}),
          ...(isPdf ? { "Content-Disposition": `inline; filename="${slug}.pdf"`, "X-Robots-Tag": "noindex" } : {}),
          ...(typeof object.contentLength === "number" ? { "Content-Length": String(object.contentLength) } : {}),
        },
        ...(headOnly ? {} : { body: object.body }),
      };
    } catch (error) {
      const failure = error as { name?: string; code?: string; $metadata?: { httpStatusCode?: number } };
      if (failure?.name === "NoSuchKey" || failure?.code === "ENOENT" || failure?.$metadata?.httpStatusCode === 404) return missing(headOnly);
      // Do not serialize/log database records, source documents, object keys, or SDK errors.
      return { statusCode: 503, headers: { ...htmlHeaders, "X-Robots-Tag": "noindex", "Retry-After": "30" }, ...(headOnly ? {} : { body: renderPublicPolicyError(503) }) };
    }
  };
}
