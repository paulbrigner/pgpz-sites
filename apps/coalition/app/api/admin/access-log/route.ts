import { NextRequest, NextResponse } from "next/server";
import { AdminAccessError, requireAdminSession } from "@/lib/admin/auth";
import { listAccessLog, type AccessEventType } from "@/lib/admin/access-log";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireAdminSession();
    const eventTypeParam = request.nextUrl.searchParams.get("eventType");
    const eventType: AccessEventType | "all" =
      eventTypeParam === "login" || eventTypeParam === "page_view" ? eventTypeParam : "all";
    const userId = request.nextUrl.searchParams.get("userId") || null;
    const limit = Number(request.nextUrl.searchParams.get("limit") || 200);
    const days = Math.min(Math.max(Number(request.nextUrl.searchParams.get("days") || 30), 1), 90);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const accessLog = await listAccessLog({ eventType, userId, limit, since });
    return NextResponse.json(accessLog);
  } catch (err) {
    if (err instanceof AdminAccessError) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }
    console.error("Failed to load access log", err);
    return NextResponse.json({ error: "Failed to load access log" }, { status: 500 });
  }
}
