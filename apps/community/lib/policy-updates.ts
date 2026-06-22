export type PolicyUpdateCategory = "weekly" | "special";
export type PolicyUpdateVisibilityStatus = "draft" | "published" | "unpublished";
export type PolicyUpdateGenerationStatus = "not_started" | "generated" | "failed";

export type PolicyUpdateSection = {
  heading: string;
  body: string[];
  table?: PolicyUpdateTable;
  bullets?: string[];
  bodyAfterBullets?: string[];
  links?: PolicyUpdateLink[];
  images?: PolicyUpdateImage[];
};

export type PolicyUpdateTable = {
  columns: string[];
  rows: string[][];
};

export type PolicyUpdateLink = {
  text: string;
  href: string;
};

export type PolicyUpdateImage = {
  src: string;
  alt: string;
  caption?: string;
  width?: number;
  height?: number;
  href?: string;
};

export type PolicyUpdate = {
  slug: string;
  category: PolicyUpdateCategory;
  categoryLabel: string;
  title: string;
  shortTitle: string;
  publishedAt: string;
  displayDate: string;
  summary: string;
  emailSubject: string;
  emailPreheader: string;
  coverImage: string;
  pdfHref: string;
  portalPath: string;
  keyTakeaways: string[];
  actionItems: string[];
  sections: PolicyUpdateSection[];
};

export type PolicyUpdateSummary = Pick<
  PolicyUpdate,
  | "slug"
  | "category"
  | "categoryLabel"
  | "title"
  | "shortTitle"
  | "publishedAt"
  | "displayDate"
  | "summary"
  | "emailSubject"
  | "emailPreheader"
  | "coverImage"
  | "pdfHref"
  | "portalPath"
> & {
  source?: "static" | "uploaded";
  visibilityStatus?: PolicyUpdateVisibilityStatus;
  publishedOn?: string | null;
  publishedBy?: string | null;
  unpublishedOn?: string | null;
  unpublishedBy?: string | null;
  uploadedAt?: string | null;
  fileName?: string | null;
  generationStatus?: PolicyUpdateGenerationStatus | null;
  generatedAt?: string | null;
  generatedBy?: string | null;
  generatedModel?: string | null;
  generationError?: string | null;
  generationSourceTextLength?: number | null;
  generationSourceTextSha256?: string | null;
};

export const policyUpdateCategoryLabels: Record<PolicyUpdateCategory, string> = {
  weekly: "Weekly Policy Memo",
  special: "Special Update",
};

const weeklyPolicyMemoSummary =
  "The House Ways and Means Committee held a full-committee hearing on digital-asset taxation, advancing discussion drafts on de minimis relief, stablecoins, mining and staking rewards, routine network fees, and related parity provisions. DCG organized a DC Fly-in with a focus on financial privacy. The week also kept exchange and custody access for privacy assets in focus under EU AMLR and MiCA.";

