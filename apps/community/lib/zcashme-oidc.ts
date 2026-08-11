import crypto from "node:crypto";
import { BETTER_AUTH_SECRET, SITE_URL, ZCASHME_AUTH_ISSUER } from "@/lib/config";

export const ZCASHME_OIDC_COOKIE = "pgpz_zcashme_oidc";
const CALLBACK_PATH = "/api/social-proof/zcashme/callback";

export type ZcashMeOidcAttempt = {
  userId: string;
  state: string;
  codeVerifier: string;
  challenge: string;
  mode: "activation" | "admin_dry_run";
  issuedAt: number;
};

const ATTEMPT_MAX_AGE_MS = 10 * 60 * 1000;
const CHALLENGE_PATTERN = /^PGPZ-[0-9A-F]{10}$/;

const base64UrlSha256 = (value: string) =>
  crypto.createHash("sha256").update(value).digest("base64url");

export function createZcashMeAuthorization(
  userId: string,
  label: string,
  mode: ZcashMeOidcAttempt["mode"] = "activation",
) {
  const attempt: ZcashMeOidcAttempt = {
    userId,
    state: crypto.randomBytes(32).toString("base64url"),
    codeVerifier: crypto.randomBytes(32).toString("base64url"),
    challenge: label,
    mode,
    issuedAt: Date.now(),
  };
  const redirectUri = `${SITE_URL}${CALLBACK_PATH}`;
  const url = new URL(`${ZCASHME_AUTH_ISSUER}/auth`);
  url.search = new URLSearchParams({
    client_id: "pgpz",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid profile",
    state: attempt.state,
    code_challenge: base64UrlSha256(attempt.codeVerifier),
    code_challenge_method: "S256",
    label,
  }).toString();

  return { attempt, authorizationUrl: url.toString(), redirectUri };
}

const signingSecret = (secret: string | undefined) => {
  if (!secret?.trim()) throw new Error("BETTER_AUTH_SECRET is required for ZcashMe verification.");
  return crypto.createHash("sha256").update(`pgpz-zcashme-oidc-v1\n${secret}`).digest();
};

const signatureFor = (payload: string, secret: string | undefined) =>
  crypto.createHmac("sha256", signingSecret(secret)).update(payload).digest("base64url");

export function encodeZcashMeOidcAttempt(
  attempt: ZcashMeOidcAttempt,
  secret: string | undefined = BETTER_AUTH_SECRET,
) {
  const payload = Buffer.from(JSON.stringify(attempt)).toString("base64url");
  return `${payload}.${signatureFor(payload, secret)}`;
}

export function decodeZcashMeOidcAttempt(
  value: string | undefined,
  secret: string | undefined = BETTER_AUTH_SECRET,
): ZcashMeOidcAttempt | null {
  if (!value) return null;
  try {
    const [payload, suppliedSignature, extra] = value.split(".");
    if (!payload || !suppliedSignature || extra) return null;
    const expectedSignature = signatureFor(payload, secret);
    const supplied = Buffer.from(suppliedSignature, "base64url");
    const expected = Buffer.from(expectedSignature, "base64url");
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return null;

    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof parsed.userId !== "string" ||
      typeof parsed.state !== "string" ||
      parsed.state.length < 32 ||
      typeof parsed.codeVerifier !== "string" ||
      parsed.codeVerifier.length < 32 ||
      typeof parsed.challenge !== "string" ||
      !CHALLENGE_PATTERN.test(parsed.challenge) ||
      !["activation", "admin_dry_run"].includes(parsed.mode) ||
      typeof parsed.issuedAt !== "number" ||
      !Number.isFinite(parsed.issuedAt) ||
      parsed.issuedAt > Date.now() + 60_000 ||
      Date.now() - parsed.issuedAt > ATTEMPT_MAX_AGE_MS
    ) {
      return null;
    }
    return parsed as ZcashMeOidcAttempt;
  } catch {
    return null;
  }
}

export function zcashMeCallbackUrl() {
  return `${SITE_URL}${CALLBACK_PATH}`;
}
