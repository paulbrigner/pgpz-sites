import crypto from "node:crypto";
import { SITE_URL, ZCASHME_AUTH_ISSUER } from "@/lib/config";

export const ZCASHME_OIDC_COOKIE = "pgpz_zcashme_oidc";
const CALLBACK_PATH = "/api/social-proof/zcashme/callback";

export type ZcashMeOidcAttempt = {
  userId: string;
  state: string;
  codeVerifier: string;
};

const base64UrlSha256 = (value: string) =>
  crypto.createHash("sha256").update(value).digest("base64url");

export function createZcashMeAuthorization(userId: string, label: string) {
  const attempt: ZcashMeOidcAttempt = {
    userId,
    state: crypto.randomBytes(32).toString("base64url"),
    codeVerifier: crypto.randomBytes(32).toString("base64url"),
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

export function encodeZcashMeOidcAttempt(attempt: ZcashMeOidcAttempt) {
  return Buffer.from(JSON.stringify(attempt)).toString("base64url");
}

export function decodeZcashMeOidcAttempt(value: string | undefined): ZcashMeOidcAttempt | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof parsed.userId !== "string" ||
      typeof parsed.state !== "string" ||
      typeof parsed.codeVerifier !== "string"
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
