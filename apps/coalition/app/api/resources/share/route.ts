import { NextRequest, NextResponse } from "next/server";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - nodemailer types not installed
import nodemailer from "nodemailer";
import {
  EMAIL_FROM,
  EMAIL_SERVER,
  EMAIL_SERVER_HOST,
  EMAIL_SERVER_PASSWORD,
  EMAIL_SERVER_PORT,
  EMAIL_SERVER_SECURE,
  EMAIL_SERVER_USER,
} from "@/lib/config";
import { resolveAppSession } from "@/lib/app-session";
import { recordEmailEvent } from "@/lib/admin/email-log";
import { getUserMembershipStatus } from "@/lib/membership-status";

export const dynamic = "force-dynamic";

const RESOURCE_INBOX = "admin@pgpz.org";

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

const sanitizeLine = (value: unknown, maxLength: number) =>
  typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maxLength) : "";

const sanitizeText = (value: unknown, maxLength: number) =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : "";

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const textToHtml = (value: string) => escapeHtml(value).replace(/\n/g, "<br/>");

export async function POST(request: NextRequest) {
  const session = await resolveAppSession(request.headers);
  const userId = session?.user?.id;
  const userEmail = typeof session?.user?.email === "string" ? session.user.email : "";

  if (!userId) {
    return NextResponse.json({ error: "Sign in before sharing a resource." }, { status: 401 });
  }

  const membership = await getUserMembershipStatus(userId);
  if (membership.membershipStatus !== "active") {
    return NextResponse.json({ error: "Active coalition membership is required." }, { status: 403 });
  }

  const transportConfig = buildEmailServerConfig();
  if (!transportConfig || !EMAIL_FROM) {
    return NextResponse.json({ error: "Email provider not configured." }, { status: 500 });
  }

  let body: any = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const title = sanitizeLine(body?.title, 140);
  const url = sanitizeLine(body?.url, 300);
  const details = sanitizeText(body?.details, 4000);

  if (!title || !details) {
    return NextResponse.json({ error: "Resource title and notes are required." }, { status: 400 });
  }

  if (url) {
    try {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        return NextResponse.json({ error: "Resource link must be an http or https URL." }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: "Resource link must be a valid URL." }, { status: 400 });
    }
  }

  const firstName = sanitizeLine(session?.user?.firstName, 80);
  const lastName = sanitizeLine(session?.user?.lastName, 80);
  const displayName =
    [firstName, lastName].filter(Boolean).join(" ") ||
    sanitizeLine(session?.user?.name, 120) ||
    userEmail ||
    "Coalition member";
  const subject = `PGPZ Coalition resource submission: ${title}`;
  const submittedAt = new Date().toISOString();
  const text = [
    "A PGPZ Coalition member submitted a resource from coalition.pgpz.org.",
    "",
    `Submitted by: ${displayName}`,
    `Email: ${userEmail || "Not available"}`,
    `Submitted at: ${submittedAt}`,
    "",
    `Resource: ${title}`,
    url ? `Link: ${url}` : "Link: Not provided",
    "",
    "Notes:",
    details,
  ].join("\n");
  const html = `
    <p>A PGPZ Coalition member submitted a resource from coalition.pgpz.org.</p>
    <p>
      <strong>Submitted by:</strong> ${escapeHtml(displayName)}<br/>
      <strong>Email:</strong> ${escapeHtml(userEmail || "Not available")}<br/>
      <strong>Submitted at:</strong> ${escapeHtml(submittedAt)}
    </p>
    <p>
      <strong>Resource:</strong> ${escapeHtml(title)}<br/>
      <strong>Link:</strong> ${url ? `<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>` : "Not provided"}
    </p>
    <p><strong>Notes:</strong><br/>${textToHtml(details)}</p>
  `;

  try {
    const transporter = nodemailer.createTransport(transportConfig);
    const sendResult = await transporter.sendMail({
      to: RESOURCE_INBOX,
      from: EMAIL_FROM,
      replyTo: userEmail || undefined,
      subject,
      text,
      html,
    });

    await recordEmailEvent({
      userId,
      email: RESOURCE_INBOX,
      type: "resource-submission",
      subject,
      status: "sent",
      providerMessageId: sendResult?.messageId ? String(sendResult.messageId) : null,
      metadata: { resourceTitle: title, resourceUrl: url || null, submitterEmail: userEmail || null },
    });

    return NextResponse.json({ ok: true, sentAt: submittedAt });
  } catch (err: any) {
    const errorMessage = typeof err?.message === "string" ? err.message : "Failed to send resource submission.";
    try {
      await recordEmailEvent({
        userId,
        email: RESOURCE_INBOX,
        type: "resource-submission",
        subject,
        status: "failed",
        error: errorMessage,
        metadata: { resourceTitle: title, resourceUrl: url || null, submitterEmail: userEmail || null },
      });
    } catch {
      // Ignore secondary logging errors.
    }
    console.error("Resource submission email error:", err);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
