import { BOARD_CANONICAL_URL } from "@/config/site";
import { resolveSafeCallbackUrl } from "@/lib/callback-url";

export const BOARD_EMAIL_LINK_LANDING_PATH = "/signin/email-link";
const BOARD_EMAIL_LINK_VERIFY_PATH = "/api/better-auth/magic-link/verify";
const MAX_CALLBACK_LENGTH = 2_048;

/** Better Auth currently generates 32-letter tokens. Accept bounded URL-safe
 * tokens without reflecting malformed query values into the verification URL. */
export function readBoardEmailLinkToken(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9_-]{16,256}$/.test(value)
    ? value
    : null;
}

/** Recover the original portal destination from the security callback used by
 * sign-in, while keeping authentication endpoints out of the continuation. */
export function resolveBoardEmailLinkCallback(value: unknown): string {
  let candidate = value;
  for (let depth = 0; depth < 4; depth += 1) {
    if (typeof candidate !== "string" || candidate.length > MAX_CALLBACK_LENGTH) return "/";
    const safePath = resolveSafeCallbackUrl(candidate);
    const parsed = new URL(safePath, BOARD_CANONICAL_URL);
    let pathname: string;
    try {
      pathname = decodeURIComponent(parsed.pathname).toLowerCase().replace(/\/+$/, "") || "/";
    } catch {
      return "/";
    }
    if (pathname === "/account/security") {
      const callbacks = parsed.searchParams.getAll("callbackUrl");
      candidate = callbacks.length === 1 ? callbacks[0] : null;
      continue;
    }
    if (/^\/(?:signin|api)(?:\/|$)/.test(pathname)) return "/";
    return safePath;
  }
  return "/";
}

/** The email contains only this non-consuming landing URL. Its origin and
 * source endpoint must match the app's configured Better Auth URL. */
export function buildBoardEmailLinkLandingUrl(verificationUrl: string, baseUrl: string): string {
  const base = new URL(baseUrl);
  const verification = new URL(verificationUrl);
  const tokens = verification.searchParams.getAll("token");
  const token = tokens.length === 1 ? readBoardEmailLinkToken(tokens[0]) : null;
  if (!/^https?:$/.test(base.protocol) || verification.origin !== base.origin ||
    verification.username || verification.password || verification.hash ||
    verification.pathname !== BOARD_EMAIL_LINK_VERIFY_PATH || !token) {
    throw new Error("Invalid Board email sign-in link.");
  }
  const callbacks = verification.searchParams.getAll("callbackURL");
  const callback = resolveBoardEmailLinkCallback(callbacks.length === 1 ? callbacks[0] : null);
  const landing = new URL(BOARD_EMAIL_LINK_LANDING_PATH, base.origin);
  landing.searchParams.set("token", token);
  landing.searchParams.set("callbackUrl", callback);
  return landing.toString();
}

/** Called only by the explicit Continue action, never during server rendering,
 * navigation prefetch, or an effect. The endpoint is always same-origin. */
export function buildBoardEmailLinkVerificationPath(tokenValue: unknown, callbackValue: unknown): string | null {
  const token = readBoardEmailLinkToken(tokenValue);
  if (!token) return null;
  const callback = encodeURIComponent(resolveBoardEmailLinkCallback(callbackValue));
  const success = `/account/security?callbackUrl=${callback}`;
  const error = `/signin?callbackUrl=${callback}`;
  // Better Auth decodes callback strings once after parsing the query. Encode
  // the complete callback here so nested query parameters survive that decode.
  const params = new URLSearchParams({
    token,
    callbackURL: encodeURIComponent(success),
    errorCallbackURL: encodeURIComponent(error),
  });
  return `${BOARD_EMAIL_LINK_VERIFY_PATH}?${params.toString()}`;
}
