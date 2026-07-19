import "server-only";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - nodemailer types are intentionally not bundled separately.
import nodemailer from "nodemailer";
import {
  assertSmokeRecipient,
  completeBackgroundJobTask,
  getCurrentEligibleRecipient,
  listBackgroundJobs,
  listBackgroundJobTasks,
  markBackgroundJobDeliveryStarted,
  markBackgroundJobTaskProjectionCompleted,
  releaseBackgroundJobTaskForRetry,
  type BackgroundJobRecord,
  type BackgroundJobTaskRecord,
} from "@/lib/admin/background-jobs";
import { buildEmailServerConfig } from "@/lib/admin/email-transport";
import { recordEmailEvent } from "@/lib/admin/email-log";
import type { InvitationEmailTemplate } from "@/lib/admin/invitation-template";
import {
  claimInvitationEmailDelivery,
  createInvitationActivationLink,
  markInvitationEmailSent,
  releaseInvitationEmailDelivery,
} from "@/lib/admin/invitations";
import { EMAIL_FROM } from "@/lib/config";
import { syncCoalitionMemberToCommunityById } from "@/lib/community-sync";
import { buildInvitationEmail } from "@/lib/system-email";

type InvitationJobPayload = {
  template: InvitationEmailTemplate;
  adminUserId?: string | null;
  bulkInvite?: boolean;
};

type CommunitySyncJobPayload = {
  triggeredBy?: string | null;
};

async function finalize({
  job,
  task,
  leaseToken,
  status,
  providerMessageId,
  result,
  error,
}: {
  job: BackgroundJobRecord;
  task: BackgroundJobTaskRecord;
  leaseToken: string;
  status: "sent" | "validated" | "skipped" | "failed" | "delivery_unknown";
  providerMessageId?: string | null;
  result?: Record<string, unknown>;
  error?: unknown;
}) {
  await completeBackgroundJobTask({
    jobId: job.id,
    taskId: task.taskId,
    leaseToken,
    status,
    providerMessageId,
    result,
    error,
  });
}

