import { NextRequest, NextResponse } from "next/server";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - nodemailer types not installed
import nodemailer from "nodemailer";
import { requireAdminSession } from "@/lib/admin/auth";
import { buildEmailServerConfig, isValidEmail, normalizeEmail } from "@/lib/admin/email-transport";
import { summarizePolicyUpdateEmailStats } from "@/lib/admin/email-log";
import { listPolicyUpdateRecipients, type PolicyUpdateRecipient } from "@/lib/admin/roster";
import { recordEmailEvent } from "@/lib/admin/email-log";
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

async function buildDraftRecipient(email: string): Promise<PolicyUpdateSendRecipient> {
  const profile = await findUserProfileByEmail(email);
  return {
    id: profile?.id || null,
    email,
    name: profile ? getUserProfileDisplayName(profile) : null,
  };
}

export async function GET() {
  const forbidden = await requireAdminOrForbidden();
  if (forbidden) return forbidden;

  const recipients = await listPolicyUpdateRecipients();
  const updates = getPolicyUpdateSummaries();
  const statsBySlug = await summarizePolicyUpdateEmailStats(updates.map((update) => update.slug));
  return NextResponse.json({
    updates,
    recipientCount: recipients.length,
    statsBySlug,
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
  const recipients: PolicyUpdateSendRecipient[] = draftMode
    ? [await buildDraftRecipient(draftRecipientEmail)]
    : await listPolicyUpdateRecipients();
  if (!recipients.length) {
    return NextResponse.json({ error: "No active member recipients with unsuppressed email addresses" }, { status: 400 });
  }

  const transporter = nodemailer.createTransport(transportConfig);
  const emailType = `policy_update_${update.category}${draftMode ? "_draft" : ""}`;
  const failures: Array<{ email: string; error: string }> = [];
  let sent = 0;

  for (const recipient of recipients) {
    const built = buildPolicyUpdateEmail(
      update,
      { email: recipient.email, name: recipient.name },
      SITE_URL,
    );
    try {
      const sendResult = await transporter.sendMail({
        to: recipient.email,
        from: EMAIL_FROM,
        subject: built.subject,
        text: built.text,
        html: built.html,
      });
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
          draft: draftMode,
          profileNameResolved: !!recipient.name,
        },
      }).catch(() => undefined);
    }
  }

  return NextResponse.json({
    ok: failures.length === 0,
    slug: update.slug,
    title: update.title,
    draft: draftMode,
    recipientEmail: draftRecipientEmail || null,
    resolvedRecipientName: draftMode ? recipients[0]?.name || null : null,
    recipientCount: recipients.length,
    sent,
    failed: failures.length,
    failures: failures.slice(0, 10),
  });
}
