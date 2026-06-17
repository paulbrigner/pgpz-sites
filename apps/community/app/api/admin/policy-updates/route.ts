import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - nodemailer types not installed
import nodemailer from "nodemailer";
import { requireAdminSession } from "@/lib/admin/auth";
import { buildEmailServerConfig, isValidEmail, normalizeEmail } from "@/lib/admin/email-transport";
import {
  listPolicyUpdateSendHistory,
  recordEmailEvent,
  recordPolicyUpdateSendRun,
  summarizePolicyUpdateEmailStats,
} from "@/lib/admin/email-log";
import {
  createNewsletterTrackingRecord,
  markNewsletterTrackingSent,
} from "@/lib/admin/email-tracking";
import { listPolicyUpdateRecipients, type PolicyUpdateRecipient } from "@/lib/admin/roster";
import {
  findUserProfileByEmail,
  getUserProfileDisplayName,
} from "@/lib/admin/user-profile";
import { EMAIL_FROM, SITE_URL } from "@/lib/config";
import { buildPolicyUpdateEmail } from "@/lib/policy-update-email";
import { getPolicyUpdate, getPolicyUpdateSummaries } from "@/lib/policy-updates";

export const dynamic = "force-dynamic";

async function requireAdminOrForbidden() {
  try {
    await requireAdminSession();
    return null;
  } catch {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
}

type PolicyUpdateSendRecipient = Omit<PolicyUpdateRecipient, "id"> & {
  id: string | null;
};

type PolicyUpdateAudienceMode = "all_active_members" | "selected_members";

async function buildDraftRecipient(email: string): Promise<PolicyUpdateSendRecipient> {
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

async function resolvePolicyUpdateAudience(body: any) {
  const audienceMode: PolicyUpdateAudienceMode =
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
  const forbidden = await requireAdminOrForbidden();
  if (forbidden) return forbidden;

  const recipients = await listPolicyUpdateRecipients();
  const updates = getPolicyUpdateSummaries();
  const [statsBySlug, sendHistory] = await Promise.all([
    summarizePolicyUpdateEmailStats(updates.map((update) => update.slug)),
    listPolicyUpdateSendHistory(updates),
  ]);
  return NextResponse.json({
    updates,
    recipientCount: recipients.length,
    recipients,
    statsBySlug,
    sendHistory,
  });
}
export async function POST(request: NextRequest) {
  const forbidden = await requireAdminOrForbidden();
  if (forbidden) return forbidden;

  const transportConfig = buildEmailServerConfig();
  if (!transportConfig || !EMAIL_FROM) {
    return NextResponse.json({ error: "Email provider not configured" }, { status: 500 });
  }

  let body: any = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const slug = typeof body?.slug === "string" ? body.slug.trim() : "";
  const draftRecipientEmail = normalizeEmail(body?.draftRecipientEmail || body?.testRecipientEmail);
  const confirmSend = body?.confirmSend === true;
  if (!confirmSend) {
    return NextResponse.json({ error: "confirmSend must be true before sending member email" }, { status: 400 });
  }
  if (draftRecipientEmail && !isValidEmail(draftRecipientEmail)) {
    return NextResponse.json({ error: "Enter a valid draft recipient email" }, { status: 400 });
  }

  const update = getPolicyUpdate(slug);
  if (!update) {
    return NextResponse.json({ error: "Unknown policy update" }, { status: 404 });
  }

  const draftMode = !!draftRecipientEmail;
  let audienceMode: PolicyUpdateAudienceMode = "all_active_members";
  let activeRecipientCount = 0;
  let recipients: PolicyUpdateSendRecipient[];
  if (draftMode) {
    recipients = [await buildDraftRecipient(draftRecipientEmail)];
  } else {
    try {
      const resolvedAudience = await resolvePolicyUpdateAudience(body);
      audienceMode = resolvedAudience.audienceMode;
      activeRecipientCount = resolvedAudience.activeRecipientCount;
      recipients = resolvedAudience.recipients;
    } catch (err: any) {
      return NextResponse.json(
        { error: typeof err?.message === "string" ? err.message : "Invalid policy update audience" },
        { status: 400 },
      );
    }
  }
  if (!recipients.length) {
    return NextResponse.json({ error: "No active member recipients with unsuppressed email addresses" }, { status: 400 });
  }

  const transporter = nodemailer.createTransport(transportConfig);
  const emailType = `policy_update_${update.category}${draftMode ? "_draft" : ""}`;
  const policyUpdateSendRunId = draftMode ? null : randomUUID();
  const failures: Array<{ email: string; error: string }> = [];
  let sent = 0;

  for (const recipient of recipients) {
    const tracking = !draftMode
      ? await createNewsletterTrackingRecord({
          newsletterId: update.slug,
          sendRunId: policyUpdateSendRunId,
          messageType: "policy_update",
          audienceMode,
          userId: recipient.id,
          email: recipient.email,
        })
      : null;
    const built = buildPolicyUpdateEmail(
      update,
      {
        email: recipient.email,
        name: recipient.name,
        firstName: recipient.firstName,
        lastName: recipient.lastName,
      },
      SITE_URL,
      tracking
        ? {
            trackingId: tracking.trackingId,
            trackLinks: true,
            includeOpenPixel: true,
            includeUnsubscribe: true,
          }
        : undefined,
    );
    try {
      const sendResult = await transporter.sendMail({
        to: recipient.email,
        from: EMAIL_FROM,
        subject: built.subject,
        text: built.text,
        html: built.html,
      });
      if (tracking) {
        await markNewsletterTrackingSent({
          trackingId: tracking.trackingId,
          providerMessageId: sendResult?.messageId ? String(sendResult.messageId) : null,
        });
      }
      sent += 1;
      await recordEmailEvent({
        userId: recipient.id,
        email: recipient.email,
        type: emailType,
        subject: built.subject,
        status: "sent",
        providerMessageId: sendResult?.messageId ? String(sendResult.messageId) : null,
        metadata: {
          updateSlug: update.slug,
          category: update.category,
          policyUpdateSendRunId,
          trackingId: tracking?.trackingId || null,
          audienceMode: draftMode ? "draft" : audienceMode,
          portalUrl: built.portalUrl,
          draft: draftMode,
          profileNameResolved: !!recipient.name,
        },
      });
    } catch (err: any) {
      const error = typeof err?.message === "string" ? err.message : "Failed to send policy update";
      failures.push({ email: recipient.email, error });
      await recordEmailEvent({
        userId: recipient.id,
        email: recipient.email,
        type: emailType,
        subject: update.emailSubject,
        status: "failed",
        error,
        metadata: {
          updateSlug: update.slug,
          category: update.category,
          policyUpdateSendRunId,
          trackingId: tracking?.trackingId || null,
          audienceMode: draftMode ? "draft" : audienceMode,
          draft: draftMode,
          profileNameResolved: !!recipient.name,
        },
      }).catch(() => undefined);
    }
  }

  if (!draftMode && policyUpdateSendRunId) {
    await recordPolicyUpdateSendRun({
      sendRunId: policyUpdateSendRunId,
      update,
      recipientCount: recipients.length,
      sentCount: sent,
      failedCount: failures.length,
      failurePreview: failures,
      audienceMode,
    });
  }

  return NextResponse.json({
    ok: failures.length === 0,
    slug: update.slug,
    sendRunId: policyUpdateSendRunId,
    title: update.title,
    draft: draftMode,
    recipientEmail: draftRecipientEmail || null,
    resolvedRecipientName: draftMode ? recipients[0]?.firstName || null : null,
    audienceMode: draftMode ? "draft" : audienceMode,
    activeRecipientCount,
    recipientCount: recipients.length,
    sent,
    failed: failures.length,
    failures: failures.slice(0, 10),
  });
}
