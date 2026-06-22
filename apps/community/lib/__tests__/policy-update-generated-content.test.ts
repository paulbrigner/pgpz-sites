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
              rows: [["Hearing", "Held June 9", "Tax-friction implications"]],
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
      rows: [["Hearing", "Held June 9", "Tax-friction implications"]],
    });
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
