import { NextRequest, NextResponse } from "next/server";
import { documentClient, TABLE_NAME } from "@/lib/dynamodb";
import { resolveAppSession } from "@/lib/app-session";

export async function POST(request: NextRequest) {
  try {
    const session = await resolveAppSession(request.headers);
    const userId = session?.user?.id || "";
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { firstName, lastName } = body || {};
    let { xHandle, linkedinUrl } = body || {};

    // Basic validations
    const err = (msg: string) => NextResponse.json({ error: msg }, { status: 400 });
    if (!firstName || typeof firstName !== "string" || firstName.trim().length < 1) return err("First name is required");
    if (!lastName || typeof lastName !== "string" || lastName.trim().length < 1) return err("Last name is required");
    if (xHandle && typeof xHandle === "string") {
      // Normalize: ensure it starts with '@'
      xHandle = xHandle.trim();
      if (xHandle && !xHandle.startsWith("@")) xHandle = `@${xHandle}`;
      if (xHandle.length > 50) return err("X handle too long");
    }
    if (linkedinUrl && typeof linkedinUrl === "string") {
      linkedinUrl = linkedinUrl.trim();
      try {
        const u = new URL(linkedinUrl);
        if (!/^https?:$/.test(u.protocol)) return err("LinkedIn URL must be http(s)");
      } catch {
        return err("Invalid LinkedIn URL");
      }
    }

    const name = `${firstName.trim()} ${lastName.trim()}`.trim();
    const updated = await documentClient.update({
      TableName: TABLE_NAME,
      Key: { pk: `USER#${userId}`, sk: `USER#${userId}` },
      UpdateExpression:
        "SET firstName = :firstName, lastName = :lastName, #name = :name, xHandle = :xHandle, linkedinUrl = :linkedinUrl, updatedAt = :now",
      ExpressionAttributeNames: { "#name": "name" },
      ExpressionAttributeValues: {
        ":firstName": firstName.trim(),
        ":lastName": lastName.trim(),
        ":name": name,
        ":xHandle": xHandle || null,
        ":linkedinUrl": linkedinUrl || null,
        ":now": new Date().toISOString(),
      },
      ReturnValues: "ALL_NEW",
    });

    const item = updated.Attributes || {};
    return NextResponse.json({ ok: true, user: { id: item.id, firstName: item.firstName, lastName: item.lastName, xHandle: item.xHandle, linkedinUrl: item.linkedinUrl } });
  } catch (e: any) {
    const msg = typeof e?.message === "string" ? e.message : (() => { try { return JSON.stringify(e); } catch { return String(e); } })();
    console.error("/api/profile/update error:", msg);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
