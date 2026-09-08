import "server-only";
import { documentClient } from "@/lib/dynamodb";
import { BOARD_MEETINGS_TABLE } from "@/lib/config";
import { DisclosureError, type DisclosureRequest, type DisclosureDraft, type DisclosureEvent } from "./disclosures";

type Row = Record<string, unknown>;
const partition = (id: string) => `DISCLOSURE#${id}`;
// Same injectable DynamoDBDocument surface as the other Board repositories.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createDisclosuresRepository(client: any = documentClient, tableName = BOARD_MEETINGS_TABLE) {
  async function get<T>(id: string, sk: string): Promise<T | null> {
    const result = await client.get({ TableName: tableName, Key: { pk: partition(id), sk }, ConsistentRead: true });
    return result.Item?.value ?? null;
  }
  async function query(pk: string, prefix: string): Promise<Row[]> {
    const rows: Row[] = []; let cursor: Row | undefined;
    do {
      const result = await client.query({ TableName: tableName, ConsistentRead: true,
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)", ExpressionAttributeValues: { ":pk": pk, ":prefix": prefix },
        ...(cursor ? { ExclusiveStartKey: cursor } : {}),
      });
      rows.push(...(result.Items ?? [])); cursor = result.LastEvaluatedKey;
    } while (cursor);
    return rows;
  }
  function put(pk: string, sk: string, value: unknown, immutable = true): Row {
    return { Put: { TableName: tableName, Item: { pk, sk, value }, ...(immutable ? { ConditionExpression: "attribute_not_exists(pk)" } : {}) } };
  }
  return {
    get: (id: string) => get<DisclosureRequest>(id, "ADMISSION"),
    draft: (id: string) => get<DisclosureDraft>(id, "DRAFT"),
    async events(id: string): Promise<DisclosureEvent[]> { return (await query(partition(id), "EVENT#")).map((row) => row.value as DisclosureEvent); },
    async ids(accessId?: string): Promise<string[]> { return (await query(accessId ? `ACCESS_DISCLOSURES#${accessId}` : "DISCLOSURE_REGISTER", "REQUEST#")).map((row) => String(row.value)); },
    async commit(request: DisclosureRequest, previousVersion: number | null, guards: Row[], changes: { draft?: DisclosureDraft; event?: DisclosureEvent } = {}) {
      const revisionKey = String(request.version).padStart(10, "0");
      try {
        await client.transactWrite({ TransactItems: [
          { Put: { TableName: tableName, Item: { pk: partition(request.id), sk: "ADMISSION", version: request.version, value: request },
            ConditionExpression: previousVersion === null ? "attribute_not_exists(pk)" : "#version = :version",
            ...(previousVersion === null ? {} : { ExpressionAttributeNames: { "#version": "version" }, ExpressionAttributeValues: { ":version": previousVersion } }),
          } },
          put(partition(request.id), `REVISION#${revisionKey}`, request),
          ...(previousVersion === null ? [put("DISCLOSURE_REGISTER", `REQUEST#${request.id}`, request.id)] : []),
          ...(previousVersion === null && request.kind === "annual" ? [put(`DISCLOSURE_ANNUAL#${request.subject.accessId}#${request.year}`, `${request.policy.documentId}#${request.policy.versionId}`, request.id)] : []),
          ...[request.subject, request.reviewer, ...(request.counsel ? [request.counsel] : [])].map((person) => put(`ACCESS_DISCLOSURES#${person.accessId}`, `REQUEST#${request.id}`, request.id, false)),
          ...(changes.draft ? [put(partition(request.id), "DRAFT", changes.draft, false)] : []),
          ...(changes.event ? [put(partition(request.id), `EVENT#${revisionKey}`, changes.event)] : []),
          ...guards,
        ] });
      } catch (error) {
        if (["TransactionCanceledException", "ConditionalCheckFailedException"].includes((error as Error).name)) throw new DisclosureError(409, previousVersion === null ? "An annual request for this person, year, and policy may already exist, or the roster changed. Refresh the register before trying again." : "The disclosure or access roster changed. Refresh before trying again.");
        throw error;
      }
      return request;
    },
  };
}
export const disclosuresRepository = createDisclosuresRepository();
