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

const tokenKey = (identifier: string, token: string) => ({
  pk: `VT#${identifier}`,
  sk: `VT#${token}`,
});

export async function createEmailChangeToken(record: EmailChangeToken) {
  await documentClient.put({
    TableName: TABLE_NAME,
    Item: {
      ...tokenKey(record.identifier, record.token),
      type: "VT",
      identifier: record.identifier,
      token: record.token,
      expires: Math.ceil(record.expires.getTime() / 1000),
      newEmail: record.newEmail,
      userId: record.userId,
      ...(record.betterAuthUserId ? { betterAuthUserId: record.betterAuthUserId } : {}),
    },
  });
  return record;
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
    Key: tokenKey(identifier, token),
    ReturnValues: "ALL_OLD",
  });
  const item = result.Attributes as Record<string, unknown> | undefined;
  if (!item || item.type !== "VT") return null;

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
