import "server-only";

import { randomUUID } from "node:crypto";
import type { AuditActor, AuditEventInput } from "@pgpz/audit-log";
import { createBoardAuditLedger } from "@/lib/audit-ledger";

/** The Board's append-only audit ledger (PGPZBoardAuditLog table). */
export const boardAuditLedger = createBoardAuditLedger();

export type BoardAuditCategory =
  | "authentication"
  | "authorization"
  | "account"
  | "document_read"
  | "document_lifecycle"
  | "audit";

/** Capabilities snapshot for a resolved, authenticated actor. */
export function authenticatedActor(
  member: {
    id: string;
    email: string;
    role: string;
    isAdmin: boolean;
  },
): AuditActor {
  return {
    type: "authenticated",
    userId: member.id,
    email: member.email,
    role: member.role,
    capabilities: member.isAdmin ? ["manageBoardDocuments", "reviewBoardAudit"] : [],
  };
}

/** Claimed identity for a failed sign-in — never merged with an authenticated actor. */
export function anonymousClaimedActor(email: string): AuditActor {
  return { type: "anonymous-claimed", userId: null, email, role: null, capabilities: [] };
}

export type AuditBestEffortInput = Omit<AuditEventInput, "idempotencyKey" | "occurredAt"> & {
  idempotencyKey?: string;
  occurredAt?: string;
};

function withDefaults(input: AuditBestEffortInput): AuditEventInput {
  return {
    ...input,
    idempotencyKey: input.idempotencyKey ?? randomUUID(),
    occurredAt: input.occurredAt ?? new Date().toISOString(),
  };
}

/**
 * Best-effort audit for authentication/authorization events. Auth hooks must
 * never break a successful sign-in or allow a failed sign-in to leave an
 * unexpectedly usable session, so failures here are swallowed. Protected
 * document mutations use `boardAuditLedger.append` directly and fail closed.
 */
export async function auditBestEffort(input: AuditBestEffortInput): Promise<boolean> {
  try {
    await boardAuditLedger.append(withDefaults(input));
    return true;
  } catch {
    return false;
  }
}

/** Best-effort helper for authorization denials (roster/privileged/route). */
export function recordAccessDenied(input: {
  actor: AuditActor;
  target: { type: string; id: string; version?: string | null };
  reason: string;
  requestId?: string;
}): Promise<boolean> {
  return auditBestEffort({
    category: "authorization",
    action: "route_denied",
    outcome: "denied",
    reason: input.reason,
    actor: input.actor,
    target: { type: input.target.type, id: input.target.id, version: input.target.version ?? null },
    requestId: input.requestId,
  });
}
