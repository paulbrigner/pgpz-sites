import { NextRequest, NextResponse } from "next/server";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - nodemailer types not installed
import nodemailer from "nodemailer";
import { requireAdminSession } from "@/lib/admin/auth";
import { listPolicyUpdateRecipients } from "@/lib/admin/roster";
import { recordEmailEvent } from "@/lib/admin/email-log";
import {
  EMAIL_FROM,
  EMAIL_SERVER,
  EMAIL_SERVER_HOST,
  EMAIL_SERVER_PASSWORD,
  EMAIL_SERVER_PORT,
  EMAIL_SERVER_SECURE,
  EMAIL_SERVER_USER,
  SITE_URL,
} from "@/lib/config";
import { buildPolicyUpdateEmail } from "@/lib/policy-update-email";
import { getPolicyUpdate, getPolicyUpdateSummaries } from "@/lib/policy-updates";

export const dynamic = "force-dynamic";

const buildEmailServerConfig = () => {
  if (EMAIL_SERVER_HOST) {
    return {
      host: EMAIL_SERVER_HOST,
      port: EMAIL_SERVER_PORT ? Number(EMAIL_SERVER_PORT) : 587,
      secure: EMAIL_SERVER_SECURE === "true",
      auth:
        EMAIL_SERVER_USER && EMAIL_SERVER_PASSWORD
          ? { user: EMAIL_SERVER_USER, pass: EMAIL_SERVER_PASSWORD }
          : undefined,
    } as any;
  }
  if (EMAIL_SERVER && EMAIL_SERVER.includes("://")) return EMAIL_SERVER as any;
  if (EMAIL_SERVER) {
    return {
      host: EMAIL_SERVER,
      port: EMAIL_SERVER_PORT ? Number(EMAIL_SERVER_PORT) : 587,
      secure: EMAIL_SERVER_SECURE === "true",
      auth:
        EMAIL_SERVER_USER && EMAIL_SERVER_PASSWORD
          ? { user: EMAIL_SERVER_USER, pass: EMAIL_SERVER_PASSWORD }
          : undefined,
    } as any;
  }
  return null;
};

async function requireAdminOrForbidden() {
  try {
    await requireAdminSession();
    return null;
  } catch {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
}

export async function GET() {
  const forbidden = await requireAdminOrForbidden();
  if (forbidden) return forbidden;

  const recipients = await listPolicyUpdateRecipients();
  return NextResponse.json({
    updates: getPolicyUpdateSummaries(),
    recipientCount: recipients.length,
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
  const confirmSend = body?.confirmSend === true;
  if (!confirmSend) {
    return NextResponse.json({ error: "confirmSend must be true before sending member email" }, { status: 400 });
  }

  const update = getPolicyUpdate(slug);
  if (!update) {
    return NextResponse.json({ error: "Unknown policy update" }, { status: 404 });
  }

  const recipients = await listPolicyUpdateRecipients();
  if (!recipients.length) {
    return NextResponse.json({ error: "No active member recipients with unsuppressed email addresses" }, { status: 400 });
  }

  const transporter = nodemailer.createTransport(transportConfig);
  const emailType = `policy_update_${update.category}`;
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
        },
      }).catch(() => undefined);
    }
  }

  return NextResponse.json({
    ok: failures.length === 0,
    slug: update.slug,
    title: update.title,
    recipientCount: recipients.length,
    sent,
    failed: failures.length,
    failures: failures.slice(0, 10),
  });
}
