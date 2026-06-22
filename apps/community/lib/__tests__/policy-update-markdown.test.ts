import { describe, expect, it } from "vitest";
import { buildPolicyUpdateForumMarkdown } from "@/lib/policy-update-markdown";
import type { PolicyUpdate } from "@/lib/policy-updates";

const update: PolicyUpdate = {
  slug: "2026-06-15-weekly-policy-memo",
  category: "weekly",
  categoryLabel: "Weekly Policy Memo",
  title: "Weekly Policy Memo: June 15, 2026",
  shortTitle: "Weekly Policy Memo: June 15, 2026",
  publishedAt: "2026-06-15",
  displayDate: "Week of June 15, 2026",
  summary: "FinCEN AML rulemaking, Illinois crypto tax, and stablecoin customer-identification requirements",
  emailSubject: "PGPZ Weekly Policy Memo: June 15, 2026",
  emailPreheader: "FinCEN AML rulemaking, Illinois crypto tax, and stablecoin customer-identification requirements",
  coverImage: "",
  pdfHref: "/api/policy-updates/2026-06-15-weekly-policy-memo/pdf",
  portalPath: "/updates/2026-06-15-weekly-policy-memo",
  keyTakeaways: ["Members of Congress wrote to FinCEN."],
  actionItems: ["Consider following Members of Congress."],
  sections: [
    {
      heading: "X Post of the Week",
      body: [],
      images: [
        {
          src: "/api/policy-updates/2026-06-15-weekly-policy-memo/assets/x-josh-swihart.png",
          alt: "Josh Swihart X post screenshot",
          caption: "Josh Swihart X post embedded in the source memo.",
          href: "https://x.com/jswihart/status/2066384781601132602?s=20",
        },
      ],
    },
    {
      heading: "House Financial Services Committee Leadership Urges FinCEN to Reorient AML Rules Toward High-Risk Threats",
      body: [
        "On June 16, House Financial Services Committee Chairman French Hill published a letter to FinCEN.",
      ],
      links: [
        {
          text: "House Financial Services Committee Leadership Urges FinCEN to Reorient AML Rules Toward High-Risk Threats",
          href: "https://financialservices.house.gov/example.pdf",
        },
        {
          text: "published a letter",
          href: "https://financialservices.house.gov/example.pdf",
        },
      ],
    },
  ],
};

describe("buildPolicyUpdateForumMarkdown", () => {
  it("exports clean forum markdown with public email asset images", () => {
    const markdown = buildPolicyUpdateForumMarkdown(update, {
      siteUrl: "https://community.pgpz.org",
    });

    expect(markdown).toContain("# Weekly Policy Memo: June 15, 2026");
    expect(markdown).toContain(
      "This week's PGPZ Community policy memo covers FinCEN AML rulemaking, Illinois crypto tax, and stablecoin customer-identification requirements.",
    );
    expect(markdown).toContain(
      "[![Josh Swihart X post screenshot](https://community.pgpz.org/api/policy-updates/2026-06-15-weekly-policy-memo/email-assets/x-josh-swihart.png)](https://x.com/jswihart/status/2066384781601132602?s=20)",
    );
    expect(markdown).toContain(
      "## [House Financial Services Committee Leadership Urges FinCEN to Reorient AML Rules Toward High-Risk Threats](https://financialservices.house.gov/example.pdf)",
    );
    expect(markdown).toContain("[published a letter](https://financialservices.house.gov/example.pdf)");
    expect(markdown).toContain("\n---\n\n##");
    expect(markdown).not.toContain("/api/email/click/");
    expect(markdown).not.toContain("/api/email/open/");
    expect(markdown).not.toContain("/api/email/unsubscribe/");
    expect(markdown).not.toContain("cid:");
    expect(markdown).not.toContain("/assets/x-josh-swihart.png");
  });
});
