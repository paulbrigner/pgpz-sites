import { describe, expect, it } from "vitest";
import {
  isPolicyUpdateSocialPostSection,
  normalizePolicyUpdateSectionLayout,
  policyUpdateSectionHeadingLink,
  splitPolicyUpdateSocialPostHeading,
} from "@/lib/policy-update-sections";

describe("policy update section helpers", () => {
  it("splits X Post of the Week headings into label and title", () => {
    expect(
      splitPolicyUpdateSocialPostHeading(
        "X Post of the Week: House Financial Services Committee Leadership Urges FinCEN to Reorient AML Rules",
      ),
    ).toEqual({
      label: "X Post of the Week",
      title: "House Financial Services Committee Leadership Urges FinCEN to Reorient AML Rules",
    });
  });

  it("recognizes notable post sections", () => {
    expect(
      splitPolicyUpdateSocialPostHeading(
        "Notable Posts: FinCEN and Federal Banking Regulators Propose Joint Identity Verification Rules",
      ),
    ).toEqual({
      label: "Notable Posts",
      title: "FinCEN and Federal Banking Regulators Propose Joint Identity Verification Rules",
    });

    expect(splitPolicyUpdateSocialPostHeading("Notable Post")).toEqual({
      label: "Notable Post",
    });
  });

  it("treats X screenshots as social-post sections but leaves the Signal QR section alone", () => {
    expect(
      isPolicyUpdateSocialPostSection({
        heading: "PGPZ Community Signal Chat",
        images: [
          {
            src: "/signal-chat-qr.png",
            alt: "QR code for joining the PGPZ Community Signal chat",
          },
        ],
      }),
    ).toBe(false);

    expect(
      isPolicyUpdateSocialPostSection({
        heading: "Policy development",
        images: [
          {
            src: "/x-warren-davidson.png",
            alt: "Embedded X post screenshot from Rep. Warren Davidson",
          },
        ],
      }),
    ).toBe(true);
  });

  it("links main policy headings from matching section links", () => {
    const section = {
      heading: "Illinois Becomes First U.S. State to Levy Direct Privilege Tax on Cryptocurrency Transactions",
      body: ["On June 16, Illinois adopted a crypto tax."],
      links: [
        {
          text: "Illinois Becomes First U.S. State to Levy Direct Privilege Tax on Cryptocurrency Transactions",
          href: "https://example.com/illinois",
        },
      ],
    };

    expect(policyUpdateSectionHeadingLink(section)).toEqual(section.links[0]);
  });

  it("keeps social screenshots with their source blocks in document order", () => {
    const normalized = normalizePolicyUpdateSectionLayout([
      {
        heading: "PGPZ Community Signal Chat",
        body: ["Join the PGPZ Community Signal chat."],
      },
      {
        heading: "X Post of the Week: House Financial Services Committee Leadership Urges FinCEN",
        body: ["FinCEN body."],
        images: [
          {
            src: "/assets/x-josh-swihart.png",
            alt: "Embedded X post screenshot from Josh Swihart",
          },
          {
            src: "/assets/x-warren-davidson.png",
            alt: "Embedded X post screenshot from Warren Davidson",
          },
        ],
      },
      {
        heading: "Why this matters for Zcash: FinCEN AML Rulemaking",
        body: ["FinCEN implications."],
      },
      {
        heading: "Notable Post: Illinois Becomes First U.S. State to Levy Direct Privilege Tax",
        body: ["Illinois body."],
        images: [
          {
            src: "/assets/x-justin-slaughter.png",
            alt: "Embedded X post screenshot from Justin Slaughter",
          },
          {
            src: "/assets/x-austin-campbell.png",
            alt: "Embedded X post screenshot from Austin Campbell",
          },
        ],
      },
      {
        heading: "Why this matters for Zcash: Illinois Crypto Tax",
        body: ["Illinois implications."],
      },
    ]);

    expect(normalized.map((section) => section.heading)).toEqual([
      "PGPZ Community Signal Chat",
      "X Post of the Week",
      "House Financial Services Committee Leadership Urges FinCEN",
      "Why this matters for Zcash: FinCEN AML Rulemaking",
      "Notable Post",
      "Illinois Becomes First U.S. State to Levy Direct Privilege Tax",
      "Why this matters for Zcash: Illinois Crypto Tax",
      "Notable Posts",
    ]);
    expect(normalized[1].images?.map((image) => image.src)).toEqual(["/assets/x-josh-swihart.png"]);
    expect(normalized[4].images?.map((image) => image.src)).toEqual(["/assets/x-warren-davidson.png"]);
    expect(normalized[7].images?.map((image) => image.src)).toEqual([
      "/assets/x-justin-slaughter.png",
      "/assets/x-austin-campbell.png",
    ]);
  });
});