const weeklyPolicyMemo: PolicyUpdate = {
  slug: "2026-06-08-weekly-policy-memo",
  category: "weekly",
  categoryLabel: policyUpdateCategoryLabels.weekly,
  title: "Weekly Policy Memo: Week of June 8, 2026",
  shortTitle: "Weekly Policy Memo: June 8, 2026",
  publishedAt: "2026-06-08",
  displayDate: "Week of June 8, 2026",
  summary: weeklyPolicyMemoSummary,
  emailSubject: "PGPZ Weekly Policy Memo: Week of June 8, 2026",
  emailPreheader:
    "Digital-asset tax drafts, the DCG Fly-in, CLARITY Act advocacy, and privacy-asset access risks.",
  coverImage: "/resources/2026-06-08-weekly-policy-memo-cover.png",
  pdfHref: "/resources/2026-06-08-weekly-policy-memo.pdf",
  portalPath: "/updates/2026-06-08-weekly-policy-memo",
  keyTakeaways: [
    "The June 9 Ways and Means hearing was a discussion hearing, not a markup, so no legislation advanced out of committee.",
    "Seven tax discussion drafts covered de minimis transaction relief, stablecoin treatment, mining and staking rewards, routine network fees, securities lending, mark-to-market parity, and charitable-deduction parity.",
    "Written submissions for the hearing record are due June 23, 2026.",
    "The June 10 DCG Fly-in put financial privacy in crypto before congressional offices and connected that advocacy to the CLARITY Act debate.",
    "EU AMLR and MiCA continue to keep privacy-coin exchange and custody access in focus as implementation timelines approach.",
  ],
  actionItems: [
    "Call your Senator and ask them to support the CLARITY Act with the Blockchain Regulatory Certainty Act provisions preserved.",
    "Share accurate corrections when EU or Philippines privacy-coin ban narratives circulate.",
    "Repost PGPZ X and LinkedIn posts to increase visibility and promote the Community.",
    "Educate your network about Zcash.",
    "Engage with PGPZ by flagging concerns and the impact of policy developments.",
  ],
  sections: [
    {
      heading: "House Ways and Means Held its Hearing on Digital Asset Taxation",
      body: [
        "On June 9, 2026, the House Ways and Means Committee held a full-committee legislative hearing on digital-asset taxation, organized around seven discussion drafts. Because it was a discussion hearing rather than a markup or floor vote, no legislation was passed out of committee.",
      ],
      bullets: [
        "De minimis relief for small transactions.",
        "Stablecoin tax treatment.",
        "Deferral of mining and staking rewards.",
        "A de minimis exception for routine network fees.",
        "Securities-lending parity.",
        "Mark-to-market parity.",
        "Charitable-deduction parity.",
      ],
      bodyAfterBullets: ["The record stays open for written submissions through June 23."],
    },
    {
      heading: "Why this matters for Zcash",
      body: [
        "De minimis relief and network-fee treatment would reduce the friction that currently makes spending Zcash a taxable event. The fact that a full committee took up these concepts in a formal hearing signals that tax legislation is advancing from concept toward drafting, though the pace and bipartisan scope remain unsettled.",
      ],
    },
    {
      heading: "DCG Fly-in Brought Financial Privacy Advocacy to Capitol Hill",
      body: [
        "On June 10, Paul Brigner, Chief Policy & Regulatory Officer of Zodl, participated in DCG's congressional briefing and fly-in on Capitol Hill focused on financial privacy in crypto. In a June 10 thread, he described briefing Congress with DCG and Aleo on the need for financial privacy, including voter polling on crypto's growing salience, financial privacy, and the CLARITY Act. DCG's public recap described the fly-in as convening DCG executives and 20+ blockchain founders for policy discussions on data privacy and digital asset regulation.",
      ],
      links: [
        {
          text: "Zodl",
          href: "https://zodl.com/",
        },
        {
          text: "June 10 thread",
          href: "https://x.com/paulbrigner/thread/2064698213236408727",
        },
        {
          text: "DCG's public recap",
          href: "https://x.com/DCGco/status/2065445282125414580?s=20",
        },
      ],
    },
    {
      heading: "Why this matters for Zcash",
      body: [
        "Meetings like these are crucial to educate policymakers on Zcash can be compliance-capable financial infrastructure - including transparent transaction modes and selective-disclosure tools - rather than a regulatory risk.",
      ],
    },
    {
      heading: "Privacy-coin Exchange Access Stays in Focus under EU AMLR and MiCA",
      body: [
        "This week's market volatility renewed attention on the standing regulatory risk for privacy assets: exchange and custody access. Under the EU's Anti-Money Laundering Regulation, licensed crypto-asset service providers face custodial restrictions on privacy coins phasing in by 2027, and MiCA conditions the admission of assets with built-in anonymity on providers being able to identify holders and their transaction history.",
        "Recent privacy-coin ban narratives show why precision matters. In an EU correction post, Brigner noted that the relevant EU rules restrict what regulated crypto service providers may offer when holders or transaction history cannot be identified; they do not ban the Zcash protocol, ZEC ownership, self-custody, peer-to-peer use, or transparent Zcash transactions. In a Philippines correction post, he similarly noted that reports point to a BSP listing/support rule for licensed VASPs, not a ban on ZEC, the protocol, self-custody, or peer-to-peer use, and that the memo reportedly does not name Zcash.",
        "Whether banks, exchanges, and custodians will serve the asset often matters more in practice than any single classification question.",
      ],
      links: [
        {
          text: "EU correction post",
          href: "https://x.com/paulbrigner/status/2060327543387857190?s=20",
        },
        {
          text: "Philippines correction post",
          href: "https://x.com/paulbrigner/status/2066106057089302602?s=20",
        },
      ],
    },
  ],
};

