import { NextRequest, NextResponse } from "next/server";
import { documentClient, TABLE_NAME } from "@/lib/dynamodb";
import { requireAdminSession } from "@/lib/admin/auth";
import { AdminMemberActionError, updateAdminMemberAdminAccess } from "@/lib/admin/roster";

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

export async function POST(request: NextRequest) {
  let adminUserId: string | null = null;
  try {
    const session = await requireAdminSession();
    adminUserId = (session.user as any)?.id || null;
  } catch {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const emailRaw = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const userIdRaw = typeof body?.userId === "string" ? body.userId.trim() : "";
    const makeAdmin = typeof body?.isAdmin === "boolean" ? body.isAdmin : true;
    const confirmation = typeof body?.confirmation === "string" ? body.confirmation : "";

    if (!emailRaw && !userIdRaw) {
      return NextResponse.json({ error: "Provide userId or email" }, { status: 400 });
    }

    let user: UserRecord | null = null;
    if (userIdRaw) user = await findUserById(userIdRaw);
    if (!user && emailRaw) user = await findUserByEmail(emailRaw);

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const result = await updateAdminMemberAdminAccess({
      userId: user.id,
      adminUserId,
      isAdmin: makeAdmin,
      confirmation,
    });

    return NextResponse.json({
      ...result,
      email: user.email || null,
    });
  } catch (err) {
    if (err instanceof AdminMemberActionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Admin adminize error", err);
    return NextResponse.json({ error: "Failed to update admin flag" }, { status: 500 });
  }
}
