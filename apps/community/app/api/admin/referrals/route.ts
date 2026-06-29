import { NextResponse } from "next/server";
import { AdminAccessError, requireAdminSession } from "@/lib/admin/auth";
import { buildReferralAdminReport } from "@/lib/referrals";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdminSession();
    return NextResponse.json(await buildReferralAdminReport());
  } catch (err) {
    if (err instanceof AdminAccessError) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }
    console.error("Failed to load referral report", err);
    return NextResponse.json({ error: "Failed to load referral report" }, { status: 500 });
  }
}
