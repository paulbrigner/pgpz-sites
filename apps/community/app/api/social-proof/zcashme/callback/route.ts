import { NextRequest, NextResponse } from "next/server";
import { resolveAppSession } from "@/lib/app-session";
import { SITE_URL, ZCASHME_API_TIMEOUT_MS, ZCASHME_AUTH_ISSUER } from "@/lib/config";
import { SocialProofError, verifyZcashMeDryRun, verifyZcashMeProof } from "@/lib/social-proof";
import { getZcashMeAccess } from "@/lib/zcashme-access";
import {
  decodeZcashMeOidcAttempt,
  zcashMeCallbackUrl,
  ZCASHME_OIDC_COOKIE,
} from "@/lib/zcashme-oidc";

export const dynamic = "force-dynamic";

function redirectHome(result: "verified" | "dry-run-verified" | "error") {
  const url = new URL(SITE_URL);
  url.searchParams.set("zcashme", result);
  return NextResponse.redirect(url);
}

async function fetchZcashMeAuth(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ZCASHME_API_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, cache: "no-store", signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function clearAttemptCookie(response: NextResponse) {
  response.cookies.set(ZCASHME_OIDC_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/social-proof/zcashme/callback",
    maxAge: 0,
  });
  return response;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const attempt = decodeZcashMeOidcAttempt(request.cookies.get(ZCASHME_OIDC_COOKIE)?.value);

  if (!code || !state || !attempt || state !== attempt.state) {
    return clearAttemptCookie(redirectHome("error"));
  }

  try {
    const session = await resolveAppSession(request.headers);
    const userId = session?.user?.id;
    if (!userId) throw new SocialProofError("Your PGPZ session expired. Please sign in and try again.", 401);
    if (attempt.userId !== userId) {
      throw new SocialProofError("This ZcashMe verification belongs to a different PGPZ account.", 403);
    }
    const access = getZcashMeAccess(session.user);
    if (attempt.mode === "admin_dry_run" ? !access.canAdminDryRun : !access.canActivate) {
      throw new SocialProofError("This ZcashMe verification mode is no longer enabled for your account.", 403);
    }

    const tokenResponse = await fetchZcashMeAuth(`${ZCASHME_AUTH_ISSUER}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: "pgpz",
        code,
        redirect_uri: zcashMeCallbackUrl(),
        code_verifier: attempt.codeVerifier,
      }),
    });
    const token = await tokenResponse.json().catch(() => null) as { access_token?: unknown } | null;
    if (!tokenResponse.ok || typeof token?.access_token !== "string") {
      throw new Error("ZcashMe could not complete the authorization exchange.");
    }

    const profileResponse = await fetchZcashMeAuth(`${ZCASHME_AUTH_ISSUER}/me`, {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    const profile = await profileResponse.json().catch(() => null) as { sub?: unknown; username?: unknown } | null;
    if (!profileResponse.ok || typeof profile?.sub !== "string" || typeof profile?.username !== "string") {
      throw new Error("ZcashMe did not return an authenticated profile.");
    }

    if (attempt.mode === "admin_dry_run") {
      await verifyZcashMeDryRun({ username: profile.username, challenge: attempt.challenge });
      return clearAttemptCookie(redirectHome("dry-run-verified"));
    }

    await verifyZcashMeProof(userId, {
      username: profile.username,
      expectedChallenge: attempt.challenge,
    });
    return clearAttemptCookie(redirectHome("verified"));
  } catch (error) {
    console.error("ZcashMe assisted membership verification failed", error);
    return clearAttemptCookie(redirectHome("error"));
  }
}
