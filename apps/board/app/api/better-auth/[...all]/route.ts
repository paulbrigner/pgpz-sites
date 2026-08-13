import { toNextJsHandler } from "better-auth/next-js";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { anonymousClaimedActor, auditBestEffort, authenticatedActor } from "@/lib/audit";
import { sanitizeClaimedEmail, shouldRecordFailureAudit } from "@/lib/failed-signin-audit";
import { boardPasskeySessionCookieOptions, boardStepUpCookieOptions, BOARD_PASSKEY_SESSION_COOKIE, BOARD_STEP_UP_COOKIE, createBoardStepUpToken } from "@/lib/passkey-step-up";
import { getBoardPasskeyCount, markBoardPasskeyEnrolled } from "@/lib/passkey-enrollment";
import { hasRecentBoardPasskeyVerification } from "@/lib/passkey-step-up";
import { sendBoardPasskeySecurityNotice } from "@/lib/passkey-notification";

export const dynamic = "force-dynamic";

const handlers = toNextJsHandler(auth);

/** Best-effort client identity for audit throttling (first X-Forwarded-For hop). */
function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const firstHop = forwarded.split(",")[0]?.trim();
    if (firstHop && !/[\x00-\x1f\x7f]/.test(firstHop)) return firstHop;
  }
  return "unknown";
}

/** Bounded read of only the claimed email from a sign-in body (never the
 * password). Used for failed-sign-in attribution; the handler gets the
 * original unconsumed request. */
async function extractClaimedEmail(request: NextRequest): Promise<string | null> {
  try {
    const cloned = request.clone();
    const body = (await cloned.json()) as { email?: unknown };
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    return email || null;
  } catch {
    return null;
  }
}

function pathOf(request: NextRequest): string {
  return new URL(request.url).pathname;
}

