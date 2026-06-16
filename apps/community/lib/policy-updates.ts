export type PolicyUpdateCategory = "weekly" | "special";

export type PolicyUpdateSection = {
  heading: string;
  body: string[];
  table?: PolicyUpdateTable;
  bullets?: string[];
};

export type PolicyUpdateTable = {
  columns: string[];
  rows: string[][];
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
>;

export const policyUpdateCategoryLabels: Record<PolicyUpdateCategory, string> = {
  weekly: "Weekly Policy Memo",
  special: "Special Update",
};

const weeklyPolicyMemo: PolicyUpdate = {
  slug: "zodl-weekly-policy-memo-2026-06-08",
  category: "weekly",
  categoryLabel: policyUpdateCategoryLabels.weekly,
  title: "ZODL Weekly Policy Memo: Week of June 8, 2026",
  shortTitle: "Weekly Policy Memo: June 8, 2026",
  publishedAt: "2026-06-08",
  displayDate: "Week of June 8, 2026",
  summary:
    "The House Ways and Means Committee held a full-committee hearing on digital-asset taxation, advancing discussion drafts on de minimis relief, stablecoins, mining and staking rewards, routine network fees, and related parity provisions. The week also kept exchange and custody access for privacy assets in focus under EU AMLR and MiCA.",
  emailSubject: "PGPZ Weekly Policy Memo: Week of June 8, 2026",
  emailPreheader:
    "Digital-asset tax drafts, de minimis relief, network-fee treatment, and privacy-asset access risks.",
  coverImage: "/resources/weekly-policy-memo-2026-06-08-cover.png",
  pdfHref: "/resources/weekly-policy-memo-2026-06-08.pdf",
  portalPath: "/updates/zodl-weekly-policy-memo-2026-06-08",
  keyTakeaways: [
    "The June 9 Ways and Means hearing was a discussion hearing, not a markup, so no legislation advanced out of committee.",
    "Seven tax discussion drafts covered de minimis transaction relief, stablecoin treatment, mining and staking rewards, routine network fees, securities lending, mark-to-market parity, and charitable-deduction parity.",
    "Written submissions for the hearing record are due June 23, 2026.",
    "EU AMLR and MiCA continue to keep privacy-coin exchange and custody access in focus as implementation timelines approach.",
  ],
  actionItems: [
    "Monitor policy updates through the PGPZ Community.",
    "Share and repost PGPZ X and LinkedIn content.",
    "Send feedback to PGPZ. How would this legislation help or hurt your operations?",
  ],
  sections: [
    {
      heading: "Executive Summary",
      body: [
        "The House Ways and Means Committee held its full-committee hearing on digital-asset taxation on June 9, advancing seven discussion drafts covering de minimis transaction relief, stablecoin treatment, mining and staking reward treatment, a network-fee exception, and securities-lending, mark-to-market, and charitable-deduction parity.",
        "It was a discussion hearing rather than a markup, and the record stays open for written submissions through June 23.",
      ],
    },
    {
      heading: "House Ways and Means held its hearing on digital asset taxation",
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
    },
    {
      heading: "Why this matters for Zcash",
      body: [
        "De minimis relief and network-fee treatment would reduce the friction that currently makes spending Zcash a taxable event. The fact that a full committee took up these concepts in a formal hearing signals that tax legislation is advancing from concept toward drafting, though the pace and bipartisan scope remain unsettled.",
      ],
    },
    {
      heading: "Privacy-coin exchange access stays in focus under EU AMLR and MiCA",
      body: [
        "This week's market volatility renewed attention on the standing regulatory risk for privacy assets: exchange and custody access. Under the EU's Anti-Money Laundering Regulation, licensed crypto-asset service providers face custodial restrictions on privacy coins phasing in by 2027, and MiCA conditions the admission of assets with built-in anonymity on providers being able to identify holders and their transaction history.",
        "Whether banks, exchanges, and custodians will serve the asset often matters more in practice than any single classification question.",
      ],
    },
  ],
};

const specialPolicyUpdate: PolicyUpdate = {
  slug: "us-digital-asset-policy-2026-zcash",
  category: "special",
  categoryLabel: policyUpdateCategoryLabels.special,
  title: "U.S. Digital Asset Policy: Developments in 2026 and Implications for the Zcash Ecosystem",
  shortTitle: "U.S. Digital Asset Policy: H1 2026",
  publishedAt: "2026-06-12",
  displayDate: "H1 2026 Special Update",
  summary:
    "The first half of 2026 moved U.S. digital asset policy from agenda-setting into implementation. The direction is more constructive for digital assets, but the issues most important to Zcash - AML, sanctions, banking access, and intermediary risk - remain unresolved.",
  emailSubject: "PGPZ Special Update: U.S. Digital Asset Policy and Zcash",
  emailPreheader:
    "A first-half 2026 special update on market structure, tax, agency guidance, banking access, and privacy-policy risk.",
  coverImage: "/resources/us-digital-asset-policy-2026-zcash-cover.png",
  pdfHref: "/resources/us-digital-asset-policy-2026-zcash.pdf",
  portalPath: "/updates/us-digital-asset-policy-2026-zcash",
  keyTakeaways: [
    "The federal digital-asset policy environment is more constructive than in prior years, but the most consequential items remain provisional.",
    "Market-structure legislation, agency taxonomy, tax drafts, and the May executive order all improve the operating climate without settling Zcash-specific questions.",
    "The SEC closure of the Zcash Foundation inquiry removes a legacy offerings-related overhang, but it is not a ruling on privacy technology.",
    "AML, sanctions, banking de-risking, and intermediary access remain the principal risks for privacy-preserving assets.",
    "The practical posture for Zcash is to treat policy as a product constraint: documentation, compliance explanations, user education, and partner-ready selective-disclosure materials matter.",
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
        "The table below summarizes the first-half developments, current status, and relevance to the Zcash ecosystem.",
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
      heading: "Policy direction under the administration",
      body: [
        "The most important White House-level signal is tone and direction. The May 19 executive order, 'Integrating Financial Technology Innovation into Regulatory Frameworks,' directs federal financial regulators to identify and reduce barriers that impede partnerships between non-bank fintech firms and federally regulated institutions and asks the Federal Reserve to evaluate access to Reserve Bank payment accounts and services for non-bank and digital-asset firms.",
        "For Zcash, the order is modestly helpful because it reduces the stigma historically attached to non-bank innovation and opens space for compliant, privacy-aware integrations to seek corporate and banking partnerships. It does not resolve any Zcash-specific question, and its practical value depends on how regulators follow through.",
      ],
    },
    {
      heading: "Congress: market structure and tax",
      body: [
        "Congress remains the venue for durable policy, and two workstreams matter most for Zcash: market structure and digital-asset taxation.",
        "The Digital Asset Market Clarity Act passed the House in 2025 and advanced out of the Senate Banking Committee on a 15-9 vote on May 14, 2026. The bill would shift primary oversight of mature, non-security digital assets toward the CFTC under a disclosure-based commodity framework.",
        "The path forward remains uncertain. The legislation must be reconciled with the Senate Agriculture Committee's version, resolve disputes over developer protections, illicit-finance and law-enforcement provisions, and ethics provisions, and secure the bipartisan support needed to pass the full Senate.",
        "On tax, the bipartisan Digital Asset PARITY Act was introduced on May 19, 2026, and the House Ways and Means Committee held a hearing on digital-asset tax discussion drafts on June 9. De minimis and small-payment relief would reduce friction for spending privacy-preserving assets, while mining-deferral treatment would be favorable for Zcash miners.",
      ],
    },
    {
      heading: "The agencies",
      body: [
        "The most substantive agency development was the SEC and CFTC's move from enforcement toward formal guidance. Their March 17 joint interpretation established a five-part taxonomy covering digital commodities, digital collectibles, digital tools, stablecoins, and digital securities, and it clarified treatment of protocol mining and staking.",
        "For Zcash, the immediate benefit is clarity rather than special treatment. The interpretation reinforces a commodity-style framework for mature, non-security assets, but neither agency is treating privacy as an affirmative policy priority.",
        "Treasury remains the principal source of risk for privacy-preserving assets because it owns the AML, sanctions, and illicit-finance framework. Even when policy statements are not anti-Zcash on their face, they are the setting most likely to produce de-risking by intermediaries.",
        "Bank regulators matter through the access layer they govern: custody, settlement, fiat on-ramps, and banks' willingness to serve digital-asset businesses. The likely result is selective bank participation rather than broad enthusiasm.",
      ],
    },
    {
      heading: "SEC closure of the Zcash Foundation inquiry",
      body: [
        "In January 2026, the Zcash Foundation disclosed that the SEC had closed an inquiry opened by subpoena in August 2023 with no enforcement action, fines, or required operational changes.",
        "The inquiry concerned crypto-asset offerings and the Foundation's funding and governance, not the legality of Zcash's privacy technology. The closure removes a multi-year legacy overhang, but it is not an affirmative endorsement of shielded transactions.",
        "The SEC did not issue a public statement, so the development is best characterized as the resolution of an inquiry rather than a formal agency pronouncement on Zcash.",
      ],
    },
    {
      heading: "What this means for the Zcash ecosystem",
      body: [
        "The favorable side is straightforward: digital-asset policy is no longer organized around the premise that innovation must yield to enforcement. That is a real improvement for developers, infrastructure providers, wallet providers, and merchant-integration efforts acting in good faith.",
        "The harder side is specific: Zcash's privacy model remains exposed to spillover from AML and sanctions debates. Intermediaries may restrict access if they view privacy features as raising examination or other risks.",
        "The practical posture is to leverage policy and regulatory developments to anticipate friction areas. That means planning for documentation, clear risk explanations, user education, and jurisdiction-specific operating models, and resisting the assumption that a favorable digital-asset headline automatically extends to privacy-preserving assets.",
      ],
    },
    {
      heading: "Risks, caveats, open questions, and recommendations",
      body: [
        "The principal risks are regulatory overlap, banking de-risking, tax-reporting complexity, and continued suspicion of privacy-enhancing features. A secondary risk is that Congress or the agencies settle on a framework that is technology-neutral on paper but operationally hostile to privacy-preserving networks in practice.",
        "The central open question is whether policymakers can distinguish legitimate privacy from illicit opacity. If they can, Zcash has a credible path to durable ecosystem growth. To achieve this, the focus should be on near-term high-leverage actions include engaging Congress and the administration on developer protections, market structure, and illicit finance and providing technical input on how shielded transactions can be supervised at on-and-off ramps without categorically excluding privacy-preserving assets.",
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
    }),
  );

export const getPolicyUpdatesByCategory = (category: PolicyUpdateCategory) =>
  policyUpdates.filter((update) => update.category === category);

export const getLatestPolicyUpdate = (category?: PolicyUpdateCategory) =>
  (category ? getPolicyUpdatesByCategory(category) : policyUpdates)[0] || null;