async function processInvitation(
  job: BackgroundJobRecord,
  task: BackgroundJobTaskRecord,
  leaseToken: string,
) {
  const payload = job.payload as InvitationJobPayload;
  let deliveryStarted = false;
  let deliveryClaimed = false;
  let providerMessageId: string | null = null;
  let providerAcceptedAt: string | null = null;
  try {
    const current = await getCurrentEligibleRecipient(task.recipient, { requireInvited: true });
    if (!current) {
      await finalize({ job, task, leaseToken, status: "skipped", result: { reason: "invitation_no_longer_eligible" } });
      return { outcome: "skipped", retry: false } as const;
    }
    if (job.mode === "smoke") await assertSmokeRecipient(task.recipient);
    if (job.mode !== "validate_only") {
      deliveryClaimed = await claimInvitationEmailDelivery({
        userId: task.recipient.userId!,
        deliveryJobId: job.id,
      });
      if (!deliveryClaimed) {
        await finalize({
          job,
          task,
          leaseToken,
          status: "skipped",
          result: { reason: "invitation_delivery_claimed_elsewhere" },
        });
        return { outcome: "skipped", retry: false } as const;
      }
    }
    const activationUrl = job.mode === "validate_only"
      ? "https://validation.invalid/invitations/activate"
      : (await createInvitationActivationLink({
          userId: task.recipient.userId!,
          adminUserId: payload.adminUserId || null,
          deliveryJobId: job.id,
        })).activationUrl;
    const built = buildInvitationEmail({
      recipientName: task.recipient.name || task.recipient.email || "Coalition member",
      recipientFirstName: task.recipient.firstName,
      recipientLastName: task.recipient.lastName,
      activationUrl,
      template: payload.template,
    });
    if (job.mode === "validate_only") {
      if (!buildEmailServerConfig() || !EMAIL_FROM) throw new Error("Email provider not configured");
      await finalize({ job, task, leaseToken, status: "validated", result: { subject: built.subject } });
      return { outcome: "validated", retry: false } as const;
    }
    const transportConfig = buildEmailServerConfig();
    if (!transportConfig || !EMAIL_FROM) throw new Error("Email provider not configured");
    const transporter = nodemailer.createTransport(transportConfig);
    await markBackgroundJobDeliveryStarted(job.id, task.taskId, leaseToken);
    deliveryStarted = true;
    const sendResult = await transporter.sendMail({
      to: task.recipient.email!,
      from: EMAIL_FROM,
      subject: built.subject,
      text: built.text,
      html: built.html,
    });
    providerMessageId = sendResult?.messageId ? String(sendResult.messageId) : null;
    providerAcceptedAt = new Date().toISOString();
    await finalize({
      job,
      task,
      leaseToken,
      status: "sent",
      providerMessageId,
      result: { subject: built.subject, providerAcceptedAt },
    });
    let projectionsCompleted = true;
    await markInvitationEmailSent({
      userId: task.recipient.userId!,
      adminUserId: payload.adminUserId || null,
      deliveryJobId: job.id,
    }).catch((projectionError) => {
      projectionsCompleted = false;
      console.error("Invitation delivery was recorded but member projection failed", {
        jobId: job.id,
        taskId: task.taskId,
        error: projectionError instanceof Error ? projectionError.message : String(projectionError),
      });
    });
    await recordEmailEvent({
      eventId: `background:${job.id}:${task.taskId}:sent`,
      occurredAt: providerAcceptedAt,
      userId: task.recipient.userId,
      email: task.recipient.email,
      type: "invitation",
      subject: built.subject,
      status: "sent",
      providerMessageId,
      metadata: { bulkInvite: payload.bulkInvite !== false, backgroundJobId: job.id },
    }).catch((projectionError) => {
      projectionsCompleted = false;
      console.error("Invitation delivery was recorded but email-log projection failed", {
        jobId: job.id,
        taskId: task.taskId,
        error: projectionError instanceof Error ? projectionError.message : String(projectionError),
      });
    });
    if (projectionsCompleted) {
      await markBackgroundJobTaskProjectionCompleted(job.id, task.taskId).catch(
        () => undefined,
      );
    }
    return { outcome: "sent", retry: false } as const;
  } catch (error: any) {
    await recordEmailEvent({
      userId: task.recipient.userId,
      email: task.recipient.email,
      type: "invitation",
      subject: payload.template?.subject || null,
      status: "failed",
      error: error?.message || "Failed to send invitation",
      metadata: {
        bulkInvite: payload.bulkInvite !== false,
        backgroundJobId: job.id,
        attempt: task.attemptCount,
      },
    }).catch(() => undefined);
    if (deliveryStarted) {
      await finalize({
        job,
        task,
        leaseToken,
        status: "delivery_unknown",
        providerMessageId,
        result: providerAcceptedAt ? { providerAcceptedAt } : undefined,
        error,
      }).catch(() => undefined);
      return { outcome: "delivery_unknown", retry: false } as const;
    }
    if (deliveryClaimed) {
      await releaseInvitationEmailDelivery({
        userId: task.recipient.userId!,
        deliveryJobId: job.id,
      }).catch(() => undefined);
    }
    if (task.attemptCount >= 3) {
      await finalize({ job, task, leaseToken, status: "failed", error });
      return { outcome: "failed", retry: false } as const;
    }
    await releaseBackgroundJobTaskForRetry({ jobId: job.id, taskId: task.taskId, leaseToken, error });
    return { outcome: "retry_scheduled", retry: true } as const;
  }
}

