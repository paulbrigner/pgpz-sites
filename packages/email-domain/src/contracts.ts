export type MemberEmailCategory = "newsletter" | "policy_update";

export type RawEmailPreferenceUser = Record<string, unknown> & {
  emailSuppressed?: boolean | null;
  emailSuppressedReason?: string | null;
  emailNewsletterOptIn?: boolean | null;
  emailPolicyUpdateOptIn?: boolean | null;
};

export type MemberEmailPreferences = {
  newsletter: boolean;
  policyUpdates: boolean;
  globallySuppressed: boolean;
  suppressionReason: string | null;
  canSelfResubscribe: boolean;
};

export type EmailMessageType = "newsletter" | "policy_update";
export type EmailTrackingAudienceMode =
  "all_active_members" | "selected_members";

export type TrackingClientInfo = {
  ip?: string | null;
  userAgent?: string | null;
  acceptLanguage?: string | null;
};

export type NewsletterTrackingRecord = {
  trackingId: string;
  newsletterId: string;
  sendRunId: string | null;
  messageType: EmailMessageType;
  audienceMode: EmailTrackingAudienceMode;
  userId: string | null;
  email: string | null;
  sentAt: string;
  providerMessageId: string | null;
  firstOpenedAt: string | null;
  lastOpenedAt: string | null;
  openCount: number;
  openFingerprints: string[];
  uniqueOpenClientCount: number;
  possibleForwardOpenCount: number;
  firstClickedAt: string | null;
  lastClickedAt: string | null;
  lastClickedUrl: string | null;
  clickCount: number;
  allowedClickDestinationDigests: string[];
  unsubscribedAt: string | null;
};

export type EmailLogStatus = "queued" | "sent" | "failed";

export interface EmailLogParams {
  eventId?: string | null;
  occurredAt?: string | null;
  userId?: string | null;
  email?: string | null;
  type: string;
  subject?: string | null;
  status: EmailLogStatus;
  providerMessageId?: string | null;
  error?: string | null;
  markWelcome?: boolean;
  emailBounceReason?: string | null;
  emailSuppressed?: boolean | null;
  metadata?: Record<string, unknown>;
}

export type PolicyUpdateEmailStats = {
  sent: number;
  failed: number;
  draftSent: number;
  lastSentAt: string | null;
};

export type PolicyUpdateSendHistoryItem = {
  id: string;
  updateSlug: string;
  title: string;
  shortTitle: string;
  category: string;
  categoryLabel: string;
  subject: string;
  sentAt: string;
  lastEventAt: string;
  audienceMode: EmailTrackingAudienceMode;
  stats: {
    recipientCount: number;
    sentCount: number;
    failedCount: number;
    openCount: number | null;
    clickCount: number | null;
    unsubscribeCount: number | null;
    possibleForwardOpenCount: number | null;
  };
  failurePreview: Array<{ email: string; error: string }>;
  source: "send_run" | "legacy_email_log";
  engagementTracked: boolean;
};

export type PolicyUpdateHistoryContext = {
  slug: string;
  title: string;
  shortTitle: string;
  category: string;
  categoryLabel: string;
  emailSubject: string;
};

export type PolicyUpdateEmailLogItem = {
  createdAt?: unknown;
  emailType?: unknown;
  status?: unknown;
  subject?: unknown;
  email?: unknown;
  error?: unknown;
  metadata?: unknown;
};

export type NewsletterStatus = "draft" | "sending" | "sent";
export type NewsletterAudienceMode = EmailTrackingAudienceMode;

export type NewsletterStats = {
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  draftSendCount: number;
  openCount: number | null;
  clickCount: number | null;
  unsubscribeCount: number | null;
  possibleForwardOpenCount: number | null;
  lastDraftSentAt: string | null;
};

export type AdminNewsletter = {
  id: string;
  subject: string;
  preheader: string;
  body: string;
  previewText: string;
  status: NewsletterStatus;
  audience: "active_members";
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
  sentAt: string | null;
  sentBy: string | null;
  deliveryJobId: string | null;
  stats: NewsletterStats;
  failurePreview: Array<{ email: string; error: string }>;
};

export type NewsletterSendRun = {
  id: string;
  newsletterId: string;
  subject: string;
  preheader: string;
  body: string;
  previewText: string;
  audienceMode: NewsletterAudienceMode;
  sentAt: string;
  sentBy: string | null;
  stats: Omit<NewsletterStats, "draftSendCount" | "lastDraftSentAt">;
  failurePreview: Array<{ email: string; error: string }>;
};

export type NewsletterDraftInput = {
  id?: string | null;
  subject: string;
  preheader?: string | null;
  body: string;
  adminUserId?: string | null;
};

export type NewsletterEmailRecipient = {
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email: string;
};

export type NewsletterEmailTracking = {
  trackingId?: string | null;
  trackLinks?: boolean;
  includeOpenPixel?: boolean;
  includeUnsubscribe?: boolean;
  onTrackedDestination?: (destination: string) => void;
};
