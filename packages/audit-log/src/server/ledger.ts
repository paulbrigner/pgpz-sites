import "server-only";

import { randomUUID } from "node:crypto";
import {
  AUDIT_SCHEMA_VERSION,
  chainFingerprintFields,
  type AuditChainEntry,
  type AuditEventInput,
  type AuditHeadState,
} from "../domain";
import { serializeCanonical } from "../serialize";
import type { HashFn } from "./hash";

export type AppendInput = Readonly<AuditEventInput & { recordedAt?: string }>;

/**
 * Append contract. A production implementation MUST persist the immutable
 * event and advance the chain head in a single atomic transaction (for the
 * Board this is one `TransactWriteItems`), fail if the head moved concurrently,
 * and be idempotent by `idempotencyKey`. This interface is deliberately
 * storage-agnostic — the AWS adapter lives in the consuming app.
 */
export interface AuditLedger {
  readHead(): Promise<AuditHeadState | null>;

  /** Atomic + idempotent append; returns the (possibly pre-existing) entry. */
  append(input: AppendInput): Promise<AuditChainEntry>;

  list(options?: { afterSequence?: number; limit?: number }): Promise<AuditChainEntry[]>;
}

export class AuditLedgerError extends Error {
  readonly kind: "concurrent-head" | "invalid-input";
  constructor(kind: AuditLedgerError["kind"], message: string) {
    super(message);
    this.name = "AuditLedgerError";
    this.kind = kind;
  }
}

/**
 * Builds a single chain entry: computes its eventHash over the canonical
 * fingerprint of the immutable fields and links it to the previous head via
 * `previousHash`. Pure with respect to the injected hash.
 */
export function buildChainEntry(
  input: AppendInput,
  previous: AuditHeadState | null,
  hash: HashFn,
): AuditChainEntry {
  const sequence = previous ? previous.sequence + 1 : 0;
  const base: Omit<AuditChainEntry, "eventHash"> = {
    schemaVersion: AUDIT_SCHEMA_VERSION,
    eventId: randomUUID(),
    sequence,
    previousHash: previous ? previous.eventHash : null,
    category: input.category,
    action: input.action,
    outcome: input.outcome,
    reason: input.reason,
    actor: input.actor,
    target: input.target,
    metadata: input.metadata,
    requestId: input.requestId,
    idempotencyKey: input.idempotencyKey,
    occurredAt: input.occurredAt,
    recordedAt: input.recordedAt ?? new Date().toISOString(),
  };
  const entry: AuditChainEntry = {
    ...base,
    eventHash: hash(serializeCanonical(chainFingerprintFields({ ...base, eventHash: "" }))),
  };
  return entry;
}

export type VerificationResult = Readonly<{
  ok: boolean;
  entryCount: number;
  issues: ReadonlyArray<string>;
}>;

/**
 * Verifies hash-chain continuity, ordering, and integrity. The table is
 * "append-only by application invariant"; this detects any unexpected
 * mutation, deletion, reorder, or gap in the entries supplied.
 */
export function verifyChain(entries: readonly AuditChainEntry[], hash: HashFn): VerificationResult {
  const issues: string[] = [];
  let previousHash: string | null = null;

  entries.forEach((entry, index) => {
    if (entry.sequence !== index) {
      issues.push(`expected sequence ${index}, got ${entry.sequence} at position ${index}`);
    }
    const expectedHash = hash(serializeCanonical(chainFingerprintFields(entry)));
    if (entry.eventHash !== expectedHash) {
      issues.push(`eventHash does not match committed content at position ${index}`);
    }
    if (entry.previousHash !== previousHash) {
      issues.push(`previousHash links to the wrong predecessor at position ${index}`);
    }
    previousHash = entry.eventHash;
  });

  return { ok: issues.length === 0, entryCount: entries.length, issues };
}