const specialPolicyUpdate: PolicyUpdate = {
  slug: "1H2026-us-digital-asset-policy",
  category: "special",
  categoryLabel: policyUpdateCategoryLabels.special,
  title: "U.S. Digital Asset Policy: Developments in 2026 and Implications for the Zcash Ecosystem",
  shortTitle: "U.S. Digital Asset Policy: H1 2026",
  publishedAt: "2026-06-16",
  displayDate: "H1 2026 U.S. Policy Report",
  summary:
    "The first half of 2026 moved U.S. digital asset policy from agenda-setting into implementation. The direction is more constructive for digital assets, but the issues most important to Zcash - AML, sanctions, banking access, and intermediary risk - remain unresolved.",
  emailSubject: "PGPZ Special Update: U.S. Digital Asset Policy and Zcash",
  emailPreheader:
    "A first-half 2026 special update on market structure, tax, agency guidance, banking access, and privacy-policy risk.",
  coverImage: "/resources/1H2026-us-digital-asset-policy-cover.png",
  pdfHref: "/resources/1H2026-us-digital-asset-policy.pdf",
  portalPath: "/updates/1H2026-us-digital-asset-policy",
  keyTakeaways: [
    "The federal digital-asset policy environment is more constructive than in prior years, but the most consequential items remain provisional.",
    "Market-structure legislation, agency taxonomy, tax drafts, and the May executive order all improve the operating climate without settling Zcash-specific questions.",
    "The SEC closure of the Zcash Foundation inquiry removes a legacy offerings-related overhang, but it is not a ruling on privacy technology.",
    "AML, sanctions, banking de-risking, and intermediary access remain the principal risks for privacy-preserving assets.",
    "The practical posture is to leverage policy and regulatory developments to anticipate friction areas: documentation, clear risk explanations, user education, and jurisdiction-specific operating models.",
  ],
  actionItems: [
    "Call your Senator and ask them to support the CLARITY Act with the Blockchain Regulatory Certainty Act provisions preserved.",
    "Repost PGPZ X and LinkedIn posts to increase visibility and promote the Community.",
    "Educate your network about Zcash.",
    "Engage with PGPZ by flagging concerns and the impact of policy developments.",
  ],
  sections: [
    {
      heading: "Executive Summary",
      body: [
        "The first half of 2026 moved U.S. digital asset policy from agenda-setting into implementation. The Trump administration, agencies, and Congress have each taken concrete steps, and the overall direction is more constructive toward digital assets than in prior years.",
        "For the Zcash ecosystem, the effect is best described as cautiously favorable in principle and uneven in practice. The developments most relevant to Zcash reduce some legacy risks while leaving the issues that matter most for a privacy-preserving network - anti-money-laundering and sanctions exposure and continued caution among banks and intermediaries - largely unresolved.",
        "No single development should be read as decisive. The market-structure bill has cleared the Senate Banking Committee but not the full Senate; the SEC-CFTC taxonomy is binding on the agencies today but revisable tomorrow; tax legislation is in early stages in the House Ways and Means Committee; and the May executive order is a policy directive rather than a change in law.",
      ],
    },
    {
      heading: "Summary of H1 2026 developments",
      body: [
        "The table below summarizes the developments discussed in this memo and their current status.",
      ],
      table: {
        columns: [
          "Development",
          "Status as of June 12, 2026",
          "Relevance to the Zcash ecosystem",
        ],
        rows: [
          [
            'Executive Order, "Integrating Financial Technology Innovation into Regulatory Frameworks" (May 19, 2026)',
            "Signed; a policy and process directive that creates no enforceable rights and changes no substantive law.",
            "Improves the climate for fintech-bank integration; practical effect depends entirely on agency follow-through.",
          ],
          [
            "Digital Asset Market Clarity Act",
            "Passed the House in 2025; advanced from Senate Banking Committee on a 15-9 vote (May 14, 2026); a Senate floor vote remains to be scheduled.",
            "Would anchor mature, non-security assets in a CFTC-led commodity framework. Illicit-finance and developer-protection provisions remain contested.",
          ],
          [
            "SEC-CFTC Joint Interpretation and five-part token taxonomy (Mar. 17, 2026)",
            "Issued; binding on both agencies, but revisable by future agency action absent legislation.",
            "Reinforces non-security commodity treatment for mature assets and clarifies the status of mining and staking.",
          ],
          [
            "Digital Asset PARITY Act and Ways & Means discussion drafts",
            "PARITY Act introduced May 19, 2026; committee hearing held June 9, 2026; early stage, no full consensus.",
            "Mining rewards tax treatment and de minimis payment relief are directly relevant to ZEC payments.",
          ],
          [
            "Treasury (FinCEN / OFAC) AML and sanctions rulemaking tied to GENIUS Act implementation",
            "Proposed during 2026; implementation ongoing.",
            "AML, sanctions, and illicit-finance posture remains the principal source of de-risking pressure for privacy-preserving assets.",
          ],
          [
            "Bank-agency GENIUS implementation (OCC, FDIC) and Federal Reserve payment-access review",
            "Proposals issued / evaluation underway during 2026.",
            "Clarifies - rather than broadly expands - bank participation; access to banking rails is likely to remain selective.",
          ],
          [
            "SEC closure of the Zcash Foundation inquiry",
            "Disclosed by the Zcash Foundation in January 2026; closed with no enforcement action.",
            "Removes a legacy, offerings-related overhang. It is not a ruling on the legality of privacy technology.",
          ],
        ],
      },
      bullets: [
        "The executive order improves the climate for fintech-bank integration, but its practical effect depends on agency follow-through.",
        "The CLARITY Act would anchor mature non-security assets in a CFTC-led commodity framework, though illicit-finance and developer-protection provisions remain contested.",
        "The SEC-CFTC taxonomy reinforces non-security commodity treatment for mature assets and clarifies mining and staking treatment.",
        "Tax drafts on de minimis payment relief and mining rewards are directly relevant to ZEC payments.",
        "AML, sanctions, and banking access remain the principal source of de-risking pressure for privacy-preserving assets.",
      ],
    },
    {
      heading: "Policy Direction Under the Administration",
      body: [
        "The most important White House-level signal is tone and direction. The May 19 executive order, 'Integrating Financial Technology Innovation into Regulatory Frameworks,' directs federal financial regulators to identify and reduce barriers that impede partnerships between non-bank fintech firms and federally regulated institutions and asks the Federal Reserve to evaluate access to Reserve Bank payment accounts and services for non-bank and digital-asset firms.",
        "For Zcash, the order is modestly helpful because it reduces the stigma historically attached to non-bank innovation and opens space for compliant, privacy-aware integrations to seek corporate and banking partnerships. It does not resolve any Zcash-specific question, and its practical value depends on how regulators follow through.",
      ],
    },
    {
      heading: "Congress: Market Structure and Tax",
      body: [
        "Congress remains the venue for durable policy, and two workstreams matter most for Zcash: market structure and digital-asset taxation.",
        "The Digital Asset Market Clarity Act passed the House in 2025 and advanced out of the Senate Banking Committee on a 15-9 vote on May 14, 2026. The bill would shift primary oversight of mature, non-security digital assets toward the CFTC under a disclosure-based commodity framework.",
        "The path forward remains uncertain. The legislation must be reconciled with the Senate Agriculture Committee's version, resolve disputes over developer protections, illicit-finance and law-enforcement provisions, and ethics provisions, and secure the bipartisan support needed to pass the full Senate.",
        "On tax, the bipartisan Digital Asset PARITY Act was introduced on May 19, 2026, and the House Ways and Means Committee held a hearing on digital-asset tax discussion drafts on June 9. De minimis and small-payment relief would reduce friction for spending privacy-preserving assets, while mining-deferral treatment would be favorable for Zcash miners.",
      ],
    },
    {
      heading: "The Agencies",
      body: [
        "The most substantive agency development was the SEC and CFTC's move from enforcement toward formal guidance. Their March 17 joint interpretation established a five-part taxonomy covering digital commodities, digital collectibles, digital tools, stablecoins, and digital securities, and it clarified treatment of protocol mining and staking.",
        "For Zcash, the immediate benefit is clarity rather than special treatment. The interpretation reinforces a commodity-style framework for mature, non-security assets, but neither agency is treating privacy as an affirmative policy priority.",
        "Treasury remains the principal source of risk for privacy-preserving assets because it owns the AML, sanctions, and illicit-finance framework. Even when policy statements are not anti-Zcash on their face, they are the setting most likely to produce de-risking by intermediaries.",
        "Bank regulators matter through the access layer they govern: custody, settlement, fiat on-ramps, and banks' willingness to serve digital-asset businesses. The likely result is selective bank participation rather than broad enthusiasm.",
      ],
    },
    {
      heading: "SEC Closure of the Zcash Foundation Inquiry",
      body: [
        "In January 2026, the Zcash Foundation disclosed that the SEC had closed an inquiry opened by subpoena in August 2023 with no enforcement action, fines, or required operational changes.",
        "The inquiry concerned crypto-asset offerings and the Foundation's funding and governance, not the legality of Zcash's privacy technology. The closure removes a multi-year legacy overhang, but it is not an affirmative endorsement of shielded transactions.",
        "The SEC did not issue a public statement, so the development is best characterized as the resolution of an inquiry rather than a formal agency pronouncement on Zcash.",
      ],
    },
    {
      heading: "What This Means for the Zcash Ecosystem",
      body: [
        "The favorable side is straightforward: digital-asset policy is no longer organized around the premise that innovation must yield to enforcement. That is a real improvement for developers, infrastructure providers, wallet providers, and merchant-integration efforts acting in good faith.",
        "The harder side is specific: Zcash's privacy model remains exposed to spillover from AML and sanctions debates. Intermediaries may restrict access if they view privacy features as raising examination or other risks.",
        "The practical posture is to leverage policy and regulatory developments to anticipate friction areas. That means planning for documentation, clear risk explanations, user education, and jurisdiction-specific operating models, and resisting the assumption that a favorable headline on digital assets automatically extends to privacy-preserving assets.",
      ],
    },
    {
      heading: "Risks, Caveats, and Open Questions",
      body: [
        "The principal risks are regulatory overlap, banking de-risking, tax-reporting complexity, and continued suspicion of privacy-enhancing features. A secondary risk is that Congress or the agencies settle on a framework that is technology-neutral on paper but operationally hostile to privacy-preserving networks in practice.",
        "The central open question is whether policymakers can distinguish legitimate privacy from illicit opacity. If they can, Zcash has a credible path to durable ecosystem growth. To achieve this, the focus should be on near-term high-leverage actions: engaging Congress and the administration on developer protections, market structure, and illicit finance and providing technical input on how shielded transactions can be supervised at on-and-off ramps without categorically excluding privacy-preserving assets.",
      ],
    },
  ],
};

