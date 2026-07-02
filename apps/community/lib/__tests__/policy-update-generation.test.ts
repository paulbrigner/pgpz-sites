import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@aws-sdk/client-s3", () => ({
  PutObjectCommand: vi.fn(),
}));
vi.mock("pngjs", () => ({
  PNG: Object.assign(
    vi.fn(function PNG(this: any, options: any) {
      this.width = options?.width || 0;
      this.height = options?.height || 0;
      this.data = Buffer.alloc(0);
    }),
    { sync: { write: vi.fn(() => Buffer.alloc(0)) } },
  ),
}));
vi.mock("@/lib/s3", () => ({
  s3Client: { send: vi.fn() },
}));

import { sourcePolicyUpdateContent } from "@/lib/admin/policy-update-generation";

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

  it("handles the June 29 memo title, progress box, and relevant-post markers", () => {
    const content = sourcePolicyUpdateContent(record, {
      text: `
        PGPZ Community Member Policy Resource
        community.pgpz.org | PGPZ Community | Page 1
        Weekly Policy Memo: June 29, 2026
        https://community.pgpz.org/updates/2026-06-29-weekly-policy-memo
        Key Takeaways
        l In its inaugural month, PGPZ successfully established itself as a central policy hub for Zcash.
        l The month culminated in a June 30 Kickoff Breakfast at the Blockchain Association.
        l The CLARITY Act’s prospects for enactment in 2026 have become increasingly uncertain.
        Action Items
        l Help us spread awareness by inviting friends and colleagues to join the Community and Coalition.
        l Call your Senator’s office to advocate for the passage of the CLARITY Act with developer protections preserved.
        --- Page 1 of 5 ---
        X Post of the Week:
        June Monthly Update on PGPZ
        PGPZ has successfully completed its first month, establishing itself as a dedicated hub for policymakers, regulators, and industry stakeholders focused on Zcash.
        Here is a summary of PGPZ progress to date:
        Why this matters for Zcash: PGPZ is focused on educating policymakers about Zcash and engaging with industry.
        Action Items: Help us spread awareness by inviting friends and colleagues to join the Community and Coalition.
        Launched the PTPZ Community and Coalition Sites
        • Developed PGPZ Policy Principles and Messaging
        • Created Coalition Workstreams
        • Mining
        • Tax
        Established the Community and Coalition Signal Chat Groups
        Published Weekly Policy Memos
        • Narrow/targeted weekly policy memos focusing on impact to Zcash ecosystem with action items.
        Published Special Updates
        • Report: U.S. Digital Asset Policy H1 2026 recapping policy developments.
        Held the PGPZ Coalition Launch Breakfast
        • June 30 Kickoff Breakfast at the Blockchain Association office
        Relevant Posts:
        CLARITY Act Talks Progress, but Prospects Become Murkier
        The CLARITY Act’s prospects for enactment in 2026 have become increasingly uncertain due to a compressed Senate legislative calendar.
        Why this matters for Zcash: The CLARITY Act generally helps the crypto industry and the Zcash ecosystem.
        Action Items: Call your Senator’s office to advocate for the passage of the CLARITY Act with developer protections preserved.
        Relevant Posts:
      `,
      tables: [],
      links: [],
      images: [],
      sourceTextLength: 0,
      sourceTextSha256: "",
    });

    expect(content.title).toBe("Weekly Policy Memo: June 29, 2026");
    expect(content.emailSubject).toBe("PGPZ Weekly Policy Memo: June 29, 2026");
    expect(content.keyTakeaways).toEqual([
      "In its inaugural month, PGPZ successfully established itself as a central policy hub for Zcash.",
      "The month culminated in a June 30 Kickoff Breakfast at the Blockchain Association.",
      "The CLARITY Act’s prospects for enactment in 2026 have become increasingly uncertain.",
    ]);
    expect(content.actionItems).toEqual([
      "Help us spread awareness by inviting friends and colleagues to join the Community and Coalition.",
      "Call your Senator’s office to advocate for the passage of the CLARITY Act with developer protections preserved.",
    ]);
    expect(content.sections.map((section) => section.heading)).toEqual([
      "X Post of the Week",
      "June Monthly Update on PGPZ",
      "PGPZ Progress Summary",
      "Why this matters for Zcash",
      "Action Items",
      "CLARITY Act Talks Progress, but Prospects Become Murkier",
      "Why this matters for Zcash",
      "Action Items",
    ]);
    expect(content.sections.find((section) => section.heading === "PGPZ Progress Summary")?.bullets).toEqual([
      "Launched the PTPZ Community and Coalition Sites: Developed PGPZ Policy Principles and Messaging; Created Coalition Workstreams; Mining; Tax",
      "Established the Community and Coalition Signal Chat Groups",
      "Published Weekly Policy Memos: Narrow/targeted weekly policy memos focusing on impact to Zcash ecosystem with action items.",
      "Published Special Updates: Report: U.S. Digital Asset Policy H1 2026 recapping policy developments.",
      "Held the PGPZ Coalition Launch Breakfast: June 30 Kickoff Breakfast at the Blockchain Association office",
    ]);
    expect(content.sections.at(-1)?.body).toEqual([
      "Call your Senator’s office to advocate for the passage of the CLARITY Act with developer protections preserved.",
      "Relevant Posts:",
    ]);
  });
});
