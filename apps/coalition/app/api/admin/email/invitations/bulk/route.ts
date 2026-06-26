import { NextRequest, NextResponse } from "next/server";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - nodemailer types not installed
import nodemailer from "nodemailer";
import { requireAdminSession } from "@/lib/admin/auth";
import { buildEmailServerConfig } from "@/lib/admin/email-transport";
import { recordEmailEvent } from "@/lib/admin/email-log";
import { getInvitationEmailTemplate } from "@/lib/admin/invitation-template";
import {
  createInvitationActivationLink,
  markInvitationEmailSent,
} from "@/lib/admin/invitations";
import { buildAdminRoster, type AdminMember } from "@/lib/admin/roster";
import { EMAIL_FROM } from "@/lib/config";
import { buildInvitationEmail } from "@/lib/system-email";
import { getUserDisplayName } from "@/lib/user-display-name";

export const dynamic = "force-dynamic";

const isOutstandingInviteableMember = (member: AdminMember) =>
  member.membershipStatus === "invited" &&
  !!member.email &&
  !member.emailSuppressed &&
  !member.invitationEmailSentAt &&
  member.manualApprovalStatus !== "pending";

export async function POST(request: NextRequest) {
  let adminUserId: string | null = null;
  try {
    const session = await requireAdminSession();
    adminUserId = (session.user as any)?.id || null;
  } catch {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  if (body?.confirmSend !== true) {
    return NextResponse.json({ error: "confirmSend must be true before bulk sending invitations" }, { status: 400 });
  }

  const transportConfig = buildEmailServerConfig();
  if (!transportConfig || !EMAIL_FROM) {
    return NextResponse.json({ error: "Email provider not configured" }, { status: 500 });
  }

  const roster = await buildAdminRoster({ statusFilter: "all" });
  const recipients = roster.members.filter(isOutstandingInviteableMember);
  if (!recipients.length) {
    return NextResponse.json({
      ok: true,
      sent: 0,
      failed: 0,
      recipientCount: 0,
      failures: [],
      skipped: roster.members.length,
    });
  }

  const transporter = nodemailer.createTransport(transportConfig);
  const template = await getInvitationEmailTemplate();
  const failures: Array<{ userId: string; email: string | null; error: string }> = [];
  let sent = 0;

  for (const member of recipients) {
    const email = member.email || null;
    try {
      const invitation = await createInvitationActivationLink({ userId: member.id, adminUserId });
      const built = buildInvitationEmail({
        recipientName: getUserDisplayName(member),
        recipientFirstName: member.firstName,
        recipientLastName: member.lastName,
        activationUrl: invitation.activationUrl,
        template,
      });
      const sendResult = await transporter.sendMail({
        to: email || "",
        from: EMAIL_FROM,
        subject: built.subject,
        text: built.text,
        html: built.html,
      });

      await markInvitationEmailSent({ userId: member.id, adminUserId });
      sent += 1;
      await recordEmailEvent({
        userId: member.id,
        email,
        type: "invitation",
        subject: built.subject,
        status: "sent",
        providerMessageId: sendResult?.messageId ? String(sendResult.messageId) : null,
        metadata: {
          bulkInvite: true,
        },
      });
    } catch (err: any) {
      const error = typeof err?.message === "string" ? err.message : "Failed to send invitation";
      failures.push({ userId: member.id, email, error });
      await recordEmailEvent({
        userId: member.id,
        email,
        type: "invitation",
        subject: template.subject,
        status: "failed",
        error,
        metadata: {
          bulkInvite: true,
        },
      }).catch(() => undefined);
    }
  }

  return NextResponse.json({
    ok: failures.length === 0,
    sent,
    failed: failures.length,
    recipientCount: recipients.length,
    failures: failures.slice(0, 20),
    skipped: roster.members.length - recipients.length,
  });
}
