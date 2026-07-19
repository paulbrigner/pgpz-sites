import { NextRequest, NextResponse } from "next/server";
import {
  BACKGROUND_JOB_STATUSES,
  BACKGROUND_JOB_TASK_STATUSES,
  type BackgroundJobStatus,
  type BackgroundJobTaskStatus,
} from "@pgpz/background-jobs";
import { requireAdminSession } from "@/lib/admin/auth";
import {
  cancelBackgroundJob,
  getBackgroundJob,
  listBackgroundJobsPage,
  listBackgroundJobTasks,
  listBackgroundJobTasksPage,
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
  if (!jobId) {
    const statusValue = request.nextUrl.searchParams.get("status")?.trim() || null;
    if (
      statusValue &&
      !(BACKGROUND_JOB_STATUSES as readonly string[]).includes(statusValue)
    ) {
      return NextResponse.json({ error: "Unknown background job status" }, { status: 400 });
    }
    try {
      return NextResponse.json(
        await listBackgroundJobsPage({
          limit: Number(request.nextUrl.searchParams.get("limit") || 30),
          cursor: request.nextUrl.searchParams.get("cursor"),
          status: statusValue as BackgroundJobStatus | null,
        }),
      );
    } catch (error: any) {
      return NextResponse.json(
        { error: error?.message || "Invalid background job page" },
        { status: 400 },
      );
    }
  }
  const taskStatusValue = request.nextUrl.searchParams.get("taskStatus")?.trim() || null;
  if (
    taskStatusValue &&
    !(BACKGROUND_JOB_TASK_STATUSES as readonly string[]).includes(taskStatusValue)
  ) {
    return NextResponse.json({ error: "Unknown background job task status" }, { status: 400 });
  }
  const includeTaskPage =
    request.nextUrl.searchParams.get("includeTasks") === "true" ||
    !!taskStatusValue ||
    request.nextUrl.searchParams.has("taskCursor");
  if (includeTaskPage) {
    try {
      const [job, page] = await Promise.all([
        getBackgroundJob(jobId),
        listBackgroundJobTasksPage(jobId, {
          limit: Number(request.nextUrl.searchParams.get("taskLimit") || 50),
          cursor: request.nextUrl.searchParams.get("taskCursor"),
          status: taskStatusValue as BackgroundJobTaskStatus | null,
        }),
      ]);
      if (!job) return NextResponse.json({ error: "Background job not found" }, { status: 404 });
      return NextResponse.json({ job, ...page });
    } catch (error: any) {
      return NextResponse.json(
        { error: error?.message || "Invalid background job task page" },
        { status: 400 },
      );
    }
  }
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
