import {
  createEmailLinkSecurity,
  listUnsubscribeHeaders,
  resolveEmailTrackingSecret,
  resolveEmailTrackingSecrets,
  safeHttpDestination,
  signEmailTrackingValues,
  verifyEmailTrackingValues,
} from "@pgpz/email-domain";
import {
  BETTER_AUTH_SECRET,
  EMAIL_TRACKING_SECRET,
  EMAIL_TRACKING_SECRET_PREVIOUS,
} from "@/lib/config";

export {
  listUnsubscribeHeaders,
  resolveEmailTrackingSecret,
  resolveEmailTrackingSecrets,
  safeHttpDestination,
  signEmailTrackingValues,
  verifyEmailTrackingValues,
};

export function getEmailTrackingSecret() {
  return resolveEmailTrackingSecret({
    emailTrackingSecret: EMAIL_TRACKING_SECRET,
    fallbackSecret: BETTER_AUTH_SECRET,
    nodeEnv: process.env.NODE_ENV,
  });
}

export function getEmailTrackingSecrets() {
  return resolveEmailTrackingSecrets({
    currentSecret: EMAIL_TRACKING_SECRET,
    previousSecret: EMAIL_TRACKING_SECRET_PREVIOUS,
    fallbackSecret: BETTER_AUTH_SECRET,
    nodeEnv: process.env.NODE_ENV,
  });
}

function emailLinkSecurity() {
  const { current, previous } = getEmailTrackingSecrets();
  return createEmailLinkSecurity({
    currentSecret: current,
    previousSecret: previous,
  });
}

export function emailTrackingDigest(purpose: string, values: string[]) {
  return emailLinkSecurity().emailTrackingDigest(purpose, values);
}

export function emailTrackingDigestCandidates(purpose: string, values: string[]) {
  return emailLinkSecurity().emailTrackingDigestCandidates(purpose, values);
}

export function signTrackedClickDestination(trackingId: string, destination: string) {
  return emailLinkSecurity().signTrackedClickDestination(trackingId, destination);
}

export function verifyTrackedClickDestination(
  input: Parameters<ReturnType<typeof emailLinkSecurity>["verifyTrackedClickDestination"]>[0],
) {
  return emailLinkSecurity().verifyTrackedClickDestination(input);
}

export function buildTrackedClickUrl(baseUrl: string, trackingId: string, destination: string) {
  return emailLinkSecurity().buildTrackedClickUrl(baseUrl, trackingId, destination);
}

export function signPolicyUpdateEmailAsset(
  materializationId: string,
  slug: string,
  asset: string,
) {
  return emailLinkSecurity().signPolicyUpdateEmailAsset(materializationId, slug, asset);
}

export function verifyPolicyUpdateEmailAsset(
  input: Parameters<ReturnType<typeof emailLinkSecurity>["verifyPolicyUpdateEmailAsset"]>[0],
) {
  return emailLinkSecurity().verifyPolicyUpdateEmailAsset(input);
}

export function buildPolicyUpdateEmailAssetPath(
  slug: string,
  asset: string,
  materializationId: string,
) {
  return emailLinkSecurity().buildPolicyUpdateEmailAssetPath(slug, asset, materializationId);
}
