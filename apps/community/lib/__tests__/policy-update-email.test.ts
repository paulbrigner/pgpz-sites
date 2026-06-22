import { describe, expect, it } from "vitest";
import { buildPolicyUpdateEmail } from "@/lib/policy-update-email";
import { getLatestPolicyUpdate } from "@/lib/policy-updates";

const weeklyUpdate = getLatestPolicyUpdate("weekly");
const specialUpdate = getLatestPolicyUpdate("special");

describe("buildPolicyUpdateEmail", () => {
  it("greets recipients by first name", () => {
    if (!weeklyUpdate) throw new Error("Missing weekly update fixture");

    const built = buildPolicyUpdateEmail(
      weeklyUpdate,
      {
        email: "paul@example.com",
        name: "Paul Brigner",
        firstName: "Paul",
        lastName: "Brigner",
      },
      "https://community.pgpz.org",
    );

    expect(built.html).toContain("Hi Paul,");
    expect(built.html).toContain("Did someone forward you this email?");
    expect(built.html).toContain('src="https://community.pgpz.org/community-join-qr.png"');
    expect(built.text).toContain("Hi Paul,");
    expect(built.text).toContain("Join the PGPZ Community to receive updates directly");
  });

  it("uses only the stored first name field for greetings", () => {
    if (!weeklyUpdate) throw new Error("Missing weekly update fixture");

    const built = buildPolicyUpdateEmail(
      weeklyUpdate,
      {
        email: "paul@example.com",
        firstName: "Paul",
        lastName: "Brigner",
      },
      "https://community.pgpz.org",
    );

    expect(built.html).toContain("Hi Paul,");
    expect(built.text).toContain("Hi Paul,");
    expect(built.html).not.toContain("Hi Paul Brigner,");
    expect(built.text).not.toContain("Hi Paul Brigner,");
  });

  it("falls back when no profile name is available", () => {
    if (!weeklyUpdate) throw new Error("Missing weekly update fixture");

    const built = buildPolicyUpdateEmail(
      weeklyUpdate,
      { email: "unknown@example.com" },
      "https://community.pgpz.org",
    );

    expect(built.html).toContain("Hi there,");
    expect(built.text).toContain("Hi there,");
  });

  it("turns terse topic-list summaries into a proper email intro", () => {
    if (!weeklyUpdate) throw new Error("Missing weekly update fixture");

    const built = buildPolicyUpdateEmail(
      {
        ...weeklyUpdate,
        summary: "FinCEN AML rulemaking, Illinois crypto tax, and stablecoin customer-identification requirements",
      },
      { email: "paul@example.com", firstName: "Paul" },
      "https://community.pgpz.org",
    );

    expect(built.html).toContain(
      "This week&#39;s PGPZ Community policy memo covers FinCEN AML rulemaking, Illinois crypto tax, and stablecoin customer-identification requirements.",
    );
    expect(built.text).toContain(
      "This week's PGPZ Community policy memo covers FinCEN AML rulemaking, Illinois crypto tax, and stablecoin customer-identification requirements.",
    );
  });

  it("renders policy update tables in HTML and text email bodies", () => {
    if (!specialUpdate) throw new Error("Missing special update fixture");

    const built = buildPolicyUpdateEmail(
      specialUpdate,
      { email: "paul@example.com", name: "Paul Brigner", firstName: "Paul", lastName: "Brigner" },
      "https://community.pgpz.org",
    );

    expect(built.html).toContain("Status as of June 12, 2026");
    expect(built.html).toContain("Digital Asset Market Clarity Act");
    expect(built.text).toContain("Development | Status as of June 12, 2026 | Relevance to the Zcash ecosystem");
    expect(built.text).toContain("SEC closure of the Zcash Foundation inquiry");
  });

  it("preserves embedded policy update links in HTML and text email bodies", () => {
    if (!weeklyUpdate) throw new Error("Missing weekly update fixture");

    const built = buildPolicyUpdateEmail(
      weeklyUpdate,
      { email: "paul@example.com", name: "Paul Brigner", firstName: "Paul", lastName: "Brigner" },
      "https://community.pgpz.org",
    );

    expect(built.html).toContain('href="https://x.com/paulbrigner/thread/2064698213236408727"');
    expect(built.html).toContain(">June 10 thread</a>");
    expect(built.html).toContain('href="https://x.com/paulbrigner/status/2060327543387857190?s=20"');
    expect(built.text).toContain(
      "June 10 thread (https://x.com/paulbrigner/thread/2064698213236408727)",
    );
    expect(built.text).toContain(
      "EU correction post (https://x.com/paulbrigner/status/2060327543387857190?s=20)",
    );
    expect(built.text).toContain("The record stays open for written submissions through June 23.");
  });

  it("renders policy update section images through unauthenticated email asset URLs", () => {
    if (!weeklyUpdate) throw new Error("Missing weekly update fixture");

    const built = buildPolicyUpdateEmail(
      {
        ...weeklyUpdate,
        slug: "test-upload",
        sections: [
          {
            heading: "X Post of the Week",
            body: [],
            images: [
              {
                src: "/api/policy-updates/test-upload/assets/x-josh-swihart.png",
                alt: "Josh Swihart X post screenshot",
                caption: "Embedded X post screenshot from the source memo.",
                width: 1200,
                height: 800,
              },
            ],
          },
        ],
      },
      { email: "paul@example.com", firstName: "Paul" },
      "https://community.pgpz.org",
    );

    expect(built.html).toContain(
      'src="https://community.pgpz.org/api/policy-updates/test-upload/email-assets/x-josh-swihart.png"',
    );
    expect(built.html).not.toContain("cid:");
    expect(built.html).not.toContain(
      'src="https://community.pgpz.org/api/policy-updates/test-upload/assets/x-josh-swihart.png"',
    );
    expect(built.text).toContain("[Image: Josh Swihart X post screenshot]");
  });

  it("adds tracked links, an open pixel, and unsubscribe URL when tracking is enabled", () => {
    if (!weeklyUpdate) throw new Error("Missing weekly update fixture");

    const built = buildPolicyUpdateEmail(
      weeklyUpdate,
      { email: "paul@example.com", firstName: "Paul" },
      "https://community.pgpz.org",
      {
        trackingId: "policy-track-123",
        trackLinks: true,
        includeOpenPixel: true,
        includeUnsubscribe: true,
      },
    );

    expect(built.html).toContain("/api/email/open/policy-track-123.png");
    expect(built.html).toContain(
      "/api/email/click/policy-track-123?url=https%3A%2F%2Fcommunity.pgpz.org%2Fupdates%2F2026-06-08-weekly-policy-memo",
    );
    expect(built.html).toContain("/api/email/unsubscribe/policy-track-123");
    expect(built.text).toContain("Unsubscribe: https://community.pgpz.org/api/email/unsubscribe/policy-track-123");
  });
});
