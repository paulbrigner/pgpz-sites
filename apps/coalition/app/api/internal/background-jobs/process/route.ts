import { NextRequest, NextResponse } from "next/server";
import {
  claimBackgroundJobTask,
  isAuthorizedBackgroundJobRequest,
  releaseBackgroundJobTaskForRetry,
  type BackgroundJobMessage,
} from "@/lib/admin/background-jobs";
import { processCoalitionBackgroundJobTask } from "@/lib/admin/coalition-background-job-processor";
import { processEmailBackgroundJobTask } from "@/lib/admin/email-background-job-processor";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isAuthorizedBackgroundJobRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const message = (await request.json().catch(() => null)) as BackgroundJobMessage | null;
  if (message?.version !== 1 || typeof message.jobId !== "string" || typeof message.taskId !== "string") {
    return NextResponse.json({ error: "Invalid background-job message" }, { status: 400 });
  }
  const claim = await claimBackgroundJobTask(message.jobId, message.taskId);
  if (claim.outcome !== "claimed") {
    return NextResponse.json({ ok: true, outcome: claim.outcome });
  }
  try {
    const result = claim.job.kind === "newsletter" ||
      claim.job.kind === "policy_update" ||
      claim.job.kind === "admin_signup_notification"
      ? await processEmailBackgroundJobTask(claim)
      : await processCoalitionBackgroundJobTask(claim);
    return NextResponse.json(
      { ok: !result.retry, ...result },
      { status: result.retry ? 503 : 200 },
    );
  } catch (error) {
    await releaseBackgroundJobTaskForRetry({
      jobId: claim.job.id,
      taskId: claim.task.taskId,
      leaseToken: claim.leaseToken,
      error,
    }).catch(() => undefined);
    return NextResponse.json({ error: "Background job processing failed" }, { status: 503 });
  }
}
