import "server-only";

import { createHash } from "node:crypto";
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
import {
  bindNewsletterTrackingDestinations,
  createNewsletterTrackingRecord,
  markNewsletterTrackingSent,
} from "@/lib/admin/email-tracking";
import { recordEmailEvent, updatePolicyUpdateSendRunProgress } from "@/lib/admin/email-log";
import {
  claimNewsletterBackgroundDelivery,
  markNewsletterSent,
  updateNewsletterSendRunProgress,
} from "@/lib/admin/newsletters";
import { EMAIL_FROM, SITE_URL } from "@/lib/config";
import { listUnsubscribeHeaders } from "@/lib/email-link-security";
import { buildNewsletterEmail } from "@/lib/newsletter-email";
import { buildPolicyUpdateEmail } from "@/lib/policy-update-email";
import type { PolicyUpdate } from "@/lib/policy-updates";

type NewsletterJobPayload = {
  newsletterId: string;
  newsletter: { subject: string; preheader: string; body: string; previewText: string };
  audienceMode: "all_active_members" | "selected_members";
  sourceSendRunId?: string | null;
  adminUserId?: string | null;
};

type PolicyUpdateJobPayload = {
  update: PolicyUpdate;
  audienceMode: "all_active_members" | "selected_members";
  emailAssetMaterializationId?: string | null;
};

type ProcessResult = {
  outcome: "sent" | "validated" | "skipped" | "failed" | "delivery_unknown" | "retry_scheduled";
  retry: boolean;
};

const TERMINAL_JOB_STATUSES = new Set(["completed", "partial", "failed", "needs_review", "canceled"]);

function stableTrackingId(jobId: string, taskId: string) {
  const digest = createHash("sha256").update(`${jobId}\n${taskId}`).digest("hex").slice(0, 32).split("");
  digest[12] = "4";
  digest[16] = ((Number.parseInt(digest[16], 16) & 0x3) | 0x8).toString(16);
  return `${digest.slice(0, 8).join("")}-${digest.slice(8, 12).join("")}-${digest.slice(12, 16).join("")}-${digest.slice(16, 20).join("")}-${digest.slice(20).join("")}`;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

async function failurePreview(jobId: string) {
  const tasks = await listBackgroundJobTasks(jobId);
  return tasks
    .filter((task) => task.status === "failed" || task.status === "delivery_unknown")
    .map((task) => ({
      email: task.recipient.email || "",
      error: task.lastError || (task.status === "delivery_unknown" ? "Delivery outcome requires review." : "Delivery failed."),
    }))
    .slice(0, 10);
}

async function syncNewsletterProgress(job: BackgroundJobRecord, payload: NewsletterJobPayload) {
  const failures = await failurePreview(job.id);
  await updateNewsletterSendRunProgress({
    sendRunId: job.id,
    sentCount: job.sentCount,
    failedCount: job.failedCount + job.deliveryUnknownCount,
    failurePreview: failures,
  });
  if (
    job.mode === "live" &&
    payload.audienceMode === "all_active_members" &&
    TERMINAL_JOB_STATUSES.has(job.status)
  ) {
    await markNewsletterSent({
      newsletterId: payload.newsletterId,
      adminUserId: payload.adminUserId || null,
      recipientCount: job.recipientCount,
      sentCount: job.sentCount,
      failedCount: job.failedCount + job.deliveryUnknownCount,
      failurePreview: failures,
      deliveryJobId: job.id,
    });
  }
}

async function syncPolicyUpdateProgress(job: BackgroundJobRecord) {
  await updatePolicyUpdateSendRunProgress({
    sendRunId: job.id,
    sentCount: job.sentCount,
    failedCount: job.failedCount + job.deliveryUnknownCount,
    failurePreview: await failurePreview(job.id),
  });
}

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
  const updated = await completeBackgroundJobTask({
    jobId: job.id,
    taskId: task.taskId,
    leaseToken,
    status,
    providerMessageId,
    result,
    error,
  });
  if (updated) {
    try {
      if (job.kind === "newsletter") {
        await syncNewsletterProgress(updated, job.payload as NewsletterJobPayload);
      }
      if (job.kind === "policy_update") await syncPolicyUpdateProgress(updated);
    } catch (projectionError) {
      console.error("Background-job delivery was recorded but progress projection failed", {
        jobId: job.id,
        taskId: task.taskId,
        error: errorMessage(projectionError, "Progress projection failed"),
      });
      return false;
    }
  }
  return true;
}

