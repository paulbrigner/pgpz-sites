import "server-only";

import { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { NEXTAUTH_SECRET } from "@/lib/config";
import { documentClient, TABLE_NAME } from "@/lib/dynamodb";

export async function hasPolicyUpdateResourceAccess(request: NextRequest) {
  const token = await getToken({ req: request as any, secret: NEXTAUTH_SECRET });
  const userId = typeof token?.sub === "string" ? token.sub : "";
  if (!userId) return { allowed: false, isAdmin: false };

  const user = await documentClient.get({
    TableName: TABLE_NAME,
    Key: { pk: `USER#${userId}`, sk: `USER#${userId}` },
    ProjectionExpression: "membershipStatus, isAdmin",
  });

  const isAdmin = user.Item?.isAdmin === true;
  return {
    allowed: user.Item?.membershipStatus === "active" || isAdmin,
    isAdmin,
  };
}
