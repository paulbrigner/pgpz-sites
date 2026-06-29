import { NextResponse } from "next/server";
import { resolveAppSession } from "@/lib/app-session";
import { listActiveMemberDirectory } from "@/lib/admin/roster";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await resolveAppSession();
  const user = session?.user || null;
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.membershipStatus !== "active") {
    return NextResponse.json({ error: "Active membership required" }, { status: 403 });
  }

  const members = await listActiveMemberDirectory();
  return NextResponse.json({ members });
}
