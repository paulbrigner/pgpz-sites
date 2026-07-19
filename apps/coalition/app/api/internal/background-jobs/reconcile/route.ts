import { NextRequest, NextResponse } from "next/server";
import {
  isAuthorizedBackgroundJobRequest,
  reconcileBackgroundJobs,
} from "@/lib/admin/background-jobs";
import { reconcileCoalitionBackgroundJobProjections } from "@/lib/admin/coalition-background-job-processor";
import { reconcileEmailBackgroundJobProjections } from "@/lib/admin/email-background-job-processor";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isAuthorizedBackgroundJobRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const jobs = await reconcileBackgroundJobs();
  const emailProjections = await reconcileEmailBackgroundJobProjections();
  const coalitionProjections = await reconcileCoalitionBackgroundJobProjections();
  return NextResponse.json({
    ok: true,
    ...jobs,
    ...emailProjections,
    ...coalitionProjections,
  });
}
