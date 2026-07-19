import { NextRequest, NextResponse } from "next/server";
import { resolveAppSession } from "@/lib/app-session";
import {
  getMemberEmailPreferences,
  updateMemberEmailPreferences,
} from "@/lib/email-preferences";

export const dynamic = "force-dynamic";

async function memberSession(request: NextRequest) {
  const session = await resolveAppSession(request.headers);
  if (!session?.user?.id) {
    return { session: null, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { session, response: null };
}

export async function GET(request: NextRequest) {
  const { session, response } = await memberSession(request);
  if (response || !session) return response;
  try {
    return NextResponse.json(await getMemberEmailPreferences(session.user.id as string));
  } catch (error) {
    console.error("Failed to load email preferences", error);
    return NextResponse.json({ error: "Failed to load email preferences" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { session, response } = await memberSession(request);
  if (response || !session) return response;
  try {
    const body = await request.json();
    if (typeof body?.newsletter !== "boolean" || typeof body?.policyUpdates !== "boolean") {
      return NextResponse.json({ error: "Both email preferences are required" }, { status: 400 });
    }
    const preferences = await updateMemberEmailPreferences({
      userId: session.user.id as string,
      newsletter: body.newsletter,
      policyUpdates: body.policyUpdates,
    });
    return NextResponse.json({ ok: true, ...preferences });
  } catch (error) {
    console.error("Failed to update email preferences", error);
    return NextResponse.json({ error: "Failed to update email preferences" }, { status: 500 });
  }
}
