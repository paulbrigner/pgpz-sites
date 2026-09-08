import "server-only";

import { randomUUID } from "node:crypto";
import { documentClient } from "@/lib/dynamodb";
import { BOARD_MEETINGS_TABLE } from "@/lib/config";
import { ExecutiveSessionError, type ExecutiveSession, type ExecutiveMessage, type ExecutiveMaterial, type ExecutiveReport, type ExecutiveGrant } from "@/lib/executive-sessions";

type Row = Record<string, unknown>;
type Transaction = Record<string, unknown>;
const partition = (id: string) => `EXECUTIVE_SESSION#${id}`;

// Same DynamoDBDocument surface as the Board repositories and their test doubles.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createExecutiveSessionsRepository(client: any = documentClient, tableName = BOARD_MEETINGS_TABLE) {
  async function query(pk: string, prefix: string): Promise<Row[]> {
    const rows: Row[] = [];
    let cursor: Row | undefined;
    do {
      const result = await client.query({
        TableName: tableName, ConsistentRead: true,
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
        ExpressionAttributeValues: { ":pk": pk, ":prefix": prefix },
        ...(cursor ? { ExclusiveStartKey: cursor } : {}),
      });
      rows.push(...(result.Items || []));
      cursor = result.LastEvaluatedKey;
    } while (cursor);
    return rows;
  }

  function put(pk: string, sk: string, value: unknown): Transaction {
    return { Put: { TableName: tableName, Item: { pk, sk, value }, ConditionExpression: "attribute_not_exists(pk)" } };
  }

  async function commit(session: ExecutiveSession, previousVersion: number | null, children: Transaction[], guards: readonly Transaction[]) {
    try {
      await client.transactWrite({ TransactItems: [
        { Put: {
          TableName: tableName, Item: { pk: partition(session.id), sk: "META", version: session.version, value: session },
          ConditionExpression: previousVersion === null ? "attribute_not_exists(pk)" : "#version = :version",
          ...(previousVersion === null ? {} : { ExpressionAttributeNames: { "#version": "version" }, ExpressionAttributeValues: { ":version": previousVersion } }),
        } },
        put(partition(session.id), `REVISION#${String(session.version).padStart(8, "0")}`, session),
        ...children, ...guards,
      ] });
    } catch (error) {
      if (["TransactionCanceledException", "ConditionalCheckFailedException"].includes((error as Error).name)) {
        throw new ExecutiveSessionError(409, "The session or roster changed. Refresh before trying again.");
      }
      throw error;
    }
    return session;
  }

  return {
    async grant(id: string, accessId: string): Promise<ExecutiveGrant | null> {
      const result = await client.get({ TableName: tableName, Key: { pk: partition(id), sk: `PARTICIPANT#${accessId}` }, ConsistentRead: true });
      return result.Item?.value ?? null;
    },
    async get(id: string): Promise<ExecutiveSession | null> {
      const result = await client.get({ TableName: tableName, Key: { pk: partition(id), sk: "META" }, ConsistentRead: true });
      return result.Item?.value ?? null;
    },
    async listIds(meetingId: string): Promise<string[]> {
      return (await query(`MEETING#${meetingId}`, "EXECUTIVE_SESSION#")).map((row) => String(row.value));
    },
    async messages(id: string): Promise<ExecutiveMessage[]> {
      return (await query(partition(id), "MESSAGE#")).map((row) => row.value as ExecutiveMessage);
    },
    async materials(id: string): Promise<ExecutiveMaterial[]> {
      return (await query(partition(id), "MATERIAL#")).map((row) => row.value as ExecutiveMaterial);
    },
    async reports(meetingId: string): Promise<ExecutiveReport[]> {
      return (await query(`MEETING#${meetingId}`, "EXECUTIVE_REPORT#")).map((row) => row.value as ExecutiveReport);
    },
    async create(session: ExecutiveSession, guards: readonly Transaction[]) {
      return commit(session, null, [
        put(`MEETING#${session.meetingId}`, `EXECUTIVE_SESSION#${session.id}`, session.id),
        ...session.participants.map((p) => put(partition(session.id), `PARTICIPANT#${p.accessId}`, {
          accessId: p.accessId, email: p.email, kind: p.kind, meetingId: session.meetingId,
        } satisfies ExecutiveGrant)),
      ], guards);
    },
    async append(session: ExecutiveSession, record: ExecutiveMessage | ExecutiveMaterial, kind: "MESSAGE" | "MATERIAL", guards: readonly Transaction[]) {
      if (session.status !== "open") throw new ExecutiveSessionError(409, "This session is closed and its record is read-only.");
      return commit({ ...session, version: session.version + 1 }, session.version,
        [put(partition(session.id), `${kind}#${record.createdAt}#${record.id}`, record)], guards);
    },
    async close(session: ExecutiveSession, actor: string, guards: readonly Transaction[]) {
      if (session.status !== "open") throw new ExecutiveSessionError(409, "This session is already closed.");
      return commit({ ...session, status: "closed", version: session.version + 1, closedAt: new Date().toISOString(), closedBy: actor }, session.version, [], guards);
    },
    async publish(session: ExecutiveSession, summary: string, actor: string, guards: readonly Transaction[]) {
      if (session.status !== "closed" || session.publishedAt) throw new ExecutiveSessionError(409, "Close the session before publishing its one reviewed outcome.");
      const publishedAt = new Date().toISOString();
      const report: ExecutiveReport = { id: randomUUID(), summary, publishedAt, publishedBy: actor };
      return commit({ ...session, publishedAt, version: session.version + 1 }, session.version,
        [put(`MEETING#${session.meetingId}`, `EXECUTIVE_REPORT#${report.id}`, report)], guards);
    },
  };
}

export const executiveSessionsRepository = createExecutiveSessionsRepository();
