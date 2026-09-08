import "server-only";

import { randomUUID } from "node:crypto";
import { boardAccessRepository } from "@/lib/board-access-repository";
import type { BoardAccessRecord } from "@/lib/board-access";
import { BOARD_ACCESS_REGISTRY_ENABLED, BOARD_ACCESS_TABLE } from "@/lib/config";
import { authenticatedActor, boardAuditLedger } from "@/lib/audit";
import type { BoardMember } from "@/lib/session";
import { executiveSessionsRepository } from "@/lib/executive-sessions-repository";
import { canCreateExecutiveSession, isDirectorRole, ExecutiveSessionError, type ExecutiveSession, type ExecutiveGrant } from "@/lib/executive-sessions";

function grantAllows(grant: ExecutiveGrant | null, record: BoardAccessRecord | null, meetingId: string): boolean {
  return !!grant && !!record && record.status === "active" && grant.meetingId === meetingId &&
    grant.accessId === record.id && grant.email === record.email &&
    (grant.kind === "director" ? isDirectorRole(record.role) : grant.kind === "counsel" && record.role === "legal-counsel");
}

export function participantCanAccess(session: ExecutiveSession, record: BoardAccessRecord | null): boolean {
  if (!record || record.status !== "active" || !Array.isArray(session.participants)) return false;
  return session.participants.some((p) => p.accessId === record.id && p.email === record.email &&
    (p.kind === "director" ? isDirectorRole(record.role) : p.kind === "counsel" && record.role === "legal-counsel"));
}

export async function executiveAccessRecord(member: BoardMember): Promise<BoardAccessRecord | null> {
  if (!BOARD_ACCESS_REGISTRY_ENABLED) return null;
  return boardAccessRepository.getByEmail(member.email);
}

export async function requireExecutiveCreator(member: BoardMember) {
  const record = await executiveAccessRecord(member);
  if (!record || record.status !== "active" || !canCreateExecutiveSession(record.role)) {
    throw new ExecutiveSessionError(403, "An active Board Chair must create the restricted session.");
  }
  return record;
}

export async function requireExecutiveAccess(member: BoardMember, meetingId: string, sessionId: string, manage = false) {
  const record = await executiveAccessRecord(member);
  if (!record || record.status !== "active") throw new ExecutiveSessionError(404, "Session not found.");
  const grant = await executiveSessionsRepository.grant(sessionId, record.id);
  if (!grantAllows(grant, record, meetingId)) throw new ExecutiveSessionError(404, "Session not found.");
  // Do not fetch private rows before checking admission. This also prevents
  // development RSC promise tracing from serializing denied viewers' raw rows.
  const session = await executiveSessionsRepository.get(sessionId);
  if (!session || session.meetingId !== meetingId || !participantCanAccess(session, record)) {
    throw new ExecutiveSessionError(404, "Session not found.");
  }
  // An administrator or counsel never inherits the selected director's capabilities.
  const canManage = !!record && isDirectorRole(record.role) && session.facilitatorId === record.id;
  if (manage && !canManage) throw new ExecutiveSessionError(403, "Only this session's facilitating director can perform this action.");
  return { session, record: record!, canManage };
}

/** Roster writes cannot race a restricted mutation into accepting a revoked actor. */
export function executiveRosterGuard(record: BoardAccessRecord) {
  return { ConditionCheck: {
    TableName: BOARD_ACCESS_TABLE, Key: { pk: `ACCESS#${record.id}`, sk: "PROFILE" },
    ConditionExpression: "#version = :version AND #status = :active",
    ExpressionAttributeNames: { "#version": "version", "#status": "status" },
    ExpressionAttributeValues: { ":version": record.version, ":active": "active" },
  } };
}

export async function executiveMutationGuards(member: BoardMember, sessionId: string, action: string, records: BoardAccessRecord[]) {
  const audit = await boardAuditLedger.buildAppendItems({
    category: "meeting", action: `executive_session_${action}`, outcome: "success", actor: authenticatedActor(member),
    target: { type: "executive-session", id: sessionId, version: null },
    // The ordinary audit reader may be staff. Never include restricted text, filenames, or participant lists.
    idempotencyKey: randomUUID(), occurredAt: new Date().toISOString(),
  });
  return [...new Map(records.map((record) => [record.id, executiveRosterGuard(record)])).values(),
    ...audit.TransactItems as Record<string, unknown>[]];
}

export async function listExecutiveCandidates() {
  if (!BOARD_ACCESS_REGISTRY_ENABLED) return [];
  const records: BoardAccessRecord[] = [];
  let cursor: Record<string, unknown> | null = null;
  do {
    const page = await boardAccessRepository.list({ status: "active", limit: 100, ...(cursor ? { cursor } : {}) });
    records.push(...page.records.filter((p) => isDirectorRole(p.role) || p.role === "legal-counsel"));
    cursor = page.cursor;
  } while (cursor);
  return records;
}

export async function visibleExecutiveSessions(member: BoardMember, meetingId: string) {
  const record = await executiveAccessRecord(member);
  if (!record || record.status !== "active" || (!isDirectorRole(record.role) && record.role !== "legal-counsel")) return [];
  const sessions = await Promise.all((await executiveSessionsRepository.listIds(meetingId)).map(async (id) => {
    const grant = await executiveSessionsRepository.grant(id, record.id);
    return grantAllows(grant, record, meetingId) ? executiveSessionsRepository.get(id) : null;
  }));
  return sessions.filter((s): s is ExecutiveSession => !!s && s.meetingId === meetingId && participantCanAccess(s, record));
}
