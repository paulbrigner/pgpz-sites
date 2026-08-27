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
import {
  roleCanAccessBoardAdministration,
  roleCanManageBoardDocuments,
  roleCanManageBoardMeetings,
  roleCanManageBoardUsers,
  roleCanPrepareBoardMeetings,
  roleCanReviewBoardAudit,
  roleCanSendBoardMeetingCommunications,
} from "@/lib/board-access";
import { hasBoardPasskey } from "@/lib/passkey-enrollment";
import { hasBoardPasskeySession } from "@/lib/passkey-step-up";

export type BoardRole =
  | "member"
  | "chair"
  | "board-support"
  | "admin"
  | "executive-director"
  | "legal-counsel";

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
  return roleCanManageBoardDocuments(member.role);
}

export function canReviewBoardAudit(member: BoardMember): boolean {
  return roleCanReviewBoardAudit(member.role);
}

/** User administration is deliberately narrower than document and audit
 * capabilities. Legal Counsel and Board Support must never inherit it merely
 * because they can access a subset of Board tools. */
export function canManageBoardUsers(member: BoardMember): boolean {
  return roleCanManageBoardUsers(member.role);
}

export function canManageBoardMeetings(member: BoardMember): boolean {
  return roleCanManageBoardMeetings(member.role);
}

export function canPrepareBoardMeetings(member: BoardMember): boolean {
  return roleCanPrepareBoardMeetings(member.role);
}

export function canSendBoardMeetingCommunications(member: BoardMember): boolean {
  return roleCanSendBoardMeetingCommunications(member.role);
}

export function canAccessBoardAdministration(member: BoardMember): boolean {
  return roleCanAccessBoardAdministration(member.role);
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
    membership.attributes?.role === "chair" ||
    membership.attributes?.role === "board-support" ||
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
  if (state.status !== "member") return null;
  if (callbackPath !== "/account/security") {
    const safeCallback = encodeURIComponent(resolveSafeCallbackUrl(callbackPath));
    if (!(await hasBoardPasskey(state.member.id))) redirect(`/account/security?enrollment=required&callbackUrl=${safeCallback}`);
    if (!(await hasBoardPasskeySession(await headers(), state.member.id))) redirect(`/account/security?verification=required&callbackUrl=${safeCallback}`);
  }
  return state.member;
}

/**
 * Server-only guard for Board administration pages. Capability status is
 * derived from the resolved role after membership is confirmed. Read-only
 * roles receive a concealed 404 instead of learning about privileged routes.
 */
export async function requireBoardAdministration(callbackPath = "/admin"): Promise<BoardMember> {
  const member = await requireBoardMember(callbackPath);
  if (!member || !canAccessBoardAdministration(member)) {
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
