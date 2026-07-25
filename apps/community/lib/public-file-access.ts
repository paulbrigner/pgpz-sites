import "server-only";

import { canAccessProtectedContent } from "@pgpz/core";
import type { NextRequest } from "next/server";
import { resolveAppSession } from "@/lib/app-session";

export async function hasPublicFileMemberAccess(request: NextRequest) {
  const session = await resolveAppSession(request.headers);
  return canAccessProtectedContent(session?.user);
}
