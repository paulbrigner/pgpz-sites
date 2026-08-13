import { createHash } from "node:crypto";
import {
  normalizeBoardAccessEmail,
  type BoardAccessRecord,
  type BoardAccessRole,
} from "./board-access";

export interface BoardRosterCandidate {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly role: BoardAccessRole;
}

export interface BoardRosterMigrationPlan {
  readonly creates: readonly BoardRosterCandidate[];
  readonly unchanged: readonly BoardAccessRecord[];
  readonly conflicts: readonly {
    email: string;
    currentRole: BoardAccessRole;
    rosterRole: BoardAccessRole;
    currentStatus: string;
  }[];
}

function emails(value: string | undefined): Set<string> {
  return new Set(
    (value || "").split(/[\s,]+/).map(normalizeBoardAccessEmail).filter(Boolean),
  );
}

function stableAccessId(email: string): string {
  return `access_${createHash("sha256").update(email).digest("hex").slice(0, 24)}`;
}

function defaultName(email: string): string {
  return email.split("@")[0].split(/[._+-]+/).filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ") || email;
}

/** Converts the legacy allowlists to one exclusive, deterministic roster. */
export function parseLegacyBoardRosters(
  env: Readonly<Record<string, string | undefined>>,
): readonly BoardRosterCandidate[] {
  const members = emails(env.BOARD_MEMBER_EMAILS);
  const admins = emails(env.BOARD_ADMIN_EMAILS);
  const executiveDirectors = emails(env.BOARD_EXECUTIVE_DIRECTOR_EMAILS);
  const legalCounsel = emails(env.BOARD_LEGAL_COUNSEL_EMAILS);
  const orphanedAdmins = [...admins].filter((email) => !members.has(email));
  if (orphanedAdmins.length) throw new Error(`BOARD_ADMIN_EMAILS is not a member subset: ${orphanedAdmins.join(", ")}`);

  const assignments = new Map<string, BoardAccessRole>();
  const assign = (email: string, role: BoardAccessRole) => {
    const previous = assignments.get(email);
    if (previous && previous !== role) throw new Error(`${email} occurs in both ${previous} and ${role} rosters`);
    assignments.set(email, role);
  };
  for (const email of members) assign(email, admins.has(email) ? "admin" : "member");
  for (const email of executiveDirectors) assign(email, "executive-director");
  for (const email of legalCounsel) assign(email, "legal-counsel");

  return [...assignments.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([email, role]) => ({
    id: stableAccessId(email), email, name: defaultName(email), role,
  }));
}

export function buildBoardRosterMigrationPlan(
  candidates: readonly BoardRosterCandidate[],
  existing: readonly BoardAccessRecord[],
): BoardRosterMigrationPlan {
  const byEmail = new Map(existing.map((record) => [record.email, record]));
  const creates: BoardRosterCandidate[] = [];
  const unchanged: BoardAccessRecord[] = [];
  const conflicts: BoardRosterMigrationPlan["conflicts"][number][] = [];
  for (const candidate of candidates) {
    const current = byEmail.get(candidate.email);
    if (!current) {
      creates.push(candidate);
    } else if (current.role === candidate.role && current.status === "active") {
      unchanged.push(current);
    } else {
      conflicts.push({
        email: candidate.email,
        currentRole: current.role,
        rosterRole: candidate.role,
        currentStatus: current.status,
      });
    }
  }
  return { creates, unchanged, conflicts };
}
