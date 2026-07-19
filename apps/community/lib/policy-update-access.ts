import "server-only";

import { canAccessAdminFeatures, canAccessProtectedContent } from "@pgpz/core";
import { NextRequest } from "next/server";
import { resolveAppSession } from "@/lib/app-session";

export async function hasPolicyUpdateResourceAccess(request: NextRequest) {
  const session = await resolveAppSession(request.headers);
  const user = session?.user;
  if (!user?.id) return { allowed: false, isAdmin: false };

  const isAdmin = canAccessAdminFeatures(user);
  return {
    allowed: canAccessProtectedContent(user),
    isAdmin,
  };
}
