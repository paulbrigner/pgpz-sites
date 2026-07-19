import type {
  BackgroundJobRecipientInput,
  NormalizedBackgroundJobRecipient,
} from "./contracts";

export function normalizeRecipientId(value: string): string {
  return value.trim().normalize("NFKC");
}

export function normalizeRecipientEmail(value: string): string {
  return value.trim().normalize("NFKC").toLowerCase();
}

/**
 * Normalizes and de-duplicates recipients into deterministic key order. A
 * repeated application ID or normalized email is treated as the same target,
 * which prevents accidental duplicate email delivery when records overlap.
 */
export function normalizeRecipients(
  recipients: readonly BackgroundJobRecipientInput[],
): NormalizedBackgroundJobRecipient[] {
  const normalized: NormalizedBackgroundJobRecipient[] = [];
  const seenKeys = new Set<string>();
  const seenIds = new Set<string>();
  const seenEmails = new Set<string>();

  for (const recipient of recipients) {
    const explicitKey =
      typeof recipient.recipientKey === "string"
        ? normalizeRecipientId(recipient.recipientKey)
        : "";
    const userId =
      typeof recipient.userId === "string" ? normalizeRecipientId(recipient.userId) : "";
    const email =
      typeof recipient.email === "string" ? normalizeRecipientEmail(recipient.email) : "";

    const recipientKey = explicitKey || userId || email;
    if (!recipientKey) {
      throw new TypeError("Every background job recipient must have a stable key, user id, or email");
    }

    if (
      seenKeys.has(recipientKey) ||
      (userId && seenIds.has(userId)) ||
      (email && seenEmails.has(email))
    ) {
      continue;
    }

    seenKeys.add(recipientKey);
    if (userId) seenIds.add(userId);
    if (email) seenEmails.add(email);

    normalized.push({
      ...recipient,
      recipientKey,
      userId: userId || null,
      email: email || null,
    });
  }

  return normalized.sort((left, right) => left.recipientKey.localeCompare(right.recipientKey));
}
