import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - nodemailer types not installed
import nodemailer from "nodemailer";
import { requireAdminSession } from "@/lib/admin/auth";
import { buildEmailServerConfig, isValidEmail, normalizeEmail } from "@/lib/admin/email-transport";
import {
  deleteNewsletterDraft,
  getNewsletter,
  listNewsletterSendRuns,
  listNewsletters,
  markNewsletterSent,
  recordNewsletterDraftSend,
  recordNewsletterSendRun,
  saveNewsletterDraft,
} from "@/lib/admin/newsletters";
import {
  createNewsletterTrackingRecord,
  markNewsletterTrackingSent,
} from "@/lib/admin/email-tracking";
import { listPolicyUpdateRecipients, type PolicyUpdateRecipient } from "@/lib/admin/roster";
import { findUserProfileByEmail, getUserProfileDisplayName } from "@/lib/admin/user-profile";
import { recordEmailEvent } from "@/lib/admin/email-log";
import { EMAIL_FROM, SITE_URL } from "@/lib/config";
import { buildNewsletterEmail } from "@/lib/newsletter-email";

export const dynamic = "force-dynamic";

type NewsletterSendRecipient = Omit<PolicyUpdateRecipient, "id"> & {
  id: string | null;
};

type NewsletterAudienceMode = "all_active_members" | "selected_members";

async function requireAdminOrForbidden() {
  try {
    const session = await requireAdminSession();
    return { session, response: null };
  } catch {
    return {
      session: null,
      response: NextResponse.json({ error: "Admin access required" }, { status: 403 }),
    };
  }
}

async function buildDraftRecipient(email: string): Promise<NewsletterSendRecipient> {
  const profile = await findUserProfileByEmail(email);
  return {
    id: profile?.id || null,
    email,
    name: profile ? getUserProfileDisplayName(profile) : null,
    firstName: profile?.firstName || null,
    lastName: profile?.lastName || null,
  };
}

function normalizeRecipientIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean),
    ),
  );
}

async function resolveNewsletterAudience(body: any) {
  const audienceMode: NewsletterAudienceMode =
    body?.audienceMode === "selected_members" ? "selected_members" : "all_active_members";
  const allRecipients = await listPolicyUpdateRecipients();

  if (audienceMode === "all_active_members") {
    return { audienceMode, recipients: allRecipients, activeRecipientCount: allRecipients.length };
  }

  const recipientIds = normalizeRecipientIds(body?.recipientIds);
  if (!recipientIds.length) {
    throw new Error("Select at least one active member recipient.");
  }

  const selectedIds = new Set(recipientIds);
  const recipients = allRecipients.filter((recipient) => selectedIds.has(recipient.id));
  if (recipients.length !== selectedIds.size) {
    throw new Error("Selected recipients must be active members with unsuppressed email addresses.");
  }

  return { audienceMode, recipients, activeRecipientCount: allRecipients.length };
}

export async function GET() {
  const { response } = await requireAdminOrForbidden();
  if (response) return response;

  const [newsletters, sendRuns, recipients] = await Promise.all([
    listNewsletters(),
    listNewsletterSendRuns(),
    listPolicyUpdateRecipients(),
  ]);
  const sendRunNewsletterIds = new Set(sendRuns.map((sendRun) => sendRun.newsletterId));
  const legacySendRuns = newsletters
    .filter((newsletter) => newsletter.status === "sent" && !sendRunNewsletterIds.has(newsletter.id))
    .map((newsletter) => ({
      id: `legacy-${newsletter.id}`,
      newsletterId: newsletter.id,
      subject: newsletter.subject,
      preheader: newsletter.preheader,
      body: newsletter.body,
      previewText: newsletter.previewText,
      audienceMode: "all_active_members" as const,
      sentAt: newsletter.sentAt || newsletter.updatedAt,
      sentBy: newsletter.sentBy,
      stats: {
        recipientCount: newsletter.stats.recipientCount,
        sentCount: newsletter.stats.sentCount,
        failedCount: newsletter.stats.failedCount,
        openCount: newsletter.stats.openCount,
        clickCount: newsletter.stats.clickCount,
        unsubscribeCount: newsletter.stats.unsubscribeCount,
      },
      failurePreview: newsletter.failurePreview,
    }));
  const allSendRuns = [...sendRuns, ...legacySendRuns].sort((a, b) => b.sentAt.localeCompare(a.sentAt));

  return NextResponse.json({
    newsletters,
    sendRuns: allSendRuns,
    recipientCount: recipients.length,
    recipients,
  });
}

