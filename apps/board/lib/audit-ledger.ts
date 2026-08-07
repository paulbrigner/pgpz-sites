import "server-only";

import type { AuditChainEntry, AuditHeadState } from "@pgpz/audit-log";
import {
  AuditLedgerError,
  buildChainEntry,
  serializeCanonical,
  sha256,
  verifyChain,
  type AppendInput,
  type AuditLedger,
} from "@pgpz/audit-log/server";
import { documentClient } from "@/lib/dynamodb";
import { BOARD_AUDIT_TABLE } from "@/lib/config";

const PK = "AUDIT";
const HEAD_SK = "HEAD";
const ENTRY_PREFIX = "ENTRY#";
const IDEMPOTENCY_PREFIX = "IDEMP#";

const pad = (sequence: number) => String(sequence).padStart(16, "0");
const entrySk = (sequence: number, eventId: string) =>
  `${ENTRY_PREFIX}${pad(sequence)}#${eventId}`;
const idempotencySk = (idempotencyKey: string) =>
  `${IDEMPOTENCY_PREFIX}${sha256(idempotencyKey).slice(0, 64)}`;

type AuditItem = Record<string, unknown>;

function entryToItem(entry: AuditChainEntry): AuditItem {
  return {
    pk: PK,
    sk: entrySk(entry.sequence, entry.eventId),
    type: "AUDIT_ENTRY",
    schemaVersion: entry.schemaVersion,
    eventId: entry.eventId,
    sequence: entry.sequence,
    category: entry.category,
    action: entry.action,
    outcome: entry.outcome,
    reason: entry.reason ?? null,
    actorType: entry.actor.type,
    actorUserId: entry.actor.userId,
    actorEmail: entry.actor.email,
    actorRole: entry.actor.role,
    actorCapabilities: [...entry.actor.capabilities].sort().join(","),
    targetType: entry.target?.type ?? null,
    targetId: entry.target?.id ?? null,
    targetVersion: entry.target?.version ?? null,
    metadata: serializeMetadata(entry.metadata),
    requestId: entry.requestId ?? null,
    idempotencyKey: entry.idempotencyKey,
    occurredAt: entry.occurredAt,
    recordedAt: entry.recordedAt,
    previousHash: entry.previousHash,
    eventHash: entry.eventHash,
  };
}

