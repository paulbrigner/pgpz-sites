import "server-only";

import {
  createEmailTrackingRuntime,
  type EmailRuntimeDocumentClient,
} from "@pgpz/email-runtime";
import { documentClient, TABLE_NAME } from "@/lib/dynamodb";
import {
  emailTrackingDigest,
  emailTrackingDigestCandidates,
  getEmailTrackingSecret,
  safeHttpDestination,
} from "@/lib/email-link-security";
import { unsubscribeMemberFromEmailCategory } from "@/lib/email-preferences";

export {
  trackingClientInfoFromHeaders,
  type EmailMessageType,
  type EmailTrackingAudienceMode,
  type NewsletterTrackingRecord,
  type TrackingClientInfo,
} from "@pgpz/email-runtime";

const runtime = createEmailTrackingRuntime({
  documentClient: documentClient as unknown as EmailRuntimeDocumentClient,
  tableName: TABLE_NAME,
  emailTrackingDigest,
  emailTrackingDigestCandidates,
  getEmailTrackingSecret,
  safeHttpDestination,
  unsubscribeMemberFromEmailCategory,
});

export const {
  createNewsletterTrackingRecord,
  markNewsletterTrackingSent,
  getNewsletterTrackingRecord,
  recordNewsletterOpen,
  bindNewsletterTrackingDestinations,
  recordNewsletterClick,
  recordLegacyNewsletterSameSiteClick,
  recordNewsletterUnsubscribe,
} = runtime;
