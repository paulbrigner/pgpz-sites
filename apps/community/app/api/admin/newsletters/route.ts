import { NextRequest, NextResponse } from "next/server";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - nodemailer types not installed
import nodemailer from "nodemailer";
import { createNewsletterRouteHandlers } from "@pgpz/email-runtime";
import { requireAdminSession } from "@/lib/admin/auth";
import {
  backgroundJobIdForIdempotencyKey,
  enqueueBackgroundJob,
} from "@/lib/admin/background-jobs";
import { recordEmailEvent } from "@/lib/admin/email-log";
import {
  buildEmailServerConfig,
  isValidEmail,
  normalizeEmail,
} from "@/lib/admin/email-transport";
import {
  bindNewsletterTrackingDestinations,
  createNewsletterTrackingRecord,
  markNewsletterTrackingSent,
} from "@/lib/admin/email-tracking";
import {
  deleteNewsletterDraft,
  getNewsletter,
  getNewsletterSendRun,
  listNewsletterSendRuns,
  listNewsletters,
  markNewsletterSent,
  recordNewsletterDraftSend,
  recordNewsletterSendRun,
  saveNewsletterDraft,
} from "@/lib/admin/newsletters";
import { listPolicyUpdateRecipients } from "@/lib/admin/roster";
import {
  findUserProfileByEmail,
  getUserProfileDisplayName,
} from "@/lib/admin/user-profile";
import { EMAIL_FROM, SITE_URL } from "@/lib/config";
import { listUnsubscribeHeaders } from "@/lib/email-link-security";
import { buildNewsletterEmail } from "@/lib/newsletter-email";

export const dynamic = "force-dynamic";

const handlers = createNewsletterRouteHandlers({
  jsonResponse: (body, init) => NextResponse.json(body, init),
  requireAdminSession,
  buildEmailServerConfig,
  isValidEmail,
  normalizeEmail,
  deleteNewsletterDraft,
  getNewsletter,
  getNewsletterSendRun,
  listNewsletterSendRuns,
  listNewsletters,
  markNewsletterSent,
  recordNewsletterDraftSend,
  recordNewsletterSendRun,
  saveNewsletterDraft,
  bindNewsletterTrackingDestinations,
  createNewsletterTrackingRecord,
  markNewsletterTrackingSent,
  listPolicyUpdateRecipients,
  findUserProfileByEmail,
  getUserProfileDisplayName,
  recordEmailEvent,
  emailFrom: EMAIL_FROM,
  siteUrl: SITE_URL,
  listUnsubscribeHeaders,
  buildNewsletterEmail,
  backgroundJobIdForIdempotencyKey,
  enqueueBackgroundJob,
  createTransport: (config) => nodemailer.createTransport(config as any),
});

export function GET() {
  return handlers.GET();
}

export function POST(request: NextRequest) {
  return handlers.POST(request);
}
