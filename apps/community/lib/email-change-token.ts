import "server-only";

import { documentClient, TABLE_NAME } from "@/lib/dynamodb";

export type EmailChangeToken = {
  identifier: string;
  token: string;
  expires: Date;
  newEmail: string;
  userId: string;
  betterAuthUserId?: string;
};

export const emailChangeTokenKey = (identifier: string, token: string) => ({
  pk: `VT#${identifier}`,
  sk: `VT#${token}`,
});

function parseEmailChangeToken({
  item,
  identifier,
  token,
}: {
  item: Record<string, unknown> | undefined;
  identifier: string;
  token: string;
}): EmailChangeToken | null {
  if (
    !item ||
    item.type !== "VT" ||
    item.identifier !== identifier ||
    item.token !== token
  ) {
    return null;
  }

  const expires =
    typeof item.expires === "number"
      ? new Date(item.expires * 1000)
      : new Date(String(item.expires || ""));
  if (!Number.isFinite(expires.getTime())) return null;
  if (typeof item.newEmail !== "string" || typeof item.userId !== "string") return null;

  return {
    identifier,
    token,
    expires,
    newEmail: item.newEmail,
    userId: item.userId,
    betterAuthUserId:
      typeof item.betterAuthUserId === "string" && item.betterAuthUserId.trim()
        ? item.betterAuthUserId
        : undefined,
  };
}

export async function createEmailChangeToken(record: EmailChangeToken) {
  await documentClient.transactWrite({
    TransactItems: [
      {
        ConditionCheck: {
          TableName: TABLE_NAME,
          Key: { pk: `USER#${record.userId}`, sk: `USER#${record.userId}` },
          ConditionExpression:
            "attribute_exists(#pk) AND (attribute_not_exists(#accountStatus) OR #accountStatus = :active) AND attribute_not_exists(#deactivatedAt)",
          ExpressionAttributeNames: {
            "#pk": "pk",
            "#accountStatus": "accountStatus",
            "#deactivatedAt": "deactivatedAt",
          },
          ExpressionAttributeValues: { ":active": "active" },
        },
      },
      {
        Put: {
          TableName: TABLE_NAME,
          Item: {
            ...emailChangeTokenKey(record.identifier, record.token),
            type: "VT",
            identifier: record.identifier,
            token: record.token,
            expires: Math.ceil(record.expires.getTime() / 1000),
            newEmail: record.newEmail,
            userId: record.userId,
            ...(record.betterAuthUserId ? { betterAuthUserId: record.betterAuthUserId } : {}),
          },
          ConditionExpression: "attribute_not_exists(#pk)",
          ExpressionAttributeNames: { "#pk": "pk" },
        },
      },
    ],
  });
  return record;
}

export async function getEmailChangeToken({
  identifier,
  token,
}: {
  identifier: string;
  token: string;
}): Promise<EmailChangeToken | null> {
  const result = await documentClient.get({
    TableName: TABLE_NAME,
    Key: emailChangeTokenKey(identifier, token),
    ConsistentRead: true,
  });
  return parseEmailChangeToken({
    item: result.Item as Record<string, unknown> | undefined,
    identifier,
    token,
  });
}

export function consumeEmailChangeTokenTransactionItem(record: EmailChangeToken) {
  return {
    Delete: {
      TableName: TABLE_NAME,
      Key: emailChangeTokenKey(record.identifier, record.token),
      ConditionExpression:
        "attribute_exists(#pk) AND #type = :type AND #identifier = :identifier AND #token = :token AND #userId = :userId AND #newEmail = :newEmail AND #expires >= :now",
      ExpressionAttributeNames: {
        "#pk": "pk",
        "#type": "type",
        "#identifier": "identifier",
        "#token": "token",
        "#userId": "userId",
        "#newEmail": "newEmail",
        "#expires": "expires",
      },
      ExpressionAttributeValues: {
        ":type": "VT",
        ":identifier": record.identifier,
        ":token": record.token,
        ":userId": record.userId,
        ":newEmail": record.newEmail,
        ":now": Math.floor(Date.now() / 1000),
      },
    },
  };
}

export async function consumeEmailChangeToken({
  identifier,
  token,
}: {
  identifier: string;
  token: string;
}): Promise<EmailChangeToken | null> {
  const result = await documentClient.delete({
    TableName: TABLE_NAME,
    Key: emailChangeTokenKey(identifier, token),
    ReturnValues: "ALL_OLD",
  });
  return parseEmailChangeToken({
    item: result.Attributes as Record<string, unknown> | undefined,
    identifier,
    token,
  });
}