export async function POST(request: NextRequest) {
  const { session, response } = await requireAdminOrForbidden();
  if (response) return response;

  let body: any = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const action = typeof body?.action === "string" ? body.action : "save";
  const adminUserId = (session?.user as any)?.id || null;

  if (action === "save") {
    try {
      const newsletter = await saveNewsletterDraft({
        id: typeof body?.id === "string" ? body.id : null,
        subject: typeof body?.subject === "string" ? body.subject : "",
        preheader: typeof body?.preheader === "string" ? body.preheader : "",
        body: typeof body?.body === "string" ? body.body : "",
        adminUserId,
      });
      return NextResponse.json({ ok: true, newsletter });
    } catch (err: any) {
      const message = typeof err?.message === "string" ? err.message : "Failed to save newsletter draft";
      return NextResponse.json({ error: message }, { status: message.includes("cannot be edited") ? 409 : 400 });
    }
  }

  if (action === "delete") {
    const newsletterId = typeof body?.id === "string" ? body.id.trim() : "";
    try {
      const result = await deleteNewsletterDraft(newsletterId);
      return NextResponse.json(result);
    } catch (err: any) {
      const message = typeof err?.message === "string" ? err.message : "Failed to delete newsletter draft";
      const status = message.includes("not found") ? 404 : message.includes("Only draft") ? 409 : 400;
      return NextResponse.json({ error: message }, { status });
    }
  }

  const transportConfig = buildEmailServerConfig();
  if (!transportConfig || !EMAIL_FROM) {
    return NextResponse.json({ error: "Email provider not configured" }, { status: 500 });
  }

  if (action === "sendDraft") {
    const draftRecipientEmail = normalizeEmail(body?.draftRecipientEmail);
    if (!draftRecipientEmail || !isValidEmail(draftRecipientEmail)) {
      return NextResponse.json({ error: "Enter a valid draft recipient email" }, { status: 400 });
    }

    try {
      const newsletter = await saveNewsletterDraft({
        id: typeof body?.id === "string" ? body.id : null,
        subject: typeof body?.subject === "string" ? body.subject : "",
        preheader: typeof body?.preheader === "string" ? body.preheader : "",
        body: typeof body?.body === "string" ? body.body : "",
        adminUserId,
      });
      const recipient = await buildDraftRecipient(draftRecipientEmail);
      const built = buildNewsletterEmail(
        newsletter,
        {
          email: recipient.email,
          name: recipient.name,
          firstName: recipient.firstName,
          lastName: recipient.lastName,
        },
        SITE_URL,
      );
      const transporter = nodemailer.createTransport(transportConfig);
      const sendResult = await transporter.sendMail({
        to: recipient.email,
        from: EMAIL_FROM,
        subject: `[Draft] ${built.subject}`,
        text: built.text,
        html: built.html,
      });

      await recordEmailEvent({
        userId: recipient.id,
        email: recipient.email,
        type: "newsletter_draft",
        subject: built.subject,
        status: "sent",
        providerMessageId: sendResult?.messageId ? String(sendResult.messageId) : null,
        metadata: {
          newsletterId: newsletter.id,
          draft: true,
          profileNameResolved: !!recipient.name,
        },
      });
      await recordNewsletterDraftSend(newsletter.id);

      return NextResponse.json({
        ok: true,
        draft: true,
        newsletter,
        recipientEmail: recipient.email,
        resolvedRecipientName: recipient.firstName || null,
      });
    } catch (err: any) {
      const message = typeof err?.message === "string" ? err.message : "Failed to send newsletter draft";
      await recordEmailEvent({
        userId: null,
        email: draftRecipientEmail,
        type: "newsletter_draft",
        subject: typeof body?.subject === "string" ? body.subject : null,
        status: "failed",
        error: message,
        metadata: {
          newsletterId: typeof body?.id === "string" ? body.id : null,
          draft: true,
        },
      }).catch(() => undefined);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  if (action === "send") {
    const newsletterId = typeof body?.id === "string" ? body.id.trim() : "";
    const confirmSend = body?.confirmSend === true;
    if (!confirmSend) {
      return NextResponse.json({ error: "confirmSend must be true before sending a newsletter" }, { status: 400 });
    }
    if (!newsletterId) {
      return NextResponse.json({ error: "Newsletter ID is required" }, { status: 400 });
    }

    const newsletter = await getNewsletter(newsletterId);
    if (!newsletter) {
      return NextResponse.json({ error: "Newsletter not found" }, { status: 404 });
    }
    if (newsletter.status === "sent") {
      return NextResponse.json({ error: "This newsletter has already been sent" }, { status: 409 });
    }

    let resolvedAudience: Awaited<ReturnType<typeof resolveNewsletterAudience>>;
    try {
      resolvedAudience = await resolveNewsletterAudience(body);
    } catch (err: any) {
      return NextResponse.json(
        { error: typeof err?.message === "string" ? err.message : "Invalid newsletter audience" },
        { status: 400 },
      );
    }

    const { audienceMode, recipients, activeRecipientCount } = resolvedAudience;
    if (!recipients.length) {
      return NextResponse.json({ error: "No active member recipients with unsuppressed email addresses" }, { status: 400 });
    }

    const transporter = nodemailer.createTransport(transportConfig);
    const failures: Array<{ email: string; error: string }> = [];
    const sendRunId = randomUUID();
    let sent = 0;

    for (const recipient of recipients) {
      const tracking = await createNewsletterTrackingRecord({
        newsletterId: newsletter.id,
        sendRunId,
        audienceMode,
        userId: recipient.id,
        email: recipient.email,
      });
      const built = buildNewsletterEmail(
        newsletter,
        {
          email: recipient.email,
          name: recipient.name,
          firstName: recipient.firstName,
          lastName: recipient.lastName,
        },
        SITE_URL,
        {
          trackingId: tracking.trackingId,
          trackLinks: true,
          includeOpenPixel: true,
          includeUnsubscribe: true,
        },
      );
      try {
        const sendResult = await transporter.sendMail({
          to: recipient.email,
          from: EMAIL_FROM,
          subject: built.subject,
          text: built.text,
          html: built.html,
        });
        await markNewsletterTrackingSent({
          trackingId: tracking.trackingId,
          providerMessageId: sendResult?.messageId ? String(sendResult.messageId) : null,
        });
        sent += 1;
        await recordEmailEvent({
          userId: recipient.id,
          email: recipient.email,
          type: "newsletter",
          subject: built.subject,
          status: "sent",
          providerMessageId: sendResult?.messageId ? String(sendResult.messageId) : null,
          metadata: {
            newsletterId: newsletter.id,
            trackingId: tracking.trackingId,
            audience: newsletter.audience,
            audienceMode,
            profileNameResolved: !!recipient.name,
          },
        });
      } catch (err: any) {
        const error = typeof err?.message === "string" ? err.message : "Failed to send newsletter";
        failures.push({ email: recipient.email, error });
        await recordEmailEvent({
          userId: recipient.id,
          email: recipient.email,
          type: "newsletter",
          subject: newsletter.subject,
          status: "failed",
          error,
          metadata: {
            newsletterId: newsletter.id,
            trackingId: tracking.trackingId,
            audience: newsletter.audience,
            audienceMode,
            profileNameResolved: !!recipient.name,
          },
        }).catch(() => undefined);
      }
    }

    const sendRun = await recordNewsletterSendRun({
      sendRunId,
      newsletterId: newsletter.id,
      newsletter,
      audienceMode,
      adminUserId,
      recipientCount: recipients.length,
      sentCount: sent,
      failedCount: failures.length,
      failurePreview: failures,
    });

    if (audienceMode === "all_active_members") {
      await markNewsletterSent({
        newsletterId: newsletter.id,
        adminUserId,
        recipientCount: recipients.length,
        sentCount: sent,
        failedCount: failures.length,
        failurePreview: failures,
      });
    }

    const sentNewsletter = await getNewsletter(newsletter.id);
    return NextResponse.json({
      ok: failures.length === 0,
      newsletter: sentNewsletter || newsletter,
      sendRun,
      audienceMode,
      activeRecipientCount,
      recipientCount: recipients.length,
      sent,
      failed: failures.length,
      failures: failures.slice(0, 10),
    });
  }

  return NextResponse.json({ error: "Unknown newsletter action" }, { status: 400 });
}
