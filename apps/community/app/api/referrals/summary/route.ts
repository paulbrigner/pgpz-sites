import { NextRequest, NextResponse } from "next/server";
import { resolveAppSession } from "@/lib/app-session";
import { getReferralSummaryForUser } from "@/lib/referrals";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await resolveAppSession(request.headers);
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    return NextResponse.json(await getReferralSummaryForUser(userId));
  } catch (err) {
    console.error("Failed to load referral summary", err);
    return NextResponse.json({ error: "Failed to load referral summary" }, { status: 500 });
  }
}