function serializeMetadata(metadata: AuditChainEntry["metadata"]): string | null {
  if (!metadata || metadata.size === 0) return null;
  return JSON.stringify([...metadata.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

function itemToEntry(item: AuditItem | undefined | null): AuditChainEntry | null {
  if (!item || item.type !== "AUDIT_ENTRY") return null;
  const eventId = String(item.eventId ?? "");
  const sequence = Number(item.sequence);
  const idempotencyKey = String(item.idempotencyKey ?? "");
  if (!eventId || !Number.isInteger(sequence) || !idempotencyKey) return null;
  const metadataTuples = typeof item.metadata === "string" ? (JSON.parse(item.metadata) as Array<[string, string | number | boolean | null]>) : [];
  return {
    schemaVersion: Number(item.schemaVersion),
    eventId,
    sequence,
    category: String(item.category),
    action: String(item.action),
    outcome: item.outcome as AuditChainEntry["outcome"],
    reason: item.reason == null ? undefined : String(item.reason),
    actor: {
      type: item.actorType === "anonymous-claimed" ? "anonymous-claimed" : "authenticated",
      userId: item.actorUserId == null ? null : String(item.actorUserId),
      email: item.actorEmail == null ? null : String(item.actorEmail),
      role: item.actorRole == null ? null : String(item.actorRole),
      capabilities: (String(item.actorCapabilities ?? "").split(",")).filter(Boolean),
    },
    target:
      item.targetId == null
        ? undefined
        : { type: String(item.targetType), id: String(item.targetId), version: item.targetVersion == null ? null : String(item.targetVersion) },
    metadata: metadataTuples.length ? new Map(metadataTuples) : undefined,
    requestId: item.requestId == null ? undefined : String(item.requestId),
    idempotencyKey,
    occurredAt: String(item.occurredAt),
    recordedAt: String(item.recordedAt),
    previousHash: item.previousHash == null ? null : String(item.previousHash),
    eventHash: String(item.eventHash),
  };
}

/**
 * Minimal DynamoDB surface the ledger uses (satisfied structurally by the
 * real DynamoDBDocument client and by an in-memory fake in tests).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LedgerDocumentClient = any;

function isTransactionCanceled(error: unknown): boolean {
  return (error as { name?: unknown } | null)?.name === "TransactionCanceledException";
}

/**
 * Append-only DynamoDB audit ledger for the PGPZBoardAuditLog table. Every
 * append is one atomic `TransactWriteItems` (immutable ordered entry +
 * idempotency marker + head update) so a concurrent or failed append can never
 * leave an orphan event or a broken chain head. Idempotent by
 * `idempotencyKey`.
 */
export function createBoardAuditLedger(client: LedgerDocumentClient = documentClient): AuditLedger & {
  list(options?: { afterSequence?: number; limit?: number }): Promise<AuditChainEntry[]>;
  verify(): Promise<{ ok: boolean; entryCount: number; issues: readonly string[] }>;
  buildAppendItems(input: AppendInput): Promise<{ TransactItems: unknown[]; entry: AuditChainEntry }>;
} {
  const tableName = BOARD_AUDIT_TABLE;

  async function readHead(): Promise<AuditHeadState | null> {
    const result = await client.get({
      TableName: tableName,
      Key: { pk: PK, sk: HEAD_SK },
    });
    const item = result?.Item as AuditItem | undefined;
    if (!item || item.type !== "AUDIT_HEAD") return null;
    return {
      eventId: String(item.eventId),
      sequence: Number(item.sequence),
      eventHash: String(item.eventHash),
    };
  }

  async function composeAppend(input: AppendInput) {
    const previous = await readHead();
    const entry = buildChainEntry(input, previous, sha256);
    const markerKey = idempotencySk(input.idempotencyKey);
    const item = entryToItem(entry);
    const conditionNames = { "#pk": "pk", "#sk": "sk" };
    const headCondition = previous
      ? "#pk = :headPk AND #eventHash = :expectedHash"
      : "attribute_not_exists(#pk) AND attribute_not_exists(#sk)";
    const expirySk = entrySk(entry.sequence, entry.eventId);
    const TransactItems = [
      {
        Put: {
          TableName: tableName,
          Item: item,
          ConditionExpression: "attribute_not_exists(#pk) AND attribute_not_exists(#sk)",
          ExpressionAttributeNames: conditionNames,
        },
      },
      {
        Put: {
          TableName: tableName,
          Item: { ...item, pk: PK, sk: markerKey, type: "AUDIT_ENTRY" },
          ConditionExpression: "attribute_not_exists(#pk) AND attribute_not_exists(#sk)",
          ExpressionAttributeNames: conditionNames,
        },
      },
      {
        Put: {
          TableName: tableName,
          Item: { pk: PK, sk: HEAD_SK, type: "AUDIT_HEAD", eventId: entry.eventId, sequence: entry.sequence, eventHash: entry.eventHash },
          ConditionExpression: headCondition,
          ExpressionAttributeNames: previous
            ? { "#pk": "pk", "#eventHash": "eventHash" }
            : conditionNames,
          ...(previous
            ? { ExpressionAttributeValues: { ":headPk": PK, ":expectedHash": previous.eventHash } }
            : {}),
        },
      },
    ];
    return { TransactItems, entry, markerKey, expirySk };
  }

  async function append(input: AppendInput): Promise<AuditChainEntry> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const composed = await composeAppend(input);
      try {
        await client.transactWrite({ TransactItems: composed.TransactItems });
        return composed.entry;
      } catch (error) {
        if (!isTransactionCanceled(error)) throw error;
        // If this idempotencyKey already committed, return the stored event.
        const existing = await client.get({
          TableName: tableName,
          Key: { pk: PK, sk: composed.markerKey },
        });
        const recovered = itemToEntry(existing?.Item as AuditItem | undefined);
        if (recovered) return recovered;
        // Otherwise the head moved concurrently; retry with a fresh head.
      }
    }
    throw new AuditLedgerError("concurrent-head", "Audit append conflicted repeatedly; refusing to retry forever.");
  }

  async function listAll(options: { afterSequence?: number; limit?: number } = {}) {
    const entries: AuditChainEntry[] = [];
    let exclusiveStartKey: Record<string, unknown> | undefined;
    let collected = 0;
    const targetLimit = options.limit;
    do {
      const result = await client.query({
        TableName: tableName,
        KeyConditionExpression: "#pk = :pk AND begins_with(#sk, :prefix)",
        ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
        ExpressionAttributeValues: { ":pk": PK, ":prefix": ENTRY_PREFIX },
        ...(exclusiveStartKey ? { ExclusiveStartKey: exclusiveStartKey } : {}),
      });
      exclusiveStartKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
      for (const item of (result.Items || []) as AuditItem[]) {
        const entry = itemToEntry(item);
        if (!entry) continue;
        if (options.afterSequence !== undefined && entry.sequence <= options.afterSequence) continue;
        entries.push(entry);
        collected += 1;
        if (targetLimit !== undefined && collected >= targetLimit) {
          return entries;
        }
      }
    } while (exclusiveStartKey);
    return entries;
  }

  return {
    async readHead() {
      return readHead();
    },
    async append(input) {
      return append(input);
    },
    // Composable audit transaction for merging into a document+audit write.
    async buildAppendItems(input: AppendInput) {
      const composed = await composeAppend(input);
      return { TransactItems: composed.TransactItems, entry: composed.entry };
    },
    async list(options) {
      return listAll(options);
    },
    async verify() {
      const head = await readHead();
      const entries = await listAll();

      // A ledger with no HEAD and no entries is trivially intact (nothing written yet).
      if (!head) {
        return entries.length === 0
          ? { ok: true, entryCount: 0, issues: [] }
          : { ok: false, entryCount: entries.length, issues: ["Ledger has entries but no stored HEAD."] };
      }

      const result = verifyChain(entries, sha256);
      const issues = [...result.issues];
      let ok = result.ok;

      // `verifyChain` only checks the internal consistency of whatever slice it is
      // given — a truncated prefix would still report intact. Cross-check that the
      // full list actually reaches the recorded HEAD so any caller accidentally
      // verifying a partial chain (or tampering with the tail) is detected.
      const last = entries[entries.length - 1];
      if (!last || last.sequence !== head.sequence || last.eventHash !== head.eventHash || last.eventId !== head.eventId) {
        ok = false;
        issues.push(
          `Verified chain does not reach stored HEAD: ends at sequence ${String(last?.sequence ?? "(none)")} (${last?.eventHash ?? "no hash"}), expected HEAD sequence ${head.sequence}.`,
        );
      }

      return { ok, entryCount: entries.length, issues };
    },
  };
}

// Convenience re-export so server callers build events with the shared helpers.
export { serializeCanonical, sha256, verifyChain };
