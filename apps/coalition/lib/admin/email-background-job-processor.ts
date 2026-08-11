import "server-only";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - nodemailer types are intentionally not bundled separately.
import nodemailer from "nodemailer";
import { createEmailBackgroundJobProcessor } from "@pgpz/email-runtime";
import {
  assertSmokeRecipient,
  completeBackgroundJobTask,
  getCurrentEligibleRecipient,
  listBackgroundJobs,
  listBackgroundJobTasks,
  markBackgroundJobDeliveryStarted,
  markBackgroundJobTaskProjectionCompleted,
  releaseBackgroundJobTaskForRetry,
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
import {
  buildAdminSignupNotificationEmail,
  getCurrentEligibleAdminSignupNotificationRecipient,
} from "@/lib/admin/signup-notifications";
import { EMAIL_FROM, SITE_URL } from "@/lib/config";
import { listUnsubscribeHeaders } from "@/lib/email-link-security";
import { buildNewsletterEmail } from "@/lib/newsletter-email";
import { buildPolicyUpdateEmail } from "@/lib/policy-update-email";

const runtime = createEmailBackgroundJobProcessor({
  assertSmokeRecipient,
  completeBackgroundJobTask,
  getCurrentEligibleRecipient,
  listBackgroundJobs,
  listBackgroundJobTasks,
  markBackgroundJobDeliveryStarted,
  markBackgroundJobTaskProjectionCompleted,
  releaseBackgroundJobTaskForRetry,
  buildEmailServerConfig,
  bindNewsletterTrackingDestinations,
  createNewsletterTrackingRecord,
  markNewsletterTrackingSent,
  recordEmailEvent,
  updatePolicyUpdateSendRunProgress,
  claimNewsletterBackgroundDelivery,
  markNewsletterSent,
  updateNewsletterSendRunProgress,
  buildAdminSignupNotificationEmail,
  getCurrentEligibleAdminSignupNotificationRecipient,
  emailFrom: EMAIL_FROM,
  siteUrl: SITE_URL,
  listUnsubscribeHeaders,
  buildNewsletterEmail,
  buildPolicyUpdateEmail,
  createTransport: (config) => nodemailer.createTransport(config as any),
});

export const {
  processEmailBackgroundJobTask,
  reconcileEmailBackgroundJobProjections,
} = runtime;
