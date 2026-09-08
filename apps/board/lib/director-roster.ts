import "server-only";

import { randomUUID } from "node:crypto";
import { BOARD_ACCESS_TABLE } from "@/lib/config";
import { documentClient } from "@/lib/dynamodb";
import type { BoardAccessRecord } from "@/lib/board-access";

export const DIRECTOR_ROSTER_KEY = { pk: "DIRECTOR_ROSTER", sk: "STATE" };
export const isVotingDirector = (role: string) => ["member", "chair", "admin"].includes(role);
export interface DirectorRoster {
  revision: string;
  ready: boolean;
  directors: { userId: string; name: string; email: string; status: string }[];
}

// This primary-key record is strongly consistent. The administrative Roster GSI
// cannot prove that every current director was included in a consent action.
export async function readDirectorRoster(client = documentClient, table = BOARD_ACCESS_TABLE): Promise<DirectorRoster | null> {
  const result = await client.get({ TableName: table, Key: DIRECTOR_ROSTER_KEY, ConsistentRead: true });
  return result.Item ? result.Item as DirectorRoster : null;
}

export function directorRosterCondition(previous: DirectorRoster | null) {
  return previous ? {
    ConditionExpression: "#revision = :revision",
    ExpressionAttributeNames: { "#revision": "revision" },
    ExpressionAttributeValues: { ":revision": previous.revision },
  } : { ConditionExpression: "attribute_not_exists(pk)" };
}

export function directorRosterGuard(roster: DirectorRoster, table = BOARD_ACCESS_TABLE) {
  if (!roster.ready) throw new Error("The director roster must be initialized before collecting written consents.");
  return { ConditionCheck: { TableName: table, Key: DIRECTOR_ROSTER_KEY, ...directorRosterCondition(roster) } };
}

export function directorRosterEntry(record: BoardAccessRecord) {
  return { userId: record.id, name: record.name, email: record.email, status: record.status };
}

export function nextDirectorRoster(previous: DirectorRoster | null, record: BoardAccessRecord): DirectorRoster {
  const directors = (previous?.directors || []).filter((entry) => entry.userId !== record.id);
  if (isVotingDirector(record.role) && record.status !== "deactivated") directors.push(directorRosterEntry(record));
  return { revision: randomUUID(), ready: previous?.ready ?? false, directors: directors.sort((a, b) => a.email.localeCompare(b.email)) };
}

export function accessRecordGuard(record: BoardAccessRecord, table = BOARD_ACCESS_TABLE) {
  return { ConditionCheck: {
    TableName: table, Key: { pk: `ACCESS#${record.id}`, sk: "PROFILE" },
    ConditionExpression: "#version = :version AND #status = :active",
    ExpressionAttributeNames: { "#version": "version", "#status": "status" },
    ExpressionAttributeValues: { ":version": record.version, ":active": "active" },
  } };
}
