import { NextRequest, NextResponse } from "next/server";
import {
  isAuthorizedBackgroundJobRequest,
  reconcileBackgroundJobs,
} from "@/lib/admin/background-jobs";
import { reconcileEmailBackgroundJobProjections } from "@/lib/admin/email-background-job-processor";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isAuthorizedBackgroundJobRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const jobs = await reconcileBackgroundJobs();
  const projections = await reconcileEmailBackgroundJobProjections();
  return NextResponse.json({ ok: true, ...jobs, ...projections });
}
