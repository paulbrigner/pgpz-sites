import { describe, expect, it } from "vitest";
import { renderPublicPolicyDocument, renderPublicPolicyText } from "../policy-update-public-html";
import type { PublicPolicyDocument } from "../public-policy-updates";

describe("public memo HTML", () => {
  it("preserves whitespace around links and escapes untrusted text and href schemes", () => {
    expect(renderPublicPolicyText("The revised text.", [], [{ text: "The " }, { text: "revised", href: "https://example.org", bold: true }, { text: " text." }])).toContain('The <a href="https://example.org/"');
    expect(renderPublicPolicyText("<script>alert(1)</script>", [{ text: "alert", href: "javascript:evil()" }])).toBe("&lt;script&gt;alert(1)&lt;/script&gt;");
  });
  it("retains dividers, tables, progress details, social images, and all narrative text", () => {
    const document: PublicPolicyDocument = {
      slug: "test", category: "weekly", categoryLabel: "Weekly Policy Memo", title: "A memo <test>", shortTitle: "Memo", publishedAt: "2026-10-12", displayDate: "October 12, 2026", summary: "Summary", canonicalUrl: "https://pgpz.org/updates/test", pdfUrl: "https://pgpz.org/updates/test/document.pdf", coverUrl: "https://pgpz.org/updates/test/cover", sourceFormat: "docx", keyTakeaways: ["A takeaway"], actionItems: ["An action"],
      sections: [
        { heading: "Article", body: ["The revised text."], bodyRuns: [[{ text: "The " }, { text: "revised", href: "https://example.org/revised" }, { text: " text." }]], dividerAfter: true, table: { columns: ["Topic", "Status"], rows: [["Privacy", "Pending"]] }, bullets: ["Bullet"], bodyAfterBullets: ["Following paragraph"] },
        { heading: "X Post of the Week: Source title", body: ["Post discussion"], images: [{ src: "https://pgpz.org/updates/test/assets/post.png", alt: "Embedded X post screenshot", displayWidthPt: 200, href: "https://x.com/example/status/1" }], dividerAfter: true },
        { heading: "PGPZ Progress Summary", body: ["Progress narrative"], progressItems: [{ label: "Workstream", details: [{ text: "A detail", children: ["Nested detail"] }] }] },
        { heading: "Final article", body: ["Final words"] },
      ],
    };
    const html = renderPublicPolicyDocument(document);
    const parsed = new DOMParser().parseFromString(html, "text/html");
    expect(parsed.querySelectorAll("article hr.source-divider")).toHaveLength(2);
    expect(parsed.querySelector("article p")?.textContent).toBe("The revised text.");
    expect(parsed.querySelector("table")?.textContent).toBe("TopicStatusPrivacyPending");
    expect(parsed.querySelector(".social-post img")?.getAttribute("style")).toBe("width:267px");
    expect(parsed.querySelector(".social-post img")?.closest("a")?.href).toBe("https://x.com/example/status/1");
    for (const content of ["Following paragraph", "Post discussion", "Progress narrative", "Nested detail", "Final words"]) expect(parsed.body.textContent).toContain(content);
    expect(parsed.querySelector("h1")?.textContent).toBe("A memo <test>");
    expect(parsed.querySelectorAll("script")).toHaveLength(0);
    expect(parsed.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(document.canonicalUrl);
    expect(html).not.toContain("/api/auth");
  });
});
