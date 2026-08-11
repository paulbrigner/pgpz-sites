import { NextResponse } from "next/server";
import { isFeatureEnabled } from "@/config/features";
import { resolveAppSession } from "@/lib/app-session";
import { listVisibleMemberProfiles } from "@/lib/member-profiles";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isFeatureEnabled("memberDirectory")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const session = await resolveAppSession();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.capabilities.member) {
    return NextResponse.json({ error: "Active membership required" }, { status: 403 });
  }
  const response = NextResponse.json({ members: await listVisibleMemberProfiles() });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
