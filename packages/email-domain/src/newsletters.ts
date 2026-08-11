import type {
  AdminNewsletter,
  NewsletterDraftInput,
  NewsletterSendRun,
  NewsletterStats,
} from "./contracts";

const textOrEmpty = (value: unknown) =>
  typeof value === "string" ? value : "";
const textOrNull = (value: unknown) =>
  typeof value === "string" && value.trim() ? value : null;

export const newsletterPreviewText = (body: string) =>
  body.replace(/\s+/g, " ").trim().slice(0, 320);

export function validateNewsletterDraft(input: NewsletterDraftInput) {
  const subject = input.subject.trim();
  const preheader = (input.preheader || "").trim();
  const body = input.body.trim();

  if (!subject) throw new Error("Newsletter subject is required.");
  if (!body) throw new Error("Newsletter body is required.");
  if (subject.length > 180) {
    throw new Error("Newsletter subject must be 180 characters or fewer.");
  }
  if (preheader.length > 240) {
    throw new Error("Newsletter preheader must be 240 characters or fewer.");
  }
  if (body.length > 25000) {
    throw new Error("Newsletter body must be 25,000 characters or fewer.");
  }

  return { subject, preheader, body };
}

export function normalizeFailurePreview(value: unknown) {
  return Array.isArray(value)
    ? value
        .map((failure: unknown) => {
          const record =
            typeof failure === "object" && failure !== null
              ? (failure as Record<string, unknown>)
              : {};
          return {
            email: textOrEmpty(record.email),
            error: textOrEmpty(record.error),
          };
        })
        .filter((failure) => failure.email || failure.error)
    : [];
}

export function newsletterFromItem(
  item: Record<string, unknown> | undefined | null,
): AdminNewsletter | null {
  if (!item?.newsletterId) return null;

  const stats: NewsletterStats = {
    recipientCount: Number(item.recipientCount || 0),
    sentCount: Number(item.sentCount || 0),
    failedCount: Number(item.failedCount || 0),
    draftSendCount: Number(item.draftSendCount || 0),
    openCount: typeof item.openCount === "number" ? item.openCount : null,
    clickCount: typeof item.clickCount === "number" ? item.clickCount : null,
    unsubscribeCount:
      typeof item.unsubscribeCount === "number" ? item.unsubscribeCount : null,
    possibleForwardOpenCount:
      typeof item.possibleForwardOpenCount === "number"
        ? item.possibleForwardOpenCount
        : null,
    lastDraftSentAt: textOrNull(item.lastDraftSentAt),
  };

  return {
    id: String(item.newsletterId),
    subject: textOrEmpty(item.subject),
    preheader: textOrEmpty(item.preheader),
    body: textOrEmpty(item.body),
    previewText:
      textOrEmpty(item.previewText) ||
      newsletterPreviewText(textOrEmpty(item.body)),
    status:
      item.status === "sent"
        ? "sent"
        : item.status === "sending"
          ? "sending"
          : "draft",
    audience: "active_members",
    createdAt: textOrEmpty(item.createdAt),
    updatedAt: textOrEmpty(item.updatedAt),
    createdBy: textOrNull(item.createdBy),
    updatedBy: textOrNull(item.updatedBy),
    sentAt: textOrNull(item.sentAt),
    sentBy: textOrNull(item.sentBy),
    deliveryJobId: textOrNull(item.deliveryJobId),
    stats,
    failurePreview: normalizeFailurePreview(item.failurePreview),
  };
}

export function newsletterSendRunFromItem(
  item: Record<string, unknown> | undefined | null,
): NewsletterSendRun | null {
  if (!item?.sendRunId || !item?.newsletterId) return null;

  return {
    id: String(item.sendRunId),
    newsletterId: String(item.newsletterId),
    subject: textOrEmpty(item.subject),
    preheader: textOrEmpty(item.preheader),
    body: textOrEmpty(item.body),
    previewText:
      textOrEmpty(item.previewText) ||
      newsletterPreviewText(textOrEmpty(item.body)),
    audienceMode:
      item.audienceMode === "selected_members"
        ? "selected_members"
        : "all_active_members",
    sentAt: textOrEmpty(item.sentAt),
    sentBy: textOrNull(item.sentBy),
    stats: {
      recipientCount: Number(item.recipientCount || 0),
      sentCount: Number(item.sentCount || 0),
      failedCount: Number(item.failedCount || 0),
      openCount: typeof item.openCount === "number" ? item.openCount : 0,
      clickCount: typeof item.clickCount === "number" ? item.clickCount : 0,
      unsubscribeCount:
        typeof item.unsubscribeCount === "number" ? item.unsubscribeCount : 0,
      possibleForwardOpenCount:
        typeof item.possibleForwardOpenCount === "number"
          ? item.possibleForwardOpenCount
          : 0,
    },
    failurePreview: normalizeFailurePreview(item.failurePreview),
  };
}
