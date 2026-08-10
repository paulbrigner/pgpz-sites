import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { resolveSigningSecret } from "@pgpz/core";

const DEVELOPMENT_ONLY_SECRET = "pgpz-email-tracking-development-only";
const EMAIL_SIGNATURE_VERSION = "h1";

export type EmailTrackingSecrets = Readonly<{
  currentSecret: string;
  previousSecret?: string | null;
}>;

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
  return (
    actualBytes.length === expectedBytes.length &&
    timingSafeEqual(actualBytes, expectedBytes)
  );
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
    const secret = secrets.find(
      (candidate) => secretKeyId(candidate) === keyId,
    );
    return (
      !!secret && signaturesMatch(digest, rawHmac(secret, purpose, values))
    );
  }

  return secrets.some((secret) =>
    signaturesMatch(signature, rawHmac(secret, purpose, values)),
  );
}

export function emailTrackingDigest(
  secret: string,
  purpose: string,
  values: string[],
) {
  return createHmac("sha256", secret)
    .update(JSON.stringify([purpose, ...values]))
    .digest("hex");
}

export function emailTrackingDigestCandidates(
  secrets: EmailTrackingSecrets,
  purpose: string,
  values: string[],
) {
  return [secrets.currentSecret, secrets.previousSecret]
    .filter((secret): secret is string => !!secret)
    .map((secret) => emailTrackingDigest(secret, purpose, values));
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

export function createEmailLinkSecurity(secrets: EmailTrackingSecrets) {
  const sign = (purpose: string, values: string[]) =>
    signEmailTrackingValues({
      secret: secrets.currentSecret,
      purpose,
      values,
    });
  const verify = (
    signature: string | null | undefined,
    purpose: string,
    values: string[],
  ) =>
    verifyEmailTrackingValues({
      signature,
      currentSecret: secrets.currentSecret,
      previousSecret: secrets.previousSecret,
      purpose,
      values,
    });

  const signTrackedClickDestination = (
    trackingId: string,
    destination: string,
  ) => {
    const canonicalDestination = safeHttpDestination(destination);
    if (!canonicalDestination) {
      throw new Error(
        "Tracked click destinations must be absolute HTTP(S) URLs",
      );
    }
    return sign("email-click-v1", [trackingId, canonicalDestination]);
  };

  return {
    emailTrackingDigest: (purpose: string, values: string[]) =>
      emailTrackingDigest(secrets.currentSecret, purpose, values),
    emailTrackingDigestCandidates: (purpose: string, values: string[]) =>
      emailTrackingDigestCandidates(secrets, purpose, values),
    signTrackedClickDestination,
    verifyTrackedClickDestination({
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
        verify(signature, "email-click-v1", [trackingId, canonicalDestination])
      );
    },
    buildTrackedClickUrl(
      baseUrl: string,
      trackingId: string,
      destination: string,
    ) {
      const canonicalDestination = safeHttpDestination(destination);
      if (!canonicalDestination) {
        throw new Error(
          "Tracked click destinations must be absolute HTTP(S) URLs",
        );
      }
      const url = new URL(
        `/api/email/click/${encodeURIComponent(trackingId)}`,
        baseUrl,
      );
      url.searchParams.set("url", canonicalDestination);
      url.searchParams.set(
        "sig",
        signTrackedClickDestination(trackingId, canonicalDestination),
      );
      return url.toString();
    },
    signPolicyUpdateEmailAsset(
      materializationId: string,
      slug: string,
      asset: string,
    ) {
      return sign("policy-update-email-asset-v2", [
        materializationId,
        slug,
        asset,
      ]);
    },
    verifyPolicyUpdateEmailAsset({
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
      return verify(signature, "policy-update-email-asset-v2", [
        materializationId,
        slug,
        asset,
      ]);
    },
    buildPolicyUpdateEmailAssetPath(
      slug: string,
      asset: string,
      materializationId: string,
    ) {
      const signature = sign("policy-update-email-asset-v2", [
        materializationId,
        slug,
        asset,
      ]);
      return `/api/policy-updates/${encodeURIComponent(slug)}/email-assets/${encodeURIComponent(asset)}?v=${encodeURIComponent(materializationId)}&sig=${encodeURIComponent(signature)}`;
    },
  };
}

export function listUnsubscribeHeaders(
  unsubscribeUrl: string | null | undefined,
) {
  if (!unsubscribeUrl) return undefined;
  return {
    "List-Unsubscribe": `<${unsubscribeUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}
