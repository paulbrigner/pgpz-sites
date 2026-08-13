import "server-only";

import { documentClient, TABLE_NAME } from "@/lib/dynamodb";

/** Best-effort enrollment signal for the dashboard. Authentication must not
 * fail merely because the optional reminder query is unavailable. */
export async function getBoardPasskeyCount(userId: string): Promise<number | null> {
  if (!userId) return null;
  try {
    const result = await documentClient.query({
      TableName: TABLE_NAME,
      IndexName: "GSI2",
      KeyConditionExpression: "#pk = :pk",
      ExpressionAttributeNames: { "#pk": "GSI2PK" },
      ExpressionAttributeValues: {
        ":pk": `BETTER_AUTH#better_auth_passkeys#userId#${userId}`,
      },
      Select: "COUNT",
    });
    return Number(result.Count || 0);
  } catch {
    return null;
  }
}

/** Authorization-grade enrollment check. Unlike the dashboard reminder, an
 * unavailable index fails closed so Board content is never exposed without a
 * confirmed passkey enrollment. */
export async function hasBoardPasskey(userId: string): Promise<boolean> {
  if (!userId) return false;
  const markerKey = { pk: `BOARD_SECURITY#PASSKEY_ENROLLED#${userId}`, sk: "CURRENT" };
  try {
    const marker = await documentClient.get({ TableName: TABLE_NAME, Key: markerKey, ConsistentRead: true });
    if (marker.Item?.enrolled === true) return true;
    const count = await getBoardPasskeyCount(userId);
    if (count === null || count <= 0) return false;
    await markBoardPasskeyEnrolled(userId);
    return true;
  } catch {
    return false;
  }
}

export async function markBoardPasskeyEnrolled(userId: string): Promise<void> {
  if (!userId) return;
  await documentClient.put({
    TableName: TABLE_NAME,
    Item: {
      pk: `BOARD_SECURITY#PASSKEY_ENROLLED#${userId}`,
      sk: "CURRENT",
      type: "BOARD_SECURITY#PASSKEY_ENROLLED",
      userId,
      enrolled: true,
      updatedAt: new Date().toISOString(),
    },
  });
}