async function retryOrFinishFailure({
  job,
  task,
  leaseToken,
  error,
  deliveryStarted,
  providerMessageId,
  providerAcceptedAt,
}: {
  job: BackgroundJobRecord;
  task: BackgroundJobTaskRecord;
  leaseToken: string;
  error: unknown;
  deliveryStarted: boolean;
  providerMessageId?: string | null;
  providerAcceptedAt?: string | null;
}): Promise<ProcessResult> {
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
    return { outcome: "delivery_unknown", retry: false };
  }
  if (task.attemptCount >= 3) {
    await finalize({ job, task, leaseToken, status: "failed", error });
    return { outcome: "failed", retry: false };
  }
  await releaseBackgroundJobTaskForRetry({ jobId: job.id, taskId: task.taskId, leaseToken, error });
  return { outcome: "retry_scheduled", retry: true };
}

async function processNewsletter(
  job: BackgroundJobRecord,
  task: BackgroundJobTaskRecord,
  leaseToken: string,
): Promise<ProcessResult> {
  const payload = job.payload as NewsletterJobPayload;
  let deliveryStarted = false;
  let providerMessageId: string | null = null;
  let providerAcceptedAt: string | null = null;
  try {
    const current = await getCurrentEligibleRecipient(task.recipient);
    if (!current) {
      await finalize({ job, task, leaseToken, status: "skipped", result: { reason: "recipient_ineligible" } });
      return { outcome: "skipped", retry: false };
    }
    if (job.mode === "smoke") await assertSmokeRecipient(task.recipient);
    if (job.mode === "live" && payload.audienceMode === "all_active_members") {
      const claimed = await claimNewsletterBackgroundDelivery({
        newsletterId: payload.newsletterId,
        deliveryJobId: job.id,
        adminUserId: payload.adminUserId || null,
      });
      if (!claimed) {
        await finalize({
          job,
          task,
          leaseToken,
          status: "skipped",
          result: { reason: "newsletter_delivery_claimed_elsewhere" },
        });
        return { outcome: "skipped", retry: false };
      }
    }
    const trackingId = stableTrackingId(job.id, task.taskId);
    const tracking = job.mode === "validate_only"
      ? null
      : await createNewsletterTrackingRecord({
          trackingId,
          newsletterId: payload.newsletterId,
          sendRunId: job.id,
          audienceMode: payload.audienceMode,
          userId: task.recipient.userId,
          email: task.recipient.email!,
        });
    const built = buildNewsletterEmail(
      payload.newsletter,
      {
        email: task.recipient.email!,
        name: task.recipient.name,
        firstName: task.recipient.firstName,
        lastName: task.recipient.lastName,
      },
      SITE_URL,
      tracking
        ? { trackingId: tracking.trackingId, trackLinks: true, includeOpenPixel: true, includeUnsubscribe: true }
        : undefined,
    );
    if (job.mode === "validate_only") {
      if (!buildEmailServerConfig() || !EMAIL_FROM) throw new Error("Email provider not configured");
      await finalize({ job, task, leaseToken, status: "validated", result: { subject: built.subject } });
      return { outcome: "validated", retry: false };
    }
    const transportConfig = buildEmailServerConfig();
    if (!transportConfig || !EMAIL_FROM) throw new Error("Email provider not configured");
    await bindNewsletterTrackingDestinations(tracking!.trackingId, built.trackedDestinations);
    const transporter = nodemailer.createTransport(transportConfig);
    await markBackgroundJobDeliveryStarted(job.id, task.taskId, leaseToken);
    deliveryStarted = true;
    const sendResult = await transporter.sendMail({
      to: task.recipient.email!,
      from: EMAIL_FROM,
      subject: built.subject,
      text: built.text,
      html: built.html,
      headers: listUnsubscribeHeaders(built.unsubscribeUrl),
    });
    providerMessageId = sendResult?.messageId ? String(sendResult.messageId) : null;
    providerAcceptedAt = new Date().toISOString();
    let projectionsCompleted = await finalize({
      job,
      task,
      leaseToken,
      status: "sent",
      providerMessageId,
      result: { trackingId: tracking!.trackingId, providerAcceptedAt },
    });
    await markNewsletterTrackingSent({
      trackingId: tracking!.trackingId,
      providerMessageId,
    }).catch((projectionError) => {
      projectionsCompleted = false;
      console.error("Newsletter delivery was recorded but tracking projection failed", {
        jobId: job.id,
        taskId: task.taskId,
        error: errorMessage(projectionError, "Tracking projection failed"),
      });
    });
    await recordEmailEvent({
      eventId: `background:${job.id}:${task.taskId}:sent`,
      occurredAt: providerAcceptedAt,
      userId: task.recipient.userId,
      email: task.recipient.email,
      type: "newsletter",
      subject: built.subject,
      status: "sent",
      providerMessageId,
      metadata: {
        newsletterId: payload.newsletterId,
        trackingId: tracking!.trackingId,
        audience: "active_members",
        audienceMode: payload.audienceMode,
        sourceSendRunId: payload.sourceSendRunId || null,
        backgroundJobId: job.id,
        profileNameResolved: !!task.recipient.name,
      },
    }).catch((projectionError) => {
      projectionsCompleted = false;
      console.error("Newsletter delivery was recorded but email-log projection failed", {
        jobId: job.id,
        taskId: task.taskId,
        error: errorMessage(projectionError, "Email-log projection failed"),
      });
    });
    if (projectionsCompleted) {
      await markBackgroundJobTaskProjectionCompleted(job.id, task.taskId).catch(
        () => undefined,
      );
    }
    return { outcome: "sent", retry: false };
  } catch (error) {
    await recordEmailEvent({
      userId: task.recipient.userId,
      email: task.recipient.email,
      type: "newsletter",
      subject: payload.newsletter?.subject || null,
      status: "failed",
      error: errorMessage(error, "Failed to send newsletter"),
      metadata: { newsletterId: payload.newsletterId, backgroundJobId: job.id, attempt: task.attemptCount },
    }).catch(() => undefined);
    return retryOrFinishFailure({
      job,
      task,
      leaseToken,
      error,
      deliveryStarted,
      providerMessageId,
      providerAcceptedAt,
    });
  }
}

