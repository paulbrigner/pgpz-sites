import { NextResponse } from "next/server";
import { resolveAppSession } from "@/lib/app-session";
import { getUserMembershipStatus, MembershipStatusError } from "@/lib/membership-status";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await resolveAppSession();
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const status = await getUserMembershipStatus(userId);
    return NextResponse.json(status);
  } catch (err) {
    if (err instanceof MembershipStatusError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Failed to load membership status", err);
    return NextResponse.json({ error: "Failed to load membership status" }, { status: 500 });
  }
}
