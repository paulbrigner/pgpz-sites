import { NextRequest, NextResponse } from "next/server";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - nodemailer types not installed
import nodemailer from "nodemailer";
import { requireAdminSession } from "@/lib/admin/auth";
import {
  EMAIL_FROM,
  EMAIL_SERVER,
  EMAIL_SERVER_HOST,
  EMAIL_SERVER_PASSWORD,
  EMAIL_SERVER_PORT,
  EMAIL_SERVER_SECURE,
  EMAIL_SERVER_USER,
} from "@/lib/config";
import { recordEmailEvent } from "@/lib/admin/email-log";
import {
  findUserProfileByEmail,
  findUserProfileById,
  getUserProfileDisplayName,
  type UserProfile,
} from "@/lib/admin/user-profile";

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

const stripHtml = (value: string) => value.replace(/<[^>]+>/g, " ");

function buildWelcomeEmail(user: UserProfile | null, to: string) {
  const name = (user && getUserProfileDisplayName(user)) || to;
  const subject = "Welcome to PGPZ Community";
  const html = `
    <p>Hi ${name || "there"},</p>
    <p>Welcome to the PGPZ Community. Your membership is active and you can sign in any time to access community resources.</p>
    <p>If you have questions, reply to this email and we will help.</p>
    <p>Thanks,<br/>PGPZ Community Team</p>
  `;
  const text = stripHtml(html);
  return { subject, html, text };
}

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

    let subject: string | undefined;
    let html: string | undefined;
    let text: string | undefined;
    let markWelcome = false;

    if (type === "welcome") {
      const customSubject = typeof body?.subject === "string" ? body.subject.trim() : "";
      const customHtml = typeof body?.html === "string" ? body.html.trim() : "";
      const customText = typeof body?.text === "string" ? body.text.trim() : "";
      if (customSubject || customHtml || customText) {
        subject = customSubject || "Welcome to PGPZ Community";
        html = customHtml || undefined;
        text = customText || (html ? stripHtml(html) : undefined);
      } else {
        const built = buildWelcomeEmail(user, to);
        subject = built.subject;
        html = built.html;
        text = built.text;
      }
      markWelcome = true;
    } else {
      subject = typeof body?.subject === "string" ? body.subject.trim() : "";
      html = typeof body?.html === "string" ? body.html.trim() : "";
      text = typeof body?.text === "string" ? body.text.trim() : stripHtml(html || "");
      if (!subject || (!html && !text)) {
        return NextResponse.json({ error: "subject and html or text are required for custom emails" }, { status: 400 });
      }
    }

    const transporter = nodemailer.createTransport(transportConfig);
    const sendResult = await transporter.sendMail({
      to,
      from: EMAIL_FROM,
      subject,
      text: text || stripHtml(html || ""),
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
