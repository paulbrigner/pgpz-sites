import { createHmac } from "node:crypto";
import type { NewsletterTrackingRecord, TrackingClientInfo } from "./contracts";
import { emailTrackingDigest, safeHttpDestination } from "./link-security";

export const normalizeTrackingId = (trackingId: string) =>
  trackingId.trim().replace(/\.png$/i, "");

export function trackingClientInfoFromHeaders(
  headers: Headers,
): TrackingClientInfo {
  return {
    ip:
      headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      headers.get("x-real-ip") ||
      headers.get("cf-connecting-ip") ||
      null,
    userAgent: headers.get("user-agent"),
    acceptLanguage: headers.get("accept-language"),
  };
}

export function openClientFingerprint(
  clientInfo: TrackingClientInfo | null | undefined,
  secret: string,
) {
  const material = [
    clientInfo?.ip?.trim().toLowerCase() || "",
    clientInfo?.userAgent?.trim() || "",
    clientInfo?.acceptLanguage?.trim().toLowerCase() || "",
  ].join("\n");

  if (!material.trim()) return null;

  return createHmac("sha256", secret)
    .update(material)
    .digest("hex")
    .slice(0, 32);
}

export function newsletterTrackingRecordFromItem(
  item: Record<string, unknown> | undefined | null,
): NewsletterTrackingRecord | null {
  if (!item?.trackingId || !item?.newsletterId) return null;

  const openFingerprints = Array.isArray(item.openFingerprints)
    ? item.openFingerprints.filter(
        (value: unknown): value is string => typeof value === "string",
      )
    : [];

  return {
    trackingId: String(item.trackingId),
    newsletterId: String(item.newsletterId),
    sendRunId: typeof item.sendRunId === "string" ? item.sendRunId : null,
    messageType:
      item.messageType === "policy_update" ? "policy_update" : "newsletter",
    audienceMode:
      item.audienceMode === "selected_members"
        ? "selected_members"
        : "all_active_members",
    userId: typeof item.userId === "string" ? item.userId : null,
    email: typeof item.email === "string" ? item.email : null,
    sentAt: typeof item.sentAt === "string" ? item.sentAt : "",
    providerMessageId:
      typeof item.providerMessageId === "string"
        ? item.providerMessageId
        : null,
    firstOpenedAt:
      typeof item.firstOpenedAt === "string" ? item.firstOpenedAt : null,
    lastOpenedAt:
      typeof item.lastOpenedAt === "string" ? item.lastOpenedAt : null,
    openCount: Number(item.openCount || 0),
    openFingerprints,
    uniqueOpenClientCount: Number(
      item.uniqueOpenClientCount || openFingerprints.length || 0,
    ),
    possibleForwardOpenCount: Number(item.possibleForwardOpenCount || 0),
    firstClickedAt:
      typeof item.firstClickedAt === "string" ? item.firstClickedAt : null,
    lastClickedAt:
      typeof item.lastClickedAt === "string" ? item.lastClickedAt : null,
    lastClickedUrl:
      typeof item.lastClickedUrl === "string" ? item.lastClickedUrl : null,
    clickCount: Number(item.clickCount || 0),
    allowedClickDestinationDigests: Array.isArray(
      item.allowedClickDestinationDigests,
    )
      ? item.allowedClickDestinationDigests.filter(
          (value: unknown): value is string => typeof value === "string",
        )
      : [],
    unsubscribedAt:
      typeof item.unsubscribedAt === "string" ? item.unsubscribedAt : null,
  };
}

export function clickDestinationDigest(
  trackingId: string,
  destination: string,
  secret: string,
) {
  const canonicalDestination = safeHttpDestination(destination);
  if (!canonicalDestination) {
    throw new Error("Tracked click destinations must be absolute HTTP(S) URLs");
  }
  return emailTrackingDigest(secret, "email-click-destination-v1", [
    normalizeTrackingId(trackingId),
    canonicalDestination,
  ]);
}
