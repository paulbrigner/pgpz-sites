import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { auth } from "@/lib/auth";
import { BETTER_AUTH_SECRET, SITE_URL } from "@/lib/config";

export const BOARD_STEP_UP_MAX_AGE_SECONDS = 10 * 60;
export const BOARD_PASSKEY_SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;
export const BOARD_STEP_UP_COOKIE = SITE_URL.startsWith("https://")
  ? "__Host-pgpz-board-step-up"
  : "pgpz-board-step-up";
export const BOARD_PASSKEY_SESSION_COOKIE = SITE_URL.startsWith("https://")
  ? "__Host-pgpz-board-passkey-session"
  : "pgpz-board-passkey-session";

type StepUpPayload = { userId: string; sessionId: string; verifiedAt: number };

function signingSecret() {
  return BETTER_AUTH_SECRET || "board-development-secret-never-use-in-production-0001";
}

function signature(value: string) {
  return createHmac("sha256", signingSecret()).update(value).digest("base64url");
}

export function createBoardStepUpToken(payload: StepUpPayload): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signature(encoded)}`;
}

export function verifyBoardStepUpToken(
  token: string | null | undefined,
  expected: { userId: string; sessionId: string; now?: number; maxAgeSeconds?: number },
): boolean {
  if (!token) return false;
  const [encoded, suppliedSignature, extra] = token.split(".");
  if (!encoded || !suppliedSignature || extra) return false;
  const expectedSignature = signature(encoded);
  const supplied = Buffer.from(suppliedSignature);
  const signed = Buffer.from(expectedSignature);
  if (supplied.length !== signed.length || !timingSafeEqual(supplied, signed)) return false;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as StepUpPayload;
    const now = expected.now ?? Date.now();
    return payload.userId === expected.userId &&
      payload.sessionId === expected.sessionId &&
      Number.isFinite(payload.verifiedAt) &&
      payload.verifiedAt <= now &&
      now - payload.verifiedAt <= (expected.maxAgeSeconds ?? BOARD_STEP_UP_MAX_AGE_SECONDS) * 1000;
  } catch {
    return false;
  }
}

function cookieValue(headers: Headers, cookieName: string): string | null {
  const cookie = headers.get("cookie") || "";
  for (const pair of cookie.split(";")) {
    const [name, ...value] = pair.trim().split("=");
    if (name === cookieName) return decodeURIComponent(value.join("="));
  }
  return null;
}

export async function hasRecentBoardPasskeyVerification(headers: Headers, userId: string): Promise<boolean> {
  const session = await auth.api.getSession({ headers, query: { disableRefresh: true } }).catch(() => null);
  const sessionId = typeof session?.session?.id === "string" ? session.session.id : "";
  return Boolean(sessionId && verifyBoardStepUpToken(cookieValue(headers, BOARD_STEP_UP_COOKIE), { userId, sessionId }));
}

export async function hasBoardPasskeySession(headers: Headers, userId: string): Promise<boolean> {
  const session = await auth.api.getSession({ headers, query: { disableRefresh: true } }).catch(() => null);
  const sessionId = typeof session?.session?.id === "string" ? session.session.id : "";
  return Boolean(sessionId && verifyBoardStepUpToken(cookieValue(headers, BOARD_PASSKEY_SESSION_COOKIE), {
    userId,
    sessionId,
    maxAgeSeconds: BOARD_PASSKEY_SESSION_MAX_AGE_SECONDS,
  }));
}

export function boardPasskeySessionCookieOptions() {
  return { ...boardStepUpCookieOptions(), maxAge: BOARD_PASSKEY_SESSION_MAX_AGE_SECONDS };
}

export function boardStepUpCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: SITE_URL.startsWith("https://"),
    path: "/",
    maxAge: BOARD_STEP_UP_MAX_AGE_SECONDS,
  };
}
