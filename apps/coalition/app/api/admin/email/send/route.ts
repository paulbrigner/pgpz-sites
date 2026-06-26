import { NextRequest, NextResponse } from "next/server";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - nodemailer types not installed
import nodemailer from "nodemailer";
import { requireAdminSession } from "@/lib/admin/auth";
import { buildEmailServerConfig, normalizeEmail, stripHtml } from "@/lib/admin/email-transport";
import { getInvitationEmailTemplate } from "@/lib/admin/invitation-template";
import {
  createInvitationActivationLink,
  InvitationError,
  markInvitationEmailSent,
} from "@/lib/admin/invitations";
import { EMAIL_FROM, SITE_URL } from "@/lib/config";
import { documentClient, TABLE_NAME } from "@/lib/dynamodb";
import { recordEmailEvent } from "@/lib/admin/email-log";
import {
  buildCustomAdminEmail,
  buildInvitationEmail,
  buildWelcomeEmail,
} from "@/lib/system-email";
import { getUserDisplayName } from "@/lib/user-display-name";

export const dynamic = "force-dynamic";

type UserRecord = {
  id: string;
  name: string | null;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  membershipStatus: "active" | "invited" | "none";
  emailSuppressed: boolean | null;
  accountStatus: "active" | "deactivated";
  deactivatedAt: string | null;
};

type EmailType = "welcome" | "custom" | "invitation";

const coerceUser = (data: any): UserRecord | null => {
  if (!data?.id) return null;
  return {
    id: String(data.id),
    name: typeof data.name === "string" ? data.name : null,
    email: typeof data.email === "string" ? data.email : null,
    firstName: typeof data.firstName === "string" ? data.firstName : null,
    lastName: typeof data.lastName === "string" ? data.lastName : null,
    membershipStatus:
      data.membershipStatus === "active"
        ? "active"
        : data.membershipStatus === "invited"
          ? "invited"
          : "none",
    emailSuppressed: typeof data.emailSuppressed === "boolean" ? data.emailSuppressed : null,
    accountStatus: data.accountStatus === "deactivated" || !!data.deactivatedAt ? "deactivated" : "active",
    deactivatedAt: typeof data.deactivatedAt === "string" ? data.deactivatedAt : null,
  };
};

async function findUserByEmail(email: string): Promise<UserRecord | null> {
  const res = await documentClient.query({
    TableName: TABLE_NAME,
    IndexName: "GSI1",
    KeyConditionExpression: "#gsi1pk = :pk AND #gsi1sk = :sk",
    ExpressionAttributeNames: { "#gsi1pk": "GSI1PK", "#gsi1sk": "GSI1SK" },
    ExpressionAttributeValues: { ":pk": `USER#${email}`, ":sk": `USER#${email}` },
    Limit: 1,
  });
  return coerceUser(res.Items?.[0]);
}

async function findUserById(id: string): Promise<UserRecord | null> {
  const res = await documentClient.get({
    TableName: TABLE_NAME,
    Key: { pk: `USER#${id}`, sk: `USER#${id}` },
  });
  return coerceUser(res.Item);
}

const emailTypeFromBody = (value: unknown): EmailType => {
  if (value === "custom" || value === "invitation") return value;
  return "welcome";
};

export async function POST(request: NextRequest) {
  let adminUserId: string | null = null;
  try {
    const session = await requireAdminSession();
    adminUserId = (session.user as any)?.id || null;
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
    const type = emailTypeFromBody(body?.type);
    const normalizedEmail = normalizeEmail(body?.email);
    const userId = typeof body?.userId === "string" ? body.userId.trim() : "";

    let user: UserRecord | null = null;
    if (userId) user = await findUserById(userId);
    if (!user && normalizedEmail) user = await findUserByEmail(normalizedEmail);

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

    let built: { subject: string; html?: string; text: string };
    let markWelcome = false;

    if (type === "invitation") {
      if (!user?.id) {
        return NextResponse.json({ error: "Invitation target member is required" }, { status: 400 });
      }
      if (user.membershipStatus === "active") {
        return NextResponse.json({ error: "This member is already active" }, { status: 409 });
      }
      if (user.membershipStatus !== "invited") {
        return NextResponse.json(
          { error: "Invitation emails are only for admin-added invitees. Approve signed-in prospects instead." },
          { status: 409 },
        );
      }
      const invitation = await createInvitationActivationLink({ userId: user.id, adminUserId });
      const template = await getInvitationEmailTemplate();
      built = buildInvitationEmail({
        recipientName: getUserDisplayName(user),
        recipientFirstName: user.firstName,
        recipientLastName: user.lastName,
        activationUrl: invitation.activationUrl,
        template,
      });
    } else if (type === "welcome") {
      if (user?.membershipStatus !== "active") {
        return NextResponse.json({ error: "Welcome emails can only be sent to active members" }, { status: 409 });
      }
      built = buildWelcomeEmail({
        recipientName: getUserDisplayName(user),
        recipientFirstName: user.firstName,
        recipientLastName: user.lastName,
        portalUrl: SITE_URL,
      });
      markWelcome = true;
    } else {
      const subject = typeof body?.subject === "string" ? body.subject.trim() : "";
      const html = typeof body?.html === "string" ? body.html.trim() : "";
      const text = typeof body?.text === "string" ? body.text.trim() : stripHtml(html || "");
      if (!subject || (!html && !text)) {
        return NextResponse.json({ error: "subject and html or text are required for custom emails" }, { status: 400 });
      }
      built = buildCustomAdminEmail({ subject, html, text });
    }

    const transporter = nodemailer.createTransport(transportConfig);
    const sendResult = await transporter.sendMail({
      to,
      from: EMAIL_FROM,
      subject: built.subject,
      text: built.text || stripHtml(built.html || ""),
      html: built.html || undefined,
    });

    const sentAt = new Date().toISOString();
    if (type === "invitation" && user?.id) {
      await markInvitationEmailSent({ userId: user.id, adminUserId });
    }
    await recordEmailEvent({
      userId: user?.id || null,
      email: to,
      type,
      subject: built.subject,
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
    if (err instanceof InvitationError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    try {
      const userId = typeof body?.userId === "string" ? body.userId : null;
      const email = typeof body?.email === "string" ? body.email : null;
      const type = emailTypeFromBody(body?.type);
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