export const policyUpdates: PolicyUpdate[] = [specialPolicyUpdate, weeklyPolicyMemo].sort(
  (a, b) => b.publishedAt.localeCompare(a.publishedAt),
);

export const getPolicyUpdate = (slug: string) =>
  policyUpdates.find((update) => update.slug === slug) || null;

export const getPolicyUpdateSummaries = (): PolicyUpdateSummary[] =>
  policyUpdates.map(
    ({
      slug,
      category,
      categoryLabel,
      title,
      shortTitle,
      publishedAt,
      displayDate,
      summary,
      emailSubject,
      emailPreheader,
      coverImage,
      pdfHref,
      portalPath,
    }) => ({
      slug,
      category,
      categoryLabel,
      title,
      shortTitle,
      publishedAt,
      displayDate,
      summary,
      emailSubject,
      emailPreheader,
      coverImage,
      pdfHref,
      portalPath,
      source: "static",
      visibilityStatus: "published",
      publishedOn: publishedAt,
      publishedBy: null,
      unpublishedOn: null,
      unpublishedBy: null,
      uploadedAt: null,
      fileName: null,
      generationStatus: null,
      generatedAt: null,
      generatedBy: null,
      generatedModel: null,
      generationError: null,
      generationSourceTextLength: null,
      generationSourceTextSha256: null,
    }),
  );

export const getPolicyUpdatesByCategory = (category: PolicyUpdateCategory) =>
  policyUpdates.filter((update) => update.category === category);

export const getLatestPolicyUpdate = (category?: PolicyUpdateCategory) =>
  (category ? getPolicyUpdatesByCategory(category) : policyUpdates)[0] || null;
