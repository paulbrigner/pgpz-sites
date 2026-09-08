import "server-only";
import { randomUUID } from "node:crypto";
import type { BoardAccessRecord } from "@/lib/board-access";
import type { BoardAccessDocumentClient } from "@/lib/board-access-repository";
import { DIRECTOR_ROSTER_KEY, directorRosterCondition, directorRosterEntry, isVotingDirector, readDirectorRoster } from "@/lib/director-roster";

export async function planDirectorRosterInitialization(client: BoardAccessDocumentClient, table: string) {
  const previous = await readDirectorRoster(client, table);
  if (previous?.ready) return { previous, roster: previous, alreadyInitialized: true };
  const records: BoardAccessRecord[] = [];
  let cursor: Record<string, unknown> | undefined;
  do {
    const page = await client.scan({ TableName: table, ConsistentRead: true,
      FilterExpression: "#type = :profile", ExpressionAttributeNames: { "#type": "type" },
      ExpressionAttributeValues: { ":profile": "BOARD_ACCESS_PROFILE" },
      ...(cursor ? { ExclusiveStartKey: cursor } : {}),
    });
    records.push(...(page.Items || []).filter((row: Record<string, unknown>) => row.type === "BOARD_ACCESS_PROFILE"));
    cursor = page.LastEvaluatedKey;
  } while (cursor);
  const directors = records.filter((record) => isVotingDirector(record.role) && record.status !== "deactivated").map(directorRosterEntry).sort((a, b) => a.email.localeCompare(b.email));
  if (!directors.length || directors.length > 30 || new Set(directors.map((d) => d.email)).size !== directors.length || directors.some((d) => !d.email || !d.userId || !d.name)) throw new Error("Director roster is missing, duplicated, or outside the supported size. Resolve it before initialization.");
  return { previous, roster: { revision: randomUUID(), ready: true, directors }, alreadyInitialized: false };
}

export function directorRosterInitializationItem(table: string, plan: Awaited<ReturnType<typeof planDirectorRosterInitialization>>) {
  if (plan.alreadyInitialized) throw new Error("The director roster is already initialized.");
  return { Put: { TableName: table, Item: { ...DIRECTOR_ROSTER_KEY, ...plan.roster }, ...directorRosterCondition(plan.previous) } };
}
