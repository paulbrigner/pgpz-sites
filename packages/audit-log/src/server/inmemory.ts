import "server-only";

import type {
  AuditChainEntry,
  AuditHeadState,
} from "../domain";
import type { HashFn } from "./hash";
import {
  buildChainEntry,
  type AppendInput,
  type AuditLedger,
} from "./ledger";

/**
 * In-memory reference ledger used by tests and by the read-only Reference
 * proof. It models the atomic-append behaviour the production DynamoDB adapter
 * must provide: an append is an all-or-nothing step that advances the head, and
 * it is idempotent by `idempotencyKey`.
 */
export function createInMemoryAuditLedger(hash: HashFn): AuditLedger {
  let entries: AuditChainEntry[] = [];
  const byIdempotency = new Map<string, AuditChainEntry>();

  return {
    async readHead(): Promise<AuditHeadState | null> {
      const last = entries[entries.length - 1];
      return last
        ? { eventId: last.eventId, sequence: last.sequence, eventHash: last.eventHash }
        : null;
    },

    async append(input: AppendInput): Promise<AuditChainEntry> {
      const existing = byIdempotency.get(input.idempotencyKey);
      if (existing) return existing;
      const previous = await this.readHead();
      const entry = buildChainEntry(input, previous, hash);
      entries = [...entries, entry];
      byIdempotency.set(input.idempotencyKey, entry);
      return entry;
    },

    async list(options?: { afterSequence?: number; limit?: number }) {
      const after = options?.afterSequence ?? -1;
      const limit = options?.limit;
      let slice = entries.filter((entry) => entry.sequence > after);
      if (limit !== undefined) slice = slice.slice(0, limit);
      return slice;
    },
  };
}
