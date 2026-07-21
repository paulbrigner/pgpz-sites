import { NextResponse } from "next/server";
import { AdminAccessError, requireAdminSession } from "@/lib/admin/auth";
import {
  AdminXMonitorBriefingError,
  createCuratedBriefingTopic,
  listCuratedBriefingTopics,
} from "@/lib/admin/x-monitor-briefings";
import { isCommunityXMonitorBriefingsEnabled } from "@/lib/x-monitor-public";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const errorResponse = (error: unknown) => {
  if (error instanceof AdminAccessError) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  if (error instanceof AdminXMonitorBriefingError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error("Admin Topic Briefings request failed", error);
  return NextResponse.json({ error: "Topic Briefings request failed" }, { status: 500 });
};

const requireEnabledAdmin = async () => {
  await requireAdminSession();
  if (!isCommunityXMonitorBriefingsEnabled()) {
    throw new AdminXMonitorBriefingError("Topic Briefings are not enabled", 404);
  }
};

export async function GET() {
  try {
    await requireEnabledAdmin();
    return NextResponse.json(await listCuratedBriefingTopics());
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireEnabledAdmin();
    const body = await request.json().catch(() => null);
    const result = await createCuratedBriefingTopic(body);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
