import { NextRequest, NextResponse } from "next/server";
import { documentClient, TABLE_NAME } from "@/lib/dynamodb";
import { requireAdminSession } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

type UserRecord = {
  id: string;
  email?: string | null;
};

async function findUserById(userId: string): Promise<UserRecord | null> {
  const res = await documentClient.get({
    TableName: TABLE_NAME,
    Key: { pk: `USER#${userId}`, sk: `USER#${userId}` },
  });
  const item = res.Item;
  if (!item?.id) return null;
  return {
    id: item.id as string,
    email: (item.email as string | undefined) || null,
  };
}

async function findUserByEmail(email: string): Promise<UserRecord | null> {
  const res = await documentClient.query({
    TableName: TABLE_NAME,
    IndexName: "GSI1",
    KeyConditionExpression: "#gsi1pk = :pk AND #gsi1sk = :sk",
    ExpressionAttributeNames: { "#gsi1pk": "GSI1PK", "#gsi1sk": "GSI1SK" },
    ExpressionAttributeValues: {
      ":pk": `USER#${email}`,
      ":sk": `USER#${email}`,
    },
    Limit: 1,
  });
  const item = res.Items?.[0];
  if (!item?.id) return null;
  return {
    id: item.id as string,
    email: (item.email as string | undefined) || null,
  };
}

async function setAdminFlag(userId: string, isAdmin: boolean) {
  await documentClient.update({
    TableName: TABLE_NAME,
    Key: {
      pk: `USER#${userId}`,
      sk: `USER#${userId}`,
    },
    UpdateExpression: "SET isAdmin = :flag",
    ExpressionAttributeValues: {
      ":flag": isAdmin,
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    await requireAdminSession();
  } catch {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const emailRaw = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const userIdRaw = typeof body?.userId === "string" ? body.userId.trim() : "";
    const makeAdmin = typeof body?.isAdmin === "boolean" ? body.isAdmin : true;

    if (!emailRaw && !userIdRaw) {
      return NextResponse.json({ error: "Provide userId or email" }, { status: 400 });
    }

    let user: UserRecord | null = null;
    if (userIdRaw) user = await findUserById(userIdRaw);
    if (!user && emailRaw) user = await findUserByEmail(emailRaw);

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    await setAdminFlag(user.id, makeAdmin);

    return NextResponse.json({
      ok: true,
      userId: user.id,
      email: user.email || null,
      isAdmin: makeAdmin,
    });
  } catch (err) {
    console.error("Admin adminize error", err);
    return NextResponse.json({ error: "Failed to update admin flag" }, { status: 500 });
  }
}
