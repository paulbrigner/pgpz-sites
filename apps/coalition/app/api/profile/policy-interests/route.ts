import { NextRequest, NextResponse } from "next/server";
import { documentClient, TABLE_NAME } from "@/lib/dynamodb";
import { resolveAppSession } from "@/lib/app-session";
import { normalizePolicyInterestGroups } from "@/lib/policy-interest-groups";

export async function POST(request: NextRequest) {
  try {
    const session = await resolveAppSession(request.headers);
    const userId = session?.user?.id || "";
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const policyInterestGroups = normalizePolicyInterestGroups(body?.policyInterestGroups);
    const updated = await documentClient.update({
      TableName: TABLE_NAME,
      Key: { pk: `USER#${userId}`, sk: `USER#${userId}` },
      UpdateExpression: "SET policyInterestGroups = :policyInterestGroups, updatedAt = :now",
      ExpressionAttributeValues: {
        ":policyInterestGroups": policyInterestGroups,
        ":now": new Date().toISOString(),
      },
      ReturnValues: "ALL_NEW",
    });

    return NextResponse.json({
      ok: true,
      policyInterestGroups: normalizePolicyInterestGroups(updated.Attributes?.policyInterestGroups),
    });
  } catch (err) {
    console.error("/api/profile/policy-interests error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
