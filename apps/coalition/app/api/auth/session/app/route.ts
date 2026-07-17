import { NextRequest, NextResponse } from "next/server";
import { resolveAppSession } from "@/lib/app-session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await resolveAppSession(request.headers);
  return NextResponse.json(session || null);
}
