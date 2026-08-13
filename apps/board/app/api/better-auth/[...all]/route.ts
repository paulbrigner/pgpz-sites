import { toNextJsHandler } from "better-auth/next-js";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { anonymousClaimedActor, auditBestEffort, authenticatedActor } from "@/lib/audit";
import { sanitizeClaimedEmail, shouldRecordFailureAudit } from "@/lib/failed-signin-audit";

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
    path.endsWith("/passkey/verify-registration") ||
    path.endsWith("/passkey/delete-passkey") ||
    path.endsWith("/passkey/update-passkey")
  ) {
    const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
    const response = await handlers.POST(request);
    const user = session?.user;
    const email = typeof user?.email === "string" ? user.email.trim().toLowerCase() : "";
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
    }
    return response;
  }

  return handlers.POST(request);
}

export const GET = handlers.GET;
export const PATCH = handlers.PATCH;
export const PUT = handlers.PUT;
export const DELETE = handlers.DELETE;
