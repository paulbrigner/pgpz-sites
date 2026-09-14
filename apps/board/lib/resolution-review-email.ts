import "server-only";
import nodemailer from "nodemailer";
import { assertBoardEmailReady } from "./email-transport";
import { SITE_URL } from "./config";
import { reviewThreadId, reviewThreadPath } from "./resolution-review-links";

/** Keep private titles, assessments and reply bodies out of notifications. */
export function reviewReplyEmail(input: { meetingId: string; submissionId: string; to: string }) {
  if (!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(input.to)) throw new Error("One recipient is required");
  if (!reviewThreadId(input.submissionId)) throw new Error("A valid assessment identifier is required");
  const link = new URL(reviewThreadPath(input.meetingId, input.submissionId), SITE_URL);
  return { to: input.to, subject: "PGPZ Board: new reply in your review thread",
    text: `A director has replied to your assessment or message in a Board resolution review.\n\nOpen the review thread: ${link}\n\nSign in to read and respond. Private assessment and reply text are not included in this email. A reply does not change your review status or constitute consent. Only you can update your own assessment.`,
  };
}

export async function sendReviewReplyEmail(input: Parameters<typeof reviewReplyEmail>[0]) {
  const email = reviewReplyEmail(input);
  const { transport, from } = assertBoardEmailReady({ maxAttempts: 1 });
  await nodemailer.createTransport(transport as never).sendMail({ from, ...email } as never);
}
