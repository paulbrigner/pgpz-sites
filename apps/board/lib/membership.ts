import "server-only";

import type { MembershipAdapter, MembershipSubject } from "@pgpz/core/server";

export function normalizeBoardEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/**
 * Parses the BOARD_MEMBER_EMAILS allowlist. Accepts commas, whitespace, or
 * newlines as separators and normalizes every address to lowercase.
 */
export function parseBoardMemberEmails(value: string | undefined): ReadonlySet<string> {
  const emails = new Set<string>();
  for (const raw of (value || "").split(/[\s,]+/)) {
    const email = normalizeBoardEmail(raw);
    if (email) emails.add(email);
  }
  return emails;
}

/**
 * Membership is decided outside the application by the BOARD_MEMBER_EMAILS
 * allowlist. An empty allowlist resolves every subject as inactive, so an
 * unset variable locks the portal closed instead of opening it.
 */
export function createBoardMembershipAdapter(
  env: Readonly<Record<string, string | undefined>>,
): MembershipAdapter {
  const allowlist = parseBoardMemberEmails(env.BOARD_MEMBER_EMAILS);

  return {
    mode: "externally-managed",
    async resolve(subject: MembershipSubject) {
      const email = normalizeBoardEmail(subject.email);
      const active = allowlist.size > 0 && allowlist.has(email);
      return {
        active,
        reason: active
          ? "Email is on the current PGPZ Board roster."
          : "Email is not on the current PGPZ Board roster.",
        ...(active ? { attributes: { source: "board-roster" } } : {}),
      };
    },
  };
}
