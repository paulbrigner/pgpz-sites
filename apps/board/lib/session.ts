import "server-only";

import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import {
  resolveActiveMembership,
  type MembershipAdapter,
} from "@pgpz/core/server";
import { boardMembershipAdapter } from "@/config/server";
import { auth } from "@/lib/auth";
import { resolveSafeCallbackUrl } from "@/lib/callback-url";
import { auditBestEffort, authenticatedActor } from "@/lib/audit";

export type BoardRole = "member" | "admin" | "executive-director" | "legal-counsel";

export type BoardMember = Readonly<{
  /** Stable Better Auth user id, used for tamper-attributable audit events. */
  id: string;
  name: string;
  email: string;
  role: BoardRole;
  isAdmin: boolean;
}>;

/** Named governance capability helpers backed by the resolved role. New
 * privileged routes must use these instead of scattering raw `isAdmin` checks,
 * so a future change to the capability mapping is a one-line edit here. */
export function canManageBoardDocuments(member: BoardMember): boolean {
  return member.isAdmin;
}

export function canReviewBoardAudit(member: BoardMember): boolean {
  return member.isAdmin;
}

export type BoardMemberState =
  | { status: "anonymous" }
  | { status: "restricted"; email: string }
  | { status: "member"; member: BoardMember };

export type BoardSessionLike = Readonly<{
  user?: Readonly<{ id?: string; name?: string | null; email?: string | null }> | null;
} | null>;

export type BoardSessionResolver = (requestHeaders: Headers) => Promise<BoardSessionLike>;

const defaultSessionResolver: BoardSessionResolver = (requestHeaders) =>
  auth.api.getSession({
    headers: requestHeaders,
    query: { disableRefresh: true },
  }) as Promise<BoardSessionLike>;

/**
 * Resolves the request into one of three states: anonymous (no session),
 * restricted (signed in but not on the current board roster), or member
 * (signed in and on the roster). Membership is enforced from the
 * BOARD_MEMBER_EMAILS allowlist adapter, so an empty allowlist restricts every
 * account (fail closed).
 */
export async function resolveBoardMemberState(
  requestHeaders: Headers,
  options: {
    resolveSession?: BoardSessionResolver;
    membershipAdapter?: MembershipAdapter;
  } = {},
): Promise<BoardMemberState> {
  const resolveSession = options.resolveSession ?? defaultSessionResolver;
  const membershipAdapter = options.membershipAdapter ?? boardMembershipAdapter;

  const session = await resolveSession(requestHeaders);
  if (!session?.user) return { status: "anonymous" };
  const user = session.user;

  const email =
    typeof user.email === "string" ? user.email.trim().toLowerCase() : "";
  if (!email) return { status: "anonymous" };

  const membership = await resolveActiveMembership(membershipAdapter, { email });
  if (!membership.active) return { status: "restricted", email };

  const name =
    typeof user.name === "string" && user.name.trim()
      ? user.name.trim()
      : "Board member";
  const role: BoardRole =
    membership.attributes?.role === "admin" ||
    membership.attributes?.role === "executive-director" ||
    membership.attributes?.role === "legal-counsel"
      ? membership.attributes.role
      : "member";
  return {
    status: "member",
    member: {
      id: typeof user.id === "string" ? user.id : "",
      name,
      email,
      role,
      isAdmin: membership.attributes?.isAdmin === true,
    },
  };
}

/**
 * Server-only guard for private leaves. Redirects anonymous visitors to the
 * sign-in page with a validated local callback, returns null for
 * signed-in-but-not-on-roster requests (the portal layout renders the roster
 * notice), and returns the verified board member otherwise. Private pages
 * must call this before rendering or reading any private data so their
 * payloads never serialize for anonymous document or RSC requests.
 */
export async function requireBoardMember(callbackPath = "/"): Promise<BoardMember | null> {
  const state = await resolveBoardMemberState(await headers());
  if (state.status === "anonymous") {
    redirect(`/signin?callbackUrl=${encodeURIComponent(resolveSafeCallbackUrl(callbackPath))}`);
  }
  return state.status === "member" ? state.member : null;
}

/**
 * Server-only guard for administrator pages. Administrator status is derived
 * from BOARD_ADMIN_EMAILS after membership is confirmed, so an administrator
 * can never bypass the Board roster. Non-administrators receive a concealed
 * 404 response instead of learning about the privileged route surface.
 */
export async function requireBoardAdmin(callbackPath = "/admin"): Promise<BoardMember> {
  const member = await requireBoardMember(callbackPath);
  if (!member?.isAdmin) {
    if (member) {
      // Best-effort authorization-denial audit on the privileged route.
      await auditBestEffort({
        category: "authorization",
        action: "route_denied",
        outcome: "denied",
        reason: "admin_required",
        actor: authenticatedActor(member),
        target: { type: "route", id: callbackPath, version: null },
      });
    }
    notFound();
  }
  return member;
}
