import type { BoardAccessRecord } from "./board-access";
import type { ExecutiveSession } from "./executive-sessions";

export const sessionFixture = (): ExecutiveSession => ({
  id: "session-1", meetingId: "meeting-1", title: "PRIVATE compensation", purpose: "PRIVATE exclusions and comparables",
  participants: [
    { accessId: "director", name: "Director", email: "director@example.invalid", kind: "director" },
    { accessId: "counsel", name: "Counsel", email: "counsel@example.invalid", kind: "counsel" },
  ],
  facilitatorId: "director", status: "open", version: 1, createdAt: "2026-09-08T12:00:00Z", createdBy: "chair",
  closedAt: null, closedBy: null, publishedAt: null,
});

export const accessFixture = (id: string, role: BoardAccessRecord["role"] = "member"): BoardAccessRecord => ({
  id, name: id, email: `${id}@example.invalid`, role, status: "active", version: 1,
  createdAt: "2026-09-01T00:00:00Z", createdBy: "chair", updatedAt: "2026-09-01T00:00:00Z", updatedBy: "chair",
  activatedAt: "2026-09-01T00:00:00Z", deactivatedAt: null, sessionsRevokedAt: null,
});

type Row = Record<string, unknown>;
type Operation = { TableName: string; Key?: Row; Item?: Row; ConditionExpression?: string; ExpressionAttributeValues?: Row };

/** Condition-aware fake: all checks run before any write, including access guards. */
export function executiveFakeClient() {
  const items = new Map<string, Row>();
  const key = (table: string, row: Row) => `${table}|${row.pk}|${row.sk}`;
  return {
    items,
    seed(table: string, row: Row) { items.set(key(table, row), row); },
    async get(input: Operation) { return { Item: items.get(key(input.TableName, input.Key!)) }; },
    async query(input: { TableName: string; IndexName?: string; ExpressionAttributeValues: Row; ExclusiveStartKey?: Row }) {
      const values = input.ExpressionAttributeValues;
      let rows = [...items.entries()].filter(([k]) => k.startsWith(`${input.TableName}|`)).map(([, row]) => row);
      if (input.IndexName === "Library") rows = rows.filter((r) => r.libraryPk === values[":lp"]);
      else if (input.IndexName === "MeetingDocuments") rows = rows.filter((r) => r.meetingPk === values[":meetingPk"]);
      else rows = rows.filter((r) => r.pk === values[":pk"] && (!values[":prefix"] || String(r.sk).startsWith(String(values[":prefix"]))));
      rows.sort((a, b) => String(a.sk).localeCompare(String(b.sk)));
      if (input.ExclusiveStartKey) rows = rows.filter((r) => String(r.sk) > String(input.ExclusiveStartKey!.sk));
      // Small pages ensure repository callers follow pagination.
      return { Items: rows.slice(0, 2), ...(rows.length > 2 ? { LastEvaluatedKey: { pk: rows[1].pk, sk: rows[1].sk } } : {}) };
    },
    async transactWrite({ TransactItems }: { TransactItems: Record<string, Operation>[] }) {
      for (const operation of TransactItems) {
        const op = operation.Put || operation.ConditionCheck;
        const existing = items.get(key(op.TableName, op.Item || op.Key!));
        const values = op.ExpressionAttributeValues || {};
        const condition = op.ConditionExpression || "";
        const failed = (condition.includes("attribute_not_exists") && existing) ||
          (condition.includes("#version") && existing?.version !== values[":version"]) ||
          (condition.includes("#status") && existing?.status !== values[":active"]);
        if (failed) { const error = new Error("condition failed"); error.name = "TransactionCanceledException"; throw error; }
      }
      for (const { Put } of TransactItems) if (Put) items.set(key(Put.TableName, Put.Item!), structuredClone(Put.Item!));
    },
  };
}
