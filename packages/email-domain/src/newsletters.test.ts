import { describe, expect, it } from "vitest";
import {
  newsletterFromItem,
  newsletterPreviewText,
  newsletterSendRunFromItem,
  validateNewsletterDraft,
} from "./newsletters";

describe("newsletter domain", () => {
  it("normalizes and validates drafts", () => {
    expect(
      validateNewsletterDraft({
        subject: " Subject ",
        body: " Body ",
        preheader: " Intro ",
      }),
    ).toEqual({ subject: "Subject", body: "Body", preheader: "Intro" });
    expect(() =>
      validateNewsletterDraft({ subject: "", body: "Body" }),
    ).toThrow("subject is required");
    expect(() =>
      validateNewsletterDraft({ subject: "Subject", body: "" }),
    ).toThrow("body is required");
  });

  it("creates bounded preview text", () => {
    expect(newsletterPreviewText("  A\n\n B  ")).toBe("A B");
    expect(newsletterPreviewText("x".repeat(400))).toHaveLength(320);
  });

  it("normalizes newsletter and send-run records", () => {
    expect(
      newsletterFromItem({
        newsletterId: "newsletter-1",
        body: "Hello world",
        status: "unexpected",
        recipientCount: 2,
      }),
    ).toMatchObject({
      id: "newsletter-1",
      previewText: "Hello world",
      status: "draft",
      stats: { recipientCount: 2, openCount: null },
    });
    expect(
      newsletterSendRunFromItem({
        sendRunId: "run-1",
        newsletterId: "newsletter-1",
        audienceMode: "selected_members",
      }),
    ).toMatchObject({
      id: "run-1",
      audienceMode: "selected_members",
      stats: { openCount: 0 },
    });
  });
});