async function processPolicyUpdate(
  job: BackgroundJobRecord,
  task: BackgroundJobTaskRecord,
  leaseToken: string,
): Promise<ProcessResult> {
  const payload = job.payload as PolicyUpdateJobPayload;
  let deliveryStarted = false;
  let providerMessageId: string | null = null;
  let providerAcceptedAt: string | null = null;
  try {
    const current = await getCurrentEligibleRecipient(task.recipient);
    if (!current) {
      await finalize({ job, task, leaseToken, status: "skipped", result: { reason: "recipient_ineligible" } });
      return { outcome: "skipped", retry: false };
    }
    if (job.mode === "smoke") await assertSmokeRecipient(task.recipient);
    const trackingId = stableTrackingId(job.id, task.taskId);
    const tracking = job.mode === "validate_only"
      ? null
      : await createNewsletterTrackingRecord({
          trackingId,
          newsletterId: payload.update.slug,
          sendRunId: job.id,
          messageType: "policy_update",
          audienceMode: payload.audienceMode,
          userId: task.recipient.userId,
          email: task.recipient.email!,
        });
    const built = buildPolicyUpdateEmail(
      payload.update,
      {
        email: task.recipient.email!,
        name: task.recipient.name,
        firstName: task.recipient.firstName,
        lastName: task.recipient.lastName,
      },
      SITE_URL,
      tracking || payload.emailAssetMaterializationId
        ? {
            trackingId: tracking?.trackingId,
            trackLinks: !!tracking,
            includeOpenPixel: !!tracking,
            includeUnsubscribe: !!tracking,
            emailAssetMaterializationId: payload.emailAssetMaterializationId || null,
          }
        : undefined,
    );
    if (job.mode === "validate_only") {
      if (!buildEmailServerConfig() || !EMAIL_FROM) throw new Error("Email provider not configured");
      await finalize({ job, task, leaseToken, status: "validated", result: { subject: built.subject } });
      return { outcome: "validated", retry: false };
    }
    const transportConfig = buildEmailServerConfig();
    if (!transportConfig || !EMAIL_FROM) throw new Error("Email provider not configured");
    await bindNewsletterTrackingDestinations(tracking!.trackingId, built.trackedDestinations);
    const transporter = nodemailer.createTransport(transportConfig);
    await markBackgroundJobDeliveryStarted(job.id, task.taskId, leaseToken);
    deliveryStarted = true;
    const sendResult = await transporter.sendMail({
      to: task.recipient.email!,
      from: EMAIL_FROM,
      subject: built.subject,
      text: built.text,
      html: built.html,
      headers: listUnsubscribeHeaders(built.unsubscribeUrl),
    });
    providerMessageId = sendResult?.messageId ? String(sendResult.messageId) : null;
    providerAcceptedAt = new Date().toISOString();
    let projectionsCompleted = await finalize({
      job,
      task,
      leaseToken,
      status: "sent",
      providerMessageId,
      result: { trackingId: tracking!.trackingId, providerAcceptedAt },
    });
    await markNewsletterTrackingSent({
      trackingId: tracking!.trackingId,
      providerMessageId,
    }).catch((projectionError) => {
      projectionsCompleted = false;
      console.error("Policy-update delivery was recorded but tracking projection failed", {
        jobId: job.id,
        taskId: task.taskId,
        error: errorMessage(projectionError, "Tracking projection failed"),
      });
    });
    await recordEmailEvent({
      eventId: `background:${job.id}:${task.taskId}:sent`,
      occurredAt: providerAcceptedAt,
      userId: task.recipient.userId,
      email: task.recipient.email,
      type: `policy_update_${payload.update.category}`,
      subject: built.subject,
      status: "sent",
      providerMessageId,
      metadata: {
        updateSlug: payload.update.slug,
        category: payload.update.category,
        policyUpdateSendRunId: job.id,
        trackingId: tracking!.trackingId,
        audienceMode: payload.audienceMode,
        portalUrl: built.portalUrl,
        backgroundJobId: job.id,
        profileNameResolved: !!task.recipient.name,
      },
    }).catch((projectionError) => {
      projectionsCompleted = false;
      console.error("Policy-update delivery was recorded but email-log projection failed", {
        jobId: job.id,
        taskId: task.taskId,
        error: errorMessage(projectionError, "Email-log projection failed"),
      });
    });
    if (projectionsCompleted) {
      await markBackgroundJobTaskProjectionCompleted(job.id, task.taskId).catch(
        () => undefined,
      );
    }
    return { outcome: "sent", retry: false };
  } catch (error) {
    await recordEmailEvent({
      userId: task.recipient.userId,
      email: task.recipient.email,
      type: `policy_update_${payload.update?.category || "unknown"}`,
      subject: payload.update?.emailSubject || null,
      status: "failed",
      error: errorMessage(error, "Failed to send policy update"),
      metadata: { updateSlug: payload.update?.slug, policyUpdateSendRunId: job.id, attempt: task.attemptCount },
    }).catch(() => undefined);
    return retryOrFinishFailure({
      job,
      task,
      leaseToken,
      error,
      deliveryStarted,
      providerMessageId,
      providerAcceptedAt,
    });
  }
}

