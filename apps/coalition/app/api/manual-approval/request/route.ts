import { NextRequest, NextResponse } from "next/server";
import { resolveAppSession } from "@/lib/app-session";
import { ManualApprovalError, requestManualApproval } from "@/lib/manual-approval";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const session = await resolveAppSession(request.headers);
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const result = await requestManualApproval(userId);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof ManualApprovalError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Manual approval request failed", err);
    return NextResponse.json({ error: "Failed to request manual approval" }, { status: 500 });
  }
}
