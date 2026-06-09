import { NextRequest, NextResponse } from "next/server";
import { AdminAccessError, requireAdminSession } from "@/lib/admin/auth";
import { buildAdminRoster } from "@/lib/admin/roster";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireAdminSession();
    const statusParam = (request.nextUrl.searchParams.get("status") || "all").toLowerCase();
    const statusFilter =
      statusParam === "active" || statusParam === "none" || statusParam === "manual"
        ? statusParam
        : "all";
    const roster = await buildAdminRoster({ statusFilter });
    return NextResponse.json(roster);
  } catch (err) {
    if (err instanceof AdminAccessError) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }
    console.error("Failed to load admin roster", err);
    return NextResponse.json({ error: "Failed to load admin roster" }, { status: 500 });
  }
}
