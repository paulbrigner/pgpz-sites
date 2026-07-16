import "server-only";

import { documentClient, TABLE_NAME } from "@/lib/dynamodb";
import { normalizeEmail, updateAppUserEmail, userKey } from "@/lib/app-users";

const BETTER_AUTH_USER_TYPE = "BETTER_AUTH#better_auth_users";

type BetterAuthUserRecord = {
  id: string;
  email: string;
};

const betterAuthUserKey = (id: string) => ({
  pk: `${BETTER_AUTH_USER_TYPE}#${id}`,
  sk: `${BETTER_AUTH_USER_TYPE}#${id}`,
});

async function findBetterAuthUsersByEmail(email: string): Promise<BetterAuthUserRecord[]> {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return [];

  const result = await documentClient.query({
    TableName: TABLE_NAME,
    IndexName: "GSI1",
    KeyConditionExpression: "#gsi1pk = :gsi1pk",
    ExpressionAttributeNames: { "#gsi1pk": "GSI1PK" },
    ExpressionAttributeValues: {
      ":gsi1pk": `${BETTER_AUTH_USER_TYPE}#email#${normalizedEmail}`,
    },
  });

  return (result.Items || [])
    .filter((item) => item.type === BETTER_AUTH_USER_TYPE && typeof item.id === "string")
    .map((item) => ({ id: String(item.id), email: normalizeEmail(item.email) }));
}

export class BetterAuthEmailCollisionError extends Error {
  constructor() {
    super("That email is already in use.");
    this.name = "BetterAuthEmailCollisionError";
  }
}

export async function updateAppAndBetterAuthUserEmail({
  appUserId,
  betterAuthUserId,
  oldEmail,
  newEmail,
}: {
  appUserId: string;
  betterAuthUserId?: string;
  oldEmail: string;
  newEmail: string;
}) {
  const normalizedOldEmail = normalizeEmail(oldEmail);
  const normalizedNewEmail = normalizeEmail(newEmail);
  let normalizedBetterAuthUserId = betterAuthUserId?.trim() || "";
  if (!normalizedBetterAuthUserId) {
    const sourceUsers = await findBetterAuthUsersByEmail(normalizedOldEmail);
    if (sourceUsers.length > 1) {
      throw new Error("Multiple Better Auth accounts match the current email.");
    }
    normalizedBetterAuthUserId = sourceUsers[0]?.id || "";
    if (!normalizedBetterAuthUserId) {
      const updated = await updateAppUserEmail(appUserId, normalizedNewEmail);
      if (!updated?.id) throw new Error("The application account could not be updated.");
      return { betterAuthUpdated: false };
    }
  }
  const targetUsers = await findBetterAuthUsersByEmail(normalizedNewEmail);
  if (targetUsers.some((user) => user.id !== normalizedBetterAuthUserId)) {
    throw new BetterAuthEmailCollisionError();
  }

  const now = new Date().toISOString();
  await documentClient.transactWrite({
    TransactItems: [
      {
        Update: {
          TableName: TABLE_NAME,
          Key: userKey(appUserId),
          UpdateExpression:
            "SET #email = :newEmail, #gsi1pk = :appGsi, #gsi1sk = :appGsi, #updatedAt = :updatedAt",
          ConditionExpression: "attribute_exists(#pk) AND #email = :oldEmail",
          ExpressionAttributeNames: {
            "#pk": "pk",
            "#email": "email",
            "#gsi1pk": "GSI1PK",
            "#gsi1sk": "GSI1SK",
            "#updatedAt": "updatedAt",
          },
          ExpressionAttributeValues: {
            ":oldEmail": normalizedOldEmail,
            ":newEmail": normalizedNewEmail,
            ":appGsi": `USER#${normalizedNewEmail}`,
            ":updatedAt": now,
          },
        },
      },
      {
        Update: {
          TableName: TABLE_NAME,
          Key: betterAuthUserKey(normalizedBetterAuthUserId),
          UpdateExpression:
            "SET #email = :newEmail, #gsi1pk = :betterAuthGsi, #gsi1sk = :betterAuthUserId, #updatedAt = :updatedAt",
          ConditionExpression: "attribute_exists(#pk) AND #email = :oldEmail",
          ExpressionAttributeNames: {
            "#pk": "pk",
            "#email": "email",
            "#gsi1pk": "GSI1PK",
            "#gsi1sk": "GSI1SK",
            "#updatedAt": "updatedAt",
          },
          ExpressionAttributeValues: {
            ":oldEmail": normalizedOldEmail,
            ":newEmail": normalizedNewEmail,
            ":betterAuthGsi": `${BETTER_AUTH_USER_TYPE}#email#${normalizedNewEmail}`,
            ":betterAuthUserId": normalizedBetterAuthUserId,
            ":updatedAt": now,
          },
        },
      },
    ],
  });
  return { betterAuthUpdated: true };
}