async function processCommunitySync(
  job: BackgroundJobRecord,
  task: BackgroundJobTaskRecord,
  leaseToken: string,
) {
  const payload = job.payload as CommunitySyncJobPayload;
  try {
    if (!task.recipient.userId) {
      await finalize({ job, task, leaseToken, status: "failed", error: "Coalition user ID is missing." });
      return { outcome: "failed", retry: false } as const;
    }
    const syncResult = await syncCoalitionMemberToCommunityById({
      userId: task.recipient.userId,
      dryRun: job.mode === "validate_only",
      triggeredBy: payload.triggeredBy || "background_job",
    });
    if (["created", "updated", "already_active"].includes(syncResult.status)) {
      await finalize({ job, task, leaseToken, status: "validated", result: syncResult as unknown as Record<string, unknown> });
      return { outcome: "validated", retry: false } as const;
    }
    if (syncResult.status === "skipped") {
      await finalize({ job, task, leaseToken, status: "skipped", result: syncResult as unknown as Record<string, unknown> });
      return { outcome: "skipped", retry: false } as const;
    }
    await finalize({ job, task, leaseToken, status: "failed", result: syncResult as unknown as Record<string, unknown>, error: syncResult.message });
    return { outcome: "failed", retry: false } as const;
  } catch (error) {
    if (task.attemptCount >= 3) {
      await finalize({ job, task, leaseToken, status: "failed", error });
      return { outcome: "failed", retry: false } as const;
    }
    await releaseBackgroundJobTaskForRetry({ jobId: job.id, taskId: task.taskId, leaseToken, error });
    return { outcome: "retry_scheduled", retry: true } as const;
  }
}

export async function processCoalitionBackgroundJobTask({
  job,
  task,
  leaseToken,
}: {
  job: BackgroundJobRecord;
  task: BackgroundJobTaskRecord;
  leaseToken: string;
}) {
  if (job.kind === "bulk_invitation") return processInvitation(job, task, leaseToken);
  if (job.kind === "community_sync") return processCommunitySync(job, task, leaseToken);
  throw new Error(`Unsupported Coalition background job kind: ${job.kind}`);
}

export async function reconcileCoalitionBackgroundJobProjections(limit = 100) {
  const terminal = new Set(["completed", "partial", "failed", "needs_review", "canceled"]);
  const jobs = (await listBackgroundJobs(limit)).filter(
    (job) => terminal.has(job.status) && job.kind === "bulk_invitation",
  );
  let repairedInvitationTasks = 0;
  let failedInvitationRepairs = 0;

  for (const job of jobs) {
    const payload = job.payload as InvitationJobPayload;
    const tasks = await listBackgroundJobTasks(job.id);
    for (const task of tasks.filter(
      (candidate) =>
        candidate.status === "sent" && !candidate.projectionCompletedAt,
    )) {
      try {
        if (!task.recipient.userId) throw new Error("Invitation user ID is missing.");
        const providerAcceptedAt =
          typeof task.result?.providerAcceptedAt === "string"
            ? task.result.providerAcceptedAt
            : task.deliveryStartedAt;
        await markInvitationEmailSent({
          userId: task.recipient.userId,
          adminUserId: payload.adminUserId || null,
          deliveryJobId: job.id,
        });
        await recordEmailEvent({
          eventId: `background:${job.id}:${task.taskId}:sent`,
          occurredAt: providerAcceptedAt,
          userId: task.recipient.userId,
          email: task.recipient.email,
          type: "invitation",
          subject:
            typeof task.result?.subject === "string"
              ? task.result.subject
              : payload.template.subject,
          status: "sent",
          providerMessageId: task.providerMessageId,
          metadata: { bulkInvite: payload.bulkInvite !== false, backgroundJobId: job.id },
        });
        await markBackgroundJobTaskProjectionCompleted(job.id, task.taskId);
        repairedInvitationTasks += 1;
      } catch {
        failedInvitationRepairs += 1;
      }
    }
  }

  return {
    inspectedInvitationJobs: jobs.length,
    repairedInvitationTasks,
    failedInvitationRepairs,
  };
}
