import { createAccessLogPageViewRouteHandler } from "@pgpz/access-log/routes";
import { NextRequest, NextResponse } from "next/server";
import { resolveAppSession } from "@/lib/app-session";
import { getAccessLogRequestMetadata, recordAccessEvent } from "@/lib/admin/access-log";
import { getUserDisplayName } from "@/lib/user-display-name";

export const dynamic = "force-dynamic";

const handler = createAccessLogPageViewRouteHandler({
  jsonResponse: (body, init) => NextResponse.json(body, init),
  emptyResponse: (status) => new NextResponse(null, { status }),
  resolveAppSession,
  getAccessLogRequestMetadata,
  getUserDisplayName,
  recordAccessEvent,
});

export function POST(request: NextRequest) {
  return handler(request);
}
