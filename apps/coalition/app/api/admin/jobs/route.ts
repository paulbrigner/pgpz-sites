import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin/auth";
import {
  cancelBackgroundJob,
  getBackgroundJob,
  listBackgroundJobs,
  listBackgroundJobTasks,
  retryBackgroundJob,
} from "@/lib/admin/background-jobs";

export const dynamic = "force-dynamic";

async function requireAdminOrForbidden() {
  try {
    await requireAdminSession();
    return null;
  } catch {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
}

export async function GET(request: NextRequest) {
  const forbidden = await requireAdminOrForbidden();
  if (forbidden) return forbidden;
  const jobId = request.nextUrl.searchParams.get("jobId")?.trim();
  if (!jobId) return NextResponse.json({ jobs: await listBackgroundJobs() });
  const [job, tasks] = await Promise.all([
    getBackgroundJob(jobId),
    listBackgroundJobTasks(jobId),
  ]);
  if (!job) return NextResponse.json({ error: "Background job not found" }, { status: 404 });
  return NextResponse.json({
    job,
    deliveryUnknownTaskIds: tasks
      .filter((task) => task.status === "delivery_unknown")
      .map((task) => task.taskId),
    failures: tasks
      .filter((task) => task.status === "failed" || task.status === "delivery_unknown")
      .slice(0, 20)
      .map((task) => ({
        taskId: task.taskId,
        email: task.recipient.email,
        status: task.status,
        error: task.lastError,
      })),
  });
}

export async function POST(request: NextRequest) {
  const forbidden = await requireAdminOrForbidden();
  if (forbidden) return forbidden;
  const body = await request.json().catch(() => null);
  const jobId = typeof body?.jobId === "string" ? body.jobId.trim() : "";
  if (!jobId) return NextResponse.json({ error: "jobId is required" }, { status: 400 });
  try {
    if (body?.action === "retry") {
      return NextResponse.json({
        ok: true,
        ...(await retryBackgroundJob(jobId, {
          acknowledgeDeliveryUnknown: body?.acknowledgeDeliveryUnknown === true,
          deliveryUnknownTaskIds: Array.isArray(body?.deliveryUnknownTaskIds)
            ? body.deliveryUnknownTaskIds.filter(
                (taskId: unknown): taskId is string =>
                  typeof taskId === "string" && !!taskId.trim(),
              )
            : [],
        })),
      });
    }
    if (body?.action === "cancel") return NextResponse.json({ ok: true, job: await cancelBackgroundJob(jobId) });
    return NextResponse.json({ error: "Unknown job action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Background job action failed" }, { status: 409 });
  }
}
