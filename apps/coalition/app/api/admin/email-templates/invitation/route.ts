import { NextRequest, NextResponse } from "next/server";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - nodemailer types not installed
import nodemailer from "nodemailer";
import { AdminAccessError, requireAdminSession } from "@/lib/admin/auth";
import { recordEmailEvent } from "@/lib/admin/email-log";
import { buildEmailServerConfig, isValidEmail, normalizeEmail } from "@/lib/admin/email-transport";
import {
  getInvitationEmailTemplate,
  InvitationTemplateError,
  saveInvitationEmailTemplate,
  validateInvitationEmailTemplate,
} from "@/lib/admin/invitation-template";
import { findUserProfileByEmail, getUserProfileDisplayName } from "@/lib/admin/user-profile";
import { EMAIL_FROM, SITE_URL } from "@/lib/config";
import { buildInvitationEmail } from "@/lib/system-email";

export const dynamic = "force-dynamic";

const optionalText = (value: unknown) =>
  typeof value === "string" && value.trim().length ? value.trim() : null;

const draftActivationUrl = () => {
  const base = SITE_URL.replace(/\/+$/, "");
  return `${base}/api/invitations/activate?token=draft-preview-token`;
};

async function buildDraftRecipient(email: string, body: any) {
  const profile = await findUserProfileByEmail(email);
  const firstName = optionalText(body?.recipientFirstName) || profile?.firstName || "Preview";
  const lastName = optionalText(body?.recipientLastName) || profile?.lastName || "Member";
  const name =
    optionalText(body?.recipientName) ||
    (profile ? getUserProfileDisplayName(profile) : null) ||
    [firstName, lastName].filter(Boolean).join(" ");

  return {
    id: profile?.id || null,
    email,
    name,
    firstName,
    lastName,
    profileNameResolved: !!profile,
  };
}

export async function GET() {
  try {
    await requireAdminSession();
    const template = await getInvitationEmailTemplate();
    return NextResponse.json(template);
  } catch (err) {
    if (err instanceof AdminAccessError) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }
    console.error("Failed to load invitation email template", err);
    return NextResponse.json({ error: "Failed to load invitation email template" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  let adminUserId: string | null = null;
  try {
    const session = await requireAdminSession();
    adminUserId = (session.user as any)?.id || null;
  } catch (err) {
    if (err instanceof AdminAccessError) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }
    throw err;
  }

  try {
    const body = await request.json().catch(() => ({}));
    const template = await saveInvitationEmailTemplate({
      subject: typeof body?.subject === "string" ? body.subject : "",
      body: typeof body?.body === "string" ? body.body : "",
      adminUserId,
    });
    return NextResponse.json(template);
  } catch (err) {
    if (err instanceof InvitationTemplateError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Failed to save invitation email template", err);
    return NextResponse.json({ error: "Failed to save invitation email template" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let adminUserId: string | null = null;
  try {
    const session = await requireAdminSession();
    adminUserId = (session.user as any)?.id || null;
  } catch (err) {
    if (err instanceof AdminAccessError) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }
    throw err;
  }

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

  const draftRecipientEmail = normalizeEmail(body?.draftRecipientEmail || body?.email || body?.testRecipientEmail);
  if (!draftRecipientEmail || !isValidEmail(draftRecipientEmail)) {
    return NextResponse.json({ error: "Enter a valid draft recipient email" }, { status: 400 });
  }

  let template: { subject: string; body: string };
  try {
    template = validateInvitationEmailTemplate({
      subject: typeof body?.subject === "string" ? body.subject : "",
      body: typeof body?.body === "string" ? body.body : "",
      adminUserId,
    });
  } catch (err) {
    if (err instanceof InvitationTemplateError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  try {
    const recipient = await buildDraftRecipient(draftRecipientEmail, body);
    const built = buildInvitationEmail({
      recipientName: recipient.name,
      recipientFirstName: recipient.firstName,
      recipientLastName: recipient.lastName,
      activationUrl: draftActivationUrl(),
      template,
    });

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
      type: "invitation_template_draft",
      subject: built.subject,
      status: "sent",
      providerMessageId: sendResult?.messageId ? String(sendResult.messageId) : null,
      metadata: {
        draft: true,
        templatePreview: true,
        profileNameResolved: recipient.profileNameResolved,
      },
    });

    return NextResponse.json({
      ok: true,
      draft: true,
      recipientEmail: recipient.email,
      resolvedRecipientName: recipient.firstName || null,
      subject: built.subject,
    });
  } catch (err: any) {
    const message = typeof err?.message === "string" ? err.message : "Failed to send invitation template draft";
    await recordEmailEvent({
      userId: null,
      email: draftRecipientEmail,
      type: "invitation_template_draft",
      subject: template.subject,
      status: "failed",
      error: message,
      metadata: {
        draft: true,
        templatePreview: true,
      },
    }).catch(() => undefined);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
