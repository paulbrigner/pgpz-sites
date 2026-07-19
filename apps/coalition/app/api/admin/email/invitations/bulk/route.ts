import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin/auth";
import { getInvitationEmailTemplate } from "@/lib/admin/invitation-template";
import { buildAdminRoster, type AdminMember } from "@/lib/admin/roster";
import { getUserDisplayName } from "@/lib/user-display-name";
import { enqueueBackgroundJob, type BackgroundJobMode } from "@/lib/admin/background-jobs";

export const dynamic = "force-dynamic";

const isOutstandingInviteableMember = (member: AdminMember) =>
  member.accountStatus !== "deactivated" &&
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

  const roster = await buildAdminRoster({ statusFilter: "all" });
  const recipients = roster.members.filter(isOutstandingInviteableMember);
  if (!recipients.length) {
    return NextResponse.json({
      ok: true,
      queued: false,
      failed: 0,
      recipientCount: 0,
      failures: [],
      skipped: roster.members.length,
    });
  }

  const template = await getInvitationEmailTemplate();
  const mode: BackgroundJobMode = body?.deliveryMode === "validate_only"
    ? "validate_only"
    : body?.deliveryMode === "smoke"
      ? "smoke"
      : "live";
  const suppliedIdempotencyKey = request.headers.get("idempotency-key") ||
    (typeof body?.idempotencyKey === "string" ? body.idempotencyKey.trim() : "");
  const queued = await enqueueBackgroundJob({
    kind: "bulk_invitation",
    mode,
    sourceId: null,
    createdBy: adminUserId,
    idempotencyKey: `bulk-invitation:${suppliedIdempotencyKey || randomUUID()}`,
    payload: { template, adminUserId, bulkInvite: true },
    recipients: recipients.map((member) => ({
      recipientKey: member.id,
      userId: member.id,
      email: member.email,
      name: getUserDisplayName(member),
      firstName: member.firstName,
      lastName: member.lastName,
    })),
  });

  return NextResponse.json({
    ok: true,
    queued: true,
    duplicate: queued.duplicate,
    job: queued.job,
    jobId: queued.job.id,
    statusUrl: `/api/admin/jobs?jobId=${encodeURIComponent(queued.job.id)}`,
    sent: 0,
    failed: 0,
    recipientCount: recipients.length,
    failures: [],
    skipped: roster.members.length - recipients.length,
  }, { status: 202 });
}
