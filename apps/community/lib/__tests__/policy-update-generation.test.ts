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
    expect(content.summary).toBe(
      "PGPZ has successfully completed its first month, establishing itself as a dedicated hub for policymakers, regulators, and industry stakeholders focused on Zcash.",
    );
    expect(content.summary).not.toContain("The month culminated");
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
    expect(content.sections.find((section) => section.heading === "PGPZ Progress Summary")?.progressItems).toEqual([
      {
        label: "Launched the PTPZ Community and Coalition Sites",
        details: [
          { text: "Developed PGPZ Policy Principles and Messaging" },
          { text: "Created Coalition Workstreams", children: ["Mining", "Tax"] },
        ],
      },
      { label: "Established the Community and Coalition Signal Chat Groups" },
      {
        label: "Published Weekly Policy Memos",
        details: [
          "Narrow/targeted weekly policy memos focusing on impact to Zcash ecosystem with action items.",
        ].map((text) => ({ text })),
      },
      {
        label: "Published Special Updates",
        details: [{ text: "Report: U.S. Digital Asset Policy H1 2026 recapping policy developments." }],
      },
      {
        label: "Held the PGPZ Coalition Launch Breakfast",
        details: [{ text: "June 30 Kickoff Breakfast at the Blockchain Association office" }],
      },
    ]);
    expect(content.sections.at(-1)?.body).toEqual([
      "Call your Senator’s office to advocate for the passage of the CLARITY Act with developer protections preserved.",
      "Relevant Posts:",
    ]);
  });

  it("uses PDF layout to preserve a special update title, bold subheads, and repeated link labels", () => {
    const clarityHref =
      "https://community.pgpz.org/resources/statements-for-the-record/2026-07-17-hfsc-clarity-act-statement-for-the-record.pdf";
    const fincenHref =
      "https://community.pgpz.org/resources/statements-for-the-record/2026-07-21-hfsc-fincen-oversight-statement-for-the-record.pdf";
    const layoutLine = (
      overrides: Partial<{
        page: number;
        text: string;
        x: number;
        y: number;
        width: number;
        height: number;
        fontSize: number;
        bold: boolean;
        italic: boolean;
        links: Array<{ text: string; href: string }>;
      }>,
    ) => ({
      page: 2,
      text: "",
      x: 72,
      y: 0,
      width: 460,
      height: 11,
      fontSize: 11,
      bold: false,
      italic: false,
      links: [] as Array<{ text: string; href: string }>,
      ...overrides,
    });
    const specialRecord = {
      ...record,
      category: "special",
      emailSubject: "PGPZ Special Update: Uploaded title",
    } as any;
    const content = sourcePolicyUpdateContent(specialRecord, {
      text: `
        PGPZ Community Member Policy Resource
        Statements for the Record—July 17 CLARITY Act and
        July 21 FinCEN Oversight Hearings
        Special Update | July Statements for the Record| July 24, 2026
        https://community.pgpz.org/updates/July_Statements_for_the_Record
        This week, PGPZ submitted two Statements for the Record.
        --- Page 1 of 2 ---
        Executive Summary
        The two Statements reinforce a consistent PGPZ message.
        July 17 Hearing—Building the Future of Finance: How the CLARITY Act Unlocks
        Innovation
        The CLARITY statement protects non-custodial software developers.
        Read the Statement for the Record here.
        July 21 Hearing—Oversight of the Financial Crimes Enforcement Network
        The FinCEN statement supports financial privacy.
        Read the Statement for the Record here.
        --- Page 2 of 2 ---
      `,
      tables: [],
      links: [
        { page: 2, text: "here.", href: clarityHref },
        { page: 2, text: "here.", href: fincenHref },
      ],
      layoutLines: [
        layoutLine({
          page: 1,
          text: "Statements for the Record—July 17 CLARITY Act and",
          y: 700,
          height: 16,
          fontSize: 16,
        }),
        layoutLine({
          page: 1,
          text: "July 21 FinCEN Oversight Hearings",
          y: 681,
          height: 16,
          fontSize: 16,
        }),
        layoutLine({ text: "Executive Summary", y: 700, height: 13, fontSize: 13, bold: true }),
        layoutLine({
          text: "The two Statements reinforce a consistent PGPZ message.",
          y: 680,
        }),
        layoutLine({
          text: "July 17 Hearing—Building the Future of Finance: How the CLARITY Act Unlocks",
          y: 640,
          bold: true,
        }),
        layoutLine({ text: "Innovation", y: 625, width: 60, bold: true }),
        layoutLine({
          text: "The CLARITY statement protects non-custodial software developers.",
          y: 600,
        }),
        layoutLine({
          text: "Read the Statement for the Record here.",
          y: 560,
          links: [{ text: "here.", href: clarityHref }],
        }),
        layoutLine({
          text: "July 21 Hearing—Oversight of the Financial Crimes Enforcement Network",
          y: 530,
          bold: true,
        }),
        layoutLine({
          text: "The FinCEN statement supports financial privacy.",
          y: 500,
        }),
        layoutLine({
          text: "Read the Statement for the Record here.",
          y: 460,
          links: [{ text: "here.", href: fincenHref }],
        }),
        layoutLine({ text: "2", x: 300, y: 38, width: 6 }),
      ],
      images: [],
      sourceTextLength: 0,
      sourceTextSha256: "",
    });

    expect(content.title).toBe(
      "Statements for the Record—July 17 CLARITY Act and July 21 FinCEN Oversight Hearings",
    );
    expect(content.emailSubject).toBe(
      "PGPZ Special Update: Statements for the Record—July 17 CLARITY Act and July 21 FinCEN Oversight Hearings",
    );
    expect(content.sections.map((section) => section.heading)).toEqual([
      "Executive Summary",
      "July 17 Hearing—Building the Future of Finance: How the CLARITY Act Unlocks Innovation",
      "July 21 Hearing—Oversight of the Financial Crimes Enforcement Network",
    ]);
    expect(content.sections[1].links).toEqual([{ text: "here.", href: clarityHref }]);
    expect(content.sections[2].links).toEqual([{ text: "here.", href: fincenHref }]);
    expect(content.sections[2].body).not.toContain("2");
  });
});
