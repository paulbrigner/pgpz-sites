import { createHmac, timingSafeEqual } from "crypto";
import {
  BETTER_AUTH_SECRET,
  EMAIL_TRACKING_SECRET,
  NEXTAUTH_SECRET,
} from "@/lib/config";

const DEVELOPMENT_ONLY_SECRET = "pgpz-email-tracking-development-only";

export function resolveEmailTrackingSecret({
  emailTrackingSecret,
  fallbackSecret,
  nodeEnv,
}: {
  emailTrackingSecret?: string | null;
  fallbackSecret?: string | null;
  nodeEnv?: string | null;
}) {
  const configured = emailTrackingSecret?.trim();
  if (configured) return configured;

  if (nodeEnv === "production") {
    throw new Error("EMAIL_TRACKING_SECRET is required in production");
  }

  return fallbackSecret?.trim() || DEVELOPMENT_ONLY_SECRET;
}

export function getEmailTrackingSecret() {
  return resolveEmailTrackingSecret({
    emailTrackingSecret: EMAIL_TRACKING_SECRET,
    fallbackSecret: BETTER_AUTH_SECRET || NEXTAUTH_SECRET,
    nodeEnv: process.env.NODE_ENV,
  });
}

function signatureFor(purpose: string, values: string[]) {
  return createHmac("sha256", getEmailTrackingSecret())
    .update(JSON.stringify([purpose, ...values]))
    .digest("base64url");
}

function signaturesMatch(actual: string | null | undefined, expected: string) {
  if (!actual) return false;
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

export function signTrackedClickDestination(trackingId: string, destination: string) {
  const canonicalDestination = safeHttpDestination(destination);
  if (!canonicalDestination) {
    throw new Error("Tracked click destinations must be absolute HTTP(S) URLs");
  }
  return signatureFor("email-click-v1", [trackingId, canonicalDestination]);
}

export function verifyTrackedClickDestination({
  trackingId,
  destination,
  signature,
}: {
  trackingId: string;
  destination: string;
  signature: string | null | undefined;
}) {
  const canonicalDestination = safeHttpDestination(destination);
  return (
    !!canonicalDestination &&
    signaturesMatch(
      signature,
      signTrackedClickDestination(trackingId, canonicalDestination),
    )
  );
}

export function buildTrackedClickUrl(baseUrl: string, trackingId: string, destination: string) {
  const canonicalDestination = safeHttpDestination(destination);
  if (!canonicalDestination) {
    throw new Error("Tracked click destinations must be absolute HTTP(S) URLs");
  }
  const url = new URL(`/api/email/click/${encodeURIComponent(trackingId)}`, baseUrl);
  url.searchParams.set("url", canonicalDestination);
  url.searchParams.set(
    "sig",
    signTrackedClickDestination(trackingId, canonicalDestination),
  );
  return url.toString();
}

export function safeHttpDestination(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function signPolicyUpdateEmailAsset(
  materializationId: string,
  slug: string,
  asset: string,
) {
  return signatureFor("policy-update-email-asset-v2", [materializationId, slug, asset]);
}

export function verifyPolicyUpdateEmailAsset({
  slug,
  asset,
  materializationId,
  signature,
}: {
  slug: string;
  asset: string;
  materializationId: string;
  signature: string | null | undefined;
}) {
  return signaturesMatch(
    signature,
    signPolicyUpdateEmailAsset(materializationId, slug, asset),
  );
}

export function buildPolicyUpdateEmailAssetPath(
  slug: string,
  asset: string,
  materializationId: string,
) {
  const signature = signPolicyUpdateEmailAsset(materializationId, slug, asset);
  return `/api/policy-updates/${encodeURIComponent(slug)}/email-assets/${encodeURIComponent(asset)}?v=${encodeURIComponent(materializationId)}&sig=${encodeURIComponent(signature)}`;
}

export function listUnsubscribeHeaders(unsubscribeUrl: string | null | undefined) {
  if (!unsubscribeUrl) return undefined;
  return {
    "List-Unsubscribe": `<${unsubscribeUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}
