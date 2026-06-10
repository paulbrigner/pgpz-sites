import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin/auth";
import { approveManualApproval, ManualApprovalError } from "@/lib/manual-approval";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let adminUserId: string | null = null;
  try {
    const session = await requireAdminSession();
    adminUserId = (session.user as any)?.id || null;
  } catch {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const userId = typeof body?.userId === "string" ? body.userId.trim() : "";
    const result = await approveManualApproval({ userId, adminUserId });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ManualApprovalError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Manual approval admin action failed", err);
    return NextResponse.json({ error: "Failed to approve manual request" }, { status: 500 });
  }
}
