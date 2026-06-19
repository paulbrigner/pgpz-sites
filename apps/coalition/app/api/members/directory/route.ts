import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { listActiveMemberDirectory } from "@/lib/admin/roster";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions as any);
  const user = (session as any)?.user || null;
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.membershipStatus !== "active") {
    return NextResponse.json({ error: "Active membership required" }, { status: 403 });
  }

  const members = await listActiveMemberDirectory();
  return NextResponse.json({ members });
}
