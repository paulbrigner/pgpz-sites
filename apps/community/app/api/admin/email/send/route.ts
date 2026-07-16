import { NextRequest, NextResponse } from "next/server";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - nodemailer types not installed
import nodemailer from "nodemailer";
import { requireAdminSession } from "@/lib/admin/auth";
import { EMAIL_FROM } from "@/lib/config";
import { recordEmailEvent } from "@/lib/admin/email-log";
import { buildEmailServerConfig } from "@/lib/admin/email-transport";
import {
  findUserProfileByEmail,
  findUserProfileById,
  getUserProfileDisplayName,
  type UserProfile,
} from "@/lib/admin/user-profile";
import { buildCustomAdminEmail, buildWelcomeEmail } from "@/lib/system-email";
import {
  canSendWelcomeEmail,
  WELCOME_EMAIL_ACTIVE_MEMBERS_ONLY_ERROR,
} from "@/lib/admin/welcome-email";

export const dynamic = "force-dynamic";

type EmailType = "welcome" | "custom";

export async function POST(request: NextRequest) {
  try {
    await requireAdminSession();
  } catch {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const transportConfig = buildEmailServerConfig();
  if (!transportConfig || !EMAIL_FROM) {
    return NextResponse.json({ error: "Email provider not configured" }, { status: 500 });
  }

  let body: any = null;
  try {
    body = await request.json();
    const type: EmailType = body?.type === "custom" ? "custom" : "welcome";
    const normalizedEmail = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const userId = typeof body?.userId === "string" ? body.userId.trim() : "";

    let user: UserProfile | null = null;
    if (userId) user = await findUserProfileById(userId);
    if (!user && normalizedEmail) user = await findUserProfileByEmail(normalizedEmail);

    const to = normalizedEmail || user?.email || "";
    if (!to) {
      return NextResponse.json({ error: "Target email is required" }, { status: 400 });
    }
    if (user?.accountStatus === "deactivated" || user?.deactivatedAt) {
      return NextResponse.json({ error: "This user is deactivated." }, { status: 409 });
    }
    if (user?.emailSuppressed) {
      return NextResponse.json({ error: "Email is turned off for this user." }, { status: 409 });
    }

    let subject: string | undefined;
    let html: string | undefined;
    let text: string | undefined;
    let markWelcome = false;

    if (type === "welcome") {
      if (!canSendWelcomeEmail(user)) {
        return NextResponse.json({ error: WELCOME_EMAIL_ACTIVE_MEMBERS_ONLY_ERROR }, { status: 409 });
      }
      const customSubject = typeof body?.subject === "string" ? body.subject.trim() : "";
      const customHtml = typeof body?.html === "string" ? body.html.trim() : "";
      const customText = typeof body?.text === "string" ? body.text.trim() : "";
      if (customSubject || customHtml || customText) {
        const built = buildCustomAdminEmail({
          subject: customSubject || "Welcome to PGPZ Community",
          html: customHtml || undefined,
          text: customText || undefined,
        });
        subject = built.subject;
        html = built.html;
        text = built.text;
      } else {
        const built = buildWelcomeEmail({
          recipientName: user ? getUserProfileDisplayName(user) : null,
          recipientFirstName: user?.firstName || null,
          recipientLastName: user?.lastName || null,
          fallbackEmail: to,
        });
        subject = built.subject;
        html = built.html;
        text = built.text;
      }
      markWelcome = true;
    } else {
      subject = typeof body?.subject === "string" ? body.subject.trim() : "";
      const customHtml = typeof body?.html === "string" ? body.html.trim() : "";
      const customText = typeof body?.text === "string" ? body.text.trim() : "";
      if (!subject || (!customHtml && !customText)) {
        return NextResponse.json({ error: "subject and html or text are required for custom emails" }, { status: 400 });
      }
      const built = buildCustomAdminEmail({
        subject,
        html: customHtml || undefined,
        text: customText || undefined,
      });
      subject = built.subject;
      html = built.html;
      text = built.text;
    }

    const transporter = nodemailer.createTransport(transportConfig);
    const sendResult = await transporter.sendMail({
      to,
      from: EMAIL_FROM,
      subject,
      text,
      html: html || undefined,
    });

    const sentAt = new Date().toISOString();
    await recordEmailEvent({
      userId: user?.id || null,
      email: to,
      type,
      subject,
      status: "sent",
      providerMessageId: sendResult?.messageId ? String(sendResult.messageId) : null,
      markWelcome,
    });

    return NextResponse.json({
      ok: true,
      userId: user?.id || null,
      email: to,
      emailType: type,
      markWelcome,
      sentAt,
    });
  } catch (err: any) {
    const errorMessage = typeof err?.message === "string" ? err.message : "Failed to send email";
    try {
      const userId = typeof body?.userId === "string" ? body.userId : null;
      const email = typeof body?.email === "string" ? body.email : null;
      const type: EmailType = body?.type === "custom" ? "custom" : "welcome";
      const subject = typeof body?.subject === "string" ? body.subject : null;
      await recordEmailEvent({
        userId,
        email,
        type,
        subject,
        status: "failed",
        error: errorMessage,
      });
    } catch {
      // ignore secondary logging errors
    }
    console.error("Admin email send error:", err);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
