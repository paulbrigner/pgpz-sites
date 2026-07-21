import { NextResponse } from "next/server";
import { AdminAccessError, requireAdminSession } from "@/lib/admin/auth";
import {
  AdminXMonitorBriefingError,
  deleteCuratedBriefingTopic,
  editCuratedBriefingDraft,
  getCuratedBriefingVersion,
  listCuratedBriefingVersions,
  publishCuratedBriefingVersion,
  refreshCuratedBriefingTopic,
  rejectCuratedBriefingVersion,
  rollbackCuratedBriefingTopic,
  updateCuratedBriefingTopic,
} from "@/lib/admin/x-monitor-briefings";
import { isCommunityXMonitorBriefingsEnabled } from "@/lib/x-monitor-public";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ segments: string[] }> };

const errorResponse = (error: unknown) => {
  if (error instanceof AdminAccessError) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  if (error instanceof AdminXMonitorBriefingError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error("Admin Topic Briefings action failed", error);
  return NextResponse.json({ error: "Topic Briefings action failed" }, { status: 500 });
};

const prepare = async (context: RouteContext) => {
  await requireAdminSession();
  if (!isCommunityXMonitorBriefingsEnabled()) {
    throw new AdminXMonitorBriefingError("Topic Briefings are not enabled", 404);
  }
  return (await context.params).segments || [];
};

const jsonBody = (request: Request) => request.json().catch(() => null);
const unsupported = () => new AdminXMonitorBriefingError("Unsupported Topic Briefings action", 404);

export async function GET(_request: Request, context: RouteContext) {
  try {
    const segments = await prepare(context);
    if (segments.length === 3 && segments[0] === "topics" && segments[2] === "versions") {
      return NextResponse.json(await listCuratedBriefingVersions(segments[1]));
    }
    if (segments.length === 2 && segments[0] === "versions") {
      return NextResponse.json(await getCuratedBriefingVersion(segments[1]));
    }
    throw unsupported();
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const segments = await prepare(context);
    const body = await jsonBody(request);
    if (segments.length === 2 && segments[0] === "topics") {
      return NextResponse.json(await updateCuratedBriefingTopic(segments[1], body));
    }
    if (segments.length === 2 && segments[0] === "versions") {
      return NextResponse.json(await editCuratedBriefingDraft(segments[1], body), { status: 201 });
    }
    throw unsupported();
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const segments = await prepare(context);
    if (segments.length === 2 && segments[0] === "topics") {
      return NextResponse.json(await deleteCuratedBriefingTopic(segments[1]));
    }
    throw unsupported();
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const segments = await prepare(context);
    if (segments.length === 3 && segments[0] === "topics" && segments[2] === "refresh") {
      return NextResponse.json(await refreshCuratedBriefingTopic(segments[1]), { status: 202 });
    }
    if (segments.length === 3 && segments[0] === "topics" && segments[2] === "rollback") {
      return NextResponse.json(await rollbackCuratedBriefingTopic(segments[1], await jsonBody(request)));
    }
    if (segments.length === 3 && segments[0] === "versions" && segments[2] === "publish") {
      return NextResponse.json(await publishCuratedBriefingVersion(segments[1]));
    }
    if (segments.length === 3 && segments[0] === "versions" && segments[2] === "reject") {
      return NextResponse.json(await rejectCuratedBriefingVersion(segments[1], await jsonBody(request)));
    }
    throw unsupported();
  } catch (error) {
    return errorResponse(error);
  }
}
