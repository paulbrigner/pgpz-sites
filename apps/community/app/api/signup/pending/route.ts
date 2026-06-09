import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { NEXTAUTH_SECRET } from "@/lib/config";
import { documentClient, TABLE_NAME } from "@/lib/dynamodb";

const normalizeEmail = (value: unknown) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const normalizeXHandle = (value: unknown) => {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
};

const normalizeLinkedinUrl = (value: unknown) => {
  if (typeof value !== "string") return "";
  return value.trim();
};

const validateProfile = (body: any) => {
  const email = normalizeEmail(body?.email);
  const firstName = typeof body?.firstName === "string" ? body.firstName.trim() : "";
  const lastName = typeof body?.lastName === "string" ? body.lastName.trim() : "";
  const xHandle = normalizeXHandle(body?.xHandle);
  const linkedinUrl = normalizeLinkedinUrl(body?.linkedinUrl);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Enter a valid email address.");
  }
  if (!firstName) throw new Error("First name is required.");
  if (!lastName) throw new Error("Last name is required.");
  if (xHandle.length > 50) throw new Error("X handle too long.");

  if (linkedinUrl) {
    try {
      const url = new URL(linkedinUrl);
      if (!/^https?:$/.test(url.protocol)) throw new Error();
    } catch {
      throw new Error("LinkedIn URL must be http(s).");
    }
  }

  return { email, firstName, lastName, xHandle, linkedinUrl };
};

const pendingKey = (email: string, signupProfileId: string) => ({
  pk: `SIGNUP_PROFILE#${email}`,
  sk: `SIGNUP_PROFILE#${signupProfileId}`,
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const profile = validateProfile(body);
    const signupProfileId = randomUUID();
    const now = new Date().toISOString();
    const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 24;

    await documentClient.put({
      TableName: TABLE_NAME,
      Item: {
        ...pendingKey(profile.email, signupProfileId),
        type: "SIGNUP_PROFILE",
        signupProfileId,
        email: profile.email,
        firstName: profile.firstName,
        lastName: profile.lastName,
        xHandle: profile.xHandle || null,
        linkedinUrl: profile.linkedinUrl || null,
        createdAt: now,
        expiresAt,
      },
    });

    return NextResponse.json({ ok: true, signupProfileId });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Could not save signup profile." }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const token = await getToken({ req: request as any, secret: NEXTAUTH_SECRET });
    const userId = typeof token?.sub === "string" ? token.sub : "";
    const email = normalizeEmail(token?.email);
    if (!userId || !email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const signupProfileId = typeof body?.signupProfileId === "string" ? body.signupProfileId.trim() : "";
    if (!signupProfileId) {
      return NextResponse.json({ ok: true, applied: false });
    }

    const key = pendingKey(email, signupProfileId);
    const pending = await documentClient.get({
      TableName: TABLE_NAME,
      Key: key,
    });

    const item = pending.Item as any;
    if (!item || item.type !== "SIGNUP_PROFILE") {
      return NextResponse.json({ ok: true, applied: false });
    }

    const expiresAt = typeof item.expiresAt === "number" ? item.expiresAt : 0;
    if (expiresAt && expiresAt < Math.floor(Date.now() / 1000)) {
      await documentClient.delete({ TableName: TABLE_NAME, Key: key });
      return NextResponse.json({ ok: true, applied: false, expired: true });
    }

    const userKey = { pk: `USER#${userId}`, sk: `USER#${userId}` };
    const existing = await documentClient.get({
      TableName: TABLE_NAME,
      Key: userKey,
      ProjectionExpression: "xHandle, membershipVerifiedAt",
    });

    const firstName = typeof item.firstName === "string" ? item.firstName.trim() : "";
    const lastName = typeof item.lastName === "string" ? item.lastName.trim() : "";
    const name = `${firstName} ${lastName}`.trim();
    const linkedinUrl = typeof item.linkedinUrl === "string" ? item.linkedinUrl.trim() : "";
    const xHandle = normalizeXHandle(item.xHandle);
    const canUpdateXHandle = xHandle && !existing.Item?.membershipVerifiedAt;

    const updateParts = [
      "firstName = :firstName",
      "lastName = :lastName",
      "#name = :name",
      "linkedinUrl = :linkedinUrl",
    ];
    const names: Record<string, string> = { "#name": "name" };
    const values: Record<string, unknown> = {
      ":firstName": firstName,
      ":lastName": lastName,
      ":name": name,
      ":linkedinUrl": linkedinUrl || null,
    };

    if (canUpdateXHandle) {
      updateParts.push("xHandle = :xHandle");
      values[":xHandle"] = xHandle;
    }

    await documentClient.update({
      TableName: TABLE_NAME,
      Key: userKey,
      UpdateExpression: `SET ${updateParts.join(", ")}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    });

    await documentClient.delete({ TableName: TABLE_NAME, Key: key });

    return NextResponse.json({
      ok: true,
      applied: true,
      profile: { firstName, lastName, name, linkedinUrl, xHandle: canUpdateXHandle ? xHandle : null },
    });
  } catch (err) {
    console.error("/api/signup/pending PATCH error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
