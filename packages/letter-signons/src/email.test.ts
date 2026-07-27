import { describe, expect, it } from "vitest";
import {
  buildLetterSignOnReceiptEmail,
  buildLetterSignerUpdateEmail,
} from "./index";

describe("letter sign-on email", () => {
  const signer = {
    signerKind: "organization" as const,
    displayName: "Paul Brigner",
    organizationName: "PGPZ",
    title: "Founder",
    affiliation: null,
  };

  it("includes immutable receipt details and the campaign link", () => {
    const email = buildLetterSignOnReceiptEmail({
      siteName: "PGPZ Coalition",
      campaignTitle: "Support for H.R. 3633",
      campaignUrl: "https://coalition.pgpz.org/letters/clarity-act",
      deadlineAt: "2026-08-01T16:00:00.000Z",
      documentVersion: 1,
      documentSha256: "a".repeat(64),
      acceptedAt: "2026-07-27T18:00:00.000Z",
      signer,
    });

    expect(email.subject).toContain("Sign-on confirmed");
    expect(email.text).toContain("The exact PDF you reviewed is attached");
    expect(email.text).toContain("PGPZ (authorized by Paul Brigner)");
    expect(email.html).toContain("a".repeat(64));
  });

  it("clearly requests reconfirmation for material changes", () => {
    const email = buildLetterSignerUpdateEmail({
      siteName: "PGPZ Coalition",
      campaignTitle: "Support for H.R. 3633",
      campaignUrl: "https://coalition.pgpz.org/letters/clarity-act",
      displayName: "Paul Brigner",
      subject: "The letter has changed",
      message: "We updated the requested legislative language.",
      changeType: "material",
      documentVersion: 2,
    });

    expect(email.text).toContain("requires a new confirmation");
    expect(email.html).toContain("Review and reconfirm");
  });
});