export async function POST(request: NextRequest) {
  const path = pathOf(request);

  if (path.endsWith("/passkey/delete-passkey") || path.endsWith("/passkey/update-passkey")) {
    const session = await auth.api.getSession({ headers: request.headers, query: { disableRefresh: true } }).catch(() => null);
    const userId = typeof session?.user?.id === "string" ? session.user.id : "";
    if (!userId) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    if (!(await hasRecentBoardPasskeyVerification(request.headers, userId))) {
      return NextResponse.json({ error: "Verify a passkey to continue.", code: "PASSKEY_STEP_UP_REQUIRED" }, { status: 428 });
    }
    if (path.endsWith("/passkey/delete-passkey")) {
      const count = await getBoardPasskeyCount(userId);
      if (count === null) return NextResponse.json({ error: "Unable to verify passkey enrollment." }, { status: 503 });
      if (count <= 1) return NextResponse.json({ error: "Add another passkey before removing your only passkey." }, { status: 409 });
    }
  }

  // Never disclose whether the email maps to a Board account or whether the
  // provider accepted the message. Delivery success/failure is retained in the
  // private audit ledger by sendBoardMagicLink.
  if (path.endsWith("/sign-in/magic-link")) {
    const response = await handlers.POST(request);
    if (response.status >= 400) {
      return NextResponse.json({ status: true }, { status: 200 });
    }
    return response;
  }

  // Failed email/password sign-in: attribute via the claimed email only.
  if (path.endsWith("/sign-in/email")) {
    const claimedEmail = await extractClaimedEmail(request);
    const response = await handlers.POST(request);
    if (response.status >= 400 && claimedEmail) {
      // The ledger is append-only, so bound both what value we echo and how often
      // we write: only a plausible, bounded email is recorded as the "claimed"
      // identity, and repeated failures for the same client+email are coalesced.
      const sanitized = sanitizeClaimedEmail(claimedEmail);
      if (sanitized && shouldRecordFailureAudit(`${clientIp(request)}|${sanitized}`)) {
        await auditBestEffort({
          category: "authentication",
          action: "sign_in",
          outcome: "failure",
          reason: "invalid_sign_in",
          actor: anonymousClaimedActor(sanitized),
        });
      }
    }
    return response;
  }

  // Sign-out: capture the authenticated actor before the session is invalidated.
  if (path.endsWith("/sign-out")) {
    const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
    const user = session?.user;
    const email = typeof user?.email === "string" ? user.email.trim().toLowerCase() : "";
    const response = await handlers.POST(request);
    if (typeof user?.id === "string" && email) {
      await auditBestEffort({
        category: "authentication",
        action: "sign_out",
        outcome: "success",
        actor: authenticatedActor({
          id: String(user.id),
          email,
          role: "member",
          isAdmin: false,
        }),
        requestId: request.headers.get("x-request-id") ?? undefined,
      });
    }
    return response;
  }

  if (
    path.endsWith("/passkey/verify-authentication") ||
    path.endsWith("/passkey/verify-registration") ||
    path.endsWith("/passkey/delete-passkey") ||
    path.endsWith("/passkey/update-passkey")
  ) {
    const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
    const response = await handlers.POST(request);
    const user = session?.user;
    const email = typeof user?.email === "string" ? user.email.trim().toLowerCase() : "";
    if (response.ok && path.endsWith("/passkey/verify-authentication")) {
      const payload = await response.clone().json().catch(() => null) as { session?: { id?: unknown }; user?: { id?: unknown } } | null;
      const sessionId = typeof payload?.session?.id === "string" ? payload.session.id : "";
      const responseUserId = typeof payload?.user?.id === "string" ? payload.user.id : "";
      if (sessionId && responseUserId) {
        const secured = new NextResponse(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
        secured.cookies.set(
          BOARD_STEP_UP_COOKIE,
          createBoardStepUpToken({ userId: responseUserId, sessionId, verifiedAt: Date.now() }),
          boardStepUpCookieOptions(),
        );
        secured.cookies.set(
          BOARD_PASSKEY_SESSION_COOKIE,
          createBoardStepUpToken({ userId: responseUserId, sessionId, verifiedAt: Date.now() }),
          boardPasskeySessionCookieOptions(),
        );
        return secured;
      }
    }
    if (response.ok && typeof user?.id === "string" && email) {
      const action = path.endsWith("verify-registration")
        ? "passkey_registered"
        : path.endsWith("delete-passkey")
          ? "passkey_removed"
          : "passkey_updated";
      await auditBestEffort({
        category: "account",
        action,
        outcome: "success",
        actor: authenticatedActor({ id: user.id, email, role: "member", isAdmin: false }),
      });
      if (action === "passkey_registered") {
        await markBoardPasskeyEnrolled(user.id).catch((error) => {
          console.error("[board] passkey enrollment marker failed", error);
        });
        await sendBoardPasskeySecurityNotice(email, "registered");
      }
      if (action === "passkey_removed") await sendBoardPasskeySecurityNotice(email, "removed");
    }
    return response;
  }

  return handlers.POST(request);
}

export async function GET(request: NextRequest) {
  if (pathOf(request).endsWith("/passkey/generate-register-options")) {
    const session = await auth.api.getSession({ headers: request.headers, query: { disableRefresh: true } }).catch(() => null);
    const userId = typeof session?.user?.id === "string" ? session.user.id : "";
    if (!userId) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const count = await getBoardPasskeyCount(userId);
    if (count === null) return NextResponse.json({ error: "Unable to verify passkey enrollment." }, { status: 503 });
    if (count > 0 && !(await hasRecentBoardPasskeyVerification(request.headers, userId))) {
      return NextResponse.json({ error: "Verify a passkey before adding another.", code: "PASSKEY_STEP_UP_REQUIRED" }, { status: 428 });
    }
  }
  return handlers.GET(request);
}
export const PATCH = handlers.PATCH;
export const PUT = handlers.PUT;
export const DELETE = handlers.DELETE;
