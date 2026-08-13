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

export function parseBoardAdminEmails(value: string | undefined): ReadonlySet<string> {
  return parseBoardMemberEmails(value);
}

/**
 * Parses the BOARD_EXECUTIVE_DIRECTOR_EMAILS allowlist. Executive directors
 * are staff — not directors — so this roster must stay disjoint from the
 * Board roster while still granting portal access and administrator
 * privileges.
 */
export function parseBoardExecutiveDirectorEmails(
  value: string | undefined,
): ReadonlySet<string> {
  return parseBoardMemberEmails(value);
}

/**
 * Parses the BOARD_LEGAL_COUNSEL_EMAILS allowlist. Legal counsel is a staff
 * role with document-management and audit-review privileges but no user
 * management: it
 * must stay pairwise disjoint from the Board and Executive Director rosters
 * while still granting portal access and the named governance capabilities.
 */
export function parseBoardLegalCounselEmails(
  value: string | undefined,
): ReadonlySet<string> {
  return parseBoardMemberEmails(value);
}

/**
 * Membership is decided outside the application by the BOARD_MEMBER_EMAILS
 * allowlist. An empty allowlist resolves every subject as inactive, so an
 * unset variable locks the portal closed instead of opening it.
 *
 * The Executive Director and Legal Counsel are distinct, non-director staff
 * roles: emails on their allowlists gain their named portal capabilities
 * without joining the Board roster, and configuration fails fast
 * if any of the three rosters overlap.
 */
export function createBoardMembershipAdapter(
  env: Readonly<Record<string, string | undefined>>,
): MembershipAdapter {
  const allowlist = parseBoardMemberEmails(env.BOARD_MEMBER_EMAILS);
  const adminAllowlist = parseBoardAdminEmails(env.BOARD_ADMIN_EMAILS);
  const executiveDirectorAllowlist = parseBoardExecutiveDirectorEmails(
    env.BOARD_EXECUTIVE_DIRECTOR_EMAILS,
  );
  const legalCounselAllowlist = parseBoardLegalCounselEmails(
    env.BOARD_LEGAL_COUNSEL_EMAILS,
  );
  const orphanedAdmins = [...adminAllowlist].filter((email) => !allowlist.has(email));
  if (orphanedAdmins.length > 0) {
    throw new Error(
      `BOARD_ADMIN_EMAILS must be a subset of BOARD_MEMBER_EMAILS: ${orphanedAdmins.join(", ")}`,
    );
  }

  // Each staff role (Executive Director, Legal Counsel) is exclusive: never a
  // director and never both staff roles at once. Reject overlapping
  // configurations instead of silently granting a dual role that the UI
  // cannot represent.
  const overlappingExecutiveDirectors = [...executiveDirectorAllowlist].filter((email) =>
    allowlist.has(email),
  );
  if (overlappingExecutiveDirectors.length > 0) {
    throw new Error(
      `BOARD_EXECUTIVE_DIRECTOR_EMAILS must not overlap BOARD_MEMBER_EMAILS: ${overlappingExecutiveDirectors.join(", ")}`,
    );
  }
  const overlappingCounselWithBoard = [...legalCounselAllowlist].filter((email) =>
    allowlist.has(email),
  );
  if (overlappingCounselWithBoard.length > 0) {
    throw new Error(
      `BOARD_LEGAL_COUNSEL_EMAILS must not overlap BOARD_MEMBER_EMAILS: ${overlappingCounselWithBoard.join(", ")}`,
    );
  }
  const overlappingCounselWithEd = [...legalCounselAllowlist].filter((email) =>
    executiveDirectorAllowlist.has(email),
  );
  if (overlappingCounselWithEd.length > 0) {
    throw new Error(
      `BOARD_LEGAL_COUNSEL_EMAILS must not overlap BOARD_EXECUTIVE_DIRECTOR_EMAILS: ${overlappingCounselWithEd.join(", ")}`,
    );
  }

  return {
    mode: "externally-managed",
    async resolve(subject: MembershipSubject) {
      const email = normalizeBoardEmail(subject.email);
      const active = allowlist.size > 0 && allowlist.has(email);
      const isExecutiveDirector =
        executiveDirectorAllowlist.size > 0 && executiveDirectorAllowlist.has(email);
      const isLegalCounsel =
        legalCounselAllowlist.size > 0 && legalCounselAllowlist.has(email);

      if (isExecutiveDirector) {
        return {
          active: true,
          reason: "Email is on the current PGPZ executive director roster.",
          attributes: {
            source: "executive-director",
            role: "executive-director",
            isAdmin: true,
          },
        };
      }

      if (isLegalCounsel) {
        return {
          active: true,
          reason: "Email is on the current PGPZ legal counsel roster.",
          attributes: {
            source: "legal-counsel",
            role: "legal-counsel",
            isAdmin: false,
          },
        };
      }

      const isChair = active && adminAllowlist.has(email);
      return {
        active,
        reason: active
          ? "Email is on the current PGPZ Board roster."
          : "Email is not on the current PGPZ Board roster.",
        ...(active
          ? {
              attributes: {
                source: "board-roster",
                role: isChair ? "chair" : "member",
                isAdmin: isChair,
              },
            }
          : {}),
      };
    },
  };
}
