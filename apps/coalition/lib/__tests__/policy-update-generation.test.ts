import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/s3", () => ({
  s3Client: { send: vi.fn() },
}));

import {
  mergeExtractedImagesIntoContent,
  sourcePolicyUpdateContent,
  xImageRole,
} from "@/lib/admin/policy-update-generation";

const record = {
  category: "weekly",
  title: "Uploaded title",
  summary: "",
  emailSubject: "PGPZ Weekly Policy Memo: Uploaded title",
  emailPreheader: "",
  keyTakeaways: [],
  actionItems: [],
} as any;

describe("sourcePolicyUpdateContent", () => {
  it("keeps singular Relevant Post screenshots with their preceding policy sections", () => {
    const adamHref = "https://x.com/adam_minehardt/status/2077430678350598447?s=20";
    const danteHref = "https://x.com/ddisparte/status/2077096525599998319?s=20";
    const pageText = "Action Item: No action item. Relevant Post:";
    const adamRole = xImageRole({ href: adamHref, pageText, documentSocialIndex: 2 });
    const danteRole = xImageRole({ href: danteHref, pageText, documentSocialIndex: 3 });

    expect(adamRole).toBe("notable-posts");
    expect(danteRole).toBe("notable-posts");

    const merged = mergeExtractedImagesIntoContent(
      {
        summary: "Two policy developments.",
        emailPreheader: "Two policy developments.",
        keyTakeaways: [],
        actionItems: [],
        sections: [
          { heading: "CLARITY Act", body: ["CLARITY analysis."] },
          { heading: "Action Item", body: ["Call your senators.", "Relevant Post:"] },
          { heading: "U.S.-UK tokenized finance", body: ["Tokenized finance analysis."] },
          { heading: "Action Item", body: ["No action item.", "Relevant Post:"] },
        ],
      },
      [
        { src: "/assets/x-adam.png", alt: "Adam X post screenshot", href: adamHref, page: 4, role: adamRole },
        { src: "/assets/x-dante.png", alt: "Dante X post screenshot", href: danteHref, page: 5, role: danteRole },
      ],
    );

    expect(merged.sections[1].images?.map((image) => image.href)).toEqual([adamHref]);
    expect(merged.sections[3].images?.map((image) => image.href)).toEqual([danteHref]);
    expect(merged.sections.some((section) => /^Notable Post/.test(section.heading))).toBe(false);
  });

  it("isolates the weekly memo title and first-page bullets from the June 22 PDF text shape", () => {
    const content = sourcePolicyUpdateContent(record, {
      text: `
        PGPZ Community Member Policy Resource
        community.pgpz.org | PGPZ Community | Page 1
        Weekly Policy Memo: Week of June 22, 2026 https://community.pgpz.org/updates/2026 - 06 - 22 - weekly - policy - memo
        Key Takeaways l The U.S. Senate voted to pass a comprehensive housing affordability package that also bars the Federal Reserve from engineering or issuing a CBDC until 2030. l Digital asset trade associations called on the House Ways and Means Committee to pass H.R. 9175 as introduced. l Texas is mandating that data centers fully fund their upfront electric transmission hookup infrastructure.
        Action Items l Show support for H.R. 9175 by liking and reposting content on social media. l If you are a Zcash miner in Texas, reach out with feedback. l Encourage your friends to join the PGPZ Community.
        --- Page 1 of 6 ---
        X Post of the Week:
        Bipartisan Housing Legislation Heading to President’s Desk Includes Statutory Retail
        CBDC Ban Through 2030
        The U.S. Senate voted 85-5 to pass H.R.6644.
        Why this matters for Zcash: This statutory restriction protects digital assets used for payments.
        Action Items: No action needed.
        Relevant Posts:
        Digital Asset Coalitions Urge Unaltered Passage of H.R. 9175 to Normalize Mining and Staking Tax Deferral
        The Blockchain Association, Crypto Council for Innovation, and the Digital Chamber called for passage.
      `,
      tables: [],
      links: [],
      images: [],
      sourceTextLength: 0,
      sourceTextSha256: "",
    });

    expect(content.title).toBe("Weekly Policy Memo: Week of June 22, 2026");
    expect(content.emailSubject).toBe("PGPZ Weekly Policy Memo: Week of June 22, 2026");
    expect(content.title).not.toContain("PGPZ Community Member Policy Resource");
    expect(content.title).not.toContain("The U.S. Senate");
    expect(content.summary).not.toContain("Weekly Policy Memo");
    expect(content.keyTakeaways).toEqual([
      "The U.S. Senate voted to pass a comprehensive housing affordability package that also bars the Federal Reserve from engineering or issuing a CBDC until 2030.",
      "Digital asset trade associations called on the House Ways and Means Committee to pass H.R. 9175 as introduced.",
      "Texas is mandating that data centers fully fund their upfront electric transmission hookup infrastructure.",
    ]);
    expect(content.actionItems).toEqual([
      "Show support for H.R. 9175 by liking and reposting content on social media.",
      "If you are a Zcash miner in Texas, reach out with feedback.",
      "Encourage your friends to join the PGPZ Community.",
    ]);
    expect(content.sections.map((section) => section.heading)).toEqual([
      "X Post of the Week",
      "Bipartisan Housing Legislation Heading to President’s Desk Includes Statutory Retail CBDC Ban Through 2030",
      "Why this matters for Zcash",
      "Action Items",
      "Digital Asset Coalitions Urge Unaltered Passage of H.R. 9175 to Normalize Mining and Staking Tax Deferral",
    ]);
  });
});
