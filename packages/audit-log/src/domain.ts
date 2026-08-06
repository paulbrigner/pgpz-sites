/**
 * Neutral audit-ledger domain model.
 *
 * This package owns the versioned event envelope, the canonical serialization,
 * the hash-chain construction, the append contract, and the verifier. It owns
 * NO application concerns: no brand copy, no role or action names, no
 * environment reads, no AWS singleton, no table or bucket names, and no
 * Next.js route ownership. Each site supplies its own action/category taxonomy
 * and actor/target shapes through `category`/`action` string identifiers and
 * the `metadata` allowlist.
 */

export const AUDIT_SCHEMA_VERSION = 1 as const;

export type AuditOutcome = "success" | "denied" | "failure";

export type AuditActor = Readonly<{
  type: "authenticated" | "anonymous-claimed";
  /** Stable user id when known; null for anonymous-claimed actors. */
  userId: string | null;
  /** Normalized email. Kept separate from a claimed identity for failures. */
  email: string | null;
  role: string | null;
  capabilities: ReadonlyArray<string>;
}>;

export type AuditTarget = Readonly<{
  type: string;
  id: string;
  /** Exact version id when the target is a specific immutable object version. */
  version: string | null;
}>;

/** Strictly allowlisted, primitives-only metadata — never raw bodies/secrets. */
export type AuditMetadata = ReadonlyMap<string, string | number | boolean | null>;

/** The semantic, site-owned part of an event. */
export type AuditEventInput = Readonly<{
  category: string;
  action: string;
  outcome: AuditOutcome;
  /** Bounded reason code / short message. */
  reason?: string;
  actor: AuditActor;
  target?: AuditTarget;
  metadata?: AuditMetadata;
  requestId?: string;
  /** Supplied by the caller to make retried appends idempotent. */
  idempotencyKey: string;
  occurredAt: string;
}>;

export type AuditHeadState = Readonly<{
  eventId: string;
  sequence: number;
  eventHash: string;
}>;

/** A persisted, hash-chained envelope record. */
export type AuditChainEntry = Readonly<
  AuditEventInput & {
    schemaVersion: number;
    eventId: string;
    /** Zero-based index in the chain. */
    sequence: number;
    /** Previous entry's eventHash, or null for the genesis entry. */
    previousHash: string | null;
    /** SHA-256 of this entry's canonical content (excludes previousHash). */
    eventHash: string;
    recordedAt: string;
  }
>;

export function isAuditOutcome(value: unknown): value is AuditOutcome {
  return value === "success" || value === "denied" || value === "failure";
}

/** The immutable content an entry's eventHash commits to. */
export function chainFingerprintFields<const E extends AuditChainEntry>(entry: E) {
  return {
    schemaVersion: entry.schemaVersion,
    sequence: entry.sequence,
    category: entry.category,
    action: entry.action,
    outcome: entry.outcome,
    reason: entry.reason ?? null,
    actor: {
      type: entry.actor.type,
      userId: entry.actor.userId,
      email: entry.actor.email,
      role: entry.actor.role,
      capabilities: [...entry.actor.capabilities].sort(),
    },
    target: entry.target
      ? { type: entry.target.type, id: entry.target.id, version: entry.target.version }
      : null,
    metadata: sortedMetadata(entry.metadata),
    requestId: entry.requestId ?? null,
    idempotencyKey: entry.idempotencyKey,
    occurredAt: entry.occurredAt,
    recordedAt: entry.recordedAt,
  };
}

function sortedMetadata(metadata: AuditMetadata | undefined): ReturnType<typeof metadataToRecords> {
  return metadataToRecords(metadata);
}

export function metadataToRecords(
  metadata: AuditMetadata | undefined,
): ReadonlyArray<readonly [string, string | number | boolean | null]> {
  if (!metadata || metadata.size === 0) return [];
  return [...metadata.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}