export async function processEmailBackgroundJobTask({
  job,
  task,
  leaseToken,
}: {
  job: BackgroundJobRecord;
  task: BackgroundJobTaskRecord;
  leaseToken: string;
}) {
  if (job.kind === "newsletter") return processNewsletter(job, task, leaseToken);
  if (job.kind === "policy_update") return processPolicyUpdate(job, task, leaseToken);
  throw new Error(`Unsupported email background job kind: ${job.kind}`);
}

export async function reconcileEmailBackgroundJobProjections(limit = 100) {
  const jobs = (await listBackgroundJobs(limit)).filter(
    (job) =>
      TERMINAL_JOB_STATUSES.has(job.status) &&
      (job.kind === "newsletter" || job.kind === "policy_update"),
  );
  let repairedTasks = 0;
  let failedRepairs = 0;

  for (const job of jobs) {
    try {
      if (job.kind === "newsletter") {
        await syncNewsletterProgress(job, job.payload as NewsletterJobPayload);
      } else {
        await syncPolicyUpdateProgress(job);
      }
    } catch {
      failedRepairs += 1;
    }

    const tasks = await listBackgroundJobTasks(job.id);
    for (const task of tasks.filter(
      (candidate) =>
        candidate.status === "sent" && !candidate.projectionCompletedAt,
    )) {
      try {
        const trackingId =
          typeof task.result?.trackingId === "string"
            ? task.result.trackingId
            : stableTrackingId(job.id, task.taskId);
        const providerAcceptedAt =
          typeof task.result?.providerAcceptedAt === "string"
            ? task.result.providerAcceptedAt
            : task.deliveryStartedAt;
        await markNewsletterTrackingSent({
          trackingId,
          providerMessageId: task.providerMessageId,
        });

        if (job.kind === "newsletter") {
          const payload = job.payload as NewsletterJobPayload;
          await recordEmailEvent({
            eventId: `background:${job.id}:${task.taskId}:sent`,
            occurredAt: providerAcceptedAt,
            userId: task.recipient.userId,
            email: task.recipient.email,
            type: "newsletter",
            subject: payload.newsletter.subject,
            status: "sent",
            providerMessageId: task.providerMessageId,
            metadata: {
              newsletterId: payload.newsletterId,
              trackingId,
              audience: "active_members",
              audienceMode: payload.audienceMode,
              sourceSendRunId: payload.sourceSendRunId || null,
              backgroundJobId: job.id,
              profileNameResolved: !!task.recipient.name,
            },
          });
        } else {
          const payload = job.payload as PolicyUpdateJobPayload;
          await recordEmailEvent({
            eventId: `background:${job.id}:${task.taskId}:sent`,
            occurredAt: providerAcceptedAt,
            userId: task.recipient.userId,
            email: task.recipient.email,
            type: `policy_update_${payload.update.category}`,
            subject: payload.update.emailSubject,
            status: "sent",
            providerMessageId: task.providerMessageId,
            metadata: {
              updateSlug: payload.update.slug,
              category: payload.update.category,
              policyUpdateSendRunId: job.id,
              trackingId,
              audienceMode: payload.audienceMode,
              backgroundJobId: job.id,
              profileNameResolved: !!task.recipient.name,
            },
          });
        }
        await markBackgroundJobTaskProjectionCompleted(job.id, task.taskId);
        repairedTasks += 1;
      } catch {
        failedRepairs += 1;
      }
    }
  }

  return { inspectedProjectionJobs: jobs.length, repairedTasks, failedRepairs };
}
