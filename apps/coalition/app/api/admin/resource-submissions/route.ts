import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin/auth";
import {
  listResourceSubmissions,
  ResourceSubmissionError,
  reviewResourceSubmission,
  type ResourceSubmissionStatus,
} from "@/lib/resource-submissions";

export const dynamic = "force-dynamic";

async function adminSession() {
  try {
    return { session: await requireAdminSession(), response: null };
  } catch {
    return { session: null, response: NextResponse.json({ error: "Admin access required" }, { status: 403 }) };
  }
}

export async function GET(request: NextRequest) {
  const { response } = await adminSession();
  if (response) return response;
  const rawStatus = request.nextUrl.searchParams.get("status");
  const status: ResourceSubmissionStatus | "all" =
    rawStatus === "pending" || rawStatus === "approved" || rawStatus === "rejected"
      ? rawStatus
      : "all";
  return NextResponse.json({ submissions: await listResourceSubmissions(status) });
}

export async function PATCH(request: NextRequest) {
  const { session, response } = await adminSession();
  if (response || !session) return response;
  try {
    const body = await request.json();
    if (body?.decision !== "approved" && body?.decision !== "rejected") {
      return NextResponse.json({ error: "Decision must be approved or rejected" }, { status: 400 });
    }
    const submission = await reviewResourceSubmission({
      id: typeof body?.id === "string" ? body.id.trim() : "",
      decision: body.decision,
      adminUserId: String((session.user as any)?.id || ""),
      note: body?.note,
    });
    return NextResponse.json({ ok: true, submission });
  } catch (error) {
    if (error instanceof ResourceSubmissionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Resource moderation failed", error);
    return NextResponse.json({ error: "Failed to review resource submission" }, { status: 500 });
  }
}
