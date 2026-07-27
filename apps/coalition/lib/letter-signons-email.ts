import "server-only";

import {
  buildLetterSignOnReceiptEmail,
  buildLetterSignerUpdateEmail,
  type LetterRevisionChangeType,
} from "@pgpz/letter-signons";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - nodemailer types are not installed in this app.
import nodemailer from "nodemailer";
import { buildEmailServerConfig, normalizeEmail } from "@/lib/admin/email-transport";
import { recordEmailEvent } from "@/lib/admin/email-log";
import { getAppUserById } from "@/lib/app-users";
import { EMAIL_FROM, SITE_NAME } from "@/lib/config";
import {
  getLetterDocumentBytes,
  letterCampaignUrl,
  markLetterConfirmation,
  type LetterCampaign,
  type LetterSignOn,
} from "@/lib/letter-signons";

function requireTransporter() {
  const transport = buildEmailServerConfig();
  if (!transport || !EMAIL_FROM) {
    throw new Error("Email delivery is not configured.");
  }
  return nodemailer.createTransport(transport);
}

const safeError = (error: unknown) =>
  error instanceof Error && error.message
    ? error.message.slice(0, 600)
    : "Email delivery failed.";

async function currentSignOnEmail(signOn: LetterSignOn) {
  const user = await getAppUserById(signOn.userId, { consistentRead: true });
  if (user?.emailSuppressed === true) return null;
  return normalizeEmail(user?.email) || normalizeEmail(signOn.email) || null;
}

export async function sendLetterSignOnReceipt(
  campaign: LetterCampaign,
  signOn: LetterSignOn,
) {
  const email = await currentSignOnEmail(signOn);
  if (!email) {
    const message = "Confirmation skipped because the signer email is suppressed or unavailable.";
    await markLetterConfirmation({
      campaignId: campaign.id,
      userId: signOn.userId,
      status: "failed",
      error: message,
    });
    return { sent: false, error: message };
  }
  const revision =
    campaign.revisions.find(
      (item) =>
        item.version === signOn.documentVersion &&
        item.sha256 === signOn.documentSha256,
    );
  if (!revision) {
    const message = "The exact signed document version is unavailable.";
    await markLetterConfirmation({
      campaignId: campaign.id,
      userId: signOn.userId,
      status: "failed",
      error: message,
    });
    return { sent: false, error: message };
  }
  const built = buildLetterSignOnReceiptEmail({
    siteName: SITE_NAME,
    campaignTitle: campaign.title,
    campaignUrl: letterCampaignUrl(campaign),
    deadlineAt: campaign.deadlineAt,
    documentVersion: signOn.documentVersion,
    documentSha256: signOn.documentSha256,
    acceptedAt: signOn.acceptedAt,
    signer: signOn,
  });
  let providerAccepted = false;
  let providerMessageId: string | null = null;

  try {
    const bytes = await getLetterDocumentBytes(revision);
    const result = await requireTransporter().sendMail({
      to: email,
      from: EMAIL_FROM,
      subject: built.subject,
      text: built.text,
      html: built.html,
      attachments: [
        {
          filename: revision.fileName,
          content: Buffer.from(bytes),
          contentType: "application/pdf",
          contentDisposition: "attachment",
        },
      ],
    });
    providerMessageId = result?.messageId ? String(result.messageId) : null;
    providerAccepted = true;
    await markLetterConfirmation({
      campaignId: campaign.id,
      userId: signOn.userId,
      status: "sent",
    });
    await recordEmailEvent({
      userId: signOn.userId,
      email,
      type: "letter_signon_confirmation",
      subject: built.subject,
      status: "sent",
      providerMessageId,
      metadata: {
        campaignId: campaign.id,
        campaignSlug: campaign.slug,
        documentVersion: signOn.documentVersion,
        documentSha256: signOn.documentSha256,
      },
    }).catch((error) => {
      console.error("Letter sign-on confirmation logging failed", error);
    });
    return { sent: true, providerMessageId };
  } catch (error) {
    const message = safeError(error);
    if (providerAccepted) {
      await markLetterConfirmation({
        campaignId: campaign.id,
        userId: signOn.userId,
        status: "sent",
      }).catch((projectionError) => {
        console.error(
          "Letter confirmation was accepted by the provider but status projection failed",
          projectionError,
        );
      });
      return {
        sent: true,
        providerMessageId,
        warning:
          "The confirmation was accepted by the email provider, but its internal status log needs review.",
      };
    }
    await Promise.allSettled([
      markLetterConfirmation({
        campaignId: campaign.id,
        userId: signOn.userId,
        status: "failed",
        error: message,
      }),
      recordEmailEvent({
        userId: signOn.userId,
        email,
        type: "letter_signon_confirmation",
        subject: built.subject,
        status: "failed",
        error: message,
        metadata: {
          campaignId: campaign.id,
          campaignSlug: campaign.slug,
          documentVersion: signOn.documentVersion,
        },
      }),
    ]);
    return { sent: false, error: message };
  }
}

