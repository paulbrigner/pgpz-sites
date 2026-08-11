import "server-only";

import {
  createNewsletterRuntime,
  type EmailRuntimeDocumentClient,
} from "@pgpz/email-runtime";
export {
  newsletterPreviewText,
  type AdminNewsletter,
  type NewsletterAudienceMode,
  type NewsletterDraftInput,
  type NewsletterSendRun,
  type NewsletterStats,
  type NewsletterStatus,
} from "@pgpz/email-domain";
import { documentClient, TABLE_NAME } from "@/lib/dynamodb";

const runtime = createNewsletterRuntime({
  documentClient: documentClient as unknown as EmailRuntimeDocumentClient,
  tableName: TABLE_NAME,
});

export const {
  listNewsletters,
  listNewsletterSendRuns,
  getNewsletterSendRun,
  getNewsletter,
  saveNewsletterDraft,
  recordNewsletterDraftSend,
  recordNewsletterSendRun,
  updateNewsletterSendRunProgress,
  deleteNewsletterDraft,
  markNewsletterSent,
  claimNewsletterBackgroundDelivery,
} = runtime;
