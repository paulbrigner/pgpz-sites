import { GetObjectCommand } from "@aws-sdk/client-s3";
import {
  createPublicFileResourceRouteHandlers,
  type PublicFileRouteContext,
} from "@pgpz/public-files/server";
import { NextRequest, NextResponse } from "next/server";
import { isFeatureEnabled } from "@/config/features";
import { getPublicFileRecord } from "@/lib/admin/public-files";
import { hasPublicFileMemberAccess } from "@/lib/public-file-access";
import { s3Client } from "@/lib/s3";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const handlers = createPublicFileResourceRouteHandlers({
  jsonResponse: (body, init) => NextResponse.json(body, init),
  createResponse: (body, init) => new NextResponse(body, init),
  isFeatureEnabled,
  getPublicFileRecord,
  hasPublicFileMemberAccess,
  getObject: ({ bucket, key, range }) =>
    s3Client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key, ...(range ? { Range: range } : {}) }),
    ),
});

export function HEAD(request: NextRequest, context: PublicFileRouteContext) {
  return handlers.HEAD(request, context);
}

export function GET(request: NextRequest, context: PublicFileRouteContext) {
  return handlers.GET(request, context);
}
