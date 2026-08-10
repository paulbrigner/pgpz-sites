import { createAccessLogAdminRouteHandler } from "@pgpz/access-log/routes";
import { NextRequest, NextResponse } from "next/server";
import { AdminAccessError, requireAdminSession } from "@/lib/admin/auth";
import { listAccessLog } from "@/lib/admin/access-log";

export const dynamic = "force-dynamic";

const handler = createAccessLogAdminRouteHandler({
  jsonResponse: (body, init) => NextResponse.json(body, init),
  requireAdminSession,
  isAdminAccessError: (error) => error instanceof AdminAccessError,
  listAccessLog,
});

export function GET(request: NextRequest) {
  return handler(request);
}
