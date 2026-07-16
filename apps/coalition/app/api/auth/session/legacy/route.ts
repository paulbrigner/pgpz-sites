import { NextRequest, NextResponse } from "next/server";
import { expireLegacySessionCookies } from "@/lib/legacy-session-cookies";

export async function DELETE(request: NextRequest) {
  const response = new NextResponse(null, { status: 204 });
  return expireLegacySessionCookies(response, request);
}
