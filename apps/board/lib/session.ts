import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  resolveActiveMembership,
  type MembershipAdapter,
} from "@pgpz/core/server";
import { boardMembershipAdapter } from "@/config/server";
import { auth } from "@/lib/auth";
import { resolveSafeCallbackUrl } from "@/lib/callback-url";

export type BoardMember = Readonly<{
  name: string;
  email: string;
}>;

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
  return { status: "member", member: { name, email } };
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