export async function sendLetterSignerNotice(input: {
  campaign: LetterCampaign;
  signOn: LetterSignOn;
  noticeId: string;
  subject: string;
  message: string;
  changeType: LetterRevisionChangeType | "status" | "delivered";
  attachLatestDocument: boolean;
}) {
  const email = await currentSignOnEmail(input.signOn);
  if (!email) {
    return {
      sent: false,
      email: input.signOn.email,
      error: "Signer email is suppressed or unavailable.",
    };
  }
  const built = buildLetterSignerUpdateEmail({
    siteName: SITE_NAME,
    campaignTitle: input.campaign.title,
    campaignUrl: letterCampaignUrl(input.campaign),
    displayName: input.signOn.displayName,
    subject: input.subject,
    message: input.message,
    changeType: input.changeType,
    documentVersion: input.campaign.currentDocument.version,
  });
  try {
    const attachments = input.attachLatestDocument
      ? [
          {
            filename: input.campaign.currentDocument.fileName,
            content: Buffer.from(
              await getLetterDocumentBytes(input.campaign.currentDocument),
            ),
            contentType: "application/pdf",
            contentDisposition: "attachment",
          },
        ]
      : undefined;
    const result = await requireTransporter().sendMail({
      to: email,
      from: EMAIL_FROM,
      subject: built.subject,
      text: built.text,
      html: built.html,
      attachments,
    });
    const providerMessageId = result?.messageId ? String(result.messageId) : null;
    await recordEmailEvent({
      eventId: `letter-notice:${input.noticeId}:${input.signOn.userId}:sent`,
      userId: input.signOn.userId,
      email,
      type: "letter_signer_update",
      subject: built.subject,
      status: "sent",
      providerMessageId,
      metadata: {
        campaignId: input.campaign.id,
        campaignSlug: input.campaign.slug,
        noticeId: input.noticeId,
        changeType: input.changeType,
        documentVersion: input.campaign.currentDocument.version,
      },
    }).catch((error) => {
      console.error("Letter signer update logging failed", error);
    });
    return { sent: true, email, providerMessageId };
  } catch (error) {
    const message = safeError(error);
    await recordEmailEvent({
      eventId: `letter-notice:${input.noticeId}:${input.signOn.userId}:failed`,
      userId: input.signOn.userId,
      email,
      type: "letter_signer_update",
      subject: built.subject,
      status: "failed",
      error: message,
      metadata: {
        campaignId: input.campaign.id,
        campaignSlug: input.campaign.slug,
        noticeId: input.noticeId,
        changeType: input.changeType,
        documentVersion: input.campaign.currentDocument.version,
      },
    }).catch((loggingError) => {
      console.error("Letter signer update failure logging failed", loggingError);
    });
    return { sent: false, email, error: message };
  }
}
