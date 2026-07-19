import { createHash, createHmac, timingSafeEqual } from "crypto";
import { resolveSigningSecret } from "@pgpz/core";
import {
  BETTER_AUTH_SECRET,
  EMAIL_TRACKING_SECRET,
  EMAIL_TRACKING_SECRET_PREVIOUS,
} from "@/lib/config";

const DEVELOPMENT_ONLY_SECRET = "pgpz-email-tracking-development-only";
const EMAIL_SIGNATURE_VERSION = "h1";

export function resolveEmailTrackingSecret({
  emailTrackingSecret,
  fallbackSecret,
  nodeEnv,
}: {
  emailTrackingSecret?: string | null;
  fallbackSecret?: string | null;
  nodeEnv?: string | null;
}) {
  return (
    resolveSigningSecret({
      name: "EMAIL_TRACKING_SECRET",
      value: emailTrackingSecret,
      nodeEnv,
    }) ||
    resolveSigningSecret({
      name: "local email-tracking fallback",
      value: fallbackSecret,
      nodeEnv,
      requiredInProduction: false,
    }) ||
    DEVELOPMENT_ONLY_SECRET
  );
}

export function getEmailTrackingSecret() {
  return resolveEmailTrackingSecret({
    emailTrackingSecret: EMAIL_TRACKING_SECRET,
    fallbackSecret: BETTER_AUTH_SECRET,
    nodeEnv: process.env.NODE_ENV,
  });
}

export function resolveEmailTrackingSecrets({
  currentSecret,
  previousSecret,
  fallbackSecret,
  nodeEnv,
}: {
  currentSecret?: string | null;
  previousSecret?: string | null;
  fallbackSecret?: string | null;
  nodeEnv?: string | null;
}) {
  const current = resolveEmailTrackingSecret({
    emailTrackingSecret: currentSecret,
    fallbackSecret,
    nodeEnv,
  });
  const previous = resolveSigningSecret({
    name: "EMAIL_TRACKING_SECRET_PREVIOUS",
    value: previousSecret,
    nodeEnv,
    requiredInProduction: false,
  });
  if (previous && previous === current) {
    throw new Error(
      "EMAIL_TRACKING_SECRET_PREVIOUS must differ from EMAIL_TRACKING_SECRET",
    );
  }
  return { current, previous };
}

export function getEmailTrackingSecrets() {
  return resolveEmailTrackingSecrets({
    currentSecret: EMAIL_TRACKING_SECRET,
    previousSecret: EMAIL_TRACKING_SECRET_PREVIOUS,
    fallbackSecret: BETTER_AUTH_SECRET,
    nodeEnv: process.env.NODE_ENV,
  });
}

function rawHmac(secret: string, purpose: string, values: string[]) {
  return createHmac("sha256", secret)
    .update(JSON.stringify([purpose, ...values]))
    .digest("base64url");
}

function secretKeyId(secret: string) {
  return createHash("sha256").update(secret).digest("base64url").slice(0, 12);
}

function signaturesMatch(actual: string | null | undefined, expected: string) {
  if (!actual) return false;
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

export function signEmailTrackingValues({
  secret,
  purpose,
  values,
}: {
  secret: string;
  purpose: string;
  values: string[];
}) {
  return `${EMAIL_SIGNATURE_VERSION}.${secretKeyId(secret)}.${rawHmac(secret, purpose, values)}`;
}

export function verifyEmailTrackingValues({
  signature,
  currentSecret,
  previousSecret,
  purpose,
  values,
}: {
  signature: string | null | undefined;
  currentSecret: string;
  previousSecret?: string | null;
  purpose: string;
  values: string[];
}) {
  if (!signature || signature.length > 256) return false;
  const secrets = [currentSecret, previousSecret].filter(
    (secret): secret is string => !!secret,
  );
  const parts = signature.split(".");

  if (parts[0] === EMAIL_SIGNATURE_VERSION) {
    if (parts.length !== 3) return false;
    const [, keyId, digest] = parts;
    const secret = secrets.find((candidate) => secretKeyId(candidate) === keyId);
    return !!secret && signaturesMatch(digest, rawHmac(secret, purpose, values));
  }

  // Signatures emitted before key identifiers were introduced were raw HMACs.
  return secrets.some((secret) =>
    signaturesMatch(signature, rawHmac(secret, purpose, values)),
  );
}

function signatureFor(purpose: string, values: string[]) {
  return signEmailTrackingValues({
    secret: getEmailTrackingSecret(),
    purpose,
    values,
  });
}

function verifySignature(
  signature: string | null | undefined,
  purpose: string,
  values: string[],
) {
  const { current, previous } = getEmailTrackingSecrets();
  return verifyEmailTrackingValues({
    signature,
    currentSecret: current,
    previousSecret: previous,
    purpose,
    values,
  });
}

export function emailTrackingDigest(purpose: string, values: string[]) {
  return createHmac("sha256", getEmailTrackingSecret())
    .update(JSON.stringify([purpose, ...values]))
    .digest("hex");
}

export function emailTrackingDigestCandidates(purpose: string, values: string[]) {
  const { current, previous } = getEmailTrackingSecrets();
  return [current, previous]
    .filter((secret): secret is string => !!secret)
    .map((secret) =>
      createHmac("sha256", secret)
        .update(JSON.stringify([purpose, ...values]))
        .digest("hex"),
    );
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
  return !!canonicalDestination && verifySignature(
    signature,
    "email-click-v1",
    [trackingId, canonicalDestination],
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
  return verifySignature(
    signature,
    "policy-update-email-asset-v2",
    [materializationId, slug, asset],
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
