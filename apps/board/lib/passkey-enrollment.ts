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
