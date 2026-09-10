import "server-only";
import nodemailer from "nodemailer";
import { assertBoardEmailReady } from "./email-transport";
import { SITE_URL } from "./config";
import { disclosureStatus, type DisclosureReviewOutcome } from "./disclosures";

export function disclosureNotice(input: { id: string; year: number; dueDate: string | null; to: string }) {
  if (!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(input.to)) throw new Error("One recipient is required");
  return { to: input.to, subject: "PGPZ Board: disclosure action requested",
    text: `A ${input.year} individual disclosure is ready for your attention in the PGPZ Board portal.${input.dueDate ? ` Requested completion date: ${input.dueDate}.` : ""}\n\nOpen the secure portal: ${new URL(`/disclosures/${encodeURIComponent(input.id)}`, SITE_URL)}\n\nSign in to view the request. Disclosure answers and review notes are available only to authorized participants.`,
  };
}
export async function sendDisclosureNotice(input: Parameters<typeof disclosureNotice>[0]) {
  const { transport, from } = assertBoardEmailReady();
  await nodemailer.createTransport(transport as never).sendMail({ from, ...disclosureNotice(input) } as never);
}

/** Only status and opaque portal coordinates may enter an automatic review email. */
export function disclosureReviewNotice(input: { id: string; year: number; revision: number; outcome: DisclosureReviewOutcome; to: string }) {
  const base = disclosureNotice({ ...input, dueDate: null });
  const instruction = input.outcome === "satisfactory"
    ? "Your disclosure review is complete and satisfactory."
    : input.outcome === "needs-information"
      ? "Your reviewer has requested an update or clarification. Please open your disclosure to read the request and respond."
      : "Your reviewer has recorded findings and follow-up. Please open your disclosure to read the note and next steps.";
  return { to: base.to, subject: `PGPZ Board: ${disclosureStatus(input.outcome)}`,
    text: `${instruction}\n\nThis notification concerns your ${input.year} disclosure, signed revision ${input.revision}. It does not approve a transaction or a Board resolution.\n\nOpen your restricted disclosure: ${new URL(`/disclosures/${encodeURIComponent(input.id)}`, SITE_URL)}\n\nSign in to read the review. Private disclosure details and review notes are not included in this email.`,
  };
}
export async function sendDisclosureReviewNotice(input: Parameters<typeof disclosureReviewNotice>[0]) {
  const { transport, from } = assertBoardEmailReady({ maxAttempts: 1 });
  await nodemailer.createTransport(transport as never).sendMail({ from, ...disclosureReviewNotice(input) } as never);
}
