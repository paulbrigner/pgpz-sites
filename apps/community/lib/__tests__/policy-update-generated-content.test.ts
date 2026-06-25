import { describe, expect, it } from "vitest";
import { normalizeGeneratedPolicyUpdateContent } from "@/lib/policy-update-generated-content";

const fallback = {
  shortTitle: "Fallback short title",
  summary: "Fallback summary.",
  emailSubject: "Fallback subject",
  emailPreheader: "Fallback preheader.",
  keyTakeaways: ["Fallback takeaway."],
  actionItems: ["Fallback action."],
  sections: [
    {
      heading: "Fallback section",
      body: ["Fallback body."],
    },
  ],
};

describe("normalizeGeneratedPolicyUpdateContent", () => {
  it("preserves generated tables and converts markdown links into section links", () => {
    const normalized = normalizeGeneratedPolicyUpdateContent(
      {
        summary: "Generated summary.",
        emailPreheader: "Generated preheader.",
        keyTakeaways: ["Takeaway one", "Takeaway two"],
        actionItems: ["Action one"],
        sections: [
          {
            heading: "Policy development",
            body: [
              "Read the [source post](https://x.com/example/status/123) for the correction.",
            ],
            table: {
              columns: ["Development", "Status", "Zcash relevance"],
              rows: [["Hearing", "Held June 9\nWritten comments due later", "Tax-friction implications"]],
            },
          },
        ],
      },
      fallback,
    );

    expect(normalized.summary).toBe("Generated summary.");
    expect(normalized.keyTakeaways).toEqual(["Takeaway one", "Takeaway two"]);
    expect(normalized.sections[0].body[0]).toBe("Read the source post for the correction.");
    expect(normalized.sections[0].links).toEqual([
      { text: "source post", href: "https://x.com/example/status/123" },
    ]);
    expect(normalized.sections[0].table).toEqual({
      columns: ["Development", "Status", "Zcash relevance"],
      rows: [["Hearing", "Held June 9\nWritten comments due later", "Tax-friction implications"]],
    });
  });

  it("filters generic PGPZ signup QR images while preserving Signal QR images", () => {
    const normalized = normalizeGeneratedPolicyUpdateContent(
      {
        summary: "Generated summary.",
        emailPreheader: "Generated preheader.",
        keyTakeaways: ["Takeaway"],
        actionItems: ["Action"],
        sections: [
          {
            heading: "Community links",
            body: ["Join the Signal chat."],
            images: [
              {
                src: "/api/policy-updates/test/assets/member-join-qr.png",
                alt: "QR code for joining the PGPZ Community",
                caption: "PGPZ Community signup QR included in the source memo.",
                width: 384,
                height: 384,
              },
              {
                src: "/api/policy-updates/test/assets/signal-chat-qr.png",
                alt: "QR code for joining the PGPZ Community Signal chat",
                caption: "Scan to join the PGPZ Community Signal chat.",
                width: 230,
                height: 230,
              },
            ],
          },
        ],
      },
      fallback,
    );

    expect(normalized.sections[0].images).toEqual([
      {
        src: "/api/policy-updates/test/assets/signal-chat-qr.png",
        alt: "QR code for joining the PGPZ Community Signal chat",
        caption: "Scan to join the PGPZ Community Signal chat.",
        width: 230,
        height: 230,
      },
    ]);
  });

  it("falls back when generated arrays are empty", () => {
    const normalized = normalizeGeneratedPolicyUpdateContent(
      {
        summary: "",
        emailPreheader: "",
        keyTakeaways: [],
        actionItems: [],
        sections: [],
      },
      fallback,
    );

    expect(normalized.summary).toBe(fallback.summary);
    expect(normalized.emailPreheader).toBe(fallback.summary);
    expect(normalized.keyTakeaways).toEqual(fallback.keyTakeaways);
    expect(normalized.actionItems).toEqual(fallback.actionItems);
    expect(normalized.sections).toEqual(fallback.sections);
  });
});
