import "server-only";

export const BOARD_ACCESS_ROLES = [
  "member",
  "chair",
  "board-support",
  "admin",
  "executive-director",
  "legal-counsel",
] as const;

export type BoardAccessRole = (typeof BOARD_ACCESS_ROLES)[number];

/** Roles that may be assigned through current administration surfaces. `admin`
 * remains readable only so pre-rename records stay authorized until migrated
 * to `chair`; it must never be assigned to a new or updated record. */
export const BOARD_ASSIGNABLE_ACCESS_ROLES = [
  "member",
  "chair",
  "board-support",
  "executive-director",
  "legal-counsel",
] as const satisfies readonly BoardAccessRole[];

export type BoardAssignableAccessRole = (typeof BOARD_ASSIGNABLE_ACCESS_ROLES)[number];

export const BOARD_ACCESS_STATUSES = ["invited", "active", "deactivated"] as const;

export type BoardAccessStatus = (typeof BOARD_ACCESS_STATUSES)[number];

export interface BoardAccessRecord {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly role: BoardAccessRole;
  readonly status: BoardAccessStatus;
  readonly version: number;
  readonly createdAt: string;
  readonly createdBy: string;
  readonly updatedAt: string;
  readonly updatedBy: string;
  readonly activatedAt: string | null;
  readonly deactivatedAt: string | null;
  readonly sessionsRevokedAt: string | null;
}

export type BoardAccessRevisionAction =
  | "created"
  | "role-changed"
  | "status-changed"
  | "sessions-revoked";

export interface BoardAccessRevision {
  readonly revisionId: string;
  readonly accessId: string;
  readonly version: number;
  readonly action: BoardAccessRevisionAction;
  readonly actorEmail: string;
  readonly occurredAt: string;
  readonly previousRole: BoardAccessRole | null;
  readonly role: BoardAccessRole;
  readonly previousStatus: BoardAccessStatus | null;
  readonly status: BoardAccessStatus;
  readonly reason: string | null;
}

export function isBoardAccessRole(value: unknown): value is BoardAccessRole {
  return typeof value === "string" && BOARD_ACCESS_ROLES.includes(value as BoardAccessRole);
}

export function isBoardAssignableAccessRole(value: unknown): value is BoardAssignableAccessRole {
  return typeof value === "string" && BOARD_ASSIGNABLE_ACCESS_ROLES.includes(value as BoardAssignableAccessRole);
}

export function isBoardAccessStatus(value: unknown): value is BoardAccessStatus {
  return typeof value === "string" && BOARD_ACCESS_STATUSES.includes(value as BoardAccessStatus);
}

export function normalizeBoardAccessEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function roleHasBoardAdministration(role: BoardAccessRole): boolean {
  return role === "chair" || role === "admin" || role === "executive-director";
}

export function roleCanManageBoardDocuments(role: BoardAccessRole): boolean {
  return roleHasBoardAdministration(role) || role === "legal-counsel" || role === "board-support";
}

export function roleCanReviewBoardAudit(role: BoardAccessRole): boolean {
  return roleHasBoardAdministration(role) || role === "legal-counsel";
}

export function roleCanManageBoardUsers(role: BoardAccessRole): boolean {
  return roleHasBoardAdministration(role);
}

export function roleCanAccessBoardAdministration(role: BoardAccessRole): boolean {
  return roleCanManageBoardDocuments(role) || roleCanReviewBoardAudit(role) || roleCanManageBoardUsers(role);
}
